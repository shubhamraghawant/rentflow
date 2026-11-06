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

  // Default settings seed
  const defaultSettings = [
    { key: 'electricity_rate', value: process.env.DEFAULT_ELECTRICITY_RATE || '10' },
    { key: 'default_rent', value: process.env.DEFAULT_RENT || '6000' },
    { key: 'landlord_name', value: process.env.LANDLORD_NAME || 'Shubham Properties' },
    { key: 'landlord_phone', value: process.env.LANDLORD_PHONE || '' },
    { key: 'upi_id', value: process.env.UPI_ID || '' },
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
• Rate: {currency}{electricity_rate}/unit
• *Light Bill Amount:* {currency}{electricity_amount}

🏠 *Room Rent:* {currency}{rent_amount}
{other_charges_line}
━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL AMOUNT DUE:* *{currency}{total_amount}*
📅 *Due Date:* {due_date}

{payment_info}
Please share payment confirmation screenshot once done.
Thank you!
— *{landlord_name}*`
    }
  ];

  const checkStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');

  for (const s of defaultSettings) {
    const existing = checkStmt.get(s.key);
    if (!existing) {
      insertStmt.run(s.key, s.value);
    }
  }

  // Seed sample rooms if rooms table is empty
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
  if (roomCount === 0) {
    const insertRoom = db.prepare(`
      INSERT INTO rooms (room_number, floor, tenant_name, tenant_phone, base_rent, meter_initial_reading, move_in_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertRoom.run('101', 'Ground Floor', 'Rahul Sharma', '+919876543210', 6500, 1120, '2026-01-01', 'occupied');
    insertRoom.run('102', 'Ground Floor', 'Amit Patel', '+919812345678', 6000, 980, '2026-02-15', 'occupied');
    insertRoom.run('201', '1st Floor', 'Priya Deshmukh', '+919923456789', 7000, 1450, '2026-03-01', 'occupied');
    insertRoom.run('202', '1st Floor', 'Vikas Verma', '+919765432109', 6000, 830, '2026-04-10', 'occupied');
    console.log('Seeded sample rooms for initial setup.');
  }
}

initDb();

module.exports = db;
