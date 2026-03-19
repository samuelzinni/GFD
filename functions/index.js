const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

// Firebase Auth middleware
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists) return res.status(401).json({ error: 'User not found' });
    req.user = { id: decoded.uid, ...userDoc.data() };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Make middleware available to routes
app.set('authMiddleware', authMiddleware);
app.set('adminMiddleware', adminMiddleware);

// Routes
app.use('/api/events', require('./routes/events'));
app.use('/api/participants', require('./routes/participants'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/scan', require('./routes/scan'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/import', require('./routes/import'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/email', authMiddleware, adminMiddleware, require('./routes/email'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

exports.api = onRequest({ region: 'europe-west1', memory: '512MiB' }, app);
