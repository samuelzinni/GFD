const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const admin = require('firebase-admin');
const { generateTicketPDF } = require('./tickets');

// Get email config
router.get('/config', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => adminMiddleware(req, res, async () => {
    const doc = await admin.firestore().collection('config').doc('email').get();
    const config = doc.exists ? doc.data() : {};
    if (config.smtpPass) config.smtpPass = '••••••••';
    res.json(config);
  }));
});

// Update email config
router.put('/config', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => adminMiddleware(req, res, async () => {
    const data = { ...req.body };
    if (data.smtpPass === '••••••••') delete data.smtpPass;
    await admin.firestore().collection('config').doc('email').set(data, { merge: true });
    res.json({ success: true });
  }));
});

// Test SMTP
router.post('/test', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => adminMiddleware(req, res, async () => {
    try {
      const transporter = await getTransporter();
      await transporter.verify();
      res.json({ success: true, message: 'SMTP connection successful' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }));
});

// Send single ticket
router.post('/send/:participantId', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => adminMiddleware(req, res, async () => {
    const db = admin.firestore();
    const partDoc = await db.collection('participants').doc(req.params.participantId).get();
    if (!partDoc.exists) return res.status(404).json({ error: 'Not found' });

    const participant = { id: partDoc.id, ...partDoc.data() };
    await enrichParticipant(participant);

    try {
      await sendTicketEmail(participant);
      await partDoc.ref.update({
        ticketSent: true,
        ticketSentAt: new Date().toISOString()
      });
      res.json({ success: true, message: `Ticket sent to ${participant.email}` });
    } catch (err) {
      res.status(500).json({ error: `Failed: ${err.message}` });
    }
  }));
});

// Send all unsent tickets
router.post('/send-all', async (req, res) => {
  const authMiddleware = req.app.get('authMiddleware');
  const adminMiddleware = req.app.get('adminMiddleware');
  authMiddleware(req, res, () => adminMiddleware(req, res, async () => {
    const { event_id } = req.body;
    const db = admin.firestore();

    const snapshot = await db.collection('participants')
      .where('eventId', '==', event_id)
      .where('ticketSent', '==', false)
      .where('role', '==', 'student')
      .get();

    let sent = 0, failed = 0;
    const errors = [];

    for (const doc of snapshot.docs) {
      const participant = { id: doc.id, ...doc.data() };
      await enrichParticipant(participant);

      try {
        await sendTicketEmail(participant);
        await doc.ref.update({ ticketSent: true, ticketSentAt: new Date().toISOString() });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ name: `${participant.firstName} ${participant.lastName}`, error: err.message });
      }
    }

    res.json({ success: true, sent, failed, total: snapshot.size, errors });
  }));
});

async function enrichParticipant(participant) {
  const db = admin.firestore();
  if (participant.eventId) {
    const ev = await db.collection('events').doc(participant.eventId).get();
    if (ev.exists) { participant.eventName = ev.data().name; participant.eventDate = ev.data().date; participant.eventLocation = ev.data().location; }
  }
  if (participant.tableId) {
    const t = await db.collection('tables').doc(participant.tableId).get();
    if (t.exists) participant.tableNumber = t.data().tableNumber;
  }
  if (participant.seatId) {
    const s = await db.collection('seats').doc(participant.seatId).get();
    if (s.exists) participant.seatNumber = s.data().seatNumber;
  }
}

async function getTransporter() {
  const doc = await admin.firestore().collection('config').doc('email').get();
  const config = doc.data();
  if (!config?.smtpHost) throw new Error('SMTP not configured');

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: !!config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
}

async function sendTicketEmail(participant) {
  const config = (await admin.firestore().collection('config').doc('email').get()).data();
  const transporter = await getTransporter();
  const pdfBuffer = await generateTicketPDF(participant);
  const qrBuffer = await QRCode.toBuffer(participant.ticketCode, {
    width: 200, margin: 1, color: { dark: '#ffffff', light: '#000000' }
  });

  const seatInfo = participant.tableNumber
    ? `<p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#a1a1aa;">Tisch ${participant.tableNumber}${participant.seatNumber ? `, Platz ${participant.seatNumber}` : ''}</p>`
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
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#ffffff;">Dear ${participant.firstName},</p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">We are pleased to confirm your participation at the <strong style="color:#ffffff;">${participant.eventName || 'German Finance Dinner 2026'}</strong>. Your personal ticket is attached to this email as a PDF.</p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">Please present the QR code on your ticket at the entrance for check-in.</p>
</td></tr>
<tr><td style="padding:8px 40px 0;">
<table role="presentation" width="100%"><tr>
<td style="padding:24px 28px;background-color:#0c0c0f;border:1px solid #1a1a2e;border-radius:8px;">
<table role="presentation" width="100%"><tr>
<td style="width:4px;background-color:#00379e;border-radius:2px;" width="4">&nbsp;</td>
<td style="padding-left:20px;">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Your Details</p>
<p style="margin:0 0 4px;font-size:15px;line-height:24px;color:#ffffff;font-weight:600;">${participant.firstName} ${participant.lastName}</p>
<p style="margin:0 0 4px;font-size:15px;line-height:24px;color:#a1a1aa;">Ticket: ${participant.ticketCode}</p>
${seatInfo}
</td></tr></table>
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:24px 40px 0;">
<p style="margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">Your QR Code</p>
<img src="cid:qrcode" width="180" height="180" alt="QR Code" style="display:block;margin:0 auto;">
<p style="margin:8px 0 0;font-size:14px;color:#4a8af4;font-weight:600;letter-spacing:2px;">${participant.ticketCode}</p>
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
    from: `"${config.fromName || 'German Finance Dinner'}" <${config.fromEmail || 'noreply@finance-network.co'}>`,
    replyTo: config.replyTo || 'participants@finance-network.co',
    to: participant.email,
    subject: `Your Ticket – ${participant.eventName || 'German Finance Dinner 2026'}`,
    html,
    attachments: [
      { filename: `ticket-${participant.ticketCode}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
      { filename: 'qrcode.png', content: qrBuffer, contentType: 'image/png', cid: 'qrcode' }
    ]
  });
}

module.exports = router;
