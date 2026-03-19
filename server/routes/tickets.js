const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { getDb } = require('../database');
const { authMiddleware } = require('./auth');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');

// Generate PDF ticket for a participant
router.get('/:participantId/pdf', authMiddleware, async (req, res) => {
  const db = getDb();

  const participant = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type,
           e.name as event_name, e.date as event_date, e.location as event_location
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    LEFT JOIN events e ON p.event_id = e.id
    WHERE p.id = ?
  `).get(req.params.participantId);

  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  try {
    const pdfBuffer = await generateTicketPDF(participant);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${participant.ticket_code}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Preview ticket (returns PNG of QR code)
router.get('/:participantId/qr', authMiddleware, async (req, res) => {
  const db = getDb();
  const participant = db.prepare('SELECT ticket_code FROM participants WHERE id = ?').get(req.params.participantId);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  try {
    const qrBuffer = await QRCode.toBuffer(participant.ticket_code, {
      width: 300,
      margin: 2,
      color: { dark: '#ffffff', light: '#000000' }
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

async function generateTicketPDF(participant) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [595.28, 841.89], // A4
        margin: 0,
        info: {
          Title: `Ticket - ${participant.event_name}`,
          Author: 'German Finance Dinner'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Background
      doc.rect(0, 0, 595.28, 841.89).fill('#000000');

      // Top gradient line
      const gradientLine = doc.linearGradient(80, 0, 515, 0);
      gradientLine.stop(0, '#000000').stop(0.3, '#00379e').stop(0.5, '#2563eb').stop(0.7, '#00379e').stop(1, '#000000');
      doc.rect(80, 120, 435, 2).fill(gradientLine);

      // Logo
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 147.64, 40, { width: 300, align: 'center' });
      } else {
        // Text fallback for logo
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff');
        doc.text('GERMAN FINANCE DINNER', 0, 55, { align: 'center' });
      }

      // Event badge
      doc.fontSize(11).fillColor('#4a8af4').font('Helvetica-Bold');
      doc.text('YOUR TICKET', 0, 145, { align: 'center', characterSpacing: 3 });

      // Event name
      doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text(participant.event_name || 'German Finance Dinner 2026', 0, 180, { align: 'center' });

      // Event details
      if (participant.event_date || participant.event_location) {
        doc.fontSize(14).fillColor('#a1a1aa').font('Helvetica');
        const details = [participant.event_date, participant.event_location].filter(Boolean).join(' • ');
        doc.text(details, 0, 220, { align: 'center' });
      }

      // QR Code
      const qrDataUrl = await QRCode.toDataURL(participant.ticket_code, {
        width: 220,
        margin: 1,
        color: { dark: '#ffffff', light: '#000000' }
      });
      const qrImageBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrImageBuffer, 187.64, 270, { width: 220, height: 220 });

      // Ticket code below QR
      doc.fontSize(16).fillColor('#4a8af4').font('Helvetica-Bold');
      doc.text(participant.ticket_code, 0, 505, { align: 'center', characterSpacing: 2 });

      // Divider
      const gradientLine2 = doc.linearGradient(80, 0, 515, 0);
      gradientLine2.stop(0, '#000000').stop(0.3, '#1a1a2e').stop(0.5, '#00379e').stop(0.7, '#1a1a2e').stop(1, '#000000');
      doc.rect(80, 545, 435, 1).fill(gradientLine2);

      // Info card background
      doc.roundedRect(100, 570, 395, 160, 8).fill('#0c0c0f');
      doc.roundedRect(100, 570, 395, 160, 8).stroke('#1a1a2e');

      // Left accent bar
      doc.roundedRect(108, 580, 4, 140, 2).fill('#00379e');

      // Participant info
      const infoX = 128;
      let infoY = 585;

      doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold');
      doc.text('NAME', infoX, infoY, { characterSpacing: 1.5 });
      infoY += 16;
      doc.fontSize(16).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text(`${participant.first_name} ${participant.last_name}`, infoX, infoY);
      infoY += 30;

      if (participant.table_number) {
        doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold');
        doc.text('TABLE', infoX, infoY, { characterSpacing: 1.5 });
        infoY += 16;
        doc.fontSize(14).fillColor('#ffffff').font('Helvetica');
        doc.text(`Tisch ${participant.table_number}${participant.seat_number ? ` • Platz ${participant.seat_number}` : ''}`, infoX, infoY);
        infoY += 28;
      }

      doc.fontSize(10).fillColor('#64748b').font('Helvetica-Bold');
      doc.text('ROLE', infoX, infoY, { characterSpacing: 1.5 });
      infoY += 16;
      doc.fontSize(14).fillColor('#ffffff').font('Helvetica');
      doc.text(participant.role === 'student' ? 'Student' : 'Executive', infoX, infoY);

      // Bottom gradient line
      const gradientLine3 = doc.linearGradient(80, 0, 515, 0);
      gradientLine3.stop(0, '#000000').stop(0.3, '#1a1a2e').stop(0.5, '#00379e').stop(0.7, '#1a1a2e').stop(1, '#000000');
      doc.rect(80, 760, 435, 1).fill(gradientLine3);

      // Footer
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
