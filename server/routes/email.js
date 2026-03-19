const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const { getDb } = require('../database');
const { authMiddleware, adminMiddleware } = require('./auth');
const { generateTicketPDF } = require('./tickets');

// Get email config
router.get('/config', authMiddleware, adminMiddleware, (req, res) => {
  const db = getDb();
  const config = db.prepare('SELECT * FROM email_config WHERE id = 1').get();
  // Don't send password
  if (config) config.smtp_pass = config.smtp_pass ? '••••••••' : '';
  res.json(config);
});

// Update email config
router.put('/config', authMiddleware, adminMiddleware, (req, res) => {
  const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, reply_to } = req.body;
  const db = getDb();

  // Only update password if it's not the masked value
  if (smtp_pass && smtp_pass !== '••••••••') {
    db.prepare(`
      UPDATE email_config SET smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?,
      from_name = ?, from_email = ?, reply_to = ? WHERE id = 1
    `).run(smtp_host, smtp_port, smtp_secure ? 1 : 0, smtp_user, smtp_pass, from_name, from_email, reply_to);
  } else {
    db.prepare(`
      UPDATE email_config SET smtp_host = ?, smtp_port = ?, smtp_secure = ?,smtp_user = ?,
      from_name = ?, from_email = ?, reply_to = ? WHERE id = 1
    `).run(smtp_host, smtp_port, smtp_secure ? 1 : 0, smtp_user, from_name, from_email, reply_to);
  }

  res.json({ success: true });
});

// Test email connection
router.post('/test', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Send ticket email to single participant
router.post('/send/:participantId', authMiddleware, adminMiddleware, async (req, res) => {
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
    await sendTicketEmail(participant);

    db.prepare('UPDATE participants SET ticket_sent = 1, ticket_sent_at = ? WHERE id = ?').run(
      new Date().toISOString(), participant.id
    );

    const io = req.app.get('io');
    io.to('dashboard').emit('ticket-sent', { id: participant.id });

    res.json({ success: true, message: `Ticket sent to ${participant.email}` });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: `Failed to send email: ${err.message}` });
  }
});

// Send tickets to all participants who haven't received one yet
router.post('/send-all', authMiddleware, adminMiddleware, async (req, res) => {
  const db = getDb();
  const eventId = req.body.event_id;

  const participants = db.prepare(`
    SELECT p.*, t.table_number, t.table_name, s.seat_number, s.seat_type,
           e.name as event_name, e.date as event_date, e.location as event_location
    FROM participants p
    LEFT JOIN tables t ON p.table_id = t.id
    LEFT JOIN seats s ON p.seat_id = s.id
    LEFT JOIN events e ON p.event_id = e.id
    WHERE p.event_id = ? AND p.ticket_sent = 0 AND p.role = 'student'
  `).all(eventId);

  const io = req.app.get('io');
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const participant of participants) {
    try {
      await sendTicketEmail(participant);
      db.prepare('UPDATE participants SET ticket_sent = 1, ticket_sent_at = ? WHERE id = ?').run(
        new Date().toISOString(), participant.id
      );
      sent++;
      io.to('dashboard').emit('ticket-sent', { id: participant.id });
      io.to('dashboard').emit('email-progress', { sent, failed, total: participants.length });
    } catch (err) {
      failed++;
      errors.push({ participant: `${participant.first_name} ${participant.last_name}`, error: err.message });
    }
  }

  res.json({ success: true, sent, failed, total: participants.length, errors });
});

async function getTransporter() {
  const db = getDb();
  const config = db.prepare('SELECT * FROM email_config WHERE id = 1').get();

  if (!config?.smtp_host) throw new Error('SMTP not configured');

  return nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port || 587,
    secure: !!config.smtp_secure,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass
    }
  });
}

