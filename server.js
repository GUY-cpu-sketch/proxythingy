import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- SQLite setup ---
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error("DB Error:", err);
  else console.log("Connected to SQLite database");
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`);

// --- Routes ---
// Serve login/register pages
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));

// Register new user
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Missing fields" });

  const stmt = db.prepare("INSERT INTO users(username, password) VALUES(?, ?)");
  stmt.run(username, password, function(err) {
    if (err) return res.json({ success: false, message: "Username already exists" });
    res.json({ success: true });
  });
});

// Login user
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: "Missing fields" });

  db.get("SELECT * FROM users WHERE username=? AND password=?", [username, password], (err, row) => {
    if (err) return res.json({ success: false, message: "DB error" });
    if (!row) return res.json({ success: false, message: "Invalid credentials" });
    res.json({ success: true });
  });
});

// Logout
app.post("/logout", (req, res) => {
  res.json({ success: true });
});

// --- Chat ---
const onlineUsers = new Map();
const ADMIN_USER = "DEV";

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("register-user", (username) => {
    if (!username) return;
    socket.username = username;
    onlineUsers.set(socket.id, username);

    socket.emit("system", `Welcome, ${username}!`);
    socket.broadcast.emit("system", `${username} joined the chat`);
    io.emit("update-users", [...onlineUsers.values()]);
  });

  socket.on("send-chat", (msg) => {
    if (!socket.username || !msg) return;

    // Admin commands
    if (msg.startsWith("/") && socket.username === ADMIN_USER) {
      const [command, target] = msg.substring(1).split(" ");
      if (command === "kick") {
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

    io.emit("chat", {
      user: socket.username,
      message: msg,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  socket.on("disconnect", () => {
    if (!socket.username) return;
    onlineUsers.delete(socket.id);
    io.emit("update-users", [...onlineUsers.values()]);
    io.emit("system", `${socket.username} left the chat`);
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
