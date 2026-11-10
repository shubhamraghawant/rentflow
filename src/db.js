const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'rentflow.sqlite');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL UNIQUE,
      floor TEXT DEFAULT 'Ground',
      tenant_name TEXT NOT NULL,
      tenant_phone TEXT NOT NULL,
      tenant_email TEXT DEFAULT '',
      base_rent REAL NOT NULL DEFAULT 6000,
      meter_initial_reading REAL NOT NULL DEFAULT 0,
      security_deposit REAL DEFAULT 0,
      move_in_date TEXT DEFAULT '',
      status TEXT DEFAULT 'occupied',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      billing_month TEXT NOT NULL,
      previous_reading REAL NOT NULL,
      current_reading REAL NOT NULL,
      units_consumed REAL NOT NULL,
      electricity_rate REAL NOT NULL,
      electricity_amount REAL NOT NULL,
      rent_amount REAL NOT NULL,
      other_charges REAL DEFAULT 0,
      other_charges_desc TEXT DEFAULT '',
      discount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'unpaid',
      rent_status TEXT DEFAULT 'unpaid',
      rent_paid_date TEXT,
      light_status TEXT DEFAULT 'unpaid',
      light_paid_date TEXT,
      tenant_name TEXT DEFAULT '',
      tenant_phone TEXT DEFAULT '',
      paid_amount REAL DEFAULT 0,
      paid_date TEXT,
      due_date TEXT,
      notification_sent INTEGER DEFAULT 0,
      last_notified_at TEXT,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_id, billing_month)
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
      room_number TEXT,
      tenant_name TEXT,
      phone TEXT,
      channel TEXT,
      message TEXT,
      status TEXT DEFAULT 'sent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Column migrations for bills table
  const billCols = db.pragma('table_info(bills)').map(c => c.name);
  if (!billCols.includes('rent_status')) {
    db.exec("ALTER TABLE bills ADD COLUMN rent_status TEXT DEFAULT 'unpaid';");
  }
  if (!billCols.includes('rent_paid_date')) {
    db.exec("ALTER TABLE bills ADD COLUMN rent_paid_date TEXT;");
  }
  if (!billCols.includes('light_status')) {
    db.exec("ALTER TABLE bills ADD COLUMN light_status TEXT DEFAULT 'unpaid';");
  }
  if (!billCols.includes('light_paid_date')) {
    db.exec("ALTER TABLE bills ADD COLUMN light_paid_date TEXT;");
  }
  if (!billCols.includes('tenant_name')) {
    db.exec("ALTER TABLE bills ADD COLUMN tenant_name TEXT DEFAULT '';");
  }
  if (!billCols.includes('tenant_phone')) {
    db.exec("ALTER TABLE bills ADD COLUMN tenant_phone TEXT DEFAULT '';");
  }

  // Default settings seed
  const defaultSettings = [
    { key: 'electricity_rate', value: process.env.DEFAULT_ELECTRICITY_RATE || '10' },
    { key: 'default_rent', value: process.env.DEFAULT_RENT || '6000' },
    { key: 'landlord_name', value: process.env.LANDLORD_NAME || 'Malganga Niwas' },
    { key: 'landlord_phone', value: process.env.LANDLORD_PHONE || '+919146225975' },
    { key: 'upi_id', value: process.env.UPI_ID || 'vanitaraghawant@oksbi' },
    { key: 'due_day_of_month', value: '5' },
    { key: 'currency_symbol', value: '₹' },
    { key: 'currency_code', value: 'INR' },
    { key: 'sms_gateway', value: 'none' },
    { key: 'sms_api_key', value: '' },
    {
      key: 'message_template',
      value: `📢 *RENT & ELECTRICITY BILL NOTICE*
━━━━━━━━━━━━━━━━━━━━
Dear {tenant_name},
Here is your bill summary for *Room {room_number}* ({billing_month}):

⚡ *Electricity (Light Bill):*
• Previous Reading: {previous_reading} units
• Current Reading: {current_reading} units
• Units Consumed: {units_consumed} units
• *Light Bill Amount:* {currency}{electricity_amount}

🏠 *Room Rent:* {currency}{rent_amount}
{other_charges_line}
━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL AMOUNT DUE:* *{currency}{total_amount}*

💳 *Pay via UPI:* {upi_id}
📞 *GPay / PhonePe / Paytm:* {landlord_phone}

Please share payment confirmation screenshot once done.
Thank you!
— *{landlord_name}*`
    }
  ];

  const checkStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  const updateStmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');

  for (const s of defaultSettings) {
    const existing = checkStmt.get(s.key);
    if (!existing) {
      insertStmt.run(s.key, s.value);
    } else if (
      (s.key === 'landlord_name' && existing.value === 'Shubham Properties') ||
      (s.key === 'upi_id' && existing.value === 'shubham@upi') ||
      (s.key === 'landlord_phone' && existing.value === '+919876543210') ||
      (s.key === 'message_template' && existing.value.includes('{electricity_rate}/unit'))
    ) {
      updateStmt.run(s.value, s.key);
    }
  }

  // Migrate legacy room numbers if present
  try {
    db.exec(`
      UPDATE rooms SET room_number = 'Room A', floor = 'Double Room' WHERE room_number = '101';
      UPDATE rooms SET room_number = 'Room B', floor = 'Double Room' WHERE room_number = '102';
      UPDATE rooms SET room_number = '1BHK', floor = '1BHK Flat' WHERE room_number = '201';
      UPDATE rooms SET room_number = 'Single Room', floor = 'Single Room' WHERE room_number = '202';
    `);
  } catch (e) {
    // Ignore migration errors if already done
  }

  // Seed sample rooms if rooms table is empty
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
  if (roomCount === 0) {
    const insertRoom = db.prepare(`
      INSERT INTO rooms (room_number, floor, tenant_name, tenant_phone, base_rent, security_deposit, meter_initial_reading, move_in_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRoom.run('Room A', 'Double Room', 'Rahul Sharma', '+919876543210', 7500, 15000, 1120, '2026-01-01', 'occupied');
    insertRoom.run('Room B', 'Double Room', 'Amit Patel', '+919812345678', 7500, 15000, 980, '2026-02-15', 'occupied');
    insertRoom.run('1BHK', '1BHK Flat', 'Priya Deshmukh', '+919923456789', 9000, 20000, 1450, '2026-03-01', 'occupied');
    insertRoom.run('Single Room', 'Single Room', 'Vikas Verma', '+919765432109', 5000, 10000, 830, '2026-04-10', 'occupied');
    console.log('Seeded sample rooms for initial setup.');
  }
}

initDb();

module.exports = db;
