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
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let db;

// --- Initialize SQLite ---
(async () => {
  db = await open({ filename: path.join(__dirname, "data/database.sqlite"), driver: sqlite3.Database });
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

// --- Admin fetch messages ---
app.get("/admin/messages", async (req, res) => {
  const { user } = req.query;
  if (user !== "DEV") return res.json([]);
  const rows = await db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100");
  res.json(rows);
});

// --- Socket.IO ---
const onlineUsers = new Map(); // socket.id -> username
const messages = [];
const mutedUsers = {}; // username: timestamp until muted
const admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.set(socket.id, username);

  // Welcome
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers.values()));

  // Send chat history
  messages.forEach(msg => socket.emit(msg.type || "chat", msg));

  // Handle chat
  socket.on("chat", async (msg) => {
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
          const targetKick = parts[1];
          for (const [id, name] of onlineUsers.entries()) {
            if (name === targetKick) io.sockets.sockets.get(id)?.disconnect(true);
          }
          io.emit("system", `${targetKick} was kicked by admin`);
          return;
        case "/clear":
          messages.length = 0;
          io.emit("system", `${username} cleared the chat`);
          io.emit("chat", ...messages);
          return;
        case "/mute":
          const targetMute = parts[1];
          const duration = parseInt(parts[2]) || 60;
          mutedUsers[targetMute] = Date.now() + duration * 1000;
          io.emit("system", `${targetMute} was muted for ${duration} seconds`);
          return;
        case "/close":
          const targetClose = parts[1];
          for (const [id, name] of onlineUsers.entries()) {
            if (name === targetClose) io.to(id).emit("forceClose");
          }
          io.emit("system", `${username} closed ${targetClose}'s tab`);
          return;
      }
    }

    // Whisper
    if (msg.startsWith("/whisper ")) {
      const parts = msg.split(" ");
      const targetUser = parts[1];
      const message = parts.slice(2).join(" ");
      for (const [id, name] of onlineUsers.entries()) {
        if (name === targetUser) io.to(id).emit("whisper", { from: username, message });
      }
      socket.emit("whisper", { from: username, message }); // send back to self
      messages.push({ type: "whisper", user: username, message });
      await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)",
        username, socket.handshake.address, message, Date.now());
      return;
    }

    // Normal message
    const messageObj = { user: username, message: msg };
    messages.push(messageObj);
    io.emit("chat", messageObj);

    // Save to DB
    await db.run("INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)",
      username, socket.handshake.address, msg, Date.now());
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers.values()));
  });
});

// --- Start server ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
