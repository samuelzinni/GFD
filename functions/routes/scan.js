const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

router.post('/checkin', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const { ticket_code } = req.body;
    const db = admin.firestore();

    const snapshot = await db.collection('participants')
      .where('ticketCode', '==', ticket_code)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Invalid ticket code', valid: false });
    }

    const doc = snapshot.docs[0];
    const participant = { id: doc.id, ...doc.data() };

    if (participant.checkedIn) {
      return res.json({
        valid: true,
        already_checked_in: true,
        participant,
        message: `${participant.firstName} ${participant.lastName} ist bereits eingecheckt.`
      });
    }

    const now = new Date().toISOString();
    await doc.ref.update({
      checkedIn: true,
      checkedInAt: now,
      checkedInBy: req.user.id,
      checkedInByName: req.user.displayName
    });

    // Log check-in
    await db.collection('checkInLog').add({
      participantId: doc.id,
      firstName: participant.firstName,
      lastName: participant.lastName,
      ticketCode: participant.ticketCode,
      tableId: participant.tableId,
      action: 'check_in',
      scannedBy: req.user.id,
      scannedByName: req.user.displayName,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    const updated = { ...participant, checkedIn: true, checkedInAt: now, checkedInBy: req.user.id, checkedInByName: req.user.displayName };

    res.json({
      valid: true,
      already_checked_in: false,
      participant: updated,
      message: `${participant.firstName} ${participant.lastName} erfolgreich eingecheckt!`
    });
  });
});

router.post('/checkout', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const { participant_id } = req.body;
    const db = admin.firestore();

    await db.collection('participants').doc(participant_id).update({
      checkedIn: false, checkedInAt: null, checkedInBy: null, checkedInByName: null
    });

    const partDoc = await db.collection('participants').doc(participant_id).get();
    const participant = partDoc.data();

    await db.collection('checkInLog').add({
      participantId: participant_id,
      firstName: participant.firstName,
      lastName: participant.lastName,
      ticketCode: participant.ticketCode,
      action: 'check_out',
      scannedBy: req.user.id,
      scannedByName: req.user.displayName,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  });
});

module.exports = router;
