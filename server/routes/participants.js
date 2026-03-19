const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authMiddleware } = require('./auth');

function generateTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GFD-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get all participants for an event
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const eventId = req.query.event_id;

  let query = `
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type,
           u.display_name as checked_in_by_name
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    LEFT JOIN users u ON p.checked_in_by = u.id
  `;

  if (eventId) {
    query += ' WHERE p.event_id = ?';
    const participants = db.prepare(query + ' ORDER BY p.last_name, p.first_name').all(eventId);
    return res.json(participants);
  }

  const participants = db.prepare(query + ' ORDER BY p.last_name, p.first_name').all();
  res.json(participants);
});

// Get single participant
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const participant = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type,
           u.display_name as checked_in_by_name
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    LEFT JOIN users u ON p.checked_in_by = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  res.json(participant);
});

// Create participant
router.post('/', authMiddleware, (req, res) => {
  const { first_name, last_name, email, role, event_id, table_id, seat_id, notes } = req.body;
  const db = getDb();

  const id = uuidv4();
  const ticket_code = generateTicketCode();

  db.prepare(`
    INSERT INTO participants (id, event_id, ticket_code, first_name, last_name, email, role, table_id, seat_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, event_id, ticket_code, first_name, last_name, email, role || 'student', table_id || null, seat_id || null, notes || null);

  // Update seat assignment
  if (seat_id) {
    db.prepare('UPDATE seats SET participant_id = ? WHERE id = ?').run(id, seat_id);
  }

  const participant = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    WHERE p.id = ?
  `).get(id);

  // Emit real-time update
  const io = req.app.get('io');
  io.to('dashboard').emit('participant-added', participant);

  res.json(participant);
});

// Update participant
router.put('/:id', authMiddleware, (req, res) => {
  const { first_name, last_name, email, role, table_id, seat_id, notes } = req.body;
  const db = getDb();

  // Clear old seat assignment
  const oldParticipant = db.prepare('SELECT seat_id FROM participants WHERE id = ?').get(req.params.id);
  if (oldParticipant?.seat_id) {
    db.prepare('UPDATE seats SET participant_id = NULL WHERE id = ?').run(oldParticipant.seat_id);
  }

  db.prepare(`
    UPDATE participants SET first_name = ?, last_name = ?, email = ?, role = ?, table_id = ?, seat_id = ?, notes = ?
    WHERE id = ?
  `).run(first_name, last_name, email, role, table_id || null, seat_id || null, notes || null, req.params.id);

  // Update new seat assignment
  if (seat_id) {
    db.prepare('UPDATE seats SET participant_id = ? WHERE id = ?').run(req.params.id, seat_id);
  }

  const participant = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    WHERE p.id = ?
  `).get(req.params.id);

  const io = req.app.get('io');
  io.to('dashboard').emit('participant-updated', participant);

  res.json(participant);
});

// Delete participant
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();

  const participant = db.prepare('SELECT seat_id FROM participants WHERE id = ?').get(req.params.id);
  if (participant?.seat_id) {
    db.prepare('UPDATE seats SET participant_id = NULL WHERE id = ?').run(participant.seat_id);
  }

  db.prepare('DELETE FROM participants WHERE id = ?').run(req.params.id);

  const io = req.app.get('io');
  io.to('dashboard').emit('participant-removed', { id: req.params.id });

  res.json({ success: true });
});

module.exports = router;
