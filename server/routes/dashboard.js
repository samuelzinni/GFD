const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { authMiddleware } = require('./auth');

// Get dashboard stats
router.get('/stats', authMiddleware, (req, res) => {
  const db = getDb();
  const eventId = req.query.event_id;

  if (!eventId) return res.status(400).json({ error: 'event_id required' });

  const totalParticipants = db.prepare('SELECT COUNT(*) as count FROM participants WHERE event_id = ?').get(eventId).count;
  const totalStudents = db.prepare("SELECT COUNT(*) as count FROM participants WHERE event_id = ? AND role = 'student'").get(eventId).count;
  const totalExecutives = db.prepare("SELECT COUNT(*) as count FROM participants WHERE event_id = ? AND role = 'executive'").get(eventId).count;
  const checkedIn = db.prepare('SELECT COUNT(*) as count FROM participants WHERE event_id = ? AND checked_in = 1').get(eventId).count;
  const ticketsSent = db.prepare('SELECT COUNT(*) as count FROM participants WHERE event_id = ? AND ticket_sent = 1').get(eventId).count;
  const tablesCount = db.prepare('SELECT COUNT(*) as count FROM tables WHERE event_id = ?').get(eventId).count;
  const seatedParticipants = db.prepare('SELECT COUNT(*) as count FROM participants WHERE event_id = ? AND seat_id IS NOT NULL').get(eventId).count;

  res.json({
    totalParticipants,
    totalStudents,
    totalExecutives,
    checkedIn,
    notCheckedIn: totalParticipants - checkedIn,
    ticketsSent,
    ticketsNotSent: totalStudents - ticketsSent,
    tablesCount,
    seatedParticipants
  });
});

// Get recent check-ins
router.get('/recent-checkins', authMiddleware, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 20;

  const checkins = db.prepare(`
    SELECT cl.*, p.first_name, p.last_name, p.ticket_code,
           t.table_number, u.display_name as scanned_by_name
    FROM check_in_log cl
    JOIN participants p ON cl.participant_id = p.id
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN users u ON cl.scanned_by = u.id
    ORDER BY cl.timestamp DESC
    LIMIT ?
  `).all(limit);

  res.json(checkins);
});

module.exports = router;
