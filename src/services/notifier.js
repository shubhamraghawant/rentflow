const db = require('../db');

function getSettingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  // Remove spaces, hyphens, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // If starts with +, strip for wa.me link
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.length === 10) {
    // Default Indian 10-digit number prepend 91
    cleaned = '91' + cleaned;
  }
  return cleaned;
}

function formatCurrency(amount, symbol = '₹') {
  const num = Number(amount) || 0;
  return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatBillingMonth(monthStr) {
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

function buildNotificationMessage(bill, room, settings) {
  const currency = settings.currency_symbol || '₹';
  let template = settings.message_template || '';

  const rawUnits = Number(bill.units_consumed !== undefined ? bill.units_consumed : (bill.current_reading - bill.previous_reading));
  const units = rawUnits % 1 === 0 ? rawUnits.toString() : rawUnits.toFixed(2);
  const elecAmount = Number(bill.electricity_amount).toLocaleString('en-IN');
  const rentAmount = Number(bill.rent_amount).toLocaleString('en-IN');
  const totalAmount = Number(bill.total_amount).toLocaleString('en-IN');
  const formattedMonth = formatBillingMonth(bill.billing_month);

  let otherChargesLine = '';
  if (Number(bill.other_charges) > 0) {
    const desc = bill.other_charges_desc ? ` (${bill.other_charges_desc})` : '';
    otherChargesLine = `\n➕ *Other Charges${desc}:* ${currency}${Number(bill.other_charges).toFixed(2)}`;
  }
  if (Number(bill.discount) > 0) {
    otherChargesLine += `\n➖ *Discount:* ${currency}${Number(bill.discount).toFixed(2)}`;
  }

  const upiId = settings.upi_id || 'vanitaraghawant@oksbi';
  const landlordPhone = settings.landlord_phone || '+919146225975';
  const landlordName = settings.landlord_name || 'Malganga Niwas';

  let paymentInfo = '';
  if (upiId) {
    paymentInfo = `💳 *Pay via UPI:* ${upiId}\n`;
  }
  if (landlordPhone) {
    paymentInfo += `📞 *GPay / PhonePe / Paytm:* ${landlordPhone}\n`;
  }

  const rawRoom = (room.room_number || '').trim();
  const formattedRoom = rawRoom.toLowerCase().startsWith('room')
    ? rawRoom
    : (rawRoom.toLowerCase().includes('bhk') || rawRoom.toLowerCase().includes('single') ? rawRoom : `Room ${rawRoom}`);

  const replacements = {
    '{tenant_name}': room.tenant_name || 'Tenant',
    '{room_number}': rawRoom,
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
  message = message.split('*Room {room_number}*').join(`*${formattedRoom}*`);
  message = message.split('Room {room_number}').join(formattedRoom);
  for (const [key, val] of Object.entries(replacements)) {
    message = message.split(key).join(val);
  }

  return message.trim();
}

function generateWhatsAppUrl(phone, message) {
  const cleaned = cleanPhoneNumber(phone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${cleaned}?text=${encodedText}`;
}

function generateSmsUrl(phone, message) {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (!cleaned.startsWith('+') && cleaned.length === 10) {
    cleaned = '+91' + cleaned;
  }
  const encodedText = encodeURIComponent(message);
  // Universal SMS scheme
  return `sms:${cleaned}?body=${encodedText}`;
}

async function sendSmsViaGateway(phone, message, settings) {
  const gateway = settings.sms_gateway || 'none';
  const apiKey = settings.sms_api_key;

  if (gateway === 'none' || !apiKey) {
    return {
      success: false,
      reason: 'No SMS Gateway API configured. Please use direct SMS link or configure API in Settings.'
    };
  }

  try {
    if (gateway === 'fast2sms') {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'v3',
          sender_id: settings.sms_sender_id || 'TXTIND',
          message: message,
          language: 'english',
          flash: 0,
          numbers: cleanPhoneNumber(phone).slice(-10)
        })
      });
      const data = await response.json();
      return { success: data.return === true, data };
    }

    if (gateway === 'webhook' && settings.sms_api_key.startsWith('http')) {
      const response = await fetch(settings.sms_api_key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });
      const data = await response.json();
      return { success: true, data };
    }

    return { success: false, reason: `Gateway "${gateway}" handler not supported yet.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function logNotification(billId, roomNumber, tenantName, phone, channel, message, status = 'sent') {
  try {
    const stmt = db.prepare(`
      INSERT INTO notification_logs (bill_id, room_number, tenant_name, phone, channel, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(billId, roomNumber, tenantName, phone, channel, message, status);
  } catch (err) {
    console.error('Failed to log notification:', err);
  }
}

module.exports = {
  getSettingsMap,
  cleanPhoneNumber,
  buildNotificationMessage,
  generateWhatsAppUrl,
  generateSmsUrl,
  sendSmsViaGateway,
  logNotification
};
