const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

function usernameToEmail(username) {
  return `${username.toLowerCase().trim()}@gfd.local`;
}

function emailToUsername(email) {
  return email.replace('@gfd.local', '');
}

// Initialize event + tables + default admin
router.post('/init', async (req, res) => {
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

  // Create 12 tables: S S E S S E S S E
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

  await batch.commit();
  res.json({ success: true, eventId: eventRef.id, message: 'Event with 12 tables created' });
});

// Auto-register first user as admin
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

  if (userDoc.exists) {
    return res.json({ success: true, role: userDoc.data().role });
  }

  // If no users exist yet, make this one admin
  const usersSnapshot = await db.collection('users').limit(1).get();
  if (usersSnapshot.empty) {
    const username = emailToUsername(decoded.email);
    await db.collection('users').doc(decoded.uid).set({
      username,
      displayName: username,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, role: 'admin' });
  }

  return res.status(403).json({ error: 'User not registered. Ask an admin to add you.' });
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

  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const email = usernameToEmail(username);

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || username
    });

    await admin.firestore().collection('users').doc(userRecord.uid).set({
      username: username.toLowerCase().trim(),
      displayName: displayName || username,
      role: role || 'scanner',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, uid: userRecord.uid, username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete user (admin only)
router.delete('/users/:uid', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Auth required' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const callerDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    // Prevent self-delete
    if (decoded.uid === req.params.uid) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    await admin.auth().deleteUser(req.params.uid);
    await admin.firestore().collection('users').doc(req.params.uid).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
