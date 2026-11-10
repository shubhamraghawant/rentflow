// Register Service Worker for PWA / Mobile App
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered with scope:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

function handleInstallAppClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('RentFlow installed on your device!', 'success');
      }
      deferredInstallPrompt = null;
    });
  } else {
    // Show step-by-step instructions for Android & iOS
    document.getElementById('install-guide-modal').classList.add('active');
  }
}

// Offline Backup & Restore handlers
function exportDataBackup() {
  try {
    const jsonStr = API.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `rentflow-backup-${today}.json`;
    a.click();
    showToast('Full backup downloaded to your device!', 'success');
  } catch (err) {
    showToast('Failed to export backup: ' + err.message, 'error');
  }
}

function importDataBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const res = API.importBackup(e.target.result);
      if (res.success) {
        showToast(res.message, 'success');
        await loadSettingsAndFactors();
        await loadBillingDashboard();
      } else {
        showToast(res.error || 'Failed to restore backup', 'error');
      }
    } catch (err) {
      showToast('Invalid backup file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// Default billing month is one month prior to current calendar month (e.g. October when sending in November)
function getDefaultBillingMonth() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return prev.toISOString().slice(0, 7);
}

// App State
const state = {
  currentMonth: getDefaultBillingMonth(),
  settings: {},
  electricityRate: 10,
  defaultRent: 6000,
  rooms: [],
  bills: [],
  billsMap: {}, // key: room_id
  summary: null,
  activeView: 'billing-view'
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: '✅',
    error: '⚠️',
    info: 'ℹ️'
  };

  toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Navigation View Switcher
function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById(viewId);
  const targetNav = document.querySelector(`[data-view="${viewId}"]`);

  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  if (viewId === 'billing-view') loadBillingDashboard();
  if (viewId === 'rooms-view') loadRoomsTable();
  if (viewId === 'history-view') loadBillingHistory();
  if (viewId === 'settings-view') loadSettingsForm();
}

// Initial Boot
async function initApp() {
  setupMonthPicker();
  setupEventListeners();
  await loadSettingsAndFactors();
  await loadBillingDashboard();
}

// Setup Month Picker (Last 12 months + next 2 months)
function setupMonthPicker() {
  const select = document.getElementById('billing-month-select');
  select.innerHTML = '';

  const now = new Date();
  // Generate options around current month
  for (let i = -6; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === state.currentMonth) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', (e) => {
    state.currentMonth = e.target.value;
    loadBillingDashboard();
  });
}

// Load Settings & Runtime Factors
async function loadSettingsAndFactors() {
  try {
    const settings = await API.getSettings();
    state.settings = settings || {};
    state.electricityRate = Number(settings.electricity_rate || 10);
    state.defaultRent = Number(settings.default_rent || 6000);

    // Update Top Factor Input fields
    const rateInput = document.getElementById('runtime-elec-rate');
    const rentInput = document.getElementById('runtime-default-rent');
    if (rateInput) rateInput.value = state.electricityRate;
    if (rentInput) rentInput.value = state.defaultRent;

    const brandProp = document.getElementById('brand-property-name');
    if (brandProp && settings.landlord_name) {
      brandProp.textContent = settings.landlord_name;
    }
  } catch (err) {
    showToast('Failed to load settings', 'error');
  }
}

// Save Runtime Factors (Instant update)
async function saveRuntimeFactors() {
  const rateInput = document.getElementById('runtime-elec-rate');
  const rentInput = document.getElementById('runtime-default-rent');

  const newRate = Number(rateInput.value);
  const newRent = Number(rentInput.value);

  if (isNaN(newRate) || newRate < 0) {
    showToast('Electricity rate must be a valid number', 'error');
    return;
  }
  if (isNaN(newRent) || newRent < 0) {
    showToast('Base rent must be a valid number', 'error');
    return;
  }

  try {
    const res = await API.updateFactors(newRate, newRent);
    if (res.success) {
      state.electricityRate = newRate;
      state.defaultRent = newRent;
      showToast('Factors updated successfully in backend!', 'success');
      // Recalculate all cards on screen
      recalculateAllCards();
      loadSummaryStats();
    }
  } catch (err) {
    showToast('Failed to update factors: ' + err.message, 'error');
  }
}

