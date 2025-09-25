import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';

// ---- __dirname for ESM ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Express app ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cookieParser());

// ---- SQLite DB ----
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) console.error('DB error:', err);
});

// Users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`);

// Messages table
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ---- Session store ----
const sessions = {};

// ---- Register ----
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Missing fields' });

  db.run(
    'INSERT INTO users (username, password) VALUES (?, ?)',
    [username, password],
    (err) => {
      if (err) return res.json({ success: false, error: 'Username may already exist.' });

      const sessionId = crypto.randomUUID();
      sessions[sessionId] = username;
      res.cookie('sessionId', sessionId, { httpOnly: true });
      res.json({ success: true });
    }
  );
});

// ---- Login ----
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: 'Missing fields' });

  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.json({ success: false, error: 'Database error' });
    if (!row) return res.json({ success: false, error: 'Invalid username or password' });

    const sessionId = crypto.randomUUID();
    sessions[sessionId] = username;
    res.cookie('sessionId', sessionId, { httpOnly: true });
    res.json({ success: true });
  });
});

// ---- Logout ----
app.get('/logout', (req, res) => {
  const { sessionId } = req.cookies;
  if (sessionId) delete sessions[sessionId];
  res.clearCookie('sessionId');
  res.redirect('/login.html');
});

// ---- Protect chat ----
function requireLogin(req, res, next) {
  const { sessionId } = req.cookies;
  if (sessionId && sessions[sessionId]) {
    req.username = sessions[sessionId];
    next();
  } else {
    res.redirect('/login.html');
  }
}

// ---- Chat route ----
app.get('/chat', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat', 'index.html'));
});

// ---- Send message ----
app.post('/send-message', requireLogin, (req, res) => {
  const username = req.username;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Empty message' });

  db.run('INSERT INTO messages (user, message) VALUES (?, ?)', [username, message], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    io.emit('chat', { user: username, message, timestamp: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) });
    res.json({ success: true });
  });
});

// ---- Socket.IO ----
io.on('connection', socket => {
  db.all('SELECT * FROM messages ORDER BY id DESC LIMIT 50', [], (err, rows) => {
    if (err) return console.error(err);
    rows.reverse().forEach(row => socket.emit('chat', { user: row.user, message: row.message, timestamp: row.timestamp }));
  });

  socket.on('disconnect', () => {});
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
