require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const os = require('os');
const db = require('./src/db');
const settingsRoutes = require('./src/routes/settings');
const roomsRoutes = require('./src/routes/rooms');
const billsRoutes = require('./src/routes/bills');
const notificationsRoutes = require('./src/routes/notifications');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/settings', settingsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'RentFlow',
    timestamp: new Date().toISOString()
  });
});

// SPA fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error', details: err.message });
});

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const server = app.listen(PORT, HOST, () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`⚡ RentFlow is running!`);
  console.log(`💻 Local (Mac / PC):  http://localhost:${PORT}`);
  if (localIps.length > 0) {
    for (const ip of localIps) {
      console.log(`📱 Mobile (Wi-Fi):     http://${ip}:${PORT}`);
    }
    console.log(`👉 Open the Mobile URL in your phone browser to install as an app!`);
  }
  console.log(`======================================================\n`);
});

module.exports = { app, server };
