const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const Busboy = require('busboy');

function generateTicketCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GFD-';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

router.post('/', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');

  authMiddleware(req, res, () => adminMiddleware(req, res, async () => {
    // Parse multipart form
    const busboy = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let fileName = '';
    let eventId = '';

    const parseComplete = new Promise((resolve, reject) => {
      busboy.on('file', (fieldname, file, info) => {
        fileName = info.filename;
        const chunks = [];
        file.on('data', chunk => chunks.push(chunk));
        file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      });
      busboy.on('field', (name, val) => {
        if (name === 'event_id') eventId = val;
      });
      busboy.on('finish', resolve);
      busboy.on('error', reject);
    });

    // Cloud Functions may have already parsed the body
    if (req.rawBody) {
      busboy.end(req.rawBody);
    } else {
      req.pipe(busboy);
    }
    await parseComplete;

    if (!fileBuffer) return res.status(400).json({ error: 'No file uploaded' });
    if (!eventId) return res.status(400).json({ error: 'event_id required' });

    let rows;
    const ext = fileName.toLowerCase();

    try {
      if (ext.endsWith('.csv')) {
        rows = parse(fileBuffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true, bom: true });
      } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
        const wb = XLSX.read(fileBuffer);
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      } else {
        return res.status(400).json({ error: 'Use CSV or XLSX' });
      }
    } catch (err) {
      return res.status(400).json({ error: `Parse error: ${err.message}` });
    }

    if (!rows.length) return res.status(400).json({ error: 'No data found' });

    function getField(row, ...names) {
      for (const name of names) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim().replace(/[_\s-]/g, '') === name.toLowerCase().replace(/[_\s-]/g, ''));
        if (key && row[key]) return row[key].toString().trim();
      }
      return '';
    }

    const db = admin.firestore();
    const inserted = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const firstName = getField(row, 'firstname', 'first_name', 'vorname', 'First Name', 'name');
      const lastName = getField(row, 'lastname', 'last_name', 'nachname', 'Last Name', 'surname');
      const email = getField(row, 'email', 'e-mail', 'emailaddress', 'mail');
      const roleStr = getField(row, 'role', 'typ', 'type', 'rolle').toLowerCase();
      const phone = getField(row, 'phone', 'telefon', 'telefonnummer', 'phone_number', 'phonenumber', 'mobile', 'mobil', 'handy', 'tel');
      const notes = getField(row, 'notes', 'notizen', 'bemerkung', 'comment');

      if (!firstName && !lastName) { errors.push({ row: i + 2, error: 'Missing name' }); continue; }
      if (!email) { errors.push({ row: i + 2, error: 'Missing email', name: `${firstName} ${lastName}` }); continue; }

      const role = (roleStr === 'executive' || roleStr === 'exec') ? 'executive' : 'student';
      const ticketCode = generateTicketCode();

      try {
        const ref = await db.collection('participants').add({
          eventId, ticketCode, firstName, lastName, email, phone: phone || null, role,
          tableId: null, seatId: null,
          checkedIn: false, checkedInAt: null, checkedInBy: null, checkedInByName: null,
          ticketSent: false, ticketSentAt: null,
          notes: notes || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        inserted.push({ id: ref.id, firstName, lastName, email, role, ticketCode });
      } catch (err) {
        errors.push({ row: i + 2, error: err.message, name: `${firstName} ${lastName}` });
      }
    }

    res.json({ success: true, imported: inserted.length, errors: errors.length, errorDetails: errors, participants: inserted });
  }));
});

module.exports = router;
