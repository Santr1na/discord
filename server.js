const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

// Simple helper to run queries
const findUserByUsername = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);
const findUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const existing = findUserByUsername(username);
  if (existing) return res.status(400).json({ error: 'username taken' });
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
  const user = findUserById(info.lastInsertRowid);
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = findUserByUsername(username);
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
  res.json({ token, user: { id: user.id, username: user.username } });
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing auth' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  try {
    const payload = jwt.verify(parts[1], SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Friends
app.post('/api/friends/add', authMiddleware, (req, res) => {
  const { username } = req.body;
  const addressee = findUserByUsername(username);
  if (!addressee) return res.status(404).json({ error: 'user not found' });
  if (addressee.id === req.user.id) return res.status(400).json({ error: 'cannot add yourself' });
  // Check existing any direction
  const existing = db.prepare('SELECT * FROM friends WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)')
    .get(req.user.id, addressee.id, addressee.id, req.user.id);
  if (existing) return res.status(400).json({ error: 'request exists' });
  db.prepare('INSERT INTO friends (requester, addressee, status) VALUES (?, ?, ?)').run(req.user.id, addressee.id, 'pending');
  res.json({ ok: true });
});

app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const { requesterId } = req.body;
  const fr = db.prepare('SELECT * FROM friends WHERE requester = ? AND addressee = ?').get(requesterId, req.user.id);
  if (!fr) return res.status(404).json({ error: 'request not found' });
  db.prepare('UPDATE friends SET status = ? WHERE id = ?').run('accepted', fr.id);
  res.json({ ok: true });
});

app.get('/api/friends', authMiddleware, (req, res) => {
  // Return accepted friends
  const accepted = db.prepare(`
    SELECT u.id, u.username
    FROM friends f
    JOIN users u ON (u.id = CASE WHEN f.requester = ? THEN f.addressee ELSE f.requester END)
    WHERE (f.requester = ? OR f.addressee = ?) AND f.status = 'accepted'
  `).all(req.user.id, req.user.id, req.user.id);

  // Return incoming pending requests
  const incoming = db.prepare(`
    SELECT f.id as request_id, u.id as requester_id, u.username as requester_username
    FROM friends f
    JOIN users u ON u.id = f.requester
    WHERE f.addressee = ? AND f.status = 'pending'
  `).all(req.user.id);

  res.json({ friends: accepted, incoming });
});

app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username FROM users WHERE id != ?').all(req.user.id);
  res.json({ users });
});

app.get('/api/messages/:withId', authMiddleware, (req, res) => {
  const withId = Number(req.params.withId);
  const msgs = db.prepare('SELECT * FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at ASC')
    .all(req.user.id, withId, withId, req.user.id);
  res.json({ messages: msgs });
});

// Socket.IO for messaging and WebRTC signaling
const online = new Map(); // userId -> socket.id

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, SECRET);
    socket.user = payload;
    next();
  } catch (e) {
    next(new Error('invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  online.set(userId, socket.id);

  socket.on('private_message', (data) => {
    const { to, content } = data;
    const stmt = db.prepare('INSERT INTO messages (from_id, to_id, content, created_at) VALUES (?, ?, ?, ?)');
    stmt.run(userId, to, content, Date.now());
    const toSocket = online.get(to);
    const payload = { from: userId, to, content, created_at: Date.now() };
    if (toSocket) io.to(toSocket).emit('private_message', payload);
    socket.emit('private_message', payload);
  });

  // WebRTC signaling: offer/answer/candidate
  socket.on('webrtc-offer', (data) => {
    const { to, offer } = data;
    const toSocket = online.get(to);
    if (toSocket) io.to(toSocket).emit('webrtc-offer', { from: userId, offer });
  });

  socket.on('webrtc-answer', (data) => {
    const { to, answer } = data;
    const toSocket = online.get(to);
    if (toSocket) io.to(toSocket).emit('webrtc-answer', { from: userId, answer });
  });

  socket.on('webrtc-candidate', (data) => {
    const { to, candidate } = data;
    const toSocket = online.get(to);
    if (toSocket) io.to(toSocket).emit('webrtc-candidate', { from: userId, candidate });
  });

  socket.on('disconnect', () => {
    online.delete(userId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
