const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  getSettingsMap,
  buildNotificationMessage,
  generateWhatsAppUrl,
  generateSmsUrl
} = require('../services/notifier');

// GET all bills with filter options
router.get('/', (req, res) => {
  try {
    const { month, room_id, status } = req.query;
    let query = `
      SELECT b.*,
        r.room_number, r.floor, r.tenant_name, r.tenant_phone, r.tenant_email
      FROM bills b
      JOIN rooms r ON b.room_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (month) {
      query += ' AND b.billing_month = ?';
      params.push(month);
    }
    if (room_id) {
      query += ' AND b.room_id = ?';
      params.push(room_id);
    }
    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    query += ' ORDER BY b.billing_month DESC, r.room_number ASC';
    const bills = db.prepare(query).all(...params);

    const settings = getSettingsMap();

    // Attach pre-generated direct WhatsApp & SMS URLs and messages to each bill
    const enrichedBills = bills.map(bill => {
      const room = {
        room_number: bill.room_number,
        tenant_name: bill.tenant_name,
        tenant_phone: bill.tenant_phone
      };
      const message = buildNotificationMessage(bill, room, settings);
      return {
        ...bill,
        formatted_message: message,
        whatsapp_url: generateWhatsAppUrl(bill.tenant_phone, message),
        sms_url: generateSmsUrl(bill.tenant_phone, message)
      };
    });

    res.json({ success: true, count: enrichedBills.length, bills: enrichedBills });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET dashboard statistics & summary for a month
router.get('/summary', (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7); // e.g. "2026-11"

    const totalRooms = db.prepare('SELECT COUNT(*) as c FROM rooms WHERE status = "occupied"').get().c;
    const billsForMonth = db.prepare('SELECT * FROM bills WHERE billing_month = ?').all(month);

    let totalExpected = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalUnits = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const b of billsForMonth) {
      totalExpected += Number(b.total_amount || 0);
      totalUnits += Number(b.units_consumed || 0);
      if (b.status === 'paid') {
        paidCount++;
        totalCollected += Number(b.total_amount || 0);
      } else {
        unpaidCount++;
        totalPending += Number(b.total_amount || 0);
      }
    }

    const settings = getSettingsMap();

    res.json({
      success: true,
      month,
      summary: {
        total_rooms: totalRooms,
        billed_rooms: billsForMonth.length,
        unbilled_rooms: Math.max(0, totalRooms - billsForMonth.length),
        total_expected: Math.round(totalExpected),
        total_collected: Math.round(totalCollected),
        total_pending: Math.round(totalPending),
        total_units_consumed: Math.round(totalUnits * 100) / 100,
        paid_count: paidCount,
        unpaid_count: unpaidCount,
        current_electricity_rate: Number(settings.electricity_rate || 10),
        current_default_rent: Number(settings.default_rent || 6000),
        currency_symbol: settings.currency_symbol || '₹'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live preview calculation endpoint (before saving)
router.post('/preview', (req, res) => {
  try {
    const {
      previous_reading,
      current_reading,
      electricity_rate,
      rent_amount,
      other_charges = 0,
      discount = 0
    } = req.body;

    const prev = Number(previous_reading) || 0;
    const curr = Number(current_reading) || 0;
    const rate = Number(electricity_rate) || 0;
    const rent = Number(rent_amount) || 0;
    const other = Number(other_charges) || 0;
    const disc = Number(discount) || 0;

    const units = Math.max(0, curr - prev);
    const electricityAmount = Math.round(units * rate * 100) / 100;
    const totalAmount = Math.round((rent + electricityAmount + other - disc) * 100) / 100;

    res.json({
      success: true,
      calculation: {
        previous_reading: prev,
        current_reading: curr,
        units_consumed: units,
        electricity_rate: rate,
        electricity_amount: electricityAmount,
        rent_amount: rent,
        other_charges: other,
        discount: disc,
        total_amount: totalAmount
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// CREATE or UPDATE bill
router.post('/', (req, res) => {
  try {
    const {
      room_id,
      billing_month,
      previous_reading,
      current_reading,
      electricity_rate,
      rent_amount,
      other_charges = 0,
      other_charges_desc = '',
      discount = 0,
      due_date,
      notes = ''
    } = req.body;

    if (!room_id || !billing_month) {
      return res.status(400).json({ success: false, error: 'room_id and billing_month are required' });
    }

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(room_id);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const settings = getSettingsMap();

    // Determine electricity rate factor: passed in or from backend settings
    const rate = electricity_rate !== undefined && electricity_rate !== null && electricity_rate !== ''
      ? Number(electricity_rate)
      : Number(settings.electricity_rate || 10);

    // Determine rent amount: passed in, or room base_rent, or default_rent setting
    let rent = rent_amount !== undefined && rent_amount !== null && rent_amount !== ''
      ? Number(rent_amount)
      : (room.base_rent || Number(settings.default_rent || 6000));

    // Determine readings
    let prev = Number(previous_reading);
    if (isNaN(prev)) {
      // Find latest previous reading for this room
      const lastBill = db.prepare('SELECT current_reading FROM bills WHERE room_id = ? ORDER BY billing_month DESC LIMIT 1').get(room_id);
      prev = lastBill ? Number(lastBill.current_reading) : Number(room.meter_initial_reading || 0);
    }

    let curr = Number(current_reading);
    if (isNaN(curr)) {
      return res.status(400).json({ success: false, error: 'Current reading is required' });
    }

    if (curr < prev) {
      return res.status(400).json({
        success: false,
        error: `Current reading (${curr}) cannot be less than previous reading (${prev})`
      });
    }

    const units = Math.round((curr - prev) * 100) / 100;
    const electricityAmount = Math.round(units * rate * 100) / 100;
    const other = Number(other_charges) || 0;
    const disc = Number(discount) || 0;
    const total = Math.round((rent + electricityAmount + other - disc) * 100) / 100;

    // Default due date: e.g. 5th of next month or specified
    let finalDueDate = due_date;
    if (!finalDueDate) {
      const dueDay = settings.due_day_of_month || '5';
      const [year, month] = billing_month.split('-');
      finalDueDate = `${year}-${month}-${dueDay.padStart(2, '0')}`;
    }

    // Upsert into bills table
    const stmt = db.prepare(`
      INSERT INTO bills (
        room_id, billing_month, previous_reading, current_reading, units_consumed,
        electricity_rate, electricity_amount, rent_amount, other_charges, other_charges_desc,
        discount, total_amount, due_date, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(room_id, billing_month) DO UPDATE SET
        previous_reading = excluded.previous_reading,
        current_reading = excluded.current_reading,
        units_consumed = excluded.units_consumed,
        electricity_rate = excluded.electricity_rate,
        electricity_amount = excluded.electricity_amount,
        rent_amount = excluded.rent_amount,
        other_charges = excluded.other_charges,
        other_charges_desc = excluded.other_charges_desc,
        discount = excluded.discount,
        total_amount = excluded.total_amount,
        due_date = excluded.due_date,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      room_id,
      billing_month,
      prev,
      curr,
      units,
      rate,
      electricityAmount,
      rent,
      other,
      other_charges_desc,
      disc,
      total,
      finalDueDate,
      notes
    );

    const savedBill = db.prepare(`
      SELECT b.*, r.room_number, r.tenant_name, r.tenant_phone
      FROM bills b
      JOIN rooms r ON b.room_id = r.id
      WHERE b.room_id = ? AND b.billing_month = ?
    `).get(room_id, billing_month);

    const formattedMessage = buildNotificationMessage(savedBill, room, settings);
    const whatsappUrl = generateWhatsAppUrl(room.tenant_phone, formattedMessage);
    const smsUrl = generateSmsUrl(room.tenant_phone, formattedMessage);

    res.status(201).json({
      success: true,
      message: `Bill for Room ${room.room_number} (${billing_month}) saved successfully`,
      bill: {
        ...savedBill,
        formatted_message: formattedMessage,
        whatsapp_url: whatsappUrl,
        sms_url: smsUrl
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update bill payment status
router.patch('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, paid_amount } = req.body; // 'paid', 'unpaid', 'partially_paid'

    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    const paidDate = status === 'paid' ? new Date().toISOString().split('T')[0] : null;
    const paidAmt = status === 'paid' ? bill.total_amount : (paid_amount || 0);

    db.prepare(`
      UPDATE bills SET
        status = ?,
        paid_amount = ?,
        paid_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, paidAmt, paidDate, id);

    const updated = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    res.json({ success: true, message: `Status updated to ${status}`, bill: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a bill
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    db.prepare('DELETE FROM bills WHERE id = ?').run(id);
    res.json({ success: true, message: 'Bill deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
