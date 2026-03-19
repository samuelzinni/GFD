const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Initialize event + tables (run once)
router.post('/init', async (req, res) => {
  // Verify caller is authenticated
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Auth required' });

  try {
    await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = admin.firestore();

  // Check if already initialized
  const events = await db.collection('events').limit(1).get();
  if (!events.empty) return res.json({ message: 'Already initialized', eventId: events.docs[0].id });

  // Create event
  const eventRef = await db.collection('events').add({
    name: 'German Finance Dinner 2026',
    date: '2026-06-15',
    location: 'TBD',
    description: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Create 12 tables with seating pattern: S S E S S E S S E
  const seatPattern = ['student', 'student', 'executive', 'student', 'student', 'executive', 'student', 'student', 'executive'];
  const batch = db.batch();

  for (let t = 1; t <= 12; t++) {
    const tableRef = db.collection('tables').doc();
    batch.set(tableRef, {
      eventId: eventRef.id,
      tableNumber: t,
      tableName: `Tisch ${t}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    for (let s = 1; s <= 9; s++) {
      const seatRef = db.collection('seats').doc();
      batch.set(seatRef, {
        tableId: tableRef.id,
        eventId: eventRef.id,
        seatNumber: s,
        seatType: seatPattern[s - 1],
        participantId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // Create default email config
  const emailRef = db.collection('config').doc('email');
  batch.set(emailRef, {
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    fromName: 'German Finance Dinner',
    fromEmail: 'noreply@finance-network.co',
    replyTo: 'participants@finance-network.co'
  });

  await batch.commit();

  res.json({ success: true, eventId: eventRef.id, message: 'Event with 12 tables created' });
});

// Setup first admin user doc (call after Firebase Auth user created)
router.post('/admin', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Auth required' });

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(decoded.uid).get();

  // If no users exist yet, make this one admin
  const usersSnapshot = await db.collection('users').limit(1).get();

  if (usersSnapshot.empty) {
    await db.collection('users').doc(decoded.uid).set({
      email: decoded.email,
      displayName: req.body.displayName || decoded.email,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, role: 'admin' });
  }

  if (!userDoc.exists) {
    return res.status(403).json({ error: 'User not registered. Ask an admin to add you.' });
  }

  res.json({ success: true, role: userDoc.data().role });
});

// Create user (admin only)
router.post('/users', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Auth required' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const callerDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { email, password, displayName, role } = req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email
    });

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      email,
      displayName: displayName || email,
      role: role || 'scanner',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, uid: userRecord.uid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
