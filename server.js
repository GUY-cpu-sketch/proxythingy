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
  cors: { origin: "*", methods: ["GET", "POST"] } // allow all origins
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let db;
let onlineUsers = new Set();
let messages = [];
let mutedUsers = {};
const admins = ["DEV"];

// --- SQLite ---
(async () => {
  db = await open({
    filename: path.join(__dirname, "data/database.sqlite"),
    driver: sqlite3.Database
  });

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

// --- Socket.IO ---
io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Invalid username"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const username = socket.username;
  onlineUsers.add(username);

  // Send previous messages
  messages.forEach(msg => socket.emit("chat", msg));

  // Broadcast join
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers));

  // --- Handle chat ---
  socket.on("chat", msg => {
    // Mute check
    if (mutedUsers[username] && Date.now() < mutedUsers[username]) {
      socket.emit("muted", { until: mutedUsers[username], reason: "You are muted" });
      return;
    }

    // Admin commands
    if (admins.includes(username) && msg.startsWith("/")) {
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();

      switch (command) {
        case "/clear":
          messages = [];
          io.emit("system", `${username} cleared the chat`);
          return;
        case "/kick":
          const target = parts[1];
          for (let [id, s] of io.sockets.sockets) {
            if (s.username === target) s.disconnect(true);
          }
          io.emit("system", `${target} was kicked by ${username}`);
          return;
        case "/mute":
          const userToMute = parts[1];
          const duration = parseInt(parts[2]) || 60;
          mutedUsers[userToMute] = Date.now() + duration * 1000;
          io.emit("system", `${userToMute} was muted for ${duration} seconds`);
          return;
      }
    }

    // Whisper
    if (msg.startsWith("/whisper ")) {
      const [_, to, ...rest] = msg.split(" ");
      const messageText = rest.join(" ");
      for (let [id, s] of io.sockets.sockets) {
        if (s.username === to) {
          s.emit("whisper", { from: username, message: messageText });
          break;
        }
      }
      return;
    }

    // Broadcast normal message
    const messageObj = { user: username, message: msg };
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
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