// Load Billing Dashboard (Cards Grid + Summary)
async function loadBillingDashboard() {
  try {
    // 1. Fetch Rooms
    const roomsRes = await API.getRooms({ status: 'occupied' });
    state.rooms = roomsRes.rooms || [];

    // 2. Fetch Existing Bills for this month
    const billsRes = await API.getBills({ month: state.currentMonth });
    state.bills = billsRes.bills || [];

    // Map bills by room_id
    state.billsMap = {};
    for (const b of state.bills) {
      state.billsMap[b.room_id] = b;
    }

    // 3. Render Dashboard Cards
    renderRoomCards();

    // 4. Load & Render Summary
    await loadSummaryStats();
  } catch (err) {
    showToast('Error loading dashboard: ' + err.message, 'error');
  }
}

// Render Summary Stats Ribbon
async function loadSummaryStats() {
  try {
    const res = await API.getSummary(state.currentMonth);
    if (!res.success) return;
    const s = res.summary;
    state.summary = s;

    document.getElementById('stat-total-rooms').textContent = s.total_rooms;
    document.getElementById('stat-billed-rooms').textContent = `${s.billed_rooms} / ${s.total_rooms}`;
    document.getElementById('stat-total-units').textContent = `${s.total_units_consumed} units`;
    document.getElementById('stat-total-collection').textContent = `₹${s.total_expected.toLocaleString('en-IN')}`;
    document.getElementById('stat-collected').textContent = `₹${s.total_collected.toLocaleString('en-IN')}`;
    document.getElementById('stat-pending').textContent = `₹${s.total_pending.toLocaleString('en-IN')}`;
  } catch (err) {
    console.error('Failed to load summary:', err);
  }
}

