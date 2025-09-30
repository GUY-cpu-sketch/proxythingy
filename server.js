import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Ensure data folder exists
const dataFolder = path.join(process.cwd(), "data");
if (!fs.existsSync(dataFolder)) fs.mkdirSync(dataFolder);

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
  db = await open({
    filename: path.join(dataFolder, "database.sqlite"),
    driver: sqlite3.Database,
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

// Login
app.post("/login.html", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });

  const user = await db.get("SELECT * FROM users WHERE username=? AND password=?", username, password);
  if (!user) return res.json({ success: false, message: "Invalid credentials" });

  res.json({ success: true, username });
});

// Register
app.post("/register.html", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Fill in all fields" });

  try {
    await db.run("INSERT INTO users (username, password) VALUES (?, ?)", username, password);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: "Username already exists" });
  }
});

// Admin messages API
app.get("/admin/messages", async (req, res) => {
  const user = req.query.user;
  if (user !== "DEV") return res.status(403).json([]);
  const messages = await db.all("SELECT * FROM messages ORDER BY timestamp ASC");
  res.json(messages);
});

// --- Socket.IO ---
const onlineUsers = new Map(); // username -> socket.id
const mutedUsers = {}; // username -> timestamp
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

  // Welcome message
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers.keys()));

  // Load previous messages
  db.all("SELECT username, message FROM messages ORDER BY timestamp ASC").then((msgs) => {
    msgs.forEach(m => socket.emit("chat", m));
  });

  socket.on("chat", async (msg) => {
    // Check mute
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You are muted" });
      return;
    }

    // Admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const [command, target, arg] = msg.split(" ");
      switch (command.toLowerCase()) {
        case "/kick":
          if (onlineUsers.has(target)) io.sockets.sockets.get(onlineUsers.get(target))?.disconnect();
          io.emit("system", `${target} was kicked by ${username}`);
          return;
        case "/clear":
          io.emit("system", `${username.toLowerCase() === "dev" ? "DEV" : username} cleared the chat`);
          io.emit("chat", { clear: true });
          return;
        case "/mute":
          const duration = parseInt(arg) || 60;
          mutedUsers[target] = Date.now() + duration * 1000;
          io.emit("system", `${target} was muted for ${duration} seconds`);
          return;
        case "/close":
          if (onlineUsers.has(target)) io.to(onlineUsers.get(target)).emit("closeTab");
          io.emit("system", `${username} closed ${target}'s chat tab`);
          return;
      }
    }

    // Whispers
    if (msg.startsWith("/whisper ")) {
      const [_, toUser, ...rest] = msg.split(" ");
      const message = rest.join(" ");
      if (onlineUsers.has(toUser)) {
        io.to(onlineUsers.get(toUser)).emit("whisper", { from: username, message });
      }
      socket.emit("whisper", { from: username, message });
      await db.run(
        "INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)",
        username,
        socket.handshake.address,
        `(whisper to ${toUser}): ${message}`,
        Date.now()
      );
      return;
    }

    // Normal chat
    io.emit("chat", { user: username, message: msg });
    await db.run(
      "INSERT INTO messages (username, ip, message, timestamp) VALUES (?, ?, ?, ?)",
      username,
      socket.handshake.address,
      msg,
      Date.now()
    );
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
