const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

function generateTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GFD-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

router.get('/', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const eventId = req.query.event_id;
    let query = admin.firestore().collection('participants');
    if (eventId) query = query.where('eventId', '==', eventId);

    const snapshot = await query.orderBy('lastName').orderBy('firstName').get();
    const participants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(participants);
  });
});

router.get('/:id', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const doc = await admin.firestore().collection('participants').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  });
});

router.post('/', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const { firstName, lastName, email, phone, role, eventId, tableId, seatId, notes } = req.body;
    const ticketCode = generateTicketCode();

    const ref = await admin.firestore().collection('participants').add({
      eventId,
      ticketCode,
      firstName,
      lastName,
      email,
      phone: phone || null,
      role: role || 'student',
      tableId: tableId || null,
      seatId: seatId || null,
      checkedIn: false,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByName: null,
      ticketSent: false,
      ticketSentAt: null,
      notes: notes || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (seatId) {
      await admin.firestore().collection('seats').doc(seatId).update({ participantId: ref.id });
    }

    const doc = await ref.get();
    res.json({ id: doc.id, ...doc.data() });
  });
});

router.put('/:id', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const { firstName, lastName, email, phone, role, tableId, seatId, notes } = req.body;
    const db = admin.firestore();

    // Clear old seat
    const oldDoc = await db.collection('participants').doc(req.params.id).get();
    if (oldDoc.exists && oldDoc.data().seatId) {
      await db.collection('seats').doc(oldDoc.data().seatId).update({ participantId: null });
    }

    await db.collection('participants').doc(req.params.id).update({
      firstName, lastName, email, phone: phone || null, role,
      tableId: tableId || null,
      seatId: seatId || null,
      notes: notes || null
    });

    if (seatId) {
      await db.collection('seats').doc(seatId).update({ participantId: req.params.id });
    }

    const updated = await db.collection('participants').doc(req.params.id).get();
    res.json({ id: updated.id, ...updated.data() });
  });
});

router.delete('/:id', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const db = admin.firestore();
    const doc = await db.collection('participants').doc(req.params.id).get();
    if (doc.exists && doc.data().seatId) {
      await db.collection('seats').doc(doc.data().seatId).update({ participantId: null });
    }
    await db.collection('participants').doc(req.params.id).delete();
    res.json({ success: true });
  });
});

module.exports = router;
module.exports.generateTicketCode = generateTicketCode;
