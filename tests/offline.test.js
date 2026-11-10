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
  // In previous test, we saved 1220 as current reading, so next month is 1220 + 1 = 1221
  assert.equal(room.effective_previous_reading, 1221);
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

test('OfflineStore handles split payment tracking (Rent Paid and Light Bill Paid on different days)', () => {
  const room = global.offlineStore.getRooms()[0];
  const bill = global.offlineStore.saveBill({
    room_id: room.id,
    billing_month: '2026-10',
    previous_reading: 1000,
    current_reading: 1100, // 100u => 1000
    electricity_rate: 10,
    rent_amount: 6500 // total = 7500
  });

  // 1. Pay rent on 5th
  const rentUpdated = global.offlineStore.updateBillSplitStatus(bill.id, {
    rent_status: 'paid',
    rent_paid_date: '2026-10-05'
  });
  assert.equal(rentUpdated.rent_status, 'paid');
  assert.equal(rentUpdated.rent_paid_date, '2026-10-05');
  assert.equal(rentUpdated.light_status, 'unpaid');
  assert.equal(rentUpdated.status, 'partial');
  assert.equal(rentUpdated.paid_amount, 6500);

  // 2. Pay light bill later on 12th
  const allUpdated = global.offlineStore.updateBillSplitStatus(bill.id, {
    light_status: 'paid',
    light_paid_date: '2026-10-12'
  });
  assert.equal(allUpdated.rent_status, 'paid');
  assert.equal(allUpdated.rent_paid_date, '2026-10-05');
  assert.equal(allUpdated.light_status, 'paid');
  assert.equal(allUpdated.light_paid_date, '2026-10-12');
  assert.equal(allUpdated.status, 'paid');
  assert.equal(allUpdated.paid_amount, 7500);
});

test('OfflineStore generates tenant settlement ledger and handles vacating tenant', () => {
  const room = global.offlineStore.getRooms()[0]; // Rahul Sharma
  const ledger = global.offlineStore.getTenantLedger(room.id);

  assert.equal(ledger.tenant_name, 'Rahul Sharma');
  assert.ok(ledger.bills.length >= 1);
  assert.ok(ledger.total_billed > 0);

  // Vacate and replace with new tenant
  const updatedRoom = global.offlineStore.vacateTenant(room.id, {
    tenant_name: 'Suresh Patil',
    tenant_phone: '+919811223344',
    base_rent: 7000,
    meter_initial_reading: 1101
  });

  assert.equal(updatedRoom.tenant_name, 'Suresh Patil');
  assert.equal(updatedRoom.tenant_phone, '+919811223344');
  assert.equal(updatedRoom.base_rent, 7000);

  // Historical bills still retain old tenant name
  const pastBills = global.offlineStore.getBills({ room_id: room.id });
  const oldBill = pastBills.find(b => b.billing_month === '2026-10');
  assert.equal(oldBill.tenant_name, 'Rahul Sharma');
});
