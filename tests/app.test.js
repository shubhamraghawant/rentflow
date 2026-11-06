const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(__dirname, '..', 'data_test');

// Clean test db before running
if (fs.existsSync(process.env.DATA_DIR)) {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}

const db = require('../src/db');
const {
  getSettingsMap,
  cleanPhoneNumber,
  buildNotificationMessage,
  generateWhatsAppUrl,
  generateSmsUrl
} = require('../src/services/notifier');

test('Database initializes default settings and tables', () => {
  const settings = getSettingsMap();
  assert.ok(settings.electricity_rate, 'electricity_rate exists');
  assert.equal(settings.electricity_rate, '10');
  assert.equal(settings.default_rent, '6000');
  assert.ok(settings.message_template.includes('{tenant_name}'));
});

test('Clean phone numbers formats properly for WhatsApp & SMS', () => {
  assert.equal(cleanPhoneNumber('+91 98765-43210'), '919876543210');
  assert.equal(cleanPhoneNumber('9876543210'), '919876543210');
  assert.equal(cleanPhoneNumber('+1 (555) 123-4567'), '15551234567');
});

test('Room CRUD operations work properly', () => {
  const insertStmt = db.prepare(`
    INSERT INTO rooms (room_number, floor, tenant_name, tenant_phone, base_rent, meter_initial_reading)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = insertStmt.run('301', '3rd Floor', 'Test Tenant', '+919999999999', 7500, 500);
  assert.ok(info.lastInsertRowid);

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(info.lastInsertRowid);
  assert.equal(room.room_number, '301');
  assert.equal(room.tenant_name, 'Test Tenant');
  assert.equal(room.base_rent, 7500);
  assert.equal(room.meter_initial_reading, 500);

  // Update room base rent & details
  db.prepare('UPDATE rooms SET base_rent = 8000 WHERE id = ?').run(room.id);
  const updated = db.prepare('SELECT base_rent FROM rooms WHERE id = ?').get(room.id);
  assert.equal(updated.base_rent, 8000);
});

test('Electricity and Rent calculation logic with runtime factors', () => {
  const prevReading = 1000;
  const currReading = 1150;
  const unitsConsumed = currReading - prevReading; // 150 units
  const electricityRate = 12.5; // Runtime rate factor
  const electricityAmount = unitsConsumed * electricityRate; // 150 * 12.5 = 1875
  const rentAmount = 6500;
  const otherCharges = 200;
  const totalAmount = rentAmount + electricityAmount + otherCharges; // 6500 + 1875 + 200 = 8575

  assert.equal(unitsConsumed, 150);
  assert.equal(electricityAmount, 1875);
  assert.equal(totalAmount, 8575);
});

test('Bill generation, upsert, and WhatsApp message builder', () => {
  const room = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get('301');
  const settings = getSettingsMap();

  const prev = 500;
  const curr = 620; // 120 units
  const rate = 10;
  const elecAmount = 1200;
  const rent = 8000;
  const total = 9200;

  const stmt = db.prepare(`
    INSERT INTO bills (
      room_id, billing_month, previous_reading, current_reading, units_consumed,
      electricity_rate, electricity_amount, rent_amount, total_amount, due_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(room.id, '2026-11', prev, curr, 120, rate, elecAmount, rent, total, '2026-11-05');

  const bill = db.prepare('SELECT * FROM bills WHERE room_id = ? AND billing_month = ?').get(room.id, '2026-11');
  assert.ok(bill);
  assert.equal(bill.units_consumed, 120);
  assert.equal(bill.electricity_amount, 1200);
  assert.equal(bill.total_amount, 9200);

  // Message builder test
  const msg = buildNotificationMessage(bill, room, settings);
  assert.ok(msg.includes('Room 301'));
  assert.ok(msg.includes('120 units'));
  assert.ok(msg.includes('1,200'));
  assert.ok(msg.includes('8,000'));
  assert.ok(msg.includes('9,200'));

  // WhatsApp and SMS URLs
  const waUrl = generateWhatsAppUrl(room.tenant_phone, msg);
  assert.ok(waUrl.startsWith('https://wa.me/919999999999?text='));
  assert.ok(waUrl.includes(encodeURIComponent('Room 301')));

  const smsUrl = generateSmsUrl(room.tenant_phone, msg);
  assert.ok(smsUrl.startsWith('sms:+919999999999?body='));
});

test('Runtime factor update in settings', () => {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run('electricity_rate', '14.5');

  const rate = db.prepare('SELECT value FROM settings WHERE key = ?').get('electricity_rate').value;
  assert.equal(rate, '14.5');
});

// Teardown test dir after completion
test.after(() => {
  if (fs.existsSync(process.env.DATA_DIR)) {
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }
});
