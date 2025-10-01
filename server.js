import express from "express";
import http from "http";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import session from "express-session";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let db;

// SQLite setup
(async () => {
  db = await open({
    filename: path.join(__dirname, "database.db"),
    driver: sqlite3.Database
  });

  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      isAdmin INTEGER DEFAULT 0
    )
  `);
})();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(
  session({
    secret: "secret_key",
    resave: false,
    saveUninitialized: true
  })
);

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "register.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "chat.html")));

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    await db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password]);
    res.redirect("/login.html");
  } catch {
    res.send("⚠ Username already exists. Try again.");
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE username = ? AND password = ?", [
    username,
    password
  ]);
  if (user) {
    req.session.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };
    res.redirect("/chat.html");
  } else {
    res.send("❌ Invalid username or password.");
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login.html");
});

// Store connected users
const onlineUsers = {};
const mutedUsers = {};

// Socket.IO
io.use((socket, next) => {
  const { username } = socket.handshake.auth;
  if (!username) return next(new Error("Not authenticated"));
  socket.username = username;
  next();
});

io.on("connection", socket => {
  onlineUsers[socket.id] = socket.username;
  io.emit("system", `${socket.username} joined the chat`);
  io.emit("userList", Object.values(onlineUsers));

  // Handle messages
  socket.on("chat", async msg => {
    const username = socket.username;

    // Check if muted
    if (mutedUsers[username] && Date.now() < mutedUsers[username].until) {
      socket.emit("muted", mutedUsers[username]);
      return;
    }

    // Commands
    if (msg.startsWith("/")) {
      const args = msg.split(" ");
      const command = args[0].toLowerCase();

      if (command === "/whisper") {
        const target = args[1];
        const privateMsg = args.slice(2).join(" ");
        let targetSocket = Object.entries(onlineUsers).find(([id, name]) => name === target);
        if (targetSocket) {
          const targetId = targetSocket[0];
          io.to(targetId).emit("whisper", { from: username, message: privateMsg });
          socket.emit("whisper", { from: username, message: privateMsg });
        } else {
          socket.emit("system", `⚠ User ${target} not found.`);
        }
      }

      else if (command === "/clear") {
        if (await isAdmin(username)) {
          io.emit("system", "🧹 Chat was cleared by admin.");
          io.emit("chat", { user: "System", message: "[Chat cleared]" });
        } else {
          socket.emit("system", "⛔ You are not an admin.");
        }
      }

      else if (command === "/kick") {
        if (await isAdmin(username)) {
          const target = args[1];
          let targetSocket = Object.entries(onlineUsers).find(([id, name]) => name === target);
          if (targetSocket) {
            const targetId = targetSocket[0];
            io.to(targetId).disconnectSockets(true);
            io.emit("system", `👢 ${target} was kicked by admin.`);
          }
        } else {
          socket.emit("system", "⛔ You are not an admin.");
        }
      }

      else if (command === "/mute") {
        if (await isAdmin(username)) {
          const target = args[1];
          const duration = parseInt(args[2]) || 60; // default 60 sec
          mutedUsers[target] = {
            until: Date.now() + duration * 1000,
            reason: "Muted by admin"
          };
          io.emit("system", `🔇 ${target} has been muted for ${duration} seconds.`);
        } else {
          socket.emit("system", "⛔ You are not an admin.");
        }
      }

      return;
    }

    // Normal message
    io.emit("chat", { user: username, message: msg });
  });

  // Disconnect
  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
    io.emit("system", `${socket.username} left the chat`);
    io.emit("userList", Object.values(onlineUsers));
  });
});

// Helper: check if user is admin
async function isAdmin(username) {
  const user = await db.get("SELECT isAdmin FROM users WHERE username = ?", [username]);
  return user && user.isAdmin === 1;
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
