import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- SQLite Database ---
const dbFile = "/opt/render/project/data/database.sqlite"; // Render-safe path
let db;

(async () => {
  db = await open({ filename: dbFile, driver: sqlite3.Database });

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
})();

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "public/chat.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

// --- Admin message fetch ---
app.get("/admin/messages", async (req, res) => {
  const { user } = req.query;
  if (user !== "DEV") return res.status(403).json([]);
  const rows = await db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100");
  res.json(rows);
});

// --- Login/Register ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });

  const user = await db.get("SELECT * FROM users WHERE username=? AND password=?", username, password);
  if (!user) return res.json({ success: false, message: "Invalid credentials" });
  res.json({ success: true, username });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });

  try {
    await db.run("INSERT INTO users (username, password) VALUES (?, ?)", username, password);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: "Username already exists" });
  }
});

// --- Socket.IO ---
let onlineUsers = {};
let messages = [];
let mutedUsers = {}; // username: timestamp until muted
const admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  onlineUsers[username] = socket;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;

  // --- Welcome ---
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Object.keys(onlineUsers));
  messages.forEach(msg => socket.emit("chat", msg));

  // --- Handle chat ---
  socket.on("chat", async (msg) => {
    // Mute check
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You have been muted by an admin" });
      return;
    }

    // Admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();

      switch (command) {
        case "/kick": {
          const target = parts[1];
          if (onlineUsers[target]) {
            onlineUsers[target].disconnect(true);
            io.emit("system", `${target} was kicked by ${username}`);
          }
          return;
        }
        case "/clear": {
          messages = [];
          io.emit("system", `${username} cleared the chat`);
          io.emit("clearChat");
          return;
        }
        case "/mute": {
          const target = parts[1];
          const duration = parseInt(parts[2]) || 60;
          mutedUsers[target] = Date.now() + duration * 1000;
          io.emit("system", `${target} was muted for ${duration} seconds`);
          return;
        }
        case "/close": {
          const target = parts[1];
          if (onlineUsers[target]) onlineUsers[target].emit("forceClose");
          io.emit("system", `${username} closed ${target}'s chat`);
          return;
        }
      }
    }

    // Whisper
    if (msg.startsWith("/whisper ")) {
      const split = msg.split(" ");
      const target = split[1];
      const content = split.slice(2).join(" ");
      if (onlineUsers[target]) {
        onlineUsers[target].emit("whisper", { from: username, message: content });
        socket.emit("whisper", { from: username, message: content });
      }
      return;
    }

    // Normal message
    const messageObj = { user: username, message: msg };
    messages.push(messageObj);
    io.emit("chat", messageObj);

    // Store message with IP
    const ip = socket.handshake.address;
    await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", username, ip, msg, Date.now());
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    delete onlineUsers[username];
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Object.keys(onlineUsers));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
