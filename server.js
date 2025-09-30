import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Render-safe data dir (use env if provided, fallback to standard path) ---
const dataDir = process.env.RENDER_DATA_DIR || "/opt/render/project/data";
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, "database.sqlite");
// touch the file so sqlite can open it reliably
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "");

// --- SQLite init ---
let db;
(async () => {
  db = await open({ filename: dbFile, driver: sqlite3.Database });

  await db.run(`PRAGMA journal_mode=WAL;`);
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    ip TEXT,
    message TEXT,
    timestamp INTEGER
  )`);

  // load recent messages into memory (oldest → newest)
  const rows = await db.all("SELECT username as user, message, ip, timestamp FROM messages ORDER BY timestamp ASC LIMIT 200");
  messages = rows.map(r => ({ user: r.user, message: r.message, ip: r.ip, timestamp: r.timestamp }));
  console.log(`Loaded ${messages.length} messages from DB.`);
})();

// --- In-memory state ---
let messages = []; // live messages (starts after DB load)
let onlineUsers = {}; // username -> socket
let mutedUsers = {}; // username -> timestamp until muted
const admins = ["DEV"]; // change if needed

// --- Routes (serve .html routes) ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "public/chat.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

// Auth endpoints
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });
  try {
    await db.run("INSERT INTO users (username,password) VALUES (?, ?)", username, password);
    return res.json({ success: true });
  } catch (e) {
    return res.json({ success: false, message: "Username already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });
  const user = await db.get("SELECT * FROM users WHERE username=? AND password=?", username, password);
  if (!user) return res.json({ success: false, message: "Invalid credentials" });
  return res.json({ success: true, username });
});

// Admin messages read (only DEV)
app.get("/admin/messages", async (req, res) => {
  const user = req.query.user;
  if (!admins.includes(user)) return res.status(403).json([]);
  const rows = await db.all("SELECT username as user, ip, message, timestamp FROM messages ORDER BY timestamp ASC");
  res.json(rows);
});

// --- Socket auth middleware ---
io.use((socket, next) => {
  const { username } = socket.handshake.auth || {};
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

// --- Socket handlers ---
io.on("connection", (socket) => {
  const username = socket.username;
  // real client IP (if behind proxy)
  const ip = socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim() || socket.handshake.address;

  onlineUsers[username] = socket;

  // send join system and userList
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Object.keys(onlineUsers));

  // send existing (DB-loaded + in-memory) messages to newly connected socket
  // ensure we wait until DB loaded (db could be undefined for a moment). If db not ready, skip.
  (async () => {
    try {
      const recent = await db.all("SELECT username as user, message, ip, timestamp FROM messages ORDER BY timestamp ASC LIMIT 200");
      recent.forEach(m => socket.emit("chat", { user: m.user, message: m.message, ip: m.ip, timestamp: m.timestamp }));
    } catch (e) {
      // db not ready or error — ignore
    }
  })();

  // handle chat messages
  socket.on("chat", async (msg) => {
    if (!msg || typeof msg !== "string") return;

    // mute check
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You have been muted by an admin" });
      return;
    }

    // Admin commands (only admins)
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const cmd = parts[0].toLowerCase();

      switch (cmd) {
        case "/kick": {
          const target = parts[1];
          if (onlineUsers[target]) onlineUsers[target].disconnect(true);
          const sys = `${target} was kicked by ${username}`;
          io.emit("system", sys);
          await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", "SYSTEM", "-", sys, Date.now());
          return;
        }
        case "/clear": {
          messages = []; // clear in-memory live messages (clients will clear their UI)
          io.emit("clearChat");
          io.emit("system", `${username} cleared the chat`);
          // do not delete DB rows -> admin panel remains
          await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", "SYSTEM", "-", `${username} cleared the chat`, Date.now());
          return;
        }
        case "/mute": {
          const target = parts[1];
          const seconds = parseInt(parts[2], 10) || 60;
          mutedUsers[target] = Date.now() + seconds * 1000;
          io.emit("system", `${target} was muted for ${seconds} seconds`);
          await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", "SYSTEM", "-", `${target} muted ${seconds}s by ${username}`, Date.now());
          return;
        }
        case "/close": {
          const target = parts[1];
          if (onlineUsers[target]) onlineUsers[target].emit("forceClose");
          io.emit("system", `${username} closed ${target}'s chat`);
          await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", "SYSTEM", "-", `${username} closed ${target}`, Date.now());
          return;
        }
        default:
          socket.emit("system", `Unknown admin command: ${cmd}`);
          return;
      }
    }

    // Whisper: /whisper target message OR reply /r target message (we treat both)
    if (msg.startsWith("/whisper ") || msg.startsWith("/r ")) {
      const parts = msg.split(" ");
      const target = parts[1];
      const text = parts.slice(2).join(" ");
      if (!target || !text) { socket.emit("system", "Usage: /whisper [user] [message]"); return; }

      if (onlineUsers[target]) {
        // send whisper to both sender and target
        onlineUsers[target].emit("whisper", { from: username, message: text });
        socket.emit("whisper", { from: username, message: text });

        // persist whisper as a special message so admin can see it
        const stored = `(Whisper) ${username} -> ${target}: ${text}`;
        await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", `(WHISPER) ${username}`, ip, stored, Date.now());
      } else {
        socket.emit("system", `${target} is not online`);
      }
      return;
    }

    // normal message: broadcast + persist
    const messageObj = { user: username, message: msg, ip, timestamp: Date.now() };
    messages.push(messageObj);
    io.emit("chat", { user: username, message: msg, ip, timestamp: messageObj.timestamp });

    // store in DB
    try {
      await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", username, ip, msg, messageObj.timestamp);
    } catch (e) {
      console.error("DB insert failed:", e);
    }
  });

  socket.on("disconnect", () => {
    delete onlineUsers[username];
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Object.keys(onlineUsers));
  });
});

// start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
