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

// --- Initialize SQLite ---
(async () => {
  db = await open({ filename: "database.sqlite", driver: sqlite3.Database });
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
})();

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "public/chat.html")));

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
let onlineUsers = new Set();
let messages = [];
let mutedUsers = {}; // username: timestamp until muted
const admins = ["DEV"];
let lastWhisperFrom = {}; // username -> last whisper sender

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.add(username);

  // Welcome message
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers));
  messages.forEach(msg => socket.emit("chat", msg));

  // --- Handle chat ---
  socket.on("chat", (msg) => {
    // Check mute
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
          const target = parts[1];
          for (let [id, s] of io.sockets.sockets) {
            if (s.username === target) s.disconnect(true);
          }
          io.emit("system", `${target} was kicked by admin`);
          return;
        case "/clear":
          messages = [];
          io.emit("system", "Chat was cleared by admin");
          io.emit("chat", ...messages);
          return;
        case "/mute":
          const userToMute = parts[1];
          const duration = parseInt(parts[2]) || 60; // default 60 seconds
          mutedUsers[userToMute] = Date.now() + duration * 1000;
          io.emit("system", `${userToMute} was muted for ${duration} seconds`);
          return;
      }
    }

    // --- Whisper / Reply ---
    if (msg.startsWith("/whisper ")) {
      const parts = msg.split(" ");
      const targetUser = parts[1];
      const whisperMsg = parts.slice(2).join(" ");

      let targetSocket;
      for (let [id, s] of io.sockets.sockets) {
        if (s.username === targetUser) {
          targetSocket = s;
          break;
        }
      }

      if (targetSocket) {
        targetSocket.emit("whisper", { from: username, message: whisperMsg });
        socket.emit("whisper", { from: username, message: whisperMsg });
        lastWhisperFrom[targetUser] = username;
      } else {
        socket.emit("system", `User "${targetUser}" not found`);
      }
      return;
    }

    if (msg.startsWith("/r ")) {
      const replyMsg = msg.slice(3);
      const replyTo = lastWhisperFrom[username];
      if (!replyTo) {
        socket.emit("system", "No one to reply to.");
        return;
      }

      let targetSocket;
      for (let [id, s] of io.sockets.sockets) {
        if (s.username === replyTo) {
          targetSocket = s;
          break;
        }
      }

      if (targetSocket) {
        targetSocket.emit("whisper", { from: username, message: replyMsg });
        socket.emit("whisper", { from: username, message: replyMsg });
        lastWhisperFrom[replyTo] = username;
      } else {
        socket.emit("system", `User "${replyTo}" not found`);
      }
      return;
    }

    // Broadcast normal message
    const messageObj = { user: username, message: msg };
    messages.push(messageObj);
    io.emit("chat", messageObj);
  });

  // --- Handle disconnect ---
  socket.on("disconnect", () => {
    onlineUsers.delete(username);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`StartMyEducation server running on port ${PORT}`));
