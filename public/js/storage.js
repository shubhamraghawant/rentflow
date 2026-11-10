/**
 * RentFlow 100% Offline Storage Engine
 * Persists all rooms, bills, settings, and ledgers directly in the phone's local storage.
 * Completely serverless and works with zero internet connection.
 */

const STORAGE_KEYS = {
  SETTINGS: 'rentflow_settings',
  ROOMS: 'rentflow_rooms',
  BILLS: 'rentflow_bills',
  LOGS: 'rentflow_logs'
};

const DEFAULT_SETTINGS = {
  electricity_rate: '10',
  default_rent: '6000',
  landlord_name: 'Malganga Niwas',
  landlord_phone: '+919146225975',
  upi_id: 'vanitaraghawant@oksbi',
  due_day_of_month: '5',
  currency_symbol: '₹',
  message_template: `📢 *RENT & ELECTRICITY BILL NOTICE*
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
};

const DEFAULT_ROOMS = [
  { id: 1, room_number: '101', floor: 'Ground Floor', tenant_name: 'Rahul Sharma', tenant_phone: '+919876543210', base_rent: 6500, meter_initial_reading: 1120, move_in_date: '2026-01-01', status: 'occupied' },
  { id: 2, room_number: '102', floor: 'Ground Floor', tenant_name: 'Amit Patel', tenant_phone: '+919812345678', base_rent: 6000, meter_initial_reading: 980, move_in_date: '2026-02-15', status: 'occupied' },
  { id: 3, room_number: '201', floor: '1st Floor', tenant_name: 'Priya Deshmukh', tenant_phone: '+919923456789', base_rent: 7000, meter_initial_reading: 1450, move_in_date: '2026-03-01', status: 'occupied' },
  { id: 4, room_number: '202', floor: '1st Floor', tenant_name: 'Vikas Verma', tenant_phone: '+919765432109', base_rent: 6000, meter_initial_reading: 830, move_in_date: '2026-04-10', status: 'occupied' }
];

class OfflineStore {
  constructor() {
    this.init();
  }

  init() {
    // Initialize or migrate settings
    const existingSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!existingSettings) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    } else {
      const current = this.getSettings();
      // If still using previous sample landlord name or UPI ID, update to Malganga Niwas & vanitaraghawant@oksbi
      if (current.landlord_name === 'Shubham Properties' || current.upi_id === 'shubham@upi' || current.message_template.includes('{electricity_rate}/unit')) {
        current.landlord_name = 'Malganga Niwas';
        current.upi_id = 'vanitaraghawant@oksbi';
        current.landlord_phone = '+919146225975';
        current.message_template = DEFAULT_SETTINGS.message_template;
      }
      const merged = { ...DEFAULT_SETTINGS, ...current };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    }

    // Initialize sample rooms if not present
    if (!localStorage.getItem(STORAGE_KEYS.ROOMS)) {
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(DEFAULT_ROOMS));
    }

    // Initialize bills array if not present
    if (!localStorage.getItem(STORAGE_KEYS.BILLS)) {
      localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify([]));
    }

    // Initialize logs array if not present
    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
    }
  }

  // --- Settings ---
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)) || DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  updateSettings(newSettings) {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  }

  updateFactors(electricityRate, defaultRent) {
    const current = this.getSettings();
    if (electricityRate !== undefined && electricityRate !== null) {
      current.electricity_rate = String(electricityRate);
    }
    if (defaultRent !== undefined && defaultRent !== null) {
      current.default_rent = String(defaultRent);
    }
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(current));
    return current;
  }

  // --- Rooms ---
  getRooms(filter = {}) {
    try {
      let rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
      const bills = this.getBills();

      // Calculate effective previous reading from the latest bill (current reading + 1)
      rooms = rooms.map(room => {
        const roomBills = bills
          .filter(b => b.room_id === room.id)
          .sort((a, b) => (b.billing_month > a.billing_month ? 1 : -1));

        const lastBill = roomBills[0];
        const effectivePrev = lastBill
          ? Number(lastBill.current_reading) + 1
          : Number(room.meter_initial_reading || 0);

        return {
          ...room,
          effective_previous_reading: effectivePrev,
          last_recorded_reading: lastBill ? lastBill.current_reading : null,
          last_billing_month: lastBill ? lastBill.billing_month : null
        };
      });

      if (filter.status) {
        rooms = rooms.filter(r => r.status === filter.status);
      }
      if (filter.search) {
        const s = filter.search.toLowerCase();
        rooms = rooms.filter(r =>
          r.room_number.toLowerCase().includes(s) ||
          r.tenant_name.toLowerCase().includes(s) ||
          r.tenant_phone.includes(s)
        );
      }

      return rooms;
    } catch {
      return [];
    }
  }

  getRoom(id) {
    const rooms = this.getRooms();
    const room = rooms.find(r => r.id === Number(id));
    if (!room) return null;

    const bills = this.getBills({ room_id: room.id });
    return { room, recent_bills: bills };
  }

  createRoom(roomData) {
    const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
    const nextId = rooms.length > 0 ? Math.max(...rooms.map(r => r.id)) + 1 : 1;

    // Check duplicate room number
    if (rooms.some(r => r.room_number.trim() === roomData.room_number.trim())) {
      throw new Error(`Room number "${roomData.room_number}" already exists`);
    }

    const newRoom = {
      id: nextId,
      room_number: String(roomData.room_number).trim(),
      floor: roomData.floor || 'Ground Floor',
      tenant_name: String(roomData.tenant_name).trim(),
      tenant_phone: String(roomData.tenant_phone).trim(),
      tenant_email: roomData.tenant_email || '',
      base_rent: Number(roomData.base_rent) || 6000,
      meter_initial_reading: Number(roomData.meter_initial_reading) || 0,
      security_deposit: Number(roomData.security_deposit) || 0,
      move_in_date: roomData.move_in_date || new Date().toISOString().split('T')[0],
      status: roomData.status || 'occupied',
      notes: roomData.notes || '',
      created_at: new Date().toISOString()
    };

    rooms.push(newRoom);
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    return newRoom;
  }

  updateRoom(id, roomData) {
    const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
    const index = rooms.findIndex(r => r.id === Number(id));
    if (index === -1) throw new Error('Room not found');

    if (roomData.room_number && rooms.some((r, i) => i !== index && r.room_number.trim() === roomData.room_number.trim())) {
      throw new Error(`Room number "${roomData.room_number}" already exists`);
    }

    rooms[index] = {
      ...rooms[index],
      ...roomData,
      id: Number(id),
      updated_at: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    return rooms[index];
  }

  deleteRoom(id) {
    let rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
    rooms = rooms.filter(r => r.id !== Number(id));
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));

    // Also remove associated bills
    let bills = JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLS)) || [];
    bills = bills.filter(b => b.room_id !== Number(id));
    localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
    return true;
  }

  // --- Bills ---
  getBills(filter = {}) {
    try {
      let bills = JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLS)) || [];
      const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
      const settings = this.getSettings();

      // Enrich bills with room data and pre-generated URLs
      bills = bills.map(bill => {
        const room = rooms.find(r => r.id === bill.room_id) || {};
        const formattedMessage = this.buildNotificationMessage(bill, room, settings);
        return {
          ...bill,
          room_number: room.room_number || '',
          floor: room.floor || '',
          tenant_name: room.tenant_name || '',
          tenant_phone: room.tenant_phone || '',
          formatted_message: formattedMessage,
          whatsapp_url: this.generateWhatsAppUrl(room.tenant_phone, formattedMessage),
          sms_url: this.generateSmsUrl(room.tenant_phone, formattedMessage)
        };
      });

      if (filter.month) {
        bills = bills.filter(b => b.billing_month === filter.month);
      }
      if (filter.room_id) {
        bills = bills.filter(b => b.room_id === Number(filter.room_id));
      }
      if (filter.status) {
        bills = bills.filter(b => b.status === filter.status);
      }

      // Sort by billing month descending
      bills.sort((a, b) => (b.billing_month > a.billing_month ? 1 : -1));
      return bills;
    } catch {
      return [];
    }
  }

  saveBill(billData) {
    const bills = JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLS)) || [];
    const rooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
    const settings = this.getSettings();

    const room = rooms.find(r => r.id === Number(billData.room_id));
    if (!room) throw new Error('Room not found');

    const prev = Number(billData.previous_reading) || 0;
    const curr = Number(billData.current_reading);
    if (isNaN(curr)) throw new Error('Current reading is required');
    if (curr < prev) throw new Error(`Current reading (${curr}) cannot be less than previous (${prev})`);

    const rate = Number(billData.electricity_rate || settings.electricity_rate || 10);
    const rent = Number(billData.rent_amount !== undefined ? billData.rent_amount : (room.base_rent || settings.default_rent || 6000));
    const units = Math.round((curr - prev) * 100) / 100;
    const elecAmount = Math.round(units * rate * 100) / 100;
    const other = Number(billData.other_charges) || 0;
    const total = Math.round((rent + elecAmount + other) * 100) / 100;

    let dueDate = billData.due_date;
    if (!dueDate) {
      const dueDay = String(settings.due_day_of_month || '5').padStart(2, '0');
      dueDate = `${billData.billing_month}-${dueDay}`;
    }

    const existingIndex = bills.findIndex(
      b => b.room_id === Number(billData.room_id) && b.billing_month === billData.billing_month
    );

    const savedBill = {
      id: existingIndex >= 0 ? bills[existingIndex].id : (bills.length > 0 ? Math.max(...bills.map(b => b.id)) + 1 : 1),
      room_id: Number(billData.room_id),
      billing_month: billData.billing_month,
      previous_reading: prev,
      current_reading: curr,
      units_consumed: units,
      electricity_rate: rate,
      electricity_amount: elecAmount,
      rent_amount: rent,
      other_charges: other,
      total_amount: total,
      due_date: dueDate,
      status: existingIndex >= 0 ? bills[existingIndex].status : 'unpaid',
      notification_sent: existingIndex >= 0 ? bills[existingIndex].notification_sent : 0,
      updated_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      bills[existingIndex] = savedBill;
    } else {
      bills.push(savedBill);
    }

    localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));

    const message = this.buildNotificationMessage(savedBill, room, settings);
    return {
      ...savedBill,
      room_number: room.room_number,
      tenant_name: room.tenant_name,
      tenant_phone: room.tenant_phone,
      formatted_message: message,
      whatsapp_url: this.generateWhatsAppUrl(room.tenant_phone, message),
      sms_url: this.generateSmsUrl(room.tenant_phone, message)
    };
  }

  updateBillStatus(id, status, paidAmount = null) {
    const bills = JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLS)) || [];
    const index = bills.findIndex(b => b.id === Number(id));
    if (index === -1) throw new Error('Bill not found');

    bills[index].status = status;
    bills[index].paid_amount = status === 'paid' ? bills[index].total_amount : (paidAmount || 0);
    bills[index].paid_date = status === 'paid' ? new Date().toISOString().split('T')[0] : null;
    bills[index].updated_at = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
    return bills[index];
  }

  deleteBill(id) {
    let bills = JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLS)) || [];
    bills = bills.filter(b => b.id !== Number(id));
    localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
    return true;
  }

  getSummary(month) {
    const rooms = this.getRooms({ status: 'occupied' });
    const bills = this.getBills({ month });
    const settings = this.getSettings();

    let totalExpected = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalUnits = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const b of bills) {
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

    return {
      total_rooms: rooms.length,
      billed_rooms: bills.length,
      unbilled_rooms: Math.max(0, rooms.length - bills.length),
      total_expected: Math.round(totalExpected),
      total_collected: Math.round(totalCollected),
      total_pending: Math.round(totalPending),
      total_units_consumed: Math.round(totalUnits * 100) / 100,
      paid_count: paidCount,
      unpaid_count: unpaidCount,
      current_electricity_rate: Number(settings.electricity_rate || 10),
      current_default_rent: Number(settings.default_rent || 6000),
      currency_symbol: settings.currency_symbol || '₹'
    };
  }

  // Helper to format "2026-10" into "October 2026"
  formatBillingMonth(monthStr) {
    if (!monthStr) return '';
    if (monthStr.includes(' ')) return monthStr;
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (!isNaN(year) && !isNaN(month)) {
        const d = new Date(year, month - 1, 1);
        return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      }
    }
    return monthStr;
  }

  // --- Message Builder & URLs ---
  buildNotificationMessage(bill, room, settings) {
    const currency = settings.currency_symbol || '₹';
    let template = settings.message_template || '';

    const rawUnits = Number(bill.units_consumed !== undefined ? bill.units_consumed : (bill.current_reading - bill.previous_reading));
    const units = rawUnits % 1 === 0 ? rawUnits.toString() : rawUnits.toFixed(2);
    const elecAmount = Number(bill.electricity_amount).toLocaleString('en-IN');
    const rentAmount = Number(bill.rent_amount).toLocaleString('en-IN');
    const totalAmount = Number(bill.total_amount).toLocaleString('en-IN');
    const formattedMonth = this.formatBillingMonth(bill.billing_month);

    let otherChargesLine = '';
    if (Number(bill.other_charges) > 0) {
      otherChargesLine = `\n➕ *Other Charges:* ${currency}${Number(bill.other_charges).toLocaleString('en-IN')}`;
    }

    let paymentInfo = '';
    const upiId = settings.upi_id || 'vanitaraghawant@oksbi';
    const landlordPhone = settings.landlord_phone || '+919146225975';
    const landlordName = settings.landlord_name || 'Malganga Niwas';

    if (upiId) {
      paymentInfo = `💳 *Pay via UPI:* ${upiId}\n`;
    }
    if (landlordPhone) {
      paymentInfo += `📞 *GPay / PhonePe / Paytm:* ${landlordPhone}\n`;
    }

    const replacements = {
      '{tenant_name}': room.tenant_name || 'Tenant',
      '{room_number}': room.room_number || '',
      '{billing_month}': formattedMonth,
      '{previous_reading}': bill.previous_reading,
      '{current_reading}': bill.current_reading,
      '{units_consumed}': units,
      '{electricity_rate}': bill.electricity_rate,
      '{electricity_amount}': elecAmount,
      '{rent_amount}': rentAmount,
      '{other_charges_line}': otherChargesLine,
      '{total_amount}': totalAmount,
      '{due_date}': bill.due_date || 'Within 5 days',
      '{currency}': currency,
      '{payment_info}': paymentInfo.trim(),
      '{upi_id}': upiId,
      '{landlord_phone}': landlordPhone,
      '{landlord_name}': landlordName
    };

    let message = template;
    for (const [key, val] of Object.entries(replacements)) {
      message = message.split(key).join(val);
    }
    return message.trim();
  }

  cleanPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  generateWhatsAppUrl(phone, message) {
    const cleaned = this.cleanPhoneNumber(phone);
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${cleaned}?text=${encoded}`;
  }

  generateSmsUrl(phone, message) {
    let cleaned = (phone || '').replace(/[\s\-\(\)]/g, '');
    if (!cleaned.startsWith('+') && cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    }
    return `sms:${cleaned}?body=${encodeURIComponent(message)}`;
  }

  recordDispatch(billId, channel = 'whatsapp') {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS)) || [];
    logs.unshift({
      id: Date.now(),
      bill_id: billId,
      channel,
      timestamp: new Date().toISOString()
    });
    // Keep last 100 logs
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(0, 100)));
  }

  // --- Backup & Restore ---
  exportBackupJson() {
    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      settings: this.getSettings(),
      rooms: JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [],
      bills: JSON.parse(localStorage.getItem(STORAGE_KEYS.BILLS)) || [],
      logs: JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS)) || []
    };
    return JSON.stringify(backup, null, 2);
  }

  importBackupJson(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.rooms || !data.settings) {
      throw new Error('Invalid backup file format');
    }

    if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
    if (data.rooms) localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(data.rooms));
    if (data.bills) localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(data.bills));
    if (data.logs) localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(data.logs));

    return true;
  }
}

// Global store instance
const offlineStore = new OfflineStore();
window.offlineStore = offlineStore;
