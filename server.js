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
  res.json({ success: true, username: user.username });
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
let mutedUsers = {}; // { username: timestamp }

const admins = ["DEV"];

io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.add(username);

  // Welcome & notify users
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers));
  messages.forEach(msg => socket.emit("chat", msg));

  // Handle chat
  socket.on("chat", msg => {
    // Check mute
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You are muted" });
      return;
    }

    // Admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0];
      if (command === "/kick" && parts[1]) {
        const target = parts[1];
        for (let [id, s] of io.sockets.sockets) {
          if (s.username === target) s.disconnect(true);
        }
        io.emit("system", `${target} was kicked by admin`);
        return;
      }
      if (command === "/clear") {
        messages = [];
        io.emit("system", "Chat was cleared by admin");
        return;
      }
      if (command === "/mute" && parts[1] && parts[2]) {
        const target = parts[1];
        const minutes = parseInt(parts[2], 10);
        if (!isNaN(minutes)) {
          mutedUsers[target] = Date.now() + minutes * 60 * 1000;
          io.emit("system", `${target} was muted for ${minutes} minutes`);
        }
        return;
      }
    }

    // Normal message
    const message = { user: username, message: msg };
    messages.push(message);
    io.emit("chat", message);
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
