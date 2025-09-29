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
app.get("/admin.html", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

// --- Admin messages endpoint ---
app.get("/admin/messages", (req, res) => {
  const { user } = req.query;
  if (!user || !["DEV"].includes(user)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const allMessages = messages.map(msg => ({
    timestamp: msg.timestamp || Date.now(),
    username: msg.user,
    ip: msg.ip || "Unknown",
    message: msg.message
  }));

  res.json(allMessages);
});

// --- Auth endpoints ---
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
let mutedUsers = {};
const admins = ["DEV"];
let lastWhisperFrom = {};

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.add(username);

  // Welcome
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers));
  messages.forEach(msg => socket.emit("chat", msg));

  // --- Handle chat ---
  socket.on("chat", (msg) => {
    // Check mute
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You have been muted by an admin" });
      return;
    }

    // Admin commands
    if (msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();

      if (admins.includes(username)) {
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
            const duration = parseInt(parts[2]) || 60;
            mutedUsers[userToMute] = Date.now() + duration * 1000;
            io.emit("system", `${userToMute} was muted for ${duration} seconds`);
            return;
        }
      } else {
        socket.emit("system", "You are not allowed to use this command.");
        return;
      }
    }

    // --- Whisper (any user can use) ---
    if (msg.startsWith("/whisper ")) {
      const parts = msg.split(" ");
      const targetUser = parts[1];
      const whisperMsg = parts.slice(2).join(" ");

      let targetSocket;
      for (let [id, s] of io.sockets.sockets) {
        if (s.username === targetUser) targetSocket = s;
      }

      const messageObj = { user: username, message: `(Whisper to ${targetUser}) ${whisperMsg}`, timestamp: Date.now(), ip: socket.handshake.address };
      messages.push(messageObj);

      if (targetSocket) {
        targetSocket.emit("whisper", { from: username, message: whisperMsg });
        socket.emit("whisper", { from: username, message: whisperMsg });
        lastWhisperFrom[targetUser] = username;
      } else {
        socket.emit("system", `User "${targetUser}" not found`);
      }
      return;
    }

    // --- Reply ---
    if (msg.startsWith("/r ")) {
      const replyMsg = msg.slice(3);
      const replyTo = lastWhisperFrom[username];
      if (!replyTo) {
        socket.emit("system", "No one to reply to.");
        return;
      }

      let targetSocket;
      for (let [id, s] of io.sockets.sockets) {
        if (s.username === replyTo) targetSocket = s;
      }

      const messageObj = { user: username, message: `(Whisper reply to ${replyTo}) ${replyMsg}`, timestamp: Date.now(), ip: socket.handshake.address };
      messages.push(messageObj);

      if (targetSocket) {
        targetSocket.emit("whisper", { from: username, message: replyMsg });
        socket.emit("whisper", { from: username, message: replyMsg });
        lastWhisperFrom[replyTo] = username;
      } else {
        socket.emit("system", `User "${replyTo}" not found`);
      }
      return;
    }

    // --- Normal message ---
    const messageObj = { user: username, message: msg, timestamp: Date.now(), ip: socket.handshake.address };
    messages.push(messageObj);
    io.emit("chat", messageObj);
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    onlineUsers.delete(username);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`StartMyEducation server running on port ${PORT}`));
