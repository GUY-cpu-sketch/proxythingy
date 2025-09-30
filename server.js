import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Ensure Render data folder exists ---
const dataDir = "/opt/render/project/data";
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// --- Ensure SQLite file exists ---
const dbPath = path.join(dataDir, "database.sqlite");
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "");

// --- Initialize SQLite ---
let db;
(async () => {
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);
})();

// --- Chat/admin data ---
const admins = ["DEV"];
let messages = [];
let mutedUsers = {}; // username -> timestamp
let lastWhisperFrom = {};
const onlineUsers = new Set();
const users = {}; // username -> socket

// --- Routes ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "public/register.html")));
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "public/chat.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin.html")));

// Redirect old .html URLs
["login.html","register.html","chat.html","admin.html"].forEach(page => {
  app.get(`/${page}`, (req,res)=>res.redirect(`/${page.replace(".html","")}`));
});

// --- Auth ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success:false, message:"Fill in all fields" });
  try {
    await db.run("INSERT INTO users (username,password) VALUES (?,?)", username,password);
    res.json({ success:true });
  } catch(e) {
    res.json({ success:false, message:"Username already exists" });
  }
});

app.post("/login", async (req,res)=>{
  const { username,password } = req.body;
  if (!username||!password) return res.json({ success:false, message:"Fill in all fields" });
  const user = await db.get("SELECT * FROM users WHERE username=? AND password=?", username,password);
  if(!user) return res.json({ success:false, message:"Invalid credentials" });
  res.json({ success:true, username });
});

// --- Admin DB download ---
app.get("/admin/download-db", (req,res)=>{
  const user = req.query.user;
  if(!admins.includes(user)) return res.status(403).send("Forbidden");
  res.download(dbPath, "database.sqlite");
});

// --- Admin messages API ---
app.get("/admin/messages", (req,res)=>{
  const { user } = req.query;
  if(!admins.includes(user)) return res.status(403).json({ error:"Forbidden" });
  res.json(messages);
});

// --- Socket.IO ---
io.use((socket,next)=>{
  const { username } = socket.handshake.auth;
  if(!username) return next(new Error("Invalid username"));
  socket.username=username;
  next();
});

io.on("connection", (socket)=>{
  const username = socket.username;
  const ip = socket.handshake.headers["x-forwarded-for"]?.split(",")[0] || socket.handshake.address;

  users[username] = socket;
  onlineUsers.add(username);

  io.emit("system", `${username} joined the chat`);
  io.emit("userList", Array.from(onlineUsers));

  socket.on("registerChatClient", ()=>{
    messages.forEach(msg => socket.emit("chat", msg));
  });

  socket.on("chat", (msg)=>{
    if(!msg) return;

    // --- Muted check ---
    if(mutedUsers[username] && Date.now() < mutedUsers[username]){
      socket.emit("muted", { until: mutedUsers[username], reason:"You have been muted by an admin" });
      return;
    }

    // --- Admin commands ---
    if(admins.includes(username) && msg.startsWith("/")){
      const parts = msg.split(" ");
      const command = parts[0].toLowerCase();

      switch(command){
        case "/kick":{
          const target = parts[1];
          const targetSocket = users[target];
          if(targetSocket) targetSocket.disconnect(true);
          io.emit("system", `DEV kicked ${target}`);
          return;
        }
        case "/clear":{
          messages = [];
          io.emit("clearChat");
          io.emit("system", "DEV cleared the chat");
          return;
        }
        case "/mute":{
          const target = parts[1];
          const duration = parseInt(parts[2]) || 60;
          mutedUsers[target] = Date.now() + duration*1000;
          io.emit("system", `${target} was muted for ${duration} seconds`);
          return;
        }
        case "/close":{
          const target = parts[1];
          const targetSocket = users[target];
          if(targetSocket){
            targetSocket.emit("forceClose");
            io.emit("system", `DEV closed ${target}'s chat`);
            messages.push({ user:"SYSTEM", message:`DEV closed ${target}'s chat`, ip:"-", timestamp:Date.now() });
          } else {
            socket.emit("system", `User "${target}" not found`);
          }
          return;
        }
      }
    }

    // --- Whisper ---
    if(msg.startsWith("/whisper ")){
      const parts = msg.split(" ");
      const target = parts[1];
      const text = parts.slice(2).join(" ");
      const targetSocket = users[target];
      if(!targetSocket){ socket.emit("system", `User "${target}" not found`); return; }
      const messageObj = { user:`(Whisper) ${username} → ${target}`, message:text, ip, timestamp:Date.now() };
      messages.push(messageObj);
      socket.emit("whisper", { from: username, message:text });
      targetSocket.emit("whisper", { from: username, message:text });
      io.emit("chat", messageObj);
      lastWhisperFrom[target]=username;
      return;
    }

    // --- Reply ---
    if(msg.startsWith("/r ")){
      const replyMsg = msg.slice(3).trim();
      const replyTo = lastWhisperFrom[username];
      if(!replyTo){ socket.emit("system", "No one to reply to."); return; }
      const targetSocket = users[replyTo];
      if(targetSocket){
        const messageObj = { user:`(Whisper) ${username} → ${replyTo}`, message:replyMsg, ip, timestamp:Date.now() };
        messages.push(messageObj);
        targetSocket.emit("whisper",{from:username,message:replyMsg});
        socket.emit("whisper",{from:username,message:replyMsg});
        io.emit("chat", messageObj);
        lastWhisperFrom[replyTo]=username;
      } else {
        socket.emit("system", `User "${replyTo}" not found`);
      }
      return;
    }

    // --- Normal message ---
    const messageObj = { user:username, message:msg, ip, timestamp:Date.now() };
    messages.push(messageObj);
    io.emit("chat", messageObj);
  });

  socket.on("disconnect", ()=>{
    delete users[username];
    onlineUsers.delete(username);
    io.emit("system", `${username} left the chat`);
    io.emit("userList", Array.from(onlineUsers));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
