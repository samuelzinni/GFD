const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authMiddleware } = require('./auth');

// Get all tables for an event with seats and participants
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const eventId = req.query.event_id;

  if (!eventId) return res.status(400).json({ error: 'event_id required' });

  const tables = db.prepare('SELECT * FROM tables WHERE event_id = ? ORDER BY table_number').all(eventId);

  const result = tables.map(table => {
    const seats = db.prepare(`
      SELECT s.*, p.first_name, p.last_name, p.email, p.ticket_code, p.checked_in, p.role as participant_role
      FROM seats s
      LEFT JOIN participants p ON s.participant_id = p.id
      WHERE s.table_id = ?
      ORDER BY s.seat_number
    `).all(table.id);

    return { ...table, seats };
  });

  res.json(result);
});

// Get single table with seats
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const seats = db.prepare(`
    SELECT s.*, p.first_name, p.last_name, p.email, p.ticket_code, p.checked_in, p.role as participant_role
    FROM seats s
    LEFT JOIN participants p ON s.participant_id = p.id
    WHERE s.table_id = ?
    ORDER BY s.seat_number
  `).all(table.id);

  res.json({ ...table, seats });
});

// Assign participant to seat
router.post('/:tableId/seats/:seatId/assign', authMiddleware, (req, res) => {
  const { participant_id } = req.body;
  const db = getDb();

  // Clear any previous seat for this participant
  if (participant_id) {
    const oldSeat = db.prepare('SELECT id FROM seats WHERE participant_id = ?').get(participant_id);
    if (oldSeat) {
      db.prepare('UPDATE seats SET participant_id = NULL WHERE id = ?').run(oldSeat.id);
    }
  }

  // Clear current seat occupant
  db.prepare('UPDATE seats SET participant_id = NULL WHERE id = ?').run(req.params.seatId);

  // Assign new participant
  if (participant_id) {
    db.prepare('UPDATE seats SET participant_id = ? WHERE id = ?').run(participant_id, req.params.seatId);
    db.prepare('UPDATE participants SET table_id = ?, seat_id = ? WHERE id = ?').run(
      req.params.tableId, req.params.seatId, participant_id
    );
  }

  const io = req.app.get('io');
  io.to('dashboard').emit('seating-updated');

  res.json({ success: true });
});

// Unassign participant from seat
router.post('/:tableId/seats/:seatId/unassign', authMiddleware, (req, res) => {
  const db = getDb();

  const seat = db.prepare('SELECT participant_id FROM seats WHERE id = ?').get(req.params.seatId);
  if (seat?.participant_id) {
    db.prepare('UPDATE participants SET table_id = NULL, seat_id = NULL WHERE id = ?').run(seat.participant_id);
  }

  db.prepare('UPDATE seats SET participant_id = NULL WHERE id = ?').run(req.params.seatId);

  const io = req.app.get('io');
  io.to('dashboard').emit('seating-updated');

  res.json({ success: true });
});

module.exports = router;
