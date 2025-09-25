import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// ---- __dirname for ESM ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Express app ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---- SQLite database ----
let db;
async function initDB() {
  db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
initDB();

// ---- Serve static files (your proxy site) ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- Chat route ----
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat', 'index.html'));
});

// ---- Socket.IO chat ----
io.on('connection', socket => {
  console.log('A user connected');

  // Send last 50 messages to new user
  db.all('SELECT * FROM messages ORDER BY id DESC LIMIT 50').then(rows => {
    rows.reverse().forEach(row => {
      socket.emit('chat', { user: row.user, message: row.message });
    });
  });

  // Listen for new messages
  socket.on('chat', async data => {
    await db.run('INSERT INTO messages (user, message) VALUES (?, ?)', data.user, data.message);
    io.emit('chat', data);
  });

  socket.on('disconnect', () => console.log('A user disconnected'));
});

// ---- Use Render's PORT ----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
