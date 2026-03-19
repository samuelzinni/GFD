const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authMiddleware } = require('./auth');

// Get all events
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  res.json(events);
});

// Get single event
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// Update event
router.put('/:id', authMiddleware, (req, res) => {
  const { name, date, location, description } = req.body;
  const db = getDb();
  db.prepare('UPDATE events SET name = ?, date = ?, location = ?, description = ? WHERE id = ?').run(
    name, date, location, description, req.params.id
  );
  res.json({ success: true });
});

module.exports = router;
