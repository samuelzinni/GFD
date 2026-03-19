const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const admin = require('firebase-admin');
const { generateTicketPDF } = require('./tickets');

// Get email config
router.get('/config', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('config').doc('email').get();
    if (!doc.exists) {
      return res.json({
        smtp_host: '', smtp_port: 587, smtp_secure: false,
        smtp_user: '', smtp_pass: '',
        from_name: 'German Finance Dinner', from_email: '', reply_to: 'participants@finance-network.co'
      });
    }
    const config = doc.data();
    // Mask password in response
    if (config.smtp_pass) config.smtp_pass = '••••••••';
    res.json(config);
  } catch (err) {
    console.error('Get email config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save email config
router.put('/config', async (req, res) => {
  const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email, reply_to } = req.body;

  try {
    const updateData = {
      smtp_host: smtp_host || '',
      smtp_port: smtp_port || 587,
      smtp_secure: !!smtp_secure,
      smtp_user: smtp_user || '',
      from_name: from_name || 'German Finance Dinner',
      from_email: from_email || '',
      reply_to: reply_to || 'participants@finance-network.co',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Only update password if it's not the masked value
    if (smtp_pass && smtp_pass !== '••••••••') {
      updateData.smtp_pass = smtp_pass;
    }

    await admin.firestore().collection('config').doc('email').set(updateData, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Save email config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test SMTP connection
router.post('/test', async (req, res) => {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Send ticket email to single participant
router.post('/send/:participantId', async (req, res) => {
  const db = admin.firestore();

  try {
    const partDoc = await db.collection('participants').doc(req.params.participantId).get();
    if (!partDoc.exists) return res.status(404).json({ error: 'Participant not found' });

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

    await sendTicketEmail(participant);

    // Update participant record
    await db.collection('participants').doc(req.params.participantId).update({
      ticketSent: true,
      ticketSentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: `Ticket sent to ${participant.email}` });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: `Failed to send email: ${err.message}` });
  }
});

// Send tickets to all unsent participants
router.post('/send-all', async (req, res) => {
  const db = admin.firestore();

  try {
    // Get all participants who haven't received tickets and are student or executive
    const snapshot = await db.collection('participants')
      .where('ticketSent', '!=', true)
      .get();

    // Filter for student/executive roles (Firestore only allows one inequality filter)
    const participants = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.role === 'student' || p.role === 'executive');

    if (participants.length === 0) {
      return res.json({ success: true, sent: 0, failed: 0, total: 0, errors: [] });
    }

    // Pre-fetch event, table, and seat data for enrichment
    const eventCache = {};
    const tableCache = {};
    const seatCache = {};

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const participant of participants) {
      try {
        // Enrich with event data
        if (participant.eventId && !eventCache[participant.eventId]) {
          const eventDoc = await db.collection('events').doc(participant.eventId).get();
          if (eventDoc.exists) eventCache[participant.eventId] = eventDoc.data();
        }
        if (participant.eventId && eventCache[participant.eventId]) {
          const ev = eventCache[participant.eventId];
          participant.eventName = ev.name;
          participant.eventDate = ev.date;
          participant.eventLocation = ev.location;
        }

        // Enrich with table data
        if (participant.tableId && !tableCache[participant.tableId]) {
          const tableDoc = await db.collection('tables').doc(participant.tableId).get();
          if (tableDoc.exists) tableCache[participant.tableId] = tableDoc.data();
        }
        if (participant.tableId && tableCache[participant.tableId]) {
          participant.tableNumber = tableCache[participant.tableId].tableNumber;
        }

        // Enrich with seat data
        if (participant.seatId && !seatCache[participant.seatId]) {
          const seatDoc = await db.collection('seats').doc(participant.seatId).get();
          if (seatDoc.exists) seatCache[participant.seatId] = seatDoc.data();
        }
        if (participant.seatId && seatCache[participant.seatId]) {
          participant.seatNumber = seatCache[participant.seatId].seatNumber;
        }

        await sendTicketEmail(participant);

        await db.collection('participants').doc(participant.id).update({
          ticketSent: true,
          ticketSentAt: admin.firestore.FieldValue.serverTimestamp()
        });

        sent++;
      } catch (err) {
        failed++;
        errors.push({
          participant: `${participant.firstName} ${participant.lastName}`,
          error: err.message
        });
      }
    }

    res.json({ success: true, sent, failed, total: participants.length, errors });
  } catch (err) {
    console.error('Send all error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function getTransporter() {
  const doc = await admin.firestore().collection('config').doc('email').get();
  if (!doc.exists || !doc.data().smtp_host) {
    throw new Error('SMTP not configured. Please configure email settings first.');
  }

  const config = doc.data();

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
  const configDoc = await admin.firestore().collection('config').doc('email').get();
  const config = configDoc.exists ? configDoc.data() : {};
  const transporter = await getTransporter();

  // Generate PDF ticket
  const pdfBuffer = await generateTicketPDF(participant);

  // Generate QR code for inline email display
  const qrBuffer = await QRCode.toBuffer(participant.ticketCode, {
    width: 200, margin: 1, color: { dark: '#ffffff', light: '#000000' }
  });

  // Build seat/table info for the email
  const tableInfo = participant.tableNumber
    ? `<tr>
        <td style="padding:4px 0;">
          <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">TABLE &amp; SEAT</p>
          <p style="margin:4px 0 0;font-size:15px;line-height:24px;color:#ffffff;">Tisch ${participant.tableNumber}${participant.seatNumber ? ` &bull; Platz ${participant.seatNumber}` : ''}</p>
        </td>
      </tr>`
    : '';

  const roleBadgeColor = participant.role === 'student' ? '#2563eb' : '#d97706';
  const roleLabel = participant.role === 'student' ? 'Student' : 'Executive';

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark only">
<meta name="supported-color-schemes" content="dark only">
<style>u+.body .gs{background:#000;mix-blend-mode:screen}u+.body .gd{background:#000;mix-blend-mode:difference}</style>
</head>
<body class="body" style="margin:0;padding:0;width:100%;background-color:#000000;background-image:linear-gradient(#000000,#000000);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#000000;">
<tr><td align="center" valign="top">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;max-width:600px;">

<!-- Spacer -->
<tr><td style="height:30px;font-size:0;line-height:0;">&nbsp;</td></tr>

<!-- Logo -->
<tr><td align="center" style="padding:30px 40px 20px;">
<img src="https://cdn.prod.website-files.com/672109247d0292f31a4e14f6/699af841c3979f5c8445ec0d_673629a099975277df4a35a0_Logo%20FN%20white_vF%20(1).png" width="280" alt="Finance Network" style="display:block;width:280px;max-width:100%;height:auto;">
</td></tr>

<!-- Gradient Divider -->
<tr><td align="center" style="padding:0 40px;">
<table role="presentation" width="100%"><tr><td style="height:2px;background:linear-gradient(90deg,#000 0%,#00379e 30%,#2563eb 50%,#00379e 70%,#000 100%);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<!-- Header -->
<tr><td align="center" style="padding:40px 40px 8px;">
<p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#4a8af4;">YOUR TICKET IS CONFIRMED</p>
</td></tr>

<!-- Greeting & Body -->
<tr><td style="padding:20px 40px 0;">
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#ffffff;">Dear ${participant.firstName},</p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">We are pleased to confirm your participation at the <strong style="color:#ffffff;">${participant.eventName || 'German Finance Dinner 2026'}</strong>. Your personal ticket is attached to this email as a PDF.</p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">Please present the QR code below or on your attached ticket at the entrance for check-in.</p>
</td></tr>

<!-- Info Card -->
<tr><td style="padding:8px 40px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="padding:24px 28px;background-color:#0c0c0f;border:1px solid #1a1a2e;border-radius:8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="width:4px;background-color:#00379e;border-radius:2px;" width="4">&nbsp;</td>
<td style="padding-left:20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
  <td style="padding-bottom:8px;">
    <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">EVENT DETAILS</p>
  </td>
</tr>
<tr>
  <td style="padding:4px 0;">
    <p style="margin:0;font-size:15px;line-height:24px;color:#ffffff;font-weight:600;">${participant.eventName || 'German Finance Dinner 2026'}</p>
  </td>
</tr>
<tr>
  <td style="padding:4px 0;">
    <p style="margin:0;font-size:15px;line-height:24px;color:#a1a1aa;">${[participant.eventDate, participant.eventLocation].filter(Boolean).join(' &bull; ')}</p>
  </td>
</tr>
${tableInfo}
<tr>
  <td style="padding:8px 0 0;">
    <span style="display:inline-block;padding:4px 12px;font-size:12px;font-weight:600;color:#ffffff;background-color:${roleBadgeColor};border-radius:12px;">${roleLabel}</span>
  </td>
</tr>
</table>
</td></tr></table>
</td></tr></table>
</td></tr>

<!-- QR Code -->
<tr><td align="center" style="padding:28px 40px 0;">
<p style="margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;">YOUR QR CODE</p>
<img src="cid:qrcode" width="180" height="180" alt="QR Code" style="display:block;margin:0 auto;">
</td></tr>

<!-- QR instruction -->
<tr><td align="center" style="padding:12px 40px 0;">
<p style="margin:0;font-size:14px;line-height:22px;color:#a1a1aa;">Show this QR code at the entrance for check-in</p>
</td></tr>

<!-- Ticket Code -->
<tr><td align="center" style="padding:12px 40px 0;">
<p style="margin:0;font-size:14px;font-weight:600;letter-spacing:2px;color:#4a8af4;">${participant.ticketCode}</p>
</td></tr>

<!-- Contact -->
<tr><td style="padding:28px 40px 0;">
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;">If you have any questions, please contact us at <a href="mailto:participants@finance-network.co" style="color:#4a8af4;text-decoration:none;">participants@finance-network.co</a>.</p>
</td></tr>

<!-- Sign off -->
<tr><td style="padding:8px 40px 40px;">
<p style="margin:0;font-size:16px;line-height:26px;color:#ffffff;">Best regards,<br><strong>Your German Finance Dinner Team</strong></p>
</td></tr>

<!-- Footer Separator -->
<tr><td align="center" style="padding:0 40px;">
<table role="presentation" width="100%"><tr><td style="height:1px;background:linear-gradient(90deg,#000 0%,#1a1a2e 30%,#00379e 50%,#1a1a2e 70%,#000 100%);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:28px 40px 12px;">
<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#52525b;">Finance Network e.V.</p>
<p style="margin:0 0 12px;font-size:12px;line-height:20px;color:#3f3f46;"><a href="https://www.linkedin.com/company/german-finance-dinner" style="color:#52525b;text-decoration:none;">LinkedIn</a> &middot; <a href="https://www.instagram.com/germanfinancedinner/" style="color:#52525b;text-decoration:none;">Instagram</a></p>
<p style="margin:0;font-size:11px;line-height:18px;color:#3f3f46;"><a href="https://www.finance-network.co/imprint" style="color:#3f3f46;text-decoration:none;">Imprint</a> &middot; <a href="https://www.finance-network.co/privacy-policy" style="color:#3f3f46;text-decoration:none;">Privacy Policy</a> &middot; <a href="https://www.finance-network.co/terms-and-conditions" style="color:#3f3f46;text-decoration:none;">Terms &amp; Conditions</a></p>
</td></tr>

<!-- Bottom Spacer -->
<tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;

  await transporter.sendMail({
    from: `"${config.from_name || 'German Finance Dinner'}" <${config.from_email || 'noreply@finance-network.co'}>`,
    replyTo: config.reply_to || 'participants@finance-network.co',
    to: participant.email,
    subject: `Your Ticket – ${participant.eventName || 'German Finance Dinner 2026'}`,
    html,
    attachments: [
      {
        filename: `ticket-${participant.ticketCode}.pdf`,
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
