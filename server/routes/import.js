const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authMiddleware, adminMiddleware } = require('./auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function generateTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GFD-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Import participants from CSV or XLSX
router.post('/', authMiddleware, adminMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const eventId = req.body.event_id;
  if (!eventId) return res.status(400).json({ error: 'event_id required' });

  let rows;
  const ext = req.file.originalname.toLowerCase();

  try {
    if (ext.endsWith('.csv')) {
      rows = parse(req.file.buffer.toString('utf-8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
      });
    } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      const workbook = XLSX.read(req.file.buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use CSV or XLSX.' });
    }
  } catch (err) {
    return res.status(400).json({ error: `Failed to parse file: ${err.message}` });
  }

  if (!rows.length) return res.status(400).json({ error: 'No data found in file' });

  const db = getDb();
  const inserted = [];
  const errors = [];

  // Map common column name variations
  function getField(row, ...names) {
    for (const name of names) {
      const key = Object.keys(row).find(k => k.toLowerCase().trim().replace(/[_\s-]/g, '') === name.toLowerCase().replace(/[_\s-]/g, ''));
      if (key && row[key]) return row[key].toString().trim();
    }
    return '';
  }

  const insertStmt = db.prepare(`
    INSERT INTO participants (id, event_id, ticket_code, first_name, last_name, email, role, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const firstName = getField(row, 'firstname', 'first_name', 'vorname', 'First Name', 'name');
      const lastName = getField(row, 'lastname', 'last_name', 'nachname', 'Last Name', 'surname', 'familyname');
      const email = getField(row, 'email', 'e-mail', 'emailaddress', 'mail');
      const role = getField(row, 'role', 'typ', 'type', 'rolle').toLowerCase();
      const notes = getField(row, 'notes', 'notizen', 'bemerkung', 'comment');

      if (!firstName && !lastName) {
        errors.push({ row: i + 2, error: 'Missing name' });
        continue;
      }
      if (!email) {
        errors.push({ row: i + 2, error: 'Missing email', name: `${firstName} ${lastName}` });
        continue;
      }

      try {
        const id = uuidv4();
        const ticketCode = generateTicketCode();
        const participantRole = (role === 'executive' || role === 'exec') ? 'executive' : 'student';

        insertStmt.run(id, eventId, ticketCode, firstName, lastName, email, participantRole, notes || null);
        inserted.push({ id, first_name: firstName, last_name: lastName, email, role: participantRole, ticket_code: ticketCode });
      } catch (err) {
        errors.push({ row: i + 2, error: err.message, name: `${firstName} ${lastName}` });
      }
    }
  });

  insertMany(rows);

  const io = req.app.get('io');
  io.to('dashboard').emit('participants-imported', { count: inserted.length });

  res.json({
    success: true,
    imported: inserted.length,
    errors: errors.length,
    errorDetails: errors,
    participants: inserted
  });
});

module.exports = router;
