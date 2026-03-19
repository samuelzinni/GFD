const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const admin = require('firebase-admin');

// Generate PDF ticket for a participant
router.get('/:participantId/pdf', async (req, res) => {
  // Auth via query param or header
  const token = req.headers.authorization?.split('Bearer ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Auth required' });

  try {
    await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const db = admin.firestore();
  const partDoc = await db.collection('participants').doc(req.params.participantId).get();
  if (!partDoc.exists) return res.status(404).json({ error: 'Not found' });

  const participant = { id: partDoc.id, ...partDoc.data() };

  // Get event info
  if (participant.eventId) {
    const eventDoc = await db.collection('events').doc(participant.eventId).get();
    if (eventDoc.exists) {
      const ev = eventDoc.data();
      participant.eventName = ev.name;
      participant.eventDate = ev.date;
      participant.eventLocation = ev.location;
    }
  }

  // Get table info
  if (participant.tableId) {
    const tableDoc = await db.collection('tables').doc(participant.tableId).get();
    if (tableDoc.exists) {
      participant.tableNumber = tableDoc.data().tableNumber;
    }
  }

  // Get seat info
  if (participant.seatId) {
    const seatDoc = await db.collection('seats').doc(participant.seatId).get();
    if (seatDoc.exists) {
      participant.seatNumber = seatDoc.data().seatNumber;
    }
  }

  try {
    const pdfBuffer = await generateTicketPDF(participant);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${participant.ticketCode}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// QR code image
router.get('/:participantId/qr', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Auth required' });

  try {
    await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const doc = await admin.firestore().collection('participants').doc(req.params.participantId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Not found' });

  const qrBuffer = await QRCode.toBuffer(doc.data().ticketCode, {
    width: 300, margin: 2, color: { dark: '#ffffff', light: '#000000' }
  });
  res.setHeader('Content-Type', 'image/png');
  res.send(qrBuffer);
});

async function generateTicketPDF(participant) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [595.28, 841.89], margin: 0 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Background
      doc.rect(0, 0, 595.28, 841.89).fill('#000000');

      // Top gradient line
      const grad1 = doc.linearGradient(80, 0, 515, 0);
      grad1.stop(0, '#000000').stop(0.3, '#00379e').stop(0.5, '#2563eb').stop(0.7, '#00379e').stop(1, '#000000');
      doc.rect(80, 120, 435, 2).fill(grad1);

      // Logo text fallback
      doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff');
      doc.text('GERMAN FINANCE DINNER', 0, 55, { align: 'center' });

      // Event badge
      doc.fontSize(11).fillColor('#4a8af4').font('Helvetica-Bold');
      doc.text('YOUR TICKET', 0, 145, { align: 'center', characterSpacing: 3 });

      // Event name
      doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text(participant.eventName || 'German Finance Dinner 2026', 0, 180, { align: 'center' });

      // Event details
      if (participant.eventDate || participant.eventLocation) {
        doc.fontSize(14).fillColor('#a1a1aa').font('Helvetica');
        const details = [participant.eventDate, participant.eventLocation].filter(Boolean).join(' • ');
        doc.text(details, 0, 220, { align: 'center' });
      }

      // QR Code
      const qrDataUrl = await QRCode.toDataURL(participant.ticketCode, {
        width: 220, margin: 1, color: { dark: '#ffffff', light: '#000000' }
      });
      const qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuf, 187.64, 270, { width: 220, height: 220 });

      // Ticket code
      doc.fontSize(16).fillColor('#4a8af4').font('Helvetica-Bold');
      doc.text(participant.ticketCode, 0, 505, { align: 'center', characterSpacing: 2 });

      // Divider
      const grad2 = doc.linearGradient(80, 0, 515, 0);
      grad2.stop(0, '#000000').stop(0.3, '#1a1a2e').stop(0.5, '#00379e').stop(0.7, '#1a1a2e').stop(1, '#000000');
      doc.rect(80, 545, 435, 1).fill(grad2);

      // Info card
      doc.roundedRect(100, 570, 395, 160, 8).fill('#0c0c0f');
      doc.roundedRect(100, 570, 395, 160, 8).stroke('#1a1a2e');
      doc.roundedRect(108, 580, 4, 140, 2).fill('#00379e');

      const infoX = 128;
      let infoY = 585;

      doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold');
      doc.text('NAME', infoX, infoY, { characterSpacing: 1.5 });
      infoY += 16;
      doc.fontSize(16).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text(`${participant.firstName} ${participant.lastName}`, infoX, infoY);
      infoY += 30;

      if (participant.tableNumber) {
        doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold');
        doc.text('TABLE', infoX, infoY, { characterSpacing: 1.5 });
        infoY += 16;
        doc.fontSize(14).fillColor('#ffffff').font('Helvetica');
        doc.text(`Tisch ${participant.tableNumber}${participant.seatNumber ? ` • Platz ${participant.seatNumber}` : ''}`, infoX, infoY);
        infoY += 28;
      }

      doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold');
      doc.text('ROLE', infoX, infoY, { characterSpacing: 1.5 });
      infoY += 16;
      doc.fontSize(14).fillColor('#ffffff').font('Helvetica');
      doc.text(participant.role === 'student' ? 'Student' : 'Executive', infoX, infoY);

      // Footer
      const grad3 = doc.linearGradient(80, 0, 515, 0);
      grad3.stop(0, '#000000').stop(0.3, '#1a1a2e').stop(0.5, '#00379e').stop(0.7, '#1a1a2e').stop(1, '#000000');
      doc.rect(80, 760, 435, 1).fill(grad3);

      doc.fontSize(11).fillColor('#52525b').font('Helvetica');
      doc.text('Finance Network e.V.', 0, 775, { align: 'center' });
      doc.fontSize(9).fillColor('#3f3f46');
      doc.text('www.finance-network.co', 0, 792, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = router;
module.exports.generateTicketPDF = generateTicketPDF;
