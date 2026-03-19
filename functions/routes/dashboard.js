const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

router.get('/stats', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const eventId = req.query.event_id;
    if (!eventId) return res.status(400).json({ error: 'event_id required' });

    const db = admin.firestore();
    const participants = await db.collection('participants').where('eventId', '==', eventId).get();

    let totalStudents = 0, totalExecutives = 0, checkedIn = 0, seated = 0;
    participants.forEach(doc => {
      const p = doc.data();
      if (p.role === 'student') totalStudents++;
      else totalExecutives++;
      if (p.checkedIn) checkedIn++;
      if (p.seatId) seated++;
    });

    const tables = await db.collection('tables').where('eventId', '==', eventId).get();

    res.json({
      totalParticipants: participants.size,
      totalStudents,
      totalExecutives,
      checkedIn,
      notCheckedIn: participants.size - checkedIn,
      tablesCount: tables.size,
      seatedParticipants: seated
    });
  });
});

router.get('/recent-checkins', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const limit = parseInt(req.query.limit) || 20;
    const snapshot = await admin.firestore().collection('checkInLog')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const checkins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(checkins);
  });
});

module.exports = router;
