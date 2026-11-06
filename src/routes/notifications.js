const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  getSettingsMap,
  buildNotificationMessage,
  generateWhatsAppUrl,
  generateSmsUrl,
  sendSmsViaGateway,
  logNotification
} = require('../services/notifier');

// GET preview for a bill
router.get('/preview/:bill_id', (req, res) => {
  try {
    const { bill_id } = req.params;
    const bill = db.prepare(`
      SELECT b.*, r.room_number, r.tenant_name, r.tenant_phone
      FROM bills b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.id = ?
    `).get(bill_id);

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const settings = getSettingsMap();
    const room = {
      room_number: bill.room_number,
      tenant_name: bill.tenant_name,
      tenant_phone: bill.tenant_phone
    };

    const message = buildNotificationMessage(bill, room, settings);
    const whatsappUrl = generateWhatsAppUrl(bill.tenant_phone, message);
    const smsUrl = generateSmsUrl(bill.tenant_phone, message);

    res.json({
      success: true,
      data: {
        bill,
        message,
        whatsapp_url: whatsappUrl,
        sms_url: smsUrl,
        phone: bill.tenant_phone,
        tenant_name: bill.tenant_name,
        room_number: bill.room_number,
        upi_id: settings.upi_id || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Record WhatsApp notification dispatch (when user clicks WhatsApp button or opens link)
router.post('/record-dispatch', (req, res) => {
  try {
    const { bill_id, channel = 'whatsapp' } = req.body;
    const bill = db.prepare(`
      SELECT b.*, r.room_number, r.tenant_name, r.tenant_phone
      FROM bills b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.id = ?
    `).get(bill_id);

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const settings = getSettingsMap();
    const message = buildNotificationMessage(bill, {
      room_number: bill.room_number,
      tenant_name: bill.tenant_name,
      tenant_phone: bill.tenant_phone
    }, settings);

    // Update bill
    db.prepare(`
      UPDATE bills SET
        notification_sent = 1,
        last_notified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bill_id);

    // Insert log
    logNotification(bill_id, bill.room_number, bill.tenant_name, bill.tenant_phone, channel, message, 'sent');

    res.json({ success: true, message: `Notification logged via ${channel}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger SMS via configured gateway
router.post('/send-sms', async (req, res) => {
  try {
    const { bill_id } = req.body;
    const bill = db.prepare(`
      SELECT b.*, r.room_number, r.tenant_name, r.tenant_phone
      FROM bills b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.id = ?
    `).get(bill_id);

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const settings = getSettingsMap();
    const message = buildNotificationMessage(bill, {
      room_number: bill.room_number,
      tenant_name: bill.tenant_name,
      tenant_phone: bill.tenant_phone
    }, settings);

    const result = await sendSmsViaGateway(bill.tenant_phone, message, settings);

    if (result.success) {
      db.prepare(`
        UPDATE bills SET
          notification_sent = 1,
          last_notified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bill_id);

      logNotification(bill_id, bill.room_number, bill.tenant_name, bill.tenant_phone, 'sms_gateway', message, 'sent');
      return res.json({ success: true, message: 'SMS sent successfully', details: result });
    } else {
      // Fallback: provide direct SMS url
      const smsUrl = generateSmsUrl(bill.tenant_phone, message);
      return res.json({
        success: false,
        fallback_url: smsUrl,
        reason: result.reason || result.error || 'Gateway not configured'
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET notification history logs
router.get('/logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 50
    `).all();
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
