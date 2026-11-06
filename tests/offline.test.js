const test = require('node:test');
const assert = require('node:assert/strict');

// Mock localStorage for Node test environment
global.localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = String(value);
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Require storage logic
const fs = require('fs');
const path = require('path');
const storageCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'storage.js'), 'utf8');

// Evaluate in global scope
global.window = global;
eval(storageCode);

test('OfflineStore initializes default rooms and settings in localStorage', () => {
  const settings = global.offlineStore.getSettings();
  assert.equal(settings.electricity_rate, '10');
  assert.equal(settings.default_rent, '6000');

  const rooms = global.offlineStore.getRooms();
  assert.ok(rooms.length >= 4);
  assert.equal(rooms[0].room_number, '101');
});

test('OfflineStore updates runtime electricity rate and base rent factors', () => {
  global.offlineStore.updateFactors(14.5, 7500);
  const updated = global.offlineStore.getSettings();
  assert.equal(updated.electricity_rate, '14.5');
  assert.equal(updated.default_rent, '7500');
});

test('OfflineStore calculates bill with current reading and rate factor', () => {
  const room = global.offlineStore.getRooms()[0]; // Room 101, initial 1120
  const bill = global.offlineStore.saveBill({
    room_id: room.id,
    billing_month: '2026-11',
    previous_reading: 1120,
    current_reading: 1220, // 100 units
    electricity_rate: 10,
    rent_amount: 6500
  });

  assert.equal(bill.units_consumed, 100);
  assert.equal(bill.electricity_amount, 1000);
  assert.equal(bill.total_amount, 7500);
  assert.ok(bill.whatsapp_url.includes('100%20units'));
  assert.ok(bill.formatted_message.includes('₹1,000'));
});

test('OfflineStore automatically uses last bill current reading as next month previous reading', () => {
  const room = global.offlineStore.getRooms()[0]; // Room 101
  // In previous test, we saved 1220 as current reading for 2026-11
  assert.equal(room.effective_previous_reading, 1220);
});

test('OfflineStore export and import backup operates properly', () => {
  const jsonStr = global.offlineStore.exportBackupJson();
  assert.ok(jsonStr.includes('electricity_rate'));
  assert.ok(jsonStr.includes('"room_number": "101"'));

  // Clear and restore
  global.localStorage.clear();
  const res = global.offlineStore.importBackupJson(jsonStr);
  assert.equal(res, true);

  const restoredRooms = global.offlineStore.getRooms();
  assert.ok(restoredRooms.length >= 4);
});
