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

// Rename table
router.put('/:tableId', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => {
    adminMiddleware(req, res, async () => {
      try {
        const { tableName } = req.body;
        if (!tableName || !tableName.trim()) {
          return res.status(400).json({ error: 'tableName is required' });
        }
        const db = admin.firestore();
        const tableRef = db.collection('tables').doc(req.params.tableId);
        const tableDoc = await tableRef.get();
        if (!tableDoc.exists) {
          return res.status(404).json({ error: 'Table not found' });
        }
        await tableRef.update({ tableName: tableName.trim() });
        res.json({ success: true });
      } catch (err) {
        console.error('Error renaming table:', err);
        res.status(500).json({ error: 'Failed to rename table' });
      }
    });
  });
});

// Delete table
router.delete('/:tableId', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => {
    adminMiddleware(req, res, async () => {
      try {
        const db = admin.firestore();
        const tableRef = db.collection('tables').doc(req.params.tableId);
        const tableDoc = await tableRef.get();
        if (!tableDoc.exists) {
          return res.status(404).json({ error: 'Table not found' });
        }

        // Get all seats for this table
        const seatsSnap = await db.collection('seats')
          .where('tableId', '==', req.params.tableId)
          .get();

        // Check if any seats have participants assigned
        const hasAssigned = seatsSnap.docs.some(d => d.data().participantId);
        if (hasAssigned) {
          return res.status(400).json({ error: 'Tisch hat noch zugewiesene Teilnehmer' });
        }

        // Delete all seats and the table in a batch
        const batch = db.batch();
        seatsSnap.docs.forEach(seatDoc => batch.delete(seatDoc.ref));
        batch.delete(tableRef);
        await batch.commit();

        res.json({ success: true });
      } catch (err) {
        console.error('Error deleting table:', err);
        res.status(500).json({ error: 'Failed to delete table' });
      }
    });
  });
});

// Create a new table with 9 default seats
router.post('/', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => {
    adminMiddleware(req, res, async () => {
      try {
        const { eventId } = req.body;
        if (!eventId) {
          return res.status(400).json({ error: 'eventId is required' });
        }

        const db = admin.firestore();

        // Determine next table number
        const existingTables = await db.collection('tables')
          .where('eventId', '==', eventId)
          .orderBy('tableNumber', 'desc')
          .limit(1)
          .get();
        const nextNumber = existingTables.empty ? 1 : existingTables.docs[0].data().tableNumber + 1;

        const seatPattern = ['student', 'student', 'executive', 'student', 'student', 'executive', 'student', 'student', 'executive'];

        const batch = db.batch();

        const tableRef = db.collection('tables').doc();
        batch.set(tableRef, {
          eventId,
          tableNumber: nextNumber,
          tableName: `Tisch ${nextNumber}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        for (let s = 1; s <= 9; s++) {
          const seatRef = db.collection('seats').doc();
          batch.set(seatRef, {
            tableId: tableRef.id,
            eventId,
            seatNumber: s,
            seatType: seatPattern[s - 1],
            participantId: null,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        await batch.commit();
        res.json({ success: true, tableId: tableRef.id, tableNumber: nextNumber });
      } catch (err) {
        console.error('Error creating table:', err);
        res.status(500).json({ error: 'Failed to create table' });
      }
    });
  });
});

module.exports = router;
