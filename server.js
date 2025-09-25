import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const onlineUsers = new Map();
const ADMIN_USER = "DEV";

// --- Socket.IO ---
io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Expect client to send username immediately
  socket.on("register-user", (username) => {
    if (!username) return;

    socket.username = username;
    onlineUsers.set(socket.id, username);

    // Welcome message
    socket.emit("system", `Welcome, ${username}!`);
    socket.broadcast.emit("system", `${username} joined the chat`);
    io.emit("update-users", [...onlineUsers.values()]);
  });

  // Handle chat messages
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

  // Disconnect
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
