const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all settings
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update single or multiple settings
router.put('/', (req, res) => {
  try {
    const updates = req.body; // e.g. { electricity_rate: 12, default_rent: 6500 }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid settings payload' });
    }

    const upsertStmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    const updateMany = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        upsertStmt.run(key, String(value));
      }
    });

    updateMany(updates);

    // Return updated settings
    const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quick runtime factor update endpoint (for electricity_rate and default_rent)
router.post('/factors', (req, res) => {
  try {
    const { electricity_rate, default_rent } = req.body;
    const upsertStmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    db.transaction(() => {
      if (electricity_rate !== undefined && electricity_rate !== null) {
        const rateNum = Number(electricity_rate);
        if (isNaN(rateNum) || rateNum < 0) throw new Error('Electricity rate must be a non-negative number');
        upsertStmt.run('electricity_rate', String(rateNum));
      }
      if (default_rent !== undefined && default_rent !== null) {
        const rentNum = Number(default_rent);
        if (isNaN(rentNum) || rentNum < 0) throw new Error('Default rent must be a non-negative number');
        upsertStmt.run('default_rent', String(rentNum));
      }
    })();

    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN ("electricity_rate", "default_rent")').all();
    const factors = {};
    for (const r of rows) factors[r.key] = Number(r.value);

    res.json({
      success: true,
      message: 'Runtime factors updated successfully',
      factors
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
