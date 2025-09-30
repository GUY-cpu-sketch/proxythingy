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
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// --- Initialize SQLite ---
let db;
(async () => {
  const dbFile = path.join(dataDir, "database.sqlite");
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

  console.log("SQLite initialized at:", dbFile);
})();

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "public/chat.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

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

// --- Admin messages fetch ---
app.get("/admin/messages", async (req, res) => {
  const user = req.query.user;
  if (user !== "DEV") return res.status(403).json({ error: "Forbidden" });

  const rows = await db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100");
  res.json(rows);
});

// --- Socket.IO ---
let onlineUsers = new Map(); // username -> socket
let mutedUsers = {}; // username: timestamp until muted
const admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", async (socket) => {
  const username = socket.username;
  onlineUsers.set(username, socket);

  // Welcome
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers.keys()));

  // Send last 50 messages
  const lastMessages = await db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50");
  lastMessages.reverse().forEach(msg => socket.emit("chat", { user: msg.username, message: msg.message }));

  // --- Chat handling ---
  socket.on("chat", async (msg) => {
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", {
        until: mutedUsers[username],
        reason: "You have been muted by an admin"
      });
      return;
    }

    // Admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();

      switch (command) {
        case "/kick":
          const targetKick = parts[1];
          const sKick = onlineUsers.get(targetKick);
          if (sKick) sKick.disconnect(true);
          io.emit("system", `${targetKick} was kicked by admin`);
          return;

        case "/clear":
          io.emit("system", `${username.toLowerCase()} cleared the chat`);
          io.emit("chat", { user: "SYSTEM", message: "Chat was cleared" });
          return;

        case "/mute":
          const userToMute = parts[1];
          const duration = parseInt(parts[2]) || 60;
          mutedUsers[userToMute] = Date.now() + duration * 1000;
          io.emit("system", `${userToMute} was muted for ${duration} seconds`);
          return;

        case "/close":
          const userToClose = parts[1];
          const sClose = onlineUsers.get(userToClose);
          if (sClose) sClose.emit("closeTab");
          io.emit("system", `Requested ${userToClose}'s tab to close`);
          return;
      }
    }

    // /whisper handling
    if (msg.startsWith("/whisper ")) {
      const parts = msg.split(" ");
      const target = parts[1];
      const message = parts.slice(2).join(" ");
      const sTarget = onlineUsers.get(target);
      if (sTarget) sTarget.emit("whisper", { from: username, message });
      socket.emit("whisper", { from: username, message }); // show to sender
      await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)",
        `${username} -> ${target}`, socket.handshake.address, message, Date.now());
      return;
    }

    // Normal chat
    io.emit("chat", { user: username, message: msg });
    await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)",
      username, socket.handshake.address, msg, Date.now());
  });

  // Disconnect
  socket.on("disconnect", () => {
    onlineUsers.delete(username);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers.keys()));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