// Render Room Billing Cards
function renderRoomCards() {
  const container = document.getElementById('room-bills-container');
  if (!container) return;

  if (state.rooms.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
        <p style="color: var(--text-muted); margin-bottom: 1rem;">No occupied rooms found.</p>
        <button class="btn-primary" onclick="openAddRoomModal()">+ Add Your First Room & Tenant</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.rooms.map(room => {
    const bill = state.billsMap[room.id];
    const isBilled = !!bill;

    // Previous reading: if bill exists, use bill's previous_reading; otherwise use room's effective_previous_reading
    const prevReading = isBilled ? bill.previous_reading : room.effective_previous_reading;
    const currReading = isBilled ? bill.current_reading : '';
    const rentAmount = isBilled ? bill.rent_amount : (room.base_rent || state.defaultRent);

    let units = 0;
    let elecAmount = 0;
    let totalAmount = rentAmount;

    if (currReading !== '' && Number(currReading) >= Number(prevReading)) {
      units = Math.round((Number(currReading) - Number(prevReading)) * 100) / 100;
      elecAmount = Math.round(units * state.electricityRate * 100) / 100;
      totalAmount = Math.round((Number(rentAmount) + elecAmount) * 100) / 100;
    }

    const statusPillClass = isBilled ? (bill.status === 'paid' ? 'paid' : 'unpaid') : 'unbilled';
    const statusText = isBilled ? (bill.status === 'paid' ? 'Paid' : 'Unpaid') : 'Pending Reading';

    return `
      <div class="bill-card ${isBilled ? 'has-bill' : 'pending-bill'}" id="card-room-${room.id}">
        <!-- Top Row -->
        <div class="bill-card-top">
          <div class="room-badge-group">
            <div class="room-avatar">${room.room_number}</div>
            <div class="tenant-meta">
              <h4>${escapeHtml(room.tenant_name)}</h4>
              <div class="tenant-phone">
                <span>📞</span>
                <span>${room.tenant_phone}</span>
                <span style="margin: 0 4px;">•</span>
                <span>${room.floor || 'Floor'}</span>
              </div>
            </div>
          </div>
          <span class="bill-status-pill ${statusPillClass}">${statusText}</span>
        </div>

        <!-- Meter Reading Box -->
        <div class="meter-reading-box">
          <div class="meter-inputs-row">
            <!-- Previous Reading -->
            <div class="input-field-group">
              <label>Prev Reading (Units)</label>
              <div class="reading-input-wrap">
                <input
                  type="number"
                  step="any"
                  class="custom-input prev-reading-input"
                  id="prev-reading-${room.id}"
                  value="${prevReading}"
                  data-room-id="${room.id}"
                  placeholder="0"
                  oninput="handleReadingChange(${room.id})"
                />
                <button
                  type="button"
                  class="helper-btn"
                  title="Set Previous Reading = Current Reading + 1 (As configured)"
                  onclick="applyOffsetReading(${room.id})"
                >+1</button>
              </div>
            </div>

            <!-- Current Reading -->
            <div class="input-field-group">
              <label>Current Reading (Units)</label>
              <div class="reading-input-wrap">
                <input
                  type="number"
                  step="any"
                  class="custom-input current-reading-input"
                  id="curr-reading-${room.id}"
                  value="${currReading}"
                  data-room-id="${room.id}"
                  placeholder="e.g. ${Number(prevReading) + 120}"
                  oninput="handleReadingChange(${room.id})"
                />
              </div>
            </div>
          </div>

          <!-- Live Light Bill Calculation Strip -->
          <div class="calc-summary-strip">
            <div>
              <span>Units: </span>
              <span class="calc-units-badge" id="calc-units-${room.id}">${units} units</span>
            </div>
            <div>
              <span>Rate: ₹${state.electricityRate}/u → </span>
              <span class="calc-amount-badge" id="calc-elec-amt-${room.id}">₹${elecAmount}</span>
            </div>
          </div>
        </div>

        <!-- Rent & Other Row -->
        <div class="charges-row">
          <div class="input-field-group">
            <label>Rent Amount (₹)</label>
            <input
              type="number"
              class="custom-input rent-amount-input"
              id="rent-amt-${room.id}"
              value="${rentAmount}"
              data-room-id="${room.id}"
              oninput="handleReadingChange(${room.id})"
            />
          </div>
          <div class="input-field-group">
            <label>Other / Maint (₹)</label>
            <input
              type="number"
              class="custom-input other-charges-input"
              id="other-amt-${room.id}"
              value="${bill ? bill.other_charges : 0}"
              data-room-id="${room.id}"
              oninput="handleReadingChange(${room.id})"
            />
          </div>
        </div>

        <!-- Total Payable Strip -->
        <div class="card-total-bar">
          <span class="card-total-label">Total Payable</span>
          <span class="card-total-val" id="total-val-${room.id}">₹${totalAmount.toLocaleString('en-IN')}</span>
        </div>

        <!-- Action Buttons: WhatsApp Bill (Auto-generates bill) & Mark as Paid -->
        <div class="card-actions-single">
          <button
            type="button"
            class="btn-whatsapp-full"
            onclick="sendWhatsAppNotification(${room.id})"
            title="Auto-generate bill and open WhatsApp directly"
          >
            <span style="font-size: 1.15rem;">💬</span> WhatsApp Bill
          </button>

          <button
            type="button"
            class="btn-paid-toggle ${isBilled && bill.status === 'paid' ? 'is-paid' : ''}"
            onclick="toggleRoomPaid(${room.id})"
            title="Toggle payment status between Paid and Unpaid"
          >
            <span>${isBilled && bill.status === 'paid' ? '✅ Paid' : '💳 Mark as Paid'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Live calculation when readings or rent change on any card
function handleReadingChange(roomId) {
  const prevInput = document.getElementById(`prev-reading-${roomId}`);
  const currInput = document.getElementById(`curr-reading-${roomId}`);
  const rentInput = document.getElementById(`rent-amt-${roomId}`);
  const otherInput = document.getElementById(`other-amt-${roomId}`);

  const prev = Number(prevInput ? prevInput.value : 0) || 0;
  const curr = Number(currInput ? currInput.value : 0) || 0;
  const rent = Number(rentInput ? rentInput.value : 0) || 0;
  const other = Number(otherInput ? otherInput.value : 0) || 0;

  const units = curr >= prev ? Math.round((curr - prev) * 100) / 100 : 0;
  const elecAmount = Math.round(units * state.electricityRate * 100) / 100;
  const total = Math.round((rent + elecAmount + other) * 100) / 100;

  const unitsEl = document.getElementById(`calc-units-${roomId}`);
  const elecEl = document.getElementById(`calc-elec-amt-${roomId}`);
  const totalEl = document.getElementById(`total-val-${roomId}`);

  if (unitsEl) unitsEl.textContent = `${units} units`;
  if (elecEl) elecEl.textContent = `₹${elecAmount}`;
  if (totalEl) totalEl.textContent = `₹${total.toLocaleString('en-IN')}`;
}

// Recalculate all cards when runtime electricity rate or rent changes
function recalculateAllCards() {
  state.rooms.forEach(room => {
    handleReadingChange(room.id);
  });
}

// Helper button for "+1" reading offset (as specified in user prompt: "same reading plus 1 should be considered as previous reading")
function applyOffsetReading(roomId) {
  const currInput = document.getElementById(`curr-reading-${roomId}`);
  const prevInput = document.getElementById(`prev-reading-${roomId}`);

  const curr = Number(currInput ? currInput.value : 0);
  if (curr > 0) {
    prevInput.value = curr + 1;
    showToast(`Previous reading set to current + 1 (${curr + 1})`, 'info');
  } else {
    // If current is empty, increment previous reading by 1
    const prev = Number(prevInput ? prevInput.value : 0);
    prevInput.value = prev + 1;
    showToast(`Previous reading incremented by 1 (${prev + 1})`, 'info');
  }
  handleReadingChange(roomId);
}

// Save a Room's Bill to Database
async function saveRoomBill(roomId, silent = false) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return null;

  const prevInput = document.getElementById(`prev-reading-${roomId}`);
  const currInput = document.getElementById(`curr-reading-${roomId}`);
  const rentInput = document.getElementById(`rent-amt-${roomId}`);
  const otherInput = document.getElementById(`other-amt-${roomId}`);

  const prev = Number(prevInput.value);
  const curr = Number(currInput.value);
  const rent = Number(rentInput.value);
  const other = Number(otherInput.value) || 0;

  if (isNaN(curr) || currInput.value.trim() === '') {
    showToast(`Please enter Current Reading for Room ${room.room_number}`, 'error');
    currInput.focus();
    return null;
  }

  if (curr < prev) {
    showToast(`Current reading (${curr}) is less than previous (${prev}) for Room ${room.room_number}`, 'error');
    return null;
  }

  const payload = {
    room_id: roomId,
    billing_month: state.currentMonth,
    previous_reading: prev,
    current_reading: curr,
    electricity_rate: state.electricityRate,
    rent_amount: rent,
    other_charges: other
  };

  try {
    const res = await API.saveBill(payload);
    if (res.success) {
      state.billsMap[roomId] = res.bill;
      if (!silent) {
        showToast(`Bill for Room ${room.room_number} saved successfully!`, 'success');
      }
      loadBillingDashboard();
      return res.bill;
    } else {
      showToast(res.error || 'Failed to save bill', 'error');
      return null;
    }
  } catch (err) {
    showToast('Error saving bill: ' + err.message, 'error');
    return null;
  }
}

// WhatsApp Notification Direct Trigger (Auto-generates bill & opens WhatsApp)
async function sendWhatsAppNotification(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;

  const currInput = document.getElementById(`curr-reading-${roomId}`);
  if (!currInput || currInput.value.trim() === '') {
    showToast(`Please enter Current Reading for Room ${room.room_number}`, 'error');
    if (currInput) currInput.focus();
    return;
  }

  // Auto-generate and save the bill
  const bill = await saveRoomBill(roomId, true);
  if (!bill) return;

  const preview = await API.getNoticePreview(bill.id);
  if (preview.success) {
    const whatsappUrl = preview.data.whatsapp_url;
    // Record dispatch in background
    API.recordDispatch(bill.id, 'whatsapp');

    // Open WhatsApp Web or Mobile WhatsApp App
    window.open(whatsappUrl, '_blank');
    showToast(`Bill generated! Opening WhatsApp for ${room.tenant_name}...`, 'success');
  }
}

// Toggle Room Payment Status (Paid / Unpaid)
async function toggleRoomPaid(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;

  let bill = state.billsMap[roomId];
  const currInput = document.getElementById(`curr-reading-${roomId}`);

  // If bill hasn't been saved yet, auto-save it first
  if (!bill || (currInput && Number(currInput.value) !== Number(bill.current_reading))) {
    if (!currInput || currInput.value.trim() === '') {
      showToast(`Please enter Current Reading for Room ${room.room_number} first`, 'error');
      if (currInput) currInput.focus();
      return;
    }
    bill = await saveRoomBill(roomId, true);
    if (!bill) return;
  }

  const nextStatus = bill.status === 'paid' ? 'unpaid' : 'paid';
  await toggleBillStatus(bill.id, nextStatus);
}

// SMS Notification Trigger
async function sendSmsNotification(roomId) {
  let bill = state.billsMap[roomId];
  const currInput = document.getElementById(`curr-reading-${roomId}`);

  if (!bill || (currInput && Number(currInput.value) !== Number(bill.current_reading))) {
    bill = await saveRoomBill(roomId, true);
    if (!bill) return;
  }

  const preview = await API.getNoticePreview(bill.id);
  if (!preview.success) return;

  // Attempt server-side SMS gateway if configured, otherwise launch native SMS intent
  const smsRes = await API.sendSms(bill.id);
  if (smsRes.success) {
    showToast('SMS sent successfully via Gateway!', 'success');
  } else {
    // Open native SMS app
    const fallbackUrl = preview.data.sms_url;
    window.location.href = fallbackUrl;
    API.recordDispatch(bill.id, 'sms');
    showToast('Opening SMS app with pre-filled bill...', 'info');
  }
}

// Copy Notice to Clipboard
async function copyNoticeToClipboard(roomId) {
  let bill = state.billsMap[roomId];
  const currInput = document.getElementById(`curr-reading-${roomId}`);

  if (!bill || (currInput && Number(currInput.value) !== Number(bill.current_reading))) {
    bill = await saveRoomBill(roomId, true);
    if (!bill) return;
  }

  const preview = await API.getNoticePreview(bill.id);
  if (preview.success) {
    navigator.clipboard.writeText(preview.data.message);
    showToast('Notice copied to clipboard! You can paste it anywhere.', 'success');
  }
}

// Toggle Bill Payment Status
async function toggleBillStatus(billId, newStatus) {
  try {
    const res = await API.updateBillStatus(billId, newStatus);
    if (res.success) {
      showToast(`Bill marked as ${newStatus}`, 'success');
      loadBillingDashboard();
    }
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
  }
}

// Preview & Print Notice Modal
async function previewNoticeModal(roomId) {
  let bill = state.billsMap[roomId];
  const currInput = document.getElementById(`curr-reading-${roomId}`);

  if (!bill || (currInput && Number(currInput.value) !== Number(bill.current_reading))) {
    bill = await saveRoomBill(roomId, true);
    if (!bill) return;
  }

  const preview = await API.getNoticePreview(bill.id);
  if (!preview.success) return;

  const data = preview.data;
  const modal = document.getElementById('preview-notice-modal');
  const title = document.getElementById('preview-modal-title');
  const content = document.getElementById('preview-modal-content');
  const waBtn = document.getElementById('modal-btn-whatsapp');
  const smsBtn = document.getElementById('modal-btn-sms');
  const copyBtn = document.getElementById('modal-btn-copy');

  title.textContent = `Bill Notice • Room ${data.room_number} (${data.tenant_name})`;
  content.textContent = data.message;

  waBtn.onclick = () => {
    API.recordDispatch(bill.id, 'whatsapp');
    window.open(data.whatsapp_url, '_blank');
  };

  smsBtn.onclick = () => {
    API.recordDispatch(bill.id, 'sms');
    window.location.href = data.sms_url;
  };

  copyBtn.onclick = () => {
    navigator.clipboard.writeText(data.message);
    showToast('Notice copied to clipboard!', 'success');
  };

  modal.classList.add('active');
}

// Close Modal Helper
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Print Current Modal / Invoice
function printNoticeReceipt() {
  const content = document.getElementById('preview-modal-content').innerText;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Rent & Light Bill Receipt</title>
        <style>
          body { font-family: monospace; padding: 30px; font-size: 14px; line-height: 1.6; }
          pre { white-space: pre-wrap; word-wrap: break-word; }
        </style>
      </head>
      <body>
        <pre>${content}</pre>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// Rooms Management View
async function loadRoomsTable() {
  try {
    const res = await API.getRooms();
    const rooms = res.rooms || [];
    const tbody = document.getElementById('rooms-table-body');
    if (!tbody) return;

    if (rooms.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim);">No rooms configured yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rooms.map(r => `
      <tr>
        <td><strong>Room ${r.room_number}</strong></td>
        <td>${r.floor || 'Ground'}</td>
        <td><strong>${escapeHtml(r.tenant_name)}</strong></td>
        <td>${r.tenant_phone}</td>
        <td>₹${Number(r.base_rent).toLocaleString('en-IN')}</td>
        <td>${r.meter_initial_reading} units</td>
        <td>
          <span class="bill-status-pill ${r.status === 'occupied' ? 'paid' : 'unbilled'}">
            ${r.status}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn-sm-action" onclick="openEditRoomModal(${r.id})">✏️ Edit</button>
          <button class="btn-sm-action" style="color: var(--accent-rose);" onclick="deleteRoomConfirm(${r.id}, '${r.room_number}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load rooms: ' + err.message, 'error');
  }
}

// Add / Edit Room Modal Handlers
function openAddRoomModal() {
  document.getElementById('room-form-id').value = '';
  document.getElementById('room-form-title').textContent = 'Add New Room & Tenant';
  document.getElementById('room-form').reset();
  document.getElementById('room-form-rent').value = state.defaultRent;
  document.getElementById('room-form-reading').value = '0';
  document.getElementById('room-modal').classList.add('active');
}

async function openEditRoomModal(id) {
  try {
    const res = await API.getRoom(id);
    if (!res.success) return;
    const r = res.room;

    document.getElementById('room-form-id').value = r.id;
    document.getElementById('room-form-title').textContent = `Edit Room ${r.room_number}`;
    document.getElementById('room-form-number').value = r.room_number;
    document.getElementById('room-form-floor').value = r.floor || 'Ground Floor';
    document.getElementById('room-form-tenant').value = r.tenant_name;
    document.getElementById('room-form-phone').value = r.tenant_phone;
    document.getElementById('room-form-rent').value = r.base_rent;
    document.getElementById('room-form-reading').value = r.meter_initial_reading;
    document.getElementById('room-form-status').value = r.status;

    document.getElementById('room-modal').classList.add('active');
  } catch (err) {
    showToast('Failed to load room details: ' + err.message, 'error');
  }
}

async function handleRoomFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('room-form-id').value;
  const payload = {
    room_number: document.getElementById('room-form-number').value,
    floor: document.getElementById('room-form-floor').value,
    tenant_name: document.getElementById('room-form-tenant').value,
    tenant_phone: document.getElementById('room-form-phone').value,
    base_rent: Number(document.getElementById('room-form-rent').value),
    meter_initial_reading: Number(document.getElementById('room-form-reading').value),
    status: document.getElementById('room-form-status').value
  };

  try {
    let res;
    if (id) {
      res = await API.updateRoom(id, payload);
    } else {
      res = await API.createRoom(payload);
    }

    if (res.success) {
      showToast(res.message || 'Room saved successfully', 'success');
      closeModal('room-modal');
      loadRoomsTable();
      loadBillingDashboard();
    } else {
      showToast(res.error || 'Failed to save room', 'error');
    }
  } catch (err) {
    showToast('Error saving room: ' + err.message, 'error');
  }
}

async function deleteRoomConfirm(id, roomNumber) {
  if (!confirm(`Are you sure you want to delete Room ${roomNumber}? This will also remove past bills for this room.`)) {
    return;
  }
  try {
    const res = await API.deleteRoom(id);
    if (res.success) {
      showToast(res.message, 'success');
      loadRoomsTable();
      loadBillingDashboard();
    }
  } catch (err) {
    showToast('Error deleting room: ' + err.message, 'error');
  }
}

// History & Ledgers View
async function loadBillingHistory() {
  try {
    const res = await API.getBills();
    const bills = res.bills || [];
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    if (bills.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">No bill history found.</td></tr>`;
      return;
    }

    tbody.innerHTML = bills.map(b => `
      <tr>
        <td><strong>${b.billing_month}</strong></td>
        <td>Room ${b.room_number}</td>
        <td>${escapeHtml(b.tenant_name)}</td>
        <td>${b.previous_reading} → ${b.current_reading} (<strong>${b.units_consumed}u</strong>)</td>
        <td>₹${Number(b.electricity_amount).toLocaleString('en-IN')}</td>
        <td>₹${Number(b.rent_amount).toLocaleString('en-IN')}</td>
        <td><strong style="color: var(--accent-emerald);">₹${Number(b.total_amount).toLocaleString('en-IN')}</strong></td>
        <td>
          <span class="bill-status-pill ${b.status === 'paid' ? 'paid' : 'unpaid'}">${b.status}</span>
        </td>
        <td>
          <button class="btn-sm-action" onclick="sendWhatsAppNotification(${b.room_id})">💬</button>
          <button class="btn-sm-action" onclick="previewNoticeModal(${b.room_id})">👁️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load history: ' + err.message, 'error');
  }
}

// Export History to CSV
async function exportHistoryCsv() {
  try {
    const res = await API.getBills();
    const bills = res.bills || [];
    if (bills.length === 0) {
      showToast('No bills to export', 'info');
      return;
    }

    let csv = 'Month,Room,Tenant,Phone,Prev Reading,Curr Reading,Units Consumed,Electricity Rate,Electricity Amount,Rent Amount,Other Charges,Total Amount,Status,Paid Date\n';
    for (const b of bills) {
      csv += `"${b.billing_month}","${b.room_number}","${b.tenant_name}","${b.tenant_phone}",${b.previous_reading},${b.current_reading},${b.units_consumed},${b.electricity_rate},${b.electricity_amount},${b.rent_amount},${b.other_charges},${b.total_amount},"${b.status}","${b.paid_date || ''}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentflow-bills-${state.currentMonth}.csv`;
    a.click();
    showToast('CSV downloaded successfully!', 'success');
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

// Settings Form View
async function loadSettingsForm() {
  try {
    const settings = await API.getSettings();
    document.getElementById('setting-landlord-name').value = settings.landlord_name || '';
    document.getElementById('setting-landlord-phone').value = settings.landlord_phone || '';
    document.getElementById('setting-upi-id').value = settings.upi_id || '';
    document.getElementById('setting-elec-rate').value = settings.electricity_rate || 10;
    document.getElementById('setting-default-rent').value = settings.default_rent || 6000;
    document.getElementById('setting-due-day').value = settings.due_day_of_month || 5;
    document.getElementById('setting-template').value = settings.message_template || '';
    document.getElementById('setting-sms-gateway').value = settings.sms_gateway || 'none';
    document.getElementById('setting-sms-key').value = settings.sms_api_key || '';
  } catch (err) {
    showToast('Failed to load settings', 'error');
  }
}

async function handleSettingsFormSubmit(e) {
  e.preventDefault();
  const payload = {
    landlord_name: document.getElementById('setting-landlord-name').value,
    landlord_phone: document.getElementById('setting-landlord-phone').value,
    upi_id: document.getElementById('setting-upi-id').value,
    electricity_rate: document.getElementById('setting-elec-rate').value,
    default_rent: document.getElementById('setting-default-rent').value,
    due_day_of_month: document.getElementById('setting-due-day').value,
    message_template: document.getElementById('setting-template').value,
    sms_gateway: document.getElementById('setting-sms-gateway').value,
    sms_api_key: document.getElementById('setting-sms-key').value
  };

  try {
    const res = await API.updateSettings(payload);
    if (res.success) {
      showToast('Settings saved successfully!', 'success');
      await loadSettingsAndFactors();
    }
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

// Event Listeners Registration
function setupEventListeners() {
  // Install app button
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.addEventListener('click', handleInstallAppClick);
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const view = el.getAttribute('data-view');
      switchView(view);
    });
  });

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      themeBtn.innerHTML = next === 'light' ? '<span>🌙</span> Dark Mode' : '<span>☀️</span> Light Mode';
    });
  }

  // Room form
  const roomForm = document.getElementById('room-form');
  if (roomForm) roomForm.addEventListener('submit', handleRoomFormSubmit);

  // Settings form
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) settingsForm.addEventListener('submit', handleSettingsFormSubmit);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initApp);
