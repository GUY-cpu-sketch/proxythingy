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

let db;

(async () => {
  db = await open({ filename: "database.sqlite", driver: sqlite3.Database });
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    message TEXT,
    ip TEXT,
    timestamp INTEGER
  )`);
})();

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });
  const user = await db.get("SELECT * FROM users WHERE username=? AND password=?", username, password);
  if (!user) return res.json({ success: false, message: "Invalid credentials" });
  res.json({ success: true });
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

// --- Admin messages page ---
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));
app.get("/admin/messages", async (req, res) => {
  // only allow DEV
  const user = req.query.user;
  if (user !== "DEV") return res.status(403).json({ error: "Forbidden" });

  const msgs = await db.all("SELECT * FROM messages ORDER BY timestamp DESC");
  res.json(msgs);
});

// --- Socket.IO ---
let onlineUsers = new Set();
let mutedUsers = {}; // {username: untilTimestamp}
let admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.add(username);

  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers));

  // Send previous messages
  (async () => {
    const msgs = await db.all("SELECT username, message FROM messages ORDER BY timestamp ASC");
    msgs.forEach(m => socket.emit("chat", { user: m.username, message: m.message }));
  })();

  // --- Chat ---
  socket.on("chat", async msg => {
    // Check mute
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", {
        until: mutedUsers[username],
        reason: "You are muted"
      });
      return;
    }

    // Admin command
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      if (parts[0] === "/kick" && parts[1]) {
        const target = parts[1];
        for (let [id, s] of io.sockets.sockets) {
          if (s.username === target) s.disconnect(true);
        }
        io.emit("system", `${target} was kicked by admin`);
        return;
      }
      if (parts[0] === "/clear") {
        await db.run("DELETE FROM messages");
        io.emit("system", "Chat cleared by admin");
        io.emit("chat", []);
        return;
      }
      if (parts[0] === "/mute" && parts[1] && parts[2]) {
        const target = parts[1];
        const timeMs = parseInt(parts[2], 10) * 1000; // seconds
        mutedUsers[target] = Date.now() + timeMs;
        io.emit("system", `${target} was muted by admin for ${parts[2]}s`);
        return;
      }
    }

    // Save message with IP
    const ip = socket.handshake.address;
    await db.run(
      "INSERT INTO messages (username, message, ip, timestamp) VALUES (?, ?, ?, ?)",
      username,
      msg,
      ip,
      Date.now()
    );

    io.emit("chat", { user: username, message: msg });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(username);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`StartMyEducation server running on port ${PORT}`));
