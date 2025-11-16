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

// Simple helper to run queries (async)
const findUserByUsername = async (username) => await db.get('SELECT * FROM users WHERE username = ?', [username]);
const findUserById = async (id) => await db.get('SELECT * FROM users WHERE id = ?', [id]);

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  console.log(`[auth] register attempt from ${req.ip} username=${username}`);
  try {
    if (!username || !password) {
      console.warn('[auth] register missing fields', { ip: req.ip, username });
      return res.status(400).json({ error: 'username and password required' });
    }
    const existing = await findUserByUsername(username);
    if (existing) {
      console.warn('[auth] register username taken', { username, ip: req.ip });
      return res.status(400).json({ error: 'username taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    const info = await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
    const insertedId = info && info.lastInsertRowid;
    const user = await findUserById(insertedId);
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
    console.log('[auth] register success', { userId: user.id, username: user.username, ip: req.ip });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('[auth] register error', { err: err && err.message, ip: req.ip, username });
    res.status(500).json({ error: 'internal error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  console.log(`[auth] login attempt from ${req.ip} username=${username}`);
  try {
    const user = await findUserByUsername(username);
    if (!user) {
      console.warn('[auth] login failed - user not found', { username, ip: req.ip });
      return res.status(400).json({ error: 'invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      console.warn('[auth] login failed - bad password', { username, userId: user.id, ip: req.ip });
      return res.status(400).json({ error: 'invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
    console.log('[auth] login success', { userId: user.id, username: user.username, ip: req.ip });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('[auth] login error', { err: err && err.message, ip: req.ip, username });
    res.status(500).json({ error: 'internal error' });
  }
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  console.log('[auth] middleware check', { ip: req.ip, authPresent: !!auth });
  if (!auth) return res.status(401).json({ error: 'missing auth' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  try {
    const payload = jwt.verify(parts[1], SECRET);
    req.user = payload;
    next();
  } catch (e) {
    console.warn('[auth] invalid token', { ip: req.ip, err: e && e.message });
    res.status(401).json({ error: 'invalid token' });
  }
}

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Friends
app.post('/api/friends/add', authMiddleware, (req, res) => {
  const { username } = req.body;
  // convert to async flow
  (async () => {
    const addressee = await findUserByUsername(username);
    if (!addressee) return res.status(404).json({ error: 'user not found' });
    if (addressee.id === req.user.id) return res.status(400).json({ error: 'cannot add yourself' });
    // Check existing any direction
    const existing = await db.get('SELECT * FROM friends WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)', [req.user.id, addressee.id, addressee.id, req.user.id]);
    if (existing) return res.status(400).json({ error: 'request exists' });
    await db.run('INSERT INTO friends (requester, addressee, status) VALUES (?, ?, ?)', [req.user.id, addressee.id, 'pending']);
    // Notify addressee
    console.log('[friends] request sent from', req.user.username, 'to', addressee.username)
    const addresseeSocket = online.get(addressee.id);
    if (addresseeSocket) {
      io.to(addresseeSocket).emit('friend_request', { from: req.user.id, username: req.user.username });
      console.log('[friends] notified', addressee.username)
    } else {
      console.log('[friends] addressee not online', addressee.username)
    }
    res.json({ ok: true });
  })().catch(err => { console.error('[friends] add error', err); res.status(500).json({ error: 'internal' }); });
});

app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const { requesterId } = req.body;
  (async () => {
    const fr = await db.get('SELECT * FROM friends WHERE requester = ? AND addressee = ?', [requesterId, req.user.id]);
    if (!fr) return res.status(404).json({ error: 'request not found' });
    await db.run('UPDATE friends SET status = ? WHERE id = ?', ['accepted', fr.id]);
    res.json({ ok: true });
  })().catch(err => { console.error('[friends] accept error', err); res.status(500).json({ error: 'internal' }); });
});

app.get('/api/friends', authMiddleware, (req, res) => {
  (async () => {
    const accepted = await db.all(`
      SELECT u.id, u.username
      FROM friends f
      JOIN users u ON (u.id = CASE WHEN f.requester = ? THEN f.addressee ELSE f.requester END)
      WHERE (f.requester = ? OR f.addressee = ?) AND f.status = 'accepted'
    `, [req.user.id, req.user.id, req.user.id]);

    const incoming = await db.all(`
      SELECT f.id as request_id, u.id as requester_id, u.username as requester_username
      FROM friends f
      JOIN users u ON u.id = f.requester
      WHERE f.addressee = ? AND f.status = 'pending'
    `, [req.user.id]);

    console.log('[api] friends for', req.user.username, 'accepted:', accepted.length, 'incoming:', incoming.length);
    res.json({ friends: accepted, incoming });
  })().catch(err => { console.error('[friends] list error', err); res.status(500).json({ error: 'internal' }); });
});

app.get('/api/users', authMiddleware, (req, res) => {
  (async () => {
    const search = (req.query.search || '').trim();
    let users;
    if (search) {
      const q = `%${search}%`;
      users = await db.all('SELECT id, username FROM users WHERE id != ? AND LOWER(username) LIKE LOWER(?)', [req.user.id, q]);
    } else {
      users = await db.all('SELECT id, username FROM users WHERE id != ?', [req.user.id]);
    }
    console.log('[api] users for', req.user.username, 'search:', search, 'count:', users.length);
    res.json({ users });
  })().catch(err => { console.error('[users] list error', err); res.status(500).json({ error: 'internal' }); });
});

app.get('/api/messages/:withId', authMiddleware, (req, res) => {
  (async () => {
    const withId = Number(req.params.withId);
    const msgs = await db.all('SELECT * FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at ASC', [req.user.id, withId, withId, req.user.id]);
    res.json({ messages: msgs });
  })().catch(err => { console.error('[messages] list error', err); res.status(500).json({ error: 'internal' }); });
});

// Socket.IO for messaging and WebRTC signaling
const online = new Map(); // userId -> socket.id

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  console.log('[socket] auth attempt ip=', socket.handshake.address, ' tokenPresent=', !!token);
  if (!token) {
    console.warn('[socket] missing token on handshake', { addr: socket.handshake.address });
    return next(new Error('unauthorized'));
  }
  try {
    const payload = jwt.verify(token, SECRET);
    socket.user = payload;
    console.log('[socket] auth success', { userId: payload.id, username: payload.username });
    next();
  } catch (e) {
    console.warn('[socket] invalid token on handshake', { err: e && e.message });
    next(new Error('invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  console.log('[socket] user connected', socket.user.username);
  online.set(userId, socket.id);

  socket.on('private_message', async (data) => {
    try {
      const { to, content } = data;
      await db.run('INSERT INTO messages (from_id, to_id, content, created_at) VALUES (?, ?, ?, ?)', [userId, to, content, Date.now()]);
      const toSocket = online.get(to);
      const payload = { from: userId, to, content, created_at: Date.now() };
      console.log('[socket] message from', socket.user.username, 'to', to, 'content length', content.length);
      if (toSocket) io.to(toSocket).emit('private_message', payload);
      socket.emit('private_message', payload);
    } catch (err) { console.error('[socket] private_message error', err); }
  });

  // WebRTC signaling: offer/answer/candidate
  socket.on('webrtc-offer', async (data) => {
    console.log('[socket] webrtc-offer from', socket.user.username, 'to', data.to)
    const { to, offer } = data;
    const toSocket = online.get(to);
    if (toSocket) {
      const fromUser = await findUserById(userId);
      io.to(toSocket).emit('webrtc-offer', { from: userId, username: fromUser.username, offer });
      console.log('[socket] sent webrtc-offer to', fromUser.username)
    } else {
      console.log('[socket] user not online', to)
    }
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

  socket.on('webrtc-hangup', (data) => {
    const { to } = data;
    const toSocket = online.get(to);
    if (toSocket) io.to(toSocket).emit('webrtc-hangup', { from: userId });
  });

  socket.on('webrtc-reject', (data) => {
    const { to } = data;
    const toSocket = online.get(to);
    if (toSocket) io.to(toSocket).emit('webrtc-reject', { from: userId });
  });

  socket.on('disconnect', () => {
    online.delete(userId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});

// Health check
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Generic error handler for express
app.use((err, req, res, next) => {
  console.error('[server] unhandled error', err && err.stack ? err.stack : err);
  try { res.status(500).json({ error: 'internal' }); } catch(e) { /* ignore */ }
});
