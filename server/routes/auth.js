const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'gfd-ticketing-secret-2026';

// Middleware to verify JWT
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name } });
});

// Get current user
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Create user (admin only)
router.post('/users', authMiddleware, adminMiddleware, (req, res) => {
  const { username, password, display_name, role } = req.body;
  const db = getDb();

  try {
    const hash = bcrypt.hashSync(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)').run(
      id, username, hash, display_name, role || 'scanner'
    );
    res.json({ id, username, display_name, role: role || 'scanner' });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

// List users (admin only)
router.get('/users', authMiddleware, adminMiddleware, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, username, display_name, role, created_at FROM users').all();
  res.json(users);
});

// Delete user (admin only)
router.delete('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ? AND username != ?').run(req.params.id, 'admin');
  res.json({ success: true });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.adminMiddleware = adminMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
