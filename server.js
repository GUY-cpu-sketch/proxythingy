import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import session from "express-session";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Database
const db = await open({
  filename: "database.sqlite",
  driver: sqlite3.Database
});

// Create tables if not exist
await db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );
  CREATE TABLE IF NOT EXISTS banned_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE
  );
`);

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

app.use(express.static(path.join(__dirname, "public")));

// --- Auth routes ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    await db.run("INSERT INTO users (username, password) VALUES (?, ?)", [
      username,
      password
    ]);
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password]
  );
  if (user) {
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/session", (req, res) => {
  if (req.session.username) {
    res.json({ username: req.session.username });
  } else {
    res.status(401).json({ error: "Not logged in" });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// --- Socket.IO ---
const onlineUsers = new Map(); // socket.id -> username
const admins = ["AdminUser"]; // add your admin usernames here

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Register user
  socket.on("register-user", (username) => {
    if (!username) return;
    onlineUsers.set(socket.id, username);
    io.emit("update-users", [...onlineUsers.values()]);
  });

  // Handle chat
  socket.on("send-chat", async (msg) => {
    const username = onlineUsers.get(socket.id);
    if (!username) return;

    // Check ban list
    const banned = await db.get(
      "SELECT * FROM banned_users WHERE username = ?",
      [username]
    );
    if (banned) {
      socket.emit("chat", {
        user: "SYSTEM",
        message: "You are banned.",
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    // Admin commands
    if (msg.startsWith("/") && admins.includes(username)) {
      const [command, target] = msg.substring(1).split(" ");
      if (command === "kick") {
        for (const [id, user] of onlineUsers.entries()) {
          if (user === target) {
            io.to(id).disconnectSockets(true);
            onlineUsers.delete(id);
          }
        }
      } else if (command === "ban") {
        await db.run("INSERT OR IGNORE INTO banned_users (username) VALUES (?)", [
          target
        ]);
        for (const [id, user] of onlineUsers.entries()) {
          if (user === target) {
            io.to(id).disconnectSockets(true);
            onlineUsers.delete(id);
          }
        }
      } else if (command === "clear") {
        io.emit("clear-chat");
      }
      return;
    }

    // Broadcast message
    io.emit("chat", {
      user: username,
      message: msg,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    io.emit("update-users", [...onlineUsers.values()]);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));
