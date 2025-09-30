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

// --- Ensure data folder exists ---
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// --- Initialize SQLite ---
let db;
(async () => {
  db = await open({
    filename: path.join(dataDir, "database.sqlite"),
    driver: sqlite3.Database,
  });
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    username TEXT,
    ip TEXT,
    message TEXT
  )`);
})();

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "public/chat.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

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

// --- Admin messages API ---
app.get("/admin/messages", async (req, res) => {
  const { user } = req.query;
  if (!user || user !== "DEV") return res.status(403).json([]);
  const messages = await db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100");
  res.json(messages);
});

// --- Socket.IO ---
let onlineUsers = new Map(); // username => socket.id
let mutedUsers = {}; // username => timestamp until muted
const admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.set(username, socket.id);

  // --- Welcome ---
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers.keys()));

  // Send last 50 messages
  (async () => {
    const recent = await db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50");
    recent.reverse().forEach(msg => {
      socket.emit("chat", msg);
    });
  })();

  socket.on("chat", async (msg) => {
    // Check mute
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You are muted" });
      return;
    }

    // Handle admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();
      switch (command) {
        case "/kick": {
          const target = parts[1];
          const targetSocketId = onlineUsers.get(target);
          if (targetSocketId) io.sockets.sockets.get(targetSocketId)?.disconnect(true);
          io.emit("system", `${target} was kicked by admin`);
          return;
        }
        case "/mute": {
          const target = parts[1];
          const duration = parseInt(parts[2]) || 60;
          mutedUsers[target] = Date.now() + duration * 1000;
          io.emit("system", `${target} was muted for ${duration} seconds`);
          return;
        }
        case "/clear": {
          io.emit("system", `${username} cleared the chat`);
          return;
        }
        case "/close": {
          const target = parts[1];
          const targetSocketId = onlineUsers.get(target);
          if (targetSocketId) io.to(targetSocketId).emit("forceClose");
          io.emit("system", `${username} closed ${target}'s chat tab`);
          return;
        }
      }
    }

    // Whisper
    if (msg.startsWith("/whisper ")) {
      const split = msg.split(" ");
      const target = split[1];
      const message = split.slice(2).join(" ");
      const targetSocketId = onlineUsers.get(target);
      if (targetSocketId) {
        io.to(targetSocketId).emit("whisper", { from: username, message });
        socket.emit("whisper", { from: username, message });
      } else {
        socket.emit("system", `User ${target} not found.`);
      }
      return;
    }

    // Normal message
    const msgObj = {
      timestamp: Date.now(),
      username,
      ip: socket.handshake.address,
      message: msg,
    };
    await db.run("INSERT INTO messages (timestamp, username, ip, message) VALUES (?, ?, ?, ?)",
      msgObj.timestamp, msgObj.username, msgObj.ip, msgObj.message);
    io.emit("chat", msgObj);
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(username);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers.keys()));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
