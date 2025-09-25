import express from "express";
import session from "express-session";
import { createProxyMiddleware } from "http-proxy-middleware";
import bcrypt from "bcrypt";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Database("./database.sqlite");

// Create users table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )
`).run();

const ADMIN_USERNAME = "Mason";  // change this as needed

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "MEWyatt32411",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: null }  // session ends when browser closed
}));

app.use(express.static(path.join(__dirname, "public")));

// Proxy route
app.get("/proxy", (req, res, next) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing ?url= parameter");
  }
  createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: false,
    onProxyRes: (proxyRes) => {
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["content-security-policy"];
    }
  })(req, res, next);
});

// Auth: register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: "Missing username or password" });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare("INSERT INTO users(username, password) VALUES(?, ?)").run(username, hash);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: "Username taken" });
  }
});

// Auth: login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) {
    return res.json({ success: false, message: "User not found" });
  }
  const match = await bcrypt.compare(password, row.password);
  if (!match) {
    return res.json({ success: false, message: "Incorrect password" });
  }
  req.session.user = {
    username: row.username,
    role: row.role,
    isAdmin: row.username === ADMIN_USERNAME
  };
  res.json({ success: true, user: req.session.user });
});

// Socket.IO for chat
io.use((socket, next) => {
  const sessionData = socket.handshake.auth.session;
  if (sessionData) {
    socket.user = sessionData;
    return next();
  }
  return next(new Error("unauthorized"));
});

io.on("connection", (socket) => {
  // Chat message
  socket.on("chat", (msg) => {
    if (msg.startsWith("/")) {
      const parts = msg.split(" ");
      const cmd = parts[0].toLowerCase();
      if (socket.user.isAdmin) {
        switch (cmd) {
          case "/ban": {
            const target = parts[1];
            db.prepare("UPDATE users SET role = 'banned' WHERE username = ?").run(target);
            io.emit("system", `${target} was banned`);
            break;
          }
          case "/unban": {
            const target = parts[1];
            db.prepare("UPDATE users SET role = 'user' WHERE username = ?").run(target);
            io.emit("system", `${target} was unbanned`);
            break;
          }
          case "/mute": {
            const target = parts[1];
            db.prepare("UPDATE users SET role = 'muted' WHERE username = ?").run(target);
            io.emit("system", `Muted ${target}`);
            break;
          }
          case "/unmute": {
            const target = parts[1];
            db.prepare("UPDATE users SET role = 'user' WHERE username = ?").run(target);
            io.emit("system", `Unmuted ${target}`);
            break;
          }
          case "/clear": {
            io.emit("clear");  // tell clients to clear chat
            break;
          }
        }
      }
    } else {
      // normal message
      if (socket.user.role !== "muted" && socket.user.role !== "banned") {
        io.emit("chat", { user: socket.user.username, message: msg });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
