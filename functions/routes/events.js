const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

router.get('/', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const snapshot = await admin.firestore().collection('events').orderBy('createdAt', 'desc').get();
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(events);
  });
});

router.put('/:id', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  authMiddleware(req, res, async () => {
    const { name, date, location, description } = req.body;
    await admin.firestore().collection('events').doc(req.params.id).update({
      name, date, location, description
    });
    res.json({ success: true });
  });
});

module.exports = router;
