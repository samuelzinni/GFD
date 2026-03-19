const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

router.get('/', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const eventId = req.query.event_id;
    if (!eventId) return res.status(400).json({ error: 'event_id required' });

    const db = admin.firestore();
    const tablesSnap = await db.collection('tables')
      .where('eventId', '==', eventId)
      .orderBy('tableNumber')
      .get();

    const tables = [];
    for (const tableDoc of tablesSnap.docs) {
      const table = { id: tableDoc.id, ...tableDoc.data() };

      const seatsSnap = await db.collection('seats')
        .where('tableId', '==', tableDoc.id)
        .orderBy('seatNumber')
        .get();

      const seats = [];
      for (const seatDoc of seatsSnap.docs) {
        const seat = { id: seatDoc.id, ...seatDoc.data() };

        // Load participant data if assigned
        if (seat.participantId) {
          const partDoc = await db.collection('participants').doc(seat.participantId).get();
          if (partDoc.exists) {
            const p = partDoc.data();
            seat.firstName = p.firstName;
            seat.lastName = p.lastName;
            seat.email = p.email;
            seat.ticketCode = p.ticketCode;
            seat.checkedIn = p.checkedIn;
            seat.participantRole = p.role;
          }
        }
        seats.push(seat);
      }

      table.seats = seats;
      tables.push(table);
    }

    res.json(tables);
  });
});

// Assign participant to seat
router.post('/:tableId/seats/:seatId/assign', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const { participant_id } = req.body;
    const db = admin.firestore();

    // Clear previous seat for this participant
    if (participant_id) {
      const oldSeats = await db.collection('seats')
        .where('participantId', '==', participant_id)
        .get();
      const batch = db.batch();
      oldSeats.forEach(doc => batch.update(doc.ref, { participantId: null }));
      await batch.commit();
    }

    // Clear current seat
    await db.collection('seats').doc(req.params.seatId).update({ participantId: null });

    // Assign
    if (participant_id) {
      await db.collection('seats').doc(req.params.seatId).update({ participantId: participant_id });
      await db.collection('participants').doc(participant_id).update({
        tableId: req.params.tableId,
        seatId: req.params.seatId
      });
    }

    res.json({ success: true });
  });
});

// Unassign
router.post('/:tableId/seats/:seatId/unassign', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const db = admin.firestore();
    const seatDoc = await db.collection('seats').doc(req.params.seatId).get();
    if (seatDoc.exists && seatDoc.data().participantId) {
      await db.collection('participants').doc(seatDoc.data().participantId).update({
        tableId: null, seatId: null
      });
    }
    await db.collection('seats').doc(req.params.seatId).update({ participantId: null });
    res.json({ success: true });
  });
});

module.exports = router;
