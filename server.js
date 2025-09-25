import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';

// --- __dirname fix for ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Express setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

// --- SQLite ---
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), err => {
  if (err) console.error(err);
});

// --- Tables ---
db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
db.run(`CREATE TABLE IF NOT EXISTS banned_users (username TEXT PRIMARY KEY)`);

// --- Session store ---
const sessions = {};

// --- Login middleware ---
function requireLogin(req, res, next) {
  const { sessionId } = req.cookies;
  if (sessionId && sessions[sessionId]) {
    const username = sessions[sessionId];
    db.get('SELECT * FROM banned_users WHERE username = ?', [username], (err, row) => {
      if (row) {
        res.clearCookie('sessionId');
        return res.redirect('/login.html');
      }
      req.username = username;
      next();
    });
  } else {
    res.redirect('/login.html');
  }
}

// --- Routes ---

// Register
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  console.log("Register attempt:", username);
  if (!username || !password) return res.json({ success: false, error: 'Missing fields' });

  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], err => {
    if (err) return res.json({ success: false, error: 'Username may exist' });

    const sessionId = crypto.randomUUID();
    sessions[sessionId] = username;
    res.cookie('sessionId', sessionId, { httpOnly: true });
    console.log("Register successful:", username);
    res.json({ success: true });
  });
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log("Login attempt:", username);

  if (!username || !password) return res.json({ success: false, error: 'Missing fields' });

  db.get('SELECT * FROM banned_users WHERE username = ?', [username], (err, row) => {
    if (row) return res.json({ success: false, error: 'You are banned.' });

    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
      if (err) return res.json({ success: false, error: 'Database error' });
      if (!row) return res.json({ success: false, error: 'Invalid username or password' });

      const sessionId = crypto.randomUUID();
      sessions[sessionId] = username;
      res.cookie('sessionId', sessionId, { httpOnly: true });
      console.log("Login successful:", username);
      res.json({ success: true });
    });
  });
});

// Logout
app.get('/logout', (req, res) => {
  const { sessionId } = req.cookies;
  if (sessionId) delete sessions[sessionId];
  res.clearCookie('sessionId');
  res.redirect('/login.html');
});

// Chat page
app.get('/chat', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat', 'index.html'));
});

// --- Socket.IO ---
const onlineUsers = new Set();
io.on('connection', socket => {

  // Prevent duplicate messages by only emitting messages via socket
  db.all('SELECT * FROM messages ORDER BY id DESC LIMIT 50', [], (err, rows) => {
    if (!err) rows.reverse().forEach(row => socket.emit('chat', { user: row.user, message: row.message, timestamp: row.timestamp }));
  });

  // Register user
  socket.on('register-user', username => {
    socket.username = username;
    onlineUsers.add(username);
    io.emit('update-users', Array.from(onlineUsers));
  });

  // Send chat
  socket.on('send-chat', message => {
    if (!socket.username || !message.trim()) return;

    // --- Bad word filter (strictness 3) ---
    const badWords = ["badword1","badword2","badword3"];
    const regex = new RegExp(`\\b(${badWords.join("|")})\\b`, "gi");
    if (regex.test(message)) return; // silently block

    db.run('INSERT INTO messages (user, message) VALUES (?, ?)', [socket.username, message], err => {
      if (!err) io.emit('chat', { user: socket.username, message, timestamp: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) });
    });
  });

  // Admin commands
  socket.on('admin-kick', targetUser => io.emit('kick', targetUser));
  socket.on('admin-ban', targetUser => {
    db.run('INSERT OR IGNORE INTO banned_users (username) VALUES (?)', [targetUser], err => {
      if (!err) io.emit('ban', targetUser);
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('update-users', Array.from(onlineUsers));
    }
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
