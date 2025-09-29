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

let users = {}; // socket.id -> { username, ip }
let messages = [];

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", socket => {
  const username = socket.handshake.auth.username || "Anonymous";
  const ip =
    socket.handshake.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    socket.handshake.address;

  users[socket.id] = { username, ip };

  console.log(`${username} connected from ${ip}`);

  // Notify others
  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Object.values(users).map(u => u.username));

  // Send chat history
  messages.forEach(m => socket.emit("chat", m));

  // Handle chat messages
  socket.on("chat", msg => {
    if (!msg) return;

    // --- Admin commands ---
    if (username === "DEV") {
      if (msg.startsWith("/kick ")) {
        const target = msg.split(" ")[1];
        const targetSocket = Object.entries(users).find(
          ([, u]) => u.username === target
        );
        if (targetSocket) {
          io.to(targetSocket[0]).emit("system", "You were kicked by DEV.");
          io.sockets.sockets.get(targetSocket[0])?.disconnect(true);
          io.emit("system", `${target} was kicked by DEV`);
        }
        return;
      }

      if (msg.startsWith("/mute ")) {
        // not fully implemented, placeholder
        io.emit("system", `${username} muted someone`);
        return;
      }

      if (msg.startsWith("/clear")) {
        messages = [];
        io.emit("clearChat"); // 🔑 tell clients to clear UI
        io.emit("system", `${username} cleared the chat`);
        return;
      }
    }

    // --- Whisper ---
    if (msg.startsWith("/whisper ")) {
      const parts = msg.split(" ");
      const target = parts[1];
      const whisperMsg = parts.slice(2).join(" ");
      const targetSocket = Object.entries(users).find(
        ([, u]) => u.username === target
      );
      if (targetSocket) {
        io.to(targetSocket[0]).emit("whisper", {
          from: username,
          message: whisperMsg
        });
        socket.emit("whisper", { from: username, message: whisperMsg });
      }
      return;
    }

    // --- Normal chat ---
    const data = { user: username, message: msg };
    messages.push(data);
    io.emit("chat", data);
  });

  // Disconnect
  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Object.values(users).map(u => u.username));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
