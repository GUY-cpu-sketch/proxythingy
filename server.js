import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import session from "express-session";
import bcrypt from "bcrypt";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Database("database.sqlite");
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Mason"; // set yourself as admin

// --- DB setup ---
db.prepare(`CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  banned INTEGER DEFAULT 0,
  muted INTEGER DEFAULT 0
)`).run();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: null } // expires when browser closes
}));

app.use(express.static(path.join(__dirname, "public")));

// --- Minimal Proxy ---
app.get("/proxy", (req,res,next) => {
  const targetUrl = req.query.url;
  if(!targetUrl) return res.status(400).send("Missing ?url= parameter");

  createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    selfHandleResponse: false,
    onProxyRes: (proxyRes) => {
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["content-security-policy"];
    }
  })(req,res,next);
});

// --- Auth routes ---
app.post("/register", async (req,res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password,10);
  try{
    db.prepare("INSERT INTO users(username,password) VALUES(?,?)").run(username, hash);
    res.json({ success:true });
  } catch(e){
    res.json({ success:false, message:"Username taken" });
  }
});

app.post("/login", async (req,res) => {
  const { username, password } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if(row && await bcrypt.compare(password,row.password)){
    req.session.user = { 
      id: row.id, 
      username: row.username, 
      banned: row.banned, 
      muted: row.muted, 
      isAdmin: row.username === ADMIN_USERNAME 
    };
    res.json({ success:true });
  } else res.json({ success:false });
});

// --- WebSocket Chat ---
io.use((socket,next) => {
  const sessionData = socket.handshake.auth.session;
  if(sessionData && !sessionData.banned){
    socket.user = sessionData;
    next();
  } else next(new Error("unauthorized"));
});

io.on("connection", socket => {
  socket.on("chat", msg => {
    if(msg.startsWith("/")){
      const parts = msg.split(" ");
      const cmd = parts[0].toLowerCase();

      if(socket.user.isAdmin){
        switch(cmd){
          case "/ban":
            const banUser = parts[1];
            db.prepare("UPDATE users SET banned=1 WHERE username=?").run(banUser);
            io.emit("system", `${banUser} has been banned by admin.`);
            break;
          case "/unban":
            const unbanUser = parts[1];
            db.prepare("UPDATE users SET banned=0 WHERE username=?").run(unbanUser);
            io.emit("system", `${unbanUser} has been unbanned by admin.`);
            break;
          case "/mute":
            const muteUsers = parts[1].split(",");
            muteUsers.forEach(u => db.prepare("UPDATE users SET muted=1 WHERE username=?").run(u));
            io.emit("system", `Muted users: ${parts[1]}`);
            break;
          case "/unmute":
            const unmuteUsers = parts[1].split(",");
            unmuteUsers.forEach(u => db.prepare("UPDATE users SET muted=0 WHERE username=?").run(u));
            io.emit("system", `Unmuted users: ${parts[1]}`);
            break;
          case "/clear":
            io.emit("clear"); // clients clear their chat
            break;
        }
      }
    } else if(!socket.user.muted){
      io.emit("chat", { user: socket.user.username, message: msg });
    }
  });
});

server.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
