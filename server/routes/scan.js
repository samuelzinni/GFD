const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authMiddleware } = require('./auth');

// Scan QR code / check in participant
router.post('/checkin', authMiddleware, (req, res) => {
  const { ticket_code } = req.body;
  const db = getDb();

  const participant = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    WHERE p.ticket_code = ?
  `).get(ticket_code);

  if (!participant) {
    return res.status(404).json({ error: 'Invalid ticket code', valid: false });
  }

  if (participant.checked_in) {
    return res.json({
      valid: true,
      already_checked_in: true,
      participant,
      message: `${participant.first_name} ${participant.last_name} ist bereits eingecheckt.`
    });
  }

  // Check in
  const now = new Date().toISOString();
  db.prepare('UPDATE participants SET checked_in = 1, checked_in_at = ?, checked_in_by = ? WHERE id = ?').run(
    now, req.user.id, participant.id
  );

  // Log check-in
  db.prepare('INSERT INTO check_in_log (id, participant_id, action, scanned_by) VALUES (?, ?, ?, ?)').run(
    uuidv4(), participant.id, 'check_in', req.user.id
  );

  const updated = {
    ...participant,
    checked_in: 1,
    checked_in_at: now,
    checked_in_by: req.user.id
  };

  // Emit real-time update
  const io = req.app.get('io');
  io.to('dashboard').emit('check-in', updated);
  io.to('scanners').emit('check-in', updated);

  res.json({
    valid: true,
    already_checked_in: false,
    participant: updated,
    message: `${participant.first_name} ${participant.last_name} erfolgreich eingecheckt!`
  });
});

// Undo check-in
router.post('/checkout', authMiddleware, (req, res) => {
  const { participant_id } = req.body;
  const db = getDb();

  db.prepare('UPDATE participants SET checked_in = 0, checked_in_at = NULL, checked_in_by = NULL WHERE id = ?').run(participant_id);

  db.prepare('INSERT INTO check_in_log (id, participant_id, action, scanned_by) VALUES (?, ?, ?, ?)').run(
    uuidv4(), participant_id, 'check_out', req.user.id
  );

  const participant = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    WHERE p.id = ?
  `).get(participant_id);

  const io = req.app.get('io');
  io.to('dashboard').emit('check-out', participant);
  io.to('scanners').emit('check-out', participant);

  res.json({ success: true, participant });
});

module.exports = router;
