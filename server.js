import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat', 'index.html'));
});

io.on('connection', socket => {
  console.log('A user connected');

  db.all('SELECT * FROM messages ORDER BY id DESC LIMIT 50').then(rows => {
    rows.reverse().forEach(row => {
      socket.emit('chat', { user: row.user, message: row.message });
    });
  });

  socket.on('chat', async data => {
    await db.run('INSERT INTO messages (user, message) VALUES (?, ?)', data.user, data.message);
    io.emit('chat', data);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
