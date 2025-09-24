const express = require("express");
const session = require("express-session");
const { createProxyMiddleware } = require("http-proxy-middleware");
const bcrypt = require("bcrypt");
const sqlite3 = require("better-sqlite3");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new sqlite3("./database.sqlite");

// Setup users table
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'user'
)`).run();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "replace_this_with_a_secret",
  resave: false,
  saveUninitialized: true
}));

// Serve public folder
app.use(express.static("public"));

// Proxy endpoint
app.use("/proxy", createProxyMiddleware({
  target: "http://example.com", // placeholder
  changeOrigin: true,
  onProxyReq(proxyReq, req, res) {
    proxyReq.removeHeader("origin");
  },
  onProxyRes(proxyRes, req, res) {
    proxyRes.headers['x-frame-options'] = 'ALLOWALL';
  },
  pathRewrite: { "^/proxy": "" }
}));

// Registration
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hash);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) return res.json({ success: false, error: "User not found" });
  const match = await bcrypt.compare(password, user.password);
  if (match) {
    req.session.user = { username: user.username, role: user.role };
    res.json({ success: true, user: req.session.user });
  } else {
    res.json({ success: false, error: "Incorrect password" });
  }
});

// Socket.IO Chat
const users = new Map(); // username -> socket

io.on("connection", (socket) => {
  socket.on("login", (username) => {
    users.set(username, socket);
    socket.username = username;
  });

  socket.on("message", (msg) => {
    io.emit("message", { from: socket.username, message: msg });
  });

  socket.on("whisper", ({ to, message }) => {
    if (users.has(to)) users.get(to).emit("message", { from: socket.username, message });
  });

  // Admin-only commands
  socket.on("ban", (target) => {
    if (socket.username !== "admin") return;
    if (users.has(target)) users.get(target).disconnect();
  });

  socket.on("mute", (target) => {
    if (socket.username !== "admin") return;
    if (users.has(target)) users.get(target).emit("muted");
  });

  socket.on("clear", () => {
    if (socket.username !== "admin") return;
    io.emit("clearChat");
  });

  socket.on("disconnect", () => {
    users.delete(socket.username);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port 3000");
});