async function sendTicketEmail(participant) {
  const db = getDb();
  const config = db.prepare('SELECT * FROM email_config WHERE id = 1').get();
  const transporter = await getTransporter();
  const pdfBuffer = await generateTicketPDF(participant);

  // Generate QR code for inline email display
  const qrBuffer = await QRCode.toBuffer(participant.ticket_code, {
    width: 200, margin: 1, color: { dark: '#ffffff', light: '#000000' }
  });

  const seatInfo = participant.table_number
    ? `<p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#a1a1aa;">Tisch ${participant.table_number}${participant.seat_number ? `, Platz ${participant.seat_number}` : ''}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark only"></head>
<body style="margin:0;padding:0;width:100%;background-color:#000000;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#000000;">
<tr><td align="center" valign="top">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;">
<tr><td style="height:30px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:30px 40px 20px;">
<img src="https://cdn.prod.website-files.com/672109247d0292f31a4e14f6/699af841c3979f5c8445ec0d_673629a099975277df4a35a0_Logo%20FN%20white_vF%20(1).png" width="280" alt="German Finance Dinner" style="display:block;width:280px;max-width:100%;height:auto;">
</td></tr>
<tr><td align="center" style="padding:0 40px;">
<table role="presentation" width="100%"><tr><td style="height:2px;background:linear-gradient(90deg,#000 0%,#00379e 30%,#2563eb 50%,#00379e 70%,#000 100%);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:40px 40px 8px;">
<p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#4a8af4;">Your Ticket</p>
</td></tr>
<tr><td style="padding:20px 40px 0;">
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#ffffff;">Dear ${participant.first_name},</p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">We are pleased to confirm your participation at the <strong style="color:#ffffff;">${participant.event_name || 'German Finance Dinner 2026'}</strong>. Your personal ticket is attached to this email as a PDF.</p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">Please present the QR code on your ticket at the entrance for check-in.</p>
</td></tr>
<tr><td style="padding:8px 40px 0;">
<table role="presentation" width="100%"><tr>
<td style="padding:24px 28px;background-color:#0c0c0f;border:1px solid #1a1a2e;border-radius:8px;">
<table role="presentation" width="100%"><tr>
<td style="width:4px;background-color:#00379e;border-radius:2px;" width="4">&nbsp;</td>
<td style="padding-left:20px;">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Your Details</p>
<p style="margin:0 0 4px;font-size:15px;line-height:24px;color:#ffffff;font-weight:600;">${participant.first_name} ${participant.last_name}</p>
<p style="margin:0 0 4px;font-size:15px;line-height:24px;color:#a1a1aa;">Ticket: ${participant.ticket_code}</p>
${seatInfo}
</td></tr></table>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 40px 0;">
<p style="margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Your QR Code</p>
<img src="cid:qrcode" width="180" height="180" alt="QR Code" style="display:block;margin:0 auto;">
<p style="margin:8px 0 0;font-size:14px;color:#4a8af4;font-weight:600;letter-spacing:2px;">${participant.ticket_code}</p>
</td></tr>
<tr><td style="padding:28px 40px 0;">
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">If you have any questions, you can contact us at <a href="mailto:participants@finance-network.co" style="color:#4a8af4;text-decoration:none;">participants@finance-network.co</a>.</p>
</td></tr>
<tr><td style="padding:8px 40px 40px;">
<p style="margin:0;font-size:16px;line-height:26px;color:#ffffff;">Best regards,<br><strong>Your German Finance Dinner Team</strong></p>
</td></tr>
<tr><td align="center" style="padding:0 40px;">
<table role="presentation" width="100%"><tr><td style="height:1px;background:linear-gradient(90deg,#000 0%,#1a1a2e 30%,#00379e 50%,#1a1a2e 70%,#000 100%);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:28px 40px 12px;">
<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#52525b;">Finance Network e.V.</p>
<p style="margin:0 0 12px;font-size:12px;line-height:20px;color:#3f3f46;"><a href="https://www.linkedin.com/company/german-finance-dinner" style="color:#52525b;text-decoration:none;">LinkedIn</a> &middot; <a href="https://www.instagram.com/germanfinancedinner/" style="color:#52525b;text-decoration:none;">Instagram</a></p>
<p style="margin:0;font-size:11px;line-height:18px;color:#3f3f46;"><a href="https://www.finance-network.co/imprint" style="color:#3f3f46;text-decoration:none;">Imprint</a> &middot; <a href="https://www.finance-network.co/privacy-policy" style="color:#3f3f46;text-decoration:none;">Privacy Policy</a></p>
</td></tr>
<tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>
</table></td></tr></table>
</body></html>`;

  await transporter.sendMail({
    from: `"${config.from_name || 'German Finance Dinner'}" <${config.from_email || 'noreply@finance-network.co'}>`,
    replyTo: config.reply_to || 'participants@finance-network.co',
    to: participant.email,
    subject: `Your Ticket – ${participant.event_name || 'German Finance Dinner 2026'}`,
    html,
    attachments: [
      {
        filename: `ticket-${participant.ticket_code}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      },
      {
        filename: 'qrcode.png',
        content: qrBuffer,
        contentType: 'image/png',
        cid: 'qrcode'
      }
    ]
  });
}

module.exports = router;
