const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all rooms
router.get('/', (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT r.*,
        (SELECT b.current_reading FROM bills b WHERE b.room_id = r.id ORDER BY b.created_at DESC LIMIT 1) AS last_recorded_reading,
        (SELECT b.billing_month FROM bills b WHERE b.room_id = r.id ORDER BY b.created_at DESC LIMIT 1) AS last_billing_month,
        (SELECT b.status FROM bills b WHERE b.room_id = r.id ORDER BY b.created_at DESC LIMIT 1) AS last_bill_status
      FROM rooms r
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (r.room_number LIKE ? OR r.tenant_name LIKE ? OR r.tenant_phone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY r.room_number ASC';
    const rooms = db.prepare(query).all(...params);

    // Calculate effective previous reading for each room (last recorded reading + 1)
    const result = rooms.map(room => {
      const effectivePreviousReading = room.last_recorded_reading !== null && room.last_recorded_reading !== undefined
        ? Number(room.last_recorded_reading) + 1
        : Number(room.meter_initial_reading || 0);

      return {
        ...room,
        effective_previous_reading: effectivePreviousReading
      };
    });

    res.json({ success: true, count: result.length, rooms: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single room by ID with recent bills
router.get('/:id', (req, res) => {
  try {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const bills = db.prepare(`
      SELECT * FROM bills WHERE room_id = ? ORDER BY billing_month DESC LIMIT 12
    `).all(req.params.id);

    const latestBill = bills[0];
    const effectivePreviousReading = latestBill
      ? Number(latestBill.current_reading) + 1
      : Number(room.meter_initial_reading || 0);

    res.json({
      success: true,
      room: {
        ...room,
        effective_previous_reading: effectivePreviousReading
      },
      recent_bills: bills
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CREATE a new room
router.post('/', (req, res) => {
  try {
    const {
      room_number,
      floor,
      tenant_name,
      tenant_phone,
      tenant_email,
      base_rent,
      meter_initial_reading,
      security_deposit,
      move_in_date,
      status,
      notes
    } = req.body;

    if (!room_number || !tenant_name || !tenant_phone) {
      return res.status(400).json({
        success: false,
        error: 'Room number, Tenant name, and Contact number are required'
      });
    }

    // Default base rent from settings if not supplied
    let rent = base_rent;
    if (rent === undefined || rent === null || rent === '') {
      const defaultRentSetting = db.prepare('SELECT value FROM settings WHERE key = "default_rent"').get();
      rent = defaultRentSetting ? Number(defaultRentSetting.value) : 6000;
    }

    const stmt = db.prepare(`
      INSERT INTO rooms (
        room_number, floor, tenant_name, tenant_phone, tenant_email,
        base_rent, meter_initial_reading, security_deposit, move_in_date, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      String(room_number).trim(),
      floor || 'Ground',
      String(tenant_name).trim(),
      String(tenant_phone).trim(),
      tenant_email ? String(tenant_email).trim() : '',
      Number(rent) || 0,
      Number(meter_initial_reading) || 0,
      Number(security_deposit) || 0,
      move_in_date || new Date().toISOString().split('T')[0],
      status || 'occupied',
      notes || ''
    );

    const newRoom = db.prepare('SELECT * FROM rooms WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Room created successfully', room: newRoom });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: rooms.room_number')) {
      return res.status(409).json({ success: false, error: `Room number "${req.body.room_number}" already exists` });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE room & tenant details
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const {
      room_number,
      floor,
      tenant_name,
      tenant_phone,
      tenant_email,
      base_rent,
      meter_initial_reading,
      security_deposit,
      move_in_date,
      status,
      notes
    } = req.body;

    const stmt = db.prepare(`
      UPDATE rooms SET
        room_number = COALESCE(?, room_number),
        floor = COALESCE(?, floor),
        tenant_name = COALESCE(?, tenant_name),
        tenant_phone = COALESCE(?, tenant_phone),
        tenant_email = COALESCE(?, tenant_email),
        base_rent = COALESCE(?, base_rent),
        meter_initial_reading = COALESCE(?, meter_initial_reading),
        security_deposit = COALESCE(?, security_deposit),
        move_in_date = COALESCE(?, move_in_date),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      room_number ? String(room_number).trim() : null,
      floor !== undefined ? floor : null,
      tenant_name ? String(tenant_name).trim() : null,
      tenant_phone ? String(tenant_phone).trim() : null,
      tenant_email !== undefined ? tenant_email : null,
      base_rent !== undefined ? Number(base_rent) : null,
      meter_initial_reading !== undefined ? Number(meter_initial_reading) : null,
      security_deposit !== undefined ? Number(security_deposit) : null,
      move_in_date !== undefined ? move_in_date : null,
      status !== undefined ? status : null,
      notes !== undefined ? notes : null,
      id
    );

    const updated = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    res.json({ success: true, message: 'Room updated successfully', room: updated });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: rooms.room_number')) {
      return res.status(409).json({ success: false, error: `Room number "${req.body.room_number}" already exists` });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE room
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    res.json({ success: true, message: `Room ${existing.room_number} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
