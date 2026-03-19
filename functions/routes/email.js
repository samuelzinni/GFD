const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const QRCode = require('qrcode');
const admin = require('firebase-admin');
const { generateTicketPDF } = require('./tickets');

// Get email config
router.get('/config', async (req, res) => {
  try {
    const doc = await admin.firestore().collection('config').doc('email').get();
    if (!doc.exists) {
      return res.json({
        api_key: '',
        from_name: 'German Finance Dinner',
        from_email: '',
        reply_to: 'participants@finance-network.co'
      });
    }
    const config = doc.data();
    if (config.api_key) config.api_key = '••••••••';
    res.json(config);
  } catch (err) {
    console.error('Get email config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save email config
router.put('/config', async (req, res) => {
  const { api_key, from_name, from_email, reply_to } = req.body;

  try {
    const updateData = {
      from_name: from_name || 'German Finance Dinner',
      from_email: from_email || '',
      reply_to: reply_to || 'participants@finance-network.co',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Only update API key if it's not the masked value
    if (api_key && api_key !== '••••••••') {
      updateData.api_key = api_key;
    }

    await admin.firestore().collection('config').doc('email').set(updateData, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Save email config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Test Resend connection
router.post('/test', async (req, res) => {
  try {
    const resend = await getResendClient();
    // Send a test request to verify the API key works
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'delivered@resend.dev',
      subject: 'GFD Connection Test',
      text: 'This is a connection test.'
    });
    if (error) throw new Error(error.message);
    res.json({ success: true, message: 'Resend-Verbindung erfolgreich!' });
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
    const snapshot = await db.collection('participants')
      .where('ticketSent', '!=', true)
      .get();

    const participants = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.role === 'student' || p.role === 'executive');

    if (participants.length === 0) {
      return res.json({ success: true, sent: 0, failed: 0, total: 0, errors: [] });
    }

    const eventCache = {};
    const tableCache = {};
    const seatCache = {};

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const participant of participants) {
      try {
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

        if (participant.tableId && !tableCache[participant.tableId]) {
          const tableDoc = await db.collection('tables').doc(participant.tableId).get();
          if (tableDoc.exists) tableCache[participant.tableId] = tableDoc.data();
        }
        if (participant.tableId && tableCache[participant.tableId]) {
          participant.tableNumber = tableCache[participant.tableId].tableNumber;
        }

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

async function getResendClient() {
  const doc = await admin.firestore().collection('config').doc('email').get();
  if (!doc.exists || !doc.data().api_key) {
    throw new Error('Resend API Key nicht konfiguriert. Bitte in den Einstellungen hinterlegen.');
  }
  return new Resend(doc.data().api_key);
}

async function sendTicketEmail(participant) {
  const configDoc = await admin.firestore().collection('config').doc('email').get();
  const config = configDoc.exists ? configDoc.data() : {};
  const resend = await getResendClient();

  // Generate PDF ticket
  const pdfBuffer = await generateTicketPDF(participant);

  // Generate QR code
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
<p style="margin:0;font-size:13px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#4a8af4;"><span class="gs"><span class="gd">YOUR TICKET IS CONFIRMED</span></span></p>
</td></tr>

<!-- Greeting & Body -->
<tr><td style="padding:20px 40px 0;">
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#ffffff;"><span class="gs"><span class="gd">Dear ${participant.firstName},</span></span></p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;"><span class="gs"><span class="gd">We are pleased to confirm your participation at the <strong style="color:#ffffff;">${participant.eventName || 'German Finance Dinner 2026'}</strong>. Your personal ticket is attached to this email as a PDF.</span></span></p>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;"><span class="gs"><span class="gd">Please present the QR code below or on your attached ticket at the entrance for check-in.</span></span></p>
</td></tr>

<!-- Info Card -->
<tr><td style="padding:8px 40px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="padding:24px 28px;background-color:#0c0c0f;background-image:linear-gradient(#0c0c0f,#0c0c0f);border:1px solid #1a1a2e;border-radius:8px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="width:4px;background-color:#00379e;background-image:linear-gradient(#00379e,#00379e);border-radius:2px;" width="4">&nbsp;</td>
<td style="padding-left:20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
  <td style="padding-bottom:8px;">
    <p style="margin:0;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;"><span class="gs"><span class="gd">EVENT DETAILS</span></span></p>
  </td>
</tr>
<tr>
  <td style="padding:4px 0;">
    <p style="margin:0;font-size:15px;line-height:24px;color:#ffffff;font-weight:600;"><span class="gs"><span class="gd">${participant.eventName || 'German Finance Dinner 2026'}</span></span></p>
  </td>
</tr>
<tr>
  <td style="padding:4px 0;">
    <p style="margin:0;font-size:15px;line-height:24px;color:#a1a1aa;"><span class="gs"><span class="gd">${[participant.eventDate, participant.eventLocation].filter(Boolean).join(' &bull; ')}</span></span></p>
  </td>
</tr>
${tableInfo}
<tr>
  <td style="padding:8px 0 0;">
    <span style="display:inline-block;padding:4px 12px;font-size:12px;font-weight:600;color:#ffffff;background-color:${roleBadgeColor};border-radius:12px;"><span class="gs"><span class="gd">${roleLabel}</span></span></span>
  </td>
</tr>
</table>
</td></tr></table>
</td></tr></table>
</td></tr>

<!-- QR Code -->
<tr><td align="center" style="padding:28px 40px 0;">
<p style="margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;"><span class="gs"><span class="gd">YOUR QR CODE</span></span></p>
<img src="cid:qrcode" width="180" height="180" alt="QR Code" style="display:block;margin:0 auto;">
</td></tr>

<!-- QR instruction -->
<tr><td align="center" style="padding:12px 40px 0;">
<p style="margin:0;font-size:14px;line-height:22px;color:#a1a1aa;"><span class="gs"><span class="gd">Show this QR code at the entrance for check-in</span></span></p>
</td></tr>

<!-- Ticket Code -->
<tr><td align="center" style="padding:12px 40px 0;">
<p style="margin:0;font-size:14px;font-weight:600;letter-spacing:2px;color:#4a8af4;"><span class="gs"><span class="gd">${participant.ticketCode}</span></span></p>
</td></tr>

<!-- Contact -->
<tr><td style="padding:28px 40px 0;">
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#d4d4d8;"><span class="gs"><span class="gd">If you have any questions, please contact us at <a href="mailto:participants@finance-network.co" style="color:#4a8af4;text-decoration:none;">participants@finance-network.co</a>.</span></span></p>
</td></tr>

<!-- Sign off -->
<tr><td style="padding:8px 40px 40px;">
<p style="margin:0;font-size:16px;line-height:26px;color:#ffffff;"><span class="gs"><span class="gd">Best regards,<br><strong>Your German Finance Dinner Team</strong></span></span></p>
</td></tr>

<!-- Footer Separator -->
<tr><td align="center" style="padding:0 40px;">
<table role="presentation" width="100%"><tr><td style="height:1px;background:linear-gradient(90deg,#000 0%,#1a1a2e 30%,#00379e 50%,#1a1a2e 70%,#000 100%);font-size:0;line-height:0;">&nbsp;</td></tr></table>
</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:28px 40px 12px;">
<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#52525b;"><span class="gs"><span class="gd">Finance Network e.V.</span></span></p>
<p style="margin:0 0 12px;font-size:12px;line-height:20px;color:#3f3f46;"><a href="https://www.linkedin.com/company/german-finance-dinner" style="color:#52525b;text-decoration:none;"><span class="gs"><span class="gd">LinkedIn</span></span></a> &middot; <a href="https://www.instagram.com/germanfinancedinner/" style="color:#52525b;text-decoration:none;"><span class="gs"><span class="gd">Instagram</span></span></a></p>
<p style="margin:0;font-size:11px;line-height:18px;color:#3f3f46;"><a href="https://www.finance-network.co/imprint" style="color:#3f3f46;text-decoration:none;"><span class="gs"><span class="gd">Imprint</span></span></a> &middot; <a href="https://www.finance-network.co/privacy-policy" style="color:#3f3f46;text-decoration:none;"><span class="gs"><span class="gd">Privacy Policy</span></span></a> &middot; <a href="https://cdn.prod.website-files.com/672109247d0292f31a4e14f6/699afb9cdb0af633bc525f6a_gfd-terms-conditions.pdf" style="color:#3f3f46;text-decoration:none;"><span class="gs"><span class="gd">Terms &amp; Conditions</span></span></a></p>
</td></tr>

<!-- Bottom Spacer -->
<tr><td style="height:20px;font-size:0;line-height:0;">&nbsp;</td></tr>

</table></td></tr></table>
</body></html>`;

  const fromAddress = config.from_email
    ? `${config.from_name || 'German Finance Dinner'} <${config.from_email}>`
    : 'German Finance Dinner <noreply@finance-network.co>';

  const { error } = await resend.emails.send({
    from: fromAddress,
    replyTo: config.reply_to || 'participants@finance-network.co',
    to: [participant.email],
    subject: `Your Ticket – ${participant.eventName || 'German Finance Dinner 2026'}`,
    html,
    attachments: [
      {
        filename: `ticket-${participant.ticketCode}.pdf`,
        content: pdfBuffer.toString('base64'),
        contentType: 'application/pdf'
      },
      {
        filename: 'qrcode.png',
        content: qrBuffer.toString('base64'),
        contentType: 'image/png',
        headers: { 'Content-ID': '<qrcode>' }
      }
    ]
  });

  if (error) throw new Error(error.message);
}

module.exports = router;
