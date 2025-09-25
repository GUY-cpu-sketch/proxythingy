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

// --- Socket.IO ---
let onlineUsers = new Set();
let messages = [];

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

  messages.forEach(msg => socket.emit("chat", msg));

  // --- Handle chat ---
  socket.on("chat", msg => {
    const message = { user: username, message: msg };
    messages.push(message);
    io.emit("chat", message);
  });

  // --- Admin commands ---
  socket.on("adminKick", target => {
    if (username !== "DEV") return;
    for (let [id, s] of io.sockets.sockets) {
      if (s.username === target) s.disconnect(true);
    }
    io.emit("system", `${target} was kicked by admin`);
  });

  socket.on("adminClear", () => {
    if (username !== "DEV") return;
    messages = [];
    io.emit("system", "Chat was cleared by admin");
    io.emit("chat", ...messages);
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
