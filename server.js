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

// --- Database setup ---
let db;
(async () => {
  db = await open({
    filename: path.join(dataDir, "database.sqlite"),
    driver: sqlite3.Database
  });

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

// --- Auth endpoints ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });

  const user = await db.get("SELECT * FROM users WHERE username=? AND password=?", username, password);
  res.json({ success: !!user, username });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });
  try {
    await db.run("INSERT INTO users (username, password) VALUES (?, ?)", username, password);
    res.json({ success: true });
  } catch {
    res.json({ success: false, message: "Username already exists" });
  }
});

// --- Admin messages endpoint ---
app.get("/admin/messages", async (req, res) => {
  const user = req.query.user;
  if (user !== "DEV") return res.status(403).json([]);
  const rows = await db.all("SELECT * FROM messages ORDER BY timestamp ASC");
  res.json(rows);
});

// --- Socket.IO ---
let onlineUsers = new Map(); // username -> socket
let messages = [];
let mutedUsers = {}; // username: timestamp
const admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", socket => {
  const username = socket.username;
  onlineUsers.set(username, socket);

  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers.keys()));
  messages.forEach(msg => socket.emit("chat", msg));

  socket.on("chat", async msg => {
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You have been muted" });
      return;
    }

    // Admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();
      switch (command) {
        case "/kick":
          if (onlineUsers.has(parts[1])) onlineUsers.get(parts[1]).disconnect(true);
          io.emit("system", `${parts[1]} was kicked by DEV`);
          return;
        case "/clear":
          messages = [];
          io.emit("system", "DEV cleared the chat");
          io.emit("clearChat");
          return;
        case "/mute":
          mutedUsers[parts[1]] = Date.now() + (parseInt(parts[2]) || 60) * 1000;
          io.emit("system", `${parts[1]} was muted`);
          return;
        case "/close":
          if (onlineUsers.has(parts[1])) onlineUsers.get(parts[1]).emit("forceClose");
          io.emit("system", `DEV closed ${parts[1]}'s chat`);
          return;
      }
    }

    // Whispers
    if (msg.startsWith("/whisper ") || msg.startsWith("/r ")) {
      const [cmd, targetUser, ...rest] = msg.split(" ");
      const messageContent = rest.join(" ");
      if (onlineUsers.has(targetUser)) {
        onlineUsers.get(targetUser).emit("whisper", { from: username, message: messageContent });
        socket.emit("whisper", { from: username, message: messageContent });
      } else socket.emit("system", `${targetUser} is not online`);
      return;
    }

    // Normal message
    const messageObj = { user: username, message: msg };
    messages.push(messageObj);
    const ip = socket.handshake.address;
    await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)", username, ip, msg, Date.now());
    io.emit("chat", messageObj);
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
