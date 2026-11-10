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
  activeView: 'billing-view',
  layoutMode: localStorage.getItem('rentflow_layout') || 'side',
  activeRoomIndex: 0
};

// Bilingual Marathi & English Translations
const TRANSLATIONS = {
  en: {
    nav_bill_generator: 'Bill Generator',
    nav_rooms_tenants: 'Rooms & Tenants',
    nav_ledgers_history: 'Ledgers & History',
    nav_settings_notice: 'Settings & Notice',
    elec_rate_title: 'Electricity Rate',
    elec_rate_sub: 'Factor / Unit',
    default_rent_title: 'Default Base Rent',
    default_rent_sub: 'Per Month',
    btn_save_factors: 'Save Factors',
    period_label: 'PERIOD:',
    stat_occupied_rooms: 'Occupied Rooms',
    stat_power_consumption: 'Power Consumption',
    stat_total_expected: 'Total Expected',
    stat_collected_pending: 'Collected / Pending',
    stat_rent_light: 'Rent + Light Bills',
    stat_sum_meters: 'Sum of all tenant meters',
    stat_collected_label: 'collected',
    section_billing_title: '⚡ Monthly Light & Rent Billing',
    section_billing_desc: 'Enter meter readings. Units & electricity bill calculate automatically.',
    section_rooms_title: '🚪 Rooms & Tenants Directory',
    section_rooms_desc: 'Manage room configurations, resident tenant names, contact phone numbers, and security deposits.',
    btn_add_room: '+ Add New Room',
    section_history_title: '📜 Billing History & Audit Ledgers',
    section_history_desc: 'View, filter, and export all generated monthly bills and payment records.',
    btn_export_csv: '📥 Export to CSV',
    section_settings_title: '⚙️ App Settings & Notification Template',
    section_settings_desc: 'Configure your property name, UPI ID for receiving payments, and customize the message sent to tenants.',
    th_room: 'Room',
    th_floor: 'Floor',
    th_tenant: 'Tenant / Resident',
    th_phone: 'Phone / WhatsApp',
    th_rent: 'Base Rent',
    th_deposit: 'Deposit',
    th_meter: 'Initial Meter',
    th_status: 'Status',
    th_actions: 'Actions',
    th_hist_month: 'Month',
    th_hist_room: 'Room',
    th_hist_tenant: 'Tenant',
    th_hist_meter: 'Meter Readings',
    th_hist_light: 'Light Bill',
    th_hist_rent: 'Rent',
    th_hist_total: 'Total Due',
    th_hist_status: 'Payment Status',
    room_form_rent_label: 'Base Monthly Rent (₹)',
    room_form_deposit_label: 'Security Deposit (₹)',
    room_form_reading_label: 'Initial Meter Reading',
    room_form_status_label: 'Occupancy Status',
    status_occupied_opt: 'Occupied',
    status_vacant_opt: 'Vacant',
    btn_delete_tenant_details: '🗑️ Delete Tenant Details',
    btn_cancel: 'Cancel',
    btn_save_room: 'Save Room Details',
    preview_modal_desc: 'This is the formatted notification message ready for instant dispatch to your tenant:',
    btn_close: 'Close',
    btn_send_whatsapp: '💬 Send via WhatsApp',
    statement_modal_title: 'Tenant Statement & Settlement',
    statement_total_billed: 'Total Billed',
    statement_total_paid: 'Total Paid',
    statement_balance_due: 'Balance Due',
    statement_pending_dues: 'Pending Dues',
    statement_deposit_held: 'Deposit Held',
    statement_security_deposit: 'Security Deposit',
    statement_net_settlement: 'Net Settlement',
    statement_monthly_records: 'Monthly Records & Payment Dates',
    btn_export_tenant_csv: '📥 Download Excel (CSV)',
    btn_whatsapp_statement: '💬 WhatsApp Statement',
    vacate_modal_title: '🗑️ Delete or Change Tenant Details',
    vacate_settle_title: 'Leaving Tenant Settle Records',
    vacate_settle_desc: 'Check all paid and pending rent/light bill records before departure.',
    btn_view_statement: '📋 View Statement',
    vacate_action_label: 'Action for this room',
    vacate_opt_replace: 'Enter New Tenant Details for this Room',
    vacate_opt_vacant: 'Delete Tenant Details & Mark as Vacant',
    vacate_new_name_label: 'New Tenant Full Name *',
    vacate_new_phone_label: 'New Tenant WhatsApp / Phone Number *',
    vacate_new_rent_label: 'New Base Rent (₹)',
    vacate_new_deposit_label: 'New Security Deposit (₹)',
    vacate_new_reading_label: 'Initial Meter Reading',
    btn_delete_details_vacant: '🗑️ Delete Details (Mark Vacant)',
    btn_save_new_tenant: 'Save New Tenant',

    // Dynamic strings
    label_prev_reading: 'Prev Reading (Units)',
    label_new_reading: 'New Reading (Enter here)',
    placeholder_new_units: 'Enter new meter units',
    label_units: 'Units',
    label_light_bill: 'Light Bill',
    label_room_rent: 'Room Rent (₹)',
    label_total_amount: 'Total Amount',
    btn_card_whatsapp: 'Send Bill on WhatsApp',
    btn_mark_rent_paid: '⚪ Mark Rent Paid',
    btn_rent_paid: 'Rent Paid',
    btn_mark_light_paid: '⚪ Mark Light Paid',
    btn_light_paid: 'Light Paid',
    btn_edit_tenant: '✏️ Edit',
    btn_delete_tenant: '🗑️ Delete Tenant',
    btn_view_records: '📜 View Past Records',
    deposit_badge_label: 'Deposit',
    status_paid: 'Paid',
    status_rent_paid_light_due: 'Rent Paid • Light Due',
    status_light_paid_rent_due: 'Light Paid • Rent Due',
    status_unpaid: 'Unpaid',
    status_pending_reading: 'Pending Reading',
    vacant_text: 'Vacant',
    btn_assign_tenant: '➕ Assign New Tenant',
    btn_edit_room_config: '✏️ Edit Room Config',
    refund_to_tenant: 'Refund to Tenant',
    due_from_tenant: 'Due from Tenant',
    all_settled: 'All Settled (₹0)',
    billed_breakdown_label: 'Rent: ₹{rent} | Light: ₹{light}',
    paid_breakdown_label: 'Rent: ₹{rent} | Light: ₹{light}',
    deposit_held_text: 'Deposit Held: ₹{amount}',
    layout_side_by_side: 'Side by Side',
    layout_vertical_list: 'List'
  },
  mr: {
    nav_bill_generator: 'वीज व भाडे बिल',
    nav_rooms_tenants: 'खोल्या आणि भाडेकरू',
    nav_ledgers_history: 'हिशोब व जुने रेकॉर्ड',
    nav_settings_notice: 'सेटिंग्ज व नोटीस',
    elec_rate_title: 'लाईट बिल दर',
    elec_rate_sub: 'प्रति युनिट दर',
    default_rent_title: 'मूळ महिना भाडे',
    default_rent_sub: 'दर महा भाडे',
    btn_save_factors: 'दर सेव्ह करा',
    period_label: 'महिना:',
    stat_occupied_rooms: 'भरलेल्या खोल्या',
    stat_power_consumption: 'एकूण वीज वापर',
    stat_total_expected: 'एकूण येणे रक्कम',
    stat_collected_pending: 'जमा / बाकी रक्कम',
    stat_rent_light: 'भाडे + लाईट बिल',
    stat_sum_meters: 'सर्व मीटरचा एकूण वापर (युनिट)',
    stat_collected_label: 'जमा झाले',
    section_billing_title: '⚡ मासिक वीज व खोली भाडे बिल',
    section_billing_desc: 'मीटरचे नवीन युनिट टाका. लाईट बिल आणि एकूण भाडे आपोआप हिशोब होईल.',
    section_rooms_title: '🚪 खोल्या आणि भाडेकरूंची यादी',
    section_rooms_desc: 'खोली क्रमांक, भाडेकरूंचे नाव, फोन नंबर व डिपॉझिट व्यवस्थापित करा.',
    btn_add_room: '+ नवीन खोली जोडा',
    section_history_title: '📜 बिलांचा इतिहास व हिशोब',
    section_history_desc: 'मागील महिन्यांची बिले आणि जमा झालेल्या रकमेचा हिशोब पहा व डाउनलोड करा.',
    btn_export_csv: '📥 एक्सेल (CSV) डाउनलोड',
    section_settings_title: '⚙️ ॲप सेटिंग्ज व नोटीस मेसेज',
    section_settings_desc: 'इमारतीचे नाव, फोन पे/गुगल पे नंबर आणि मेसेज सेटिंग्ज बदला.',
    th_room: 'खोली',
    th_floor: 'मजला',
    th_tenant: 'भाडेकरूचे नाव',
    th_phone: 'फोन नंबर / व्हॉट्सअ‍ॅप',
    th_rent: 'महिना भाडे',
    th_deposit: 'डिपॉझिट',
    th_meter: 'सुरुवातीचे मीटर',
    th_status: 'स्थिती',
    th_actions: 'कृती',
    th_hist_month: 'महिना',
    th_hist_room: 'खोली',
    th_hist_tenant: 'भाडेकरू',
    th_hist_meter: 'मीटर युनिट्स',
    th_hist_light: 'लाईट बिल',
    th_hist_rent: 'भाडे',
    th_hist_total: 'एकूण येणे',
    th_hist_status: 'पेमेंट स्थिती',
    room_form_rent_label: 'मासिक खोली भाडे (₹)',
    room_form_deposit_label: 'सिक्युरिटी डिपॉझिट (₹)',
    room_form_reading_label: 'सुरुवातीचे मीटर रीडिंग (युनिट)',
    room_form_status_label: 'खोली स्थिती',
    status_occupied_opt: 'भाडेकरू आहे (Occupied)',
    status_vacant_opt: 'रिकामी खोली (Vacant)',
    btn_delete_tenant_details: '🗑️ भाडेकरूचे नाव काढा',
    btn_cancel: 'रद्द करा',
    btn_save_room: 'खोली माहिती सेव्ह करा',
    preview_modal_desc: 'भाडेकरूला व्हॉट्सअ‍ॅपवर पाठवण्यासाठी तयार केलेला मेसेज:',
    btn_close: 'बंद करा',
    btn_send_whatsapp: '💬 व्हॉट्सअ‍ॅपवर पाठवा',
    statement_modal_title: 'भाडेकरू हिशोब व अंतिम पावती',
    statement_total_billed: 'एकूण बिल',
    statement_total_paid: 'एकूण जमा',
    statement_balance_due: 'बाकी येणे',
    statement_pending_dues: 'थकबाकी रक्कम',
    statement_deposit_held: 'जमा डिपॉझिट',
    statement_security_deposit: 'सिक्युरिटी डिपॉझिट',
    statement_net_settlement: 'अंतिम हिशोब',
    statement_monthly_records: 'दर महिन्याचा तपशील व जमा तारखा',
    btn_export_tenant_csv: '📥 एक्सेल (CSV) डाउनलोड',
    btn_whatsapp_statement: '💬 व्हॉट्सअ‍ॅपवर हिशोब पाठवा',
    vacate_modal_title: '🗑️ भाडेकरू काढा किंवा नवीन जोडा',
    vacate_settle_title: 'जाणाऱ्या भाडेकरूचा हिशोब',
    vacate_settle_desc: 'खोली सोडण्यापूर्वी भाडे व लाईट बिलाची थकबाकी तपासा.',
    btn_view_statement: '📋 पूर्ण हिशोब पहा',
    vacate_action_label: 'या खोलीसाठी काय करायचे आहे?',
    vacate_opt_replace: 'या खोलीसाठी नवीन भाडेकरूचे नाव नोंदवा',
    vacate_opt_vacant: 'भाडेकरू काढा व खोली रिकामी नोंदवा',
    vacate_new_name_label: 'नवीन भाडेकरूचे पूर्ण नाव *',
    vacate_new_phone_label: 'नवीन भाडेकरूचा मोबाईल / व्हॉट्सअ‍ॅप नंबर *',
    vacate_new_rent_label: 'नवीन महिना भाडे (₹)',
    vacate_new_deposit_label: 'नवीन सिक्युरिटी डिपॉझिट (₹)',
    vacate_new_reading_label: 'सध्याचे मीटर युनिट्स',
    btn_delete_details_vacant: '🗑️ भाडेकरू काढा (खोली रिकामी करा)',
    btn_save_new_tenant: 'नवीन भाडेकरू सेव्ह करा',

    // Dynamic strings
    label_prev_reading: 'मागील युनिट',
    label_new_reading: 'नवीन युनिट (येथे टाका)',
    placeholder_new_units: 'नवीन मीटर युनिट टाका',
    label_units: 'वापर युनिट',
    label_light_bill: 'लाईट बिल',
    label_room_rent: 'खोली भाडे (₹)',
    label_total_amount: 'एकूण रक्कम',
    btn_card_whatsapp: 'व्हॉट्सअ‍ॅपवर बिल पाठवा',
    btn_mark_rent_paid: '⚪ भाडे जमा करा',
    btn_rent_paid: 'भाडे जमा',
    btn_mark_light_paid: '⚪ लाईट बिल जमा करा',
    btn_light_paid: 'लाईट जमा',
    btn_edit_tenant: '✏️ दुरुस्त करा',
    btn_delete_tenant: '🗑️ भाडेकरू काढा',
    btn_view_records: '📜 जुना हिशोब पहा',
    deposit_badge_label: 'डिपॉझिट',
    status_paid: 'जमा झाले',
    status_rent_paid_light_due: 'भाडे जमा • लाईट बाकी',
    status_light_paid_rent_due: 'लाईट जमा • भाडे बाकी',
    status_unpaid: 'बाकी आहे',
    status_pending_reading: 'रीडिंग टाका',
    vacant_text: 'रिकामी खोली',
    btn_assign_tenant: '➕ नवीन भाडेकरू जोडा',
    btn_edit_room_config: '✏️ खोली माहिती बदला',
    refund_to_tenant: 'भाडेकरूस परत करावयाचे',
    due_from_tenant: 'भाडेकरूकडून बाकी येणे',
    all_settled: 'सर्व हिशोब पूर्ण (₹0)',
    billed_breakdown_label: 'भाडे: ₹{rent} | लाईट: ₹{light}',
    paid_breakdown_label: 'भाडे: ₹{rent} | लाईट: ₹{light}',
    deposit_held_text: 'जमा डिपॉझिट: ₹{amount}',
    layout_side_by_side: 'शेजारी-शेजारी (कार्ड्स)',
    layout_vertical_list: 'यादी'
  }
};

function getAppLanguage() {
  return localStorage.getItem('rentflow_lang') || 'en';
}

function setAppLanguage(lang) {
  localStorage.setItem('rentflow_lang', lang);
  applyLanguage(lang);
}

function toggleLanguage() {
  const current = getAppLanguage();
  const next = current === 'mr' ? 'en' : 'mr';
  setAppLanguage(next);
  showToast(next === 'mr' ? 'मराठी भाषा निवडली आहे' : 'Switched to English', 'success');
}

function t(key, vars = {}) {
  const lang = getAppLanguage();
  let text = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS.en && TRANSLATIONS.en[key]) || key;
  for (const [vKey, vVal] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${vKey}\\}`, 'g'), vVal);
  }
  return text;
}

function applyLanguage(lang) {
  const labelEl = document.getElementById('lang-toggle-label');
  if (labelEl) {
    labelEl.textContent = lang === 'mr' ? 'English' : 'मराठी';
  }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (text) {
      el.textContent = text;
    }
  });

  if (state.rooms && state.rooms.length > 0) {
    renderRoomCards();
  }
  if (document.getElementById('rooms-view')?.classList.contains('active')) {
    loadRoomsTable();
  }
}

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
  applyLanguage(getAppLanguage());
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
    // 1. Fetch Rooms (all rooms so vacant rooms can also be assigned or viewed)
    const roomsRes = await API.getRooms();
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

// Mobile Card Carousel & Layout Mode Controls
function setLayoutMode(mode) {
  state.layoutMode = mode;
  try {
    localStorage.setItem('rentflow_layout', mode);
  } catch (e) {
    // Ignore localStorage errors
  }

  const container = document.getElementById('room-bills-container');
  const btnSide = document.getElementById('btn-layout-side');
  const btnStack = document.getElementById('btn-layout-stack');
  const navStrip = document.getElementById('room-nav-strip');
  const dotsContainer = document.getElementById('carousel-dots-indicator');

  if (container) {
    if (mode === 'side') {
      container.classList.add('side-by-side');
      container.classList.remove('vertical-stack');
    } else {
      container.classList.remove('side-by-side');
      container.classList.add('vertical-stack');
    }
  }

  if (btnSide) btnSide.classList.toggle('active', mode === 'side');
  if (btnStack) btnStack.classList.toggle('active', mode === 'stack');

  if (navStrip) {
    navStrip.style.display = (state.rooms && state.rooms.length > 1) ? 'flex' : 'none';
  }
  if (dotsContainer) {
    dotsContainer.style.display = (mode === 'side' && state.rooms && state.rooms.length > 1) ? 'flex' : 'none';
  }
}
window.setLayoutMode = setLayoutMode;

// Render Room Quick Navigation Pills (Instant jump on mobile)
function renderRoomNavPills() {
  const navStrip = document.getElementById('room-nav-strip');
  const dotsContainer = document.getElementById('carousel-dots-indicator');
  if (!navStrip) return;

  if (!state.rooms || state.rooms.length === 0) {
    navStrip.innerHTML = '';
    if (dotsContainer) dotsContainer.innerHTML = '';
    return;
  }

  navStrip.style.display = state.rooms.length > 1 ? 'flex' : 'none';
  if (dotsContainer) {
    dotsContainer.style.display = (state.layoutMode === 'side' && state.rooms.length > 1) ? 'flex' : 'none';
  }

  navStrip.innerHTML = state.rooms.map((room, idx) => {
    const isVacant = room.status === 'vacant';
    const bill = state.billsMap[room.id];
    const isBilled = !!bill;
    const isRentPaid = isBilled && (bill.rent_status === 'paid' || (bill.status === 'paid' && bill.rent_status !== 'unpaid'));
    const isLightPaid = isBilled && (bill.light_status === 'paid' || (bill.status === 'paid' && bill.light_status !== 'unpaid'));

    let statusIcon = '⏳';
    if (isVacant) {
      statusIcon = '⚪';
    } else if (isRentPaid && isLightPaid) {
      statusIcon = '✅';
    } else if (isRentPaid || isLightPaid) {
      statusIcon = '⚡';
    }

    const isActive = idx === state.activeRoomIndex;
    return `
      <button
        type="button"
        class="room-nav-pill ${isActive ? 'active' : ''}"
        id="nav-pill-room-${room.id}"
        onclick="scrollToRoomCard(${room.id}, ${idx})"
        title="Jump to ${escapeHtml(room.room_number)}"
      >
        <span>${statusIcon}</span>
        <span>${escapeHtml(room.room_number)}</span>
      </button>
    `;
  }).join('');

  if (dotsContainer) {
    dotsContainer.innerHTML = state.rooms.map((room, idx) => `
      <button
        type="button"
        class="carousel-dot ${idx === state.activeRoomIndex ? 'active' : ''}"
        onclick="scrollToRoomCard(${room.id}, ${idx})"
        title="Jump to ${escapeHtml(room.room_number)}"
        aria-label="Room ${idx + 1}"
      ></button>
    `).join('');
  }
}

// Scroll directly to room card on mobile swipe or pill tap
function scrollToRoomCard(roomId, idx) {
  state.activeRoomIndex = idx;
  const container = document.getElementById('room-bills-container');
  const card = document.getElementById(`card-room-${roomId}`);

  if (card && container) {
    if (state.layoutMode === 'side') {
      const cardLeft = card.offsetLeft - container.offsetLeft;
      container.scrollTo({
        left: cardLeft,
        behavior: 'smooth'
      });
    } else {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Update active states on pills and dots
  document.querySelectorAll('.room-nav-pill').forEach((pill, pIdx) => {
    pill.classList.toggle('active', pIdx === idx);
  });
  document.querySelectorAll('.carousel-dot').forEach((dot, dIdx) => {
    dot.classList.toggle('active', dIdx === idx);
  });
}
window.scrollToRoomCard = scrollToRoomCard;

// Carousel scroll listener to update active pill & dot when user swipes
function setupCarouselScrollListener() {
  const container = document.getElementById('room-bills-container');
  if (!container || container.dataset.scrollBound) return;
  container.dataset.scrollBound = 'true';

  let scrollTimeout = null;
  container.addEventListener('scroll', () => {
    if (state.layoutMode !== 'side') return;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      const scrollLeft = container.scrollLeft;
      const cards = container.querySelectorAll('.bill-card');
      if (cards.length === 0) return;

      let closestIdx = 0;
      let minDistance = Infinity;

      cards.forEach((card, idx) => {
        const cardOffset = card.offsetLeft - container.offsetLeft;
        const dist = Math.abs(cardOffset - scrollLeft);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = idx;
        }
      });

      if (state.activeRoomIndex !== closestIdx) {
        state.activeRoomIndex = closestIdx;
        document.querySelectorAll('.room-nav-pill').forEach((pill, pIdx) => {
          pill.classList.toggle('active', pIdx === closestIdx);
        });
        document.querySelectorAll('.carousel-dot').forEach((dot, dIdx) => {
          dot.classList.toggle('active', dIdx === closestIdx);
        });
      }
    }, 60);
  }, { passive: true });
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
    renderRoomNavPills();
    return;
  }

  container.innerHTML = state.rooms.map(room => {
    const isVacant = room.status === 'vacant';
    const bill = state.billsMap[room.id];
    const isBilled = !!bill;

    // Previous reading: if bill exists, use bill's previous_reading; otherwise use room's effective_previous_reading
    const prevReading = isBilled ? bill.previous_reading : room.effective_previous_reading;
    const currReading = isBilled ? bill.current_reading : '';
    const rentAmount = isBilled ? bill.rent_amount : (room.base_rent || state.defaultRent);

    if (isVacant) {
      return `
        <div class="bill-card pending-bill" id="card-room-${room.id}" style="border: 1.5px dashed var(--pastel-amber-border); background-color: var(--pastel-amber-bg);">
          <div class="bill-card-top">
            <div class="room-badge-group">
              <div class="room-avatar" style="background: #FFFFFF; color: var(--pastel-amber-text); border: 1px solid var(--pastel-amber-border);">${room.room_number}</div>
              <div class="tenant-meta">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <h4 style="color: var(--pastel-amber-text);">${room.room_number} (${t('vacant_text')})</h4>
                  <button
                    type="button"
                    class="btn-badge-edit"
                    onclick="openEditRoomModal(${room.id})"
                    title="Edit room settings"
                  >✏️ ${t('btn_edit_tenant')}</button>
                </div>
                <div class="tenant-phone">
                  <span>⚪ ${t('vacant_text')}</span>
                  <span style="margin: 0 4px;">•</span>
                  <span>${room.floor || 'Floor'}</span>
                </div>
              </div>
            </div>
            <span class="bill-status-pill unbilled">${t('vacant_text')}</span>
          </div>

          <div style="padding: 1rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
              <span style="color: var(--text-dim);">${t('label_prev_reading')}:</span>
              <strong>${prevReading} ${t('label_units')}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
              <span style="color: var(--text-dim);">${t('label_room_rent')}:</span>
              <strong>₹${Number(room.base_rent || state.defaultRent).toLocaleString('en-IN')}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
              <span style="color: var(--text-dim);">${t('deposit_badge_label')}:</span>
              <strong>₹${Number(room.security_deposit || 0).toLocaleString('en-IN')}</strong>
            </div>
          </div>

          <div class="card-actions-single" style="margin-top: 0.75rem;">
            <button
              type="button"
              class="btn-primary"
              style="width: 100%; min-height: 50px; font-size: 1rem;"
              onclick="openVacateTenantModal(${room.id})"
            >
              ➕ ${t('btn_assign_tenant')} (${room.room_number})
            </button>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem;">
              <button
                type="button"
                class="btn-text-link"
                onclick="openEditRoomModal(${room.id})"
              >
                ✏️ ${t('btn_edit_room_config')}
              </button>
              <button
                type="button"
                class="btn-text-link"
                onclick="openTenantStatementModal(${room.id})"
              >
                📜 ${t('btn_view_records')}
              </button>
            </div>
          </div>
        </div>
      `;
    }

    let units = 0;
    let elecAmount = 0;
    let totalAmount = rentAmount;

    if (currReading !== '' && Number(currReading) >= Number(prevReading)) {
      units = Math.round((Number(currReading) - Number(prevReading)) * 100) / 100;
      elecAmount = Math.round(units * state.electricityRate * 100) / 100;
      totalAmount = Math.round((Number(rentAmount) + elecAmount) * 100) / 100;
    }

    const isRentPaid = isBilled && (bill.rent_status === 'paid' || (bill.status === 'paid' && bill.rent_status !== 'unpaid'));
    const isLightPaid = isBilled && (bill.light_status === 'paid' || (bill.status === 'paid' && bill.light_status !== 'unpaid'));

    let statusPillClass = 'unbilled';
    let statusText = t('status_pending_reading');

    if (isBilled) {
      if (isRentPaid && isLightPaid) {
        statusPillClass = 'paid';
        statusText = t('status_paid');
      } else if (isRentPaid) {
        statusPillClass = 'partial';
        statusText = t('status_rent_paid_light_due');
      } else if (isLightPaid) {
        statusPillClass = 'partial';
        statusText = t('status_light_paid_rent_due');
      } else {
        statusPillClass = 'unpaid';
        statusText = t('status_unpaid');
      }
    }

    const rentDateLabel = isRentPaid && bill?.rent_paid_date ? ` (${formatFullDate(bill.rent_paid_date)})` : '';
    const lightDateLabel = isLightPaid && bill?.light_paid_date ? ` (${formatFullDate(bill.light_paid_date)})` : '';

    return `
      <div class="bill-card ${isBilled ? 'has-bill' : 'pending-bill'}" id="card-room-${room.id}">
        <!-- Top Row -->
        <div class="bill-card-top">
          <div class="room-badge-group">
            <div class="room-avatar">${room.room_number}</div>
            <div class="tenant-meta">
              <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                <h4>${escapeHtml(room.tenant_name)}</h4>
                <button
                  type="button"
                  class="btn-badge-edit"
                  onclick="openEditRoomModal(${room.id})"
                  title="Edit tenant details (name, phone, rent)"
                >✏️ ${t('btn_edit_tenant')}</button>
                <button
                  type="button"
                  class="btn-badge-delete"
                  onclick="openVacateTenantModal(${room.id})"
                  title="Delete or change tenant details when tenant leaves"
                >🗑️ ${t('btn_delete_tenant')}</button>
              </div>
              <div class="tenant-phone">
                <span>📞</span>
                <span>${room.tenant_phone}</span>
                <span style="margin: 0 4px;">•</span>
                <span>${room.floor || 'Floor'}</span>
                <span style="margin: 0 4px;">•</span>
                <span class="deposit-badge">💰 ${t('deposit_badge_label')}: ₹${Number(room.security_deposit || 0).toLocaleString('en-IN')}</span>
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
              <label>${t('label_prev_reading')}</label>
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
            </div>

            <!-- Current Reading -->
            <div class="input-field-group">
              <label class="label-highlight">${t('label_new_reading')}</label>
              <input
                type="number"
                step="any"
                class="custom-input current-reading-input"
                id="curr-reading-${room.id}"
                value="${currReading}"
                data-room-id="${room.id}"
                placeholder="${t('placeholder_new_units')}"
                oninput="handleReadingChange(${room.id})"
              />
            </div>
          </div>

          <!-- Live Light Bill Calculation Strip -->
          <div class="calc-summary-strip">
            <div>
              <span>⚡ ${t('label_units')}: </span>
              <span class="calc-units-badge" id="calc-units-${room.id}">${units} units</span>
            </div>
            <div>
              <span>${t('label_light_bill')}: </span>
              <span class="calc-amount-badge" id="calc-elec-amt-${room.id}">₹${elecAmount}</span>
            </div>
          </div>
        </div>

        <!-- Rent Row -->
        <div class="charges-row" style="grid-template-columns: 1fr;">
          <div class="input-field-group">
            <label>${t('label_room_rent')}</label>
            <input
              type="number"
              class="custom-input rent-amount-input"
              id="rent-amt-${room.id}"
              value="${rentAmount}"
              data-room-id="${room.id}"
              oninput="handleReadingChange(${room.id})"
            />
          </div>
        </div>

        <!-- Total Payable Strip -->
        <div class="card-total-bar">
          <span class="card-total-label">${t('label_total_amount')}</span>
          <span class="card-total-val" id="total-val-${room.id}">₹${totalAmount.toLocaleString('en-IN')}</span>
        </div>

        <!-- Action Buttons: WhatsApp Bill, Rent Paid, Light Bill Paid, View History -->
        <div class="card-actions-single">
          <button
            type="button"
            class="btn-whatsapp-full"
            onclick="sendWhatsAppNotification(${room.id})"
            title="Auto-generate bill and open WhatsApp directly"
          >
            <span style="font-size: 1.25rem;">💬</span> ${t('btn_card_whatsapp')}
          </button>

          <!-- 2 Different Payment Options: Rent Paid & Light Bill Paid -->
          <div class="card-payment-split-row">
            <button
              type="button"
              class="btn-split-toggle ${isRentPaid ? 'is-paid' : ''}"
              onclick="toggleSplitPaid(${room.id}, 'rent')"
              title="Click to mark Rent as Paid or Unpaid"
            >
              <span>${isRentPaid ? `✅ ${t('btn_rent_paid')}${rentDateLabel}` : t('btn_mark_rent_paid')}</span>
            </button>

            <button
              type="button"
              class="btn-split-toggle ${isLightPaid ? 'is-paid' : ''}"
              onclick="toggleSplitPaid(${room.id}, 'light')"
              title="Click to mark Light Bill as Paid or Unpaid"
            >
              <span>${isLightPaid ? `✅ ${t('btn_light_paid')}${lightDateLabel}` : t('btn_mark_light_paid')}</span>
            </button>
          </div>

          <!-- Card Action Links: Edit, Delete, Statement -->
          <div style="display: flex; gap: 0.5rem; justify-content: space-between; align-items: center; margin-top: 0.35rem; flex-wrap: wrap; padding-top: 0.4rem; border-top: 1px dashed var(--border-subtle);">
            <button
              type="button"
              class="btn-text-link"
              onclick="openEditRoomModal(${room.id})"
              title="Edit tenant name, phone, rent"
            >
              ✏️ ${t('btn_edit_tenant')}
            </button>
            <button
              type="button"
              class="btn-text-link"
              style="color: var(--pastel-rose-text);"
              onclick="openVacateTenantModal(${room.id})"
              title="Delete tenant details when tenant leaves"
            >
              🗑️ ${t('btn_delete_tenant')}
            </button>
            <button
              type="button"
              class="btn-text-link"
              onclick="openTenantStatementModal(${room.id})"
              title="View complete bill and payment history for this tenant"
            >
              📜 ${t('btn_view_records')}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Update room navigation pills, carousel dots, and apply active layout mode
  renderRoomNavPills();
  setLayoutMode(state.layoutMode || 'side');
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

  const prev = Number(prevInput ? prevInput.value : 0);
  const curr = Number(currInput ? currInput.value : 0);
  const rent = Number(rentInput ? rentInput.value : 0);
  const other = Number(otherInput ? otherInput.value : 0) || 0;

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

  const prevInput = document.getElementById(`prev-reading-${roomId}`);
  const currInput = document.getElementById(`curr-reading-${roomId}`);
  if (!currInput || currInput.value.trim() === '') {
    showToast(`Please enter New Reading for Room ${room.room_number}`, 'error');
    if (currInput) currInput.focus();
    return;
  }

  const currVal = Number(currInput.value);

  // Auto-generate and save the bill for this month
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

  // Set previous reading to current reading + 1 for next month
  const nextPrevReading = currVal + 1;
  await API.updateRoom(roomId, { meter_initial_reading: nextPrevReading });
  room.effective_previous_reading = nextPrevReading;

  // Immediately reflect on the UI screen
  if (prevInput) {
    prevInput.value = nextPrevReading;
  }
  if (currInput) {
    currInput.value = '';
    currInput.placeholder = `e.g. ${nextPrevReading + 100}`;
  }
  handleReadingChange(roomId);
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
  return dateStr;
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes(' ')) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return dateStr;
}

function formatLongDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes(' ') && isNaN(dateStr[0])) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    }
  }
  return dateStr;
}

// Toggle Split Payment Status (Rent Paid or Light Bill Paid)
async function toggleSplitPaid(roomId, type) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;

  let bill = state.billsMap[roomId];
  const currInput = document.getElementById(`curr-reading-${roomId}`);

  // If bill hasn't been saved yet, auto-save it first
  if (!bill || (currInput && Number(currInput.value) !== Number(bill.current_reading))) {
    if (!currInput || currInput.value.trim() === '') {
      showToast(`Please enter New Reading for Room ${room.room_number} first`, 'error');
      if (currInput) currInput.focus();
      return;
    }
    bill = await saveRoomBill(roomId, true);
    if (!bill) return;
  }

  const today = new Date().toISOString().split('T')[0];
  const isRent = type === 'rent';

  const currentRentPaid = bill.rent_status === 'paid' || (bill.status === 'paid' && bill.rent_status !== 'unpaid');
  const currentLightPaid = bill.light_status === 'paid' || (bill.status === 'paid' && bill.light_status !== 'unpaid');

  const newRentStatus = isRent ? (currentRentPaid ? 'unpaid' : 'paid') : (currentRentPaid ? 'paid' : 'unpaid');
  const newLightStatus = !isRent ? (currentLightPaid ? 'unpaid' : 'paid') : (currentLightPaid ? 'paid' : 'unpaid');

  const newRentDate = newRentStatus === 'paid' ? (bill.rent_paid_date || today) : null;
  const newLightDate = newLightStatus === 'paid' ? (bill.light_paid_date || today) : null;

  try {
    const res = await API.updateBillSplitStatus(bill.id, {
      rent_status: newRentStatus,
      rent_paid_date: newRentDate,
      light_status: newLightStatus,
      light_paid_date: newLightDate
    });

    if (res.success) {
      state.billsMap[roomId] = res.bill;
      const label = isRent ? 'Room Rent' : 'Light Bill';
      const action = (isRent ? newRentStatus : newLightStatus) === 'paid' ? 'marked as Paid' : 'marked as Unpaid';
      showToast(`${label} for Room ${room.room_number} ${action}!`, 'success');
      renderRoomCards();
      loadSummaryStats();
    }
  } catch (err) {
    showToast('Failed to update payment status: ' + err.message, 'error');
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

// Tenant Statement & Settlement Modal Logic
let currentStatementData = null;

async function openTenantStatementModal(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  const ledgerRes = await API.getTenantLedger(roomId);
  if (!ledgerRes.success) {
    showToast('Failed to load ledger', 'error');
    return;
  }

  const ledger = ledgerRes.ledger;
  currentStatementData = ledger;

  const roomNum = room ? room.room_number : (ledger.room?.room_number || '');
  const tenantName = ledger.tenant_name || 'Tenant';
  const tenantPhone = ledger.tenant_phone || '';
  const deposit = Number(ledger.deposit_amount || room?.security_deposit || 0);
  const balanceDue = Number(ledger.balance_due || 0);
  const netRefund = deposit > balanceDue ? (deposit - balanceDue) : 0;
  const netDue = balanceDue > deposit ? (balanceDue - deposit) : 0;

  document.getElementById('statement-modal-title').textContent = `${t('statement_modal_title')} • ${tenantName}`;
  document.getElementById('statement-modal-subtitle').textContent = `Room ${roomNum} • ${tenantPhone || 'No contact'}`;

  document.getElementById('statement-total-billed').textContent = `₹${ledger.total_billed.toLocaleString('en-IN')}`;
  document.getElementById('statement-billed-breakdown').textContent = t('billed_breakdown_label', {
    rent: ledger.total_rent_billed.toLocaleString('en-IN'),
    light: ledger.total_light_billed.toLocaleString('en-IN')
  });

  document.getElementById('statement-total-paid').textContent = `₹${ledger.total_paid.toLocaleString('en-IN')}`;
  document.getElementById('statement-paid-breakdown').textContent = t('paid_breakdown_label', {
    rent: ledger.total_rent_paid.toLocaleString('en-IN'),
    light: ledger.total_light_paid.toLocaleString('en-IN')
  });

  const balanceEl = document.getElementById('statement-balance-due');
  balanceEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;
  balanceEl.style.color = balanceDue > 0 ? 'var(--pastel-amber-text)' : 'var(--pastel-green-text)';

  // Security Deposit Held Card
  const depositEl = document.getElementById('statement-deposit-held');
  if (depositEl) {
    depositEl.textContent = `₹${deposit.toLocaleString('en-IN')}`;
  }

  // Net Settlement Card
  const netCard = document.getElementById('statement-net-card');
  const netLabel = document.getElementById('statement-net-label');
  const netVal = document.getElementById('statement-net-settlement');
  const netSubtext = document.getElementById('statement-net-subtext');

  if (netRefund > 0) {
    if (netCard) {
      netCard.style.backgroundColor = 'var(--pastel-green-bg)';
      netCard.style.borderColor = 'var(--pastel-green-border)';
    }
    if (netLabel) {
      netLabel.textContent = t('statement_net_settlement');
      netLabel.style.color = 'var(--pastel-green-text)';
    }
    if (netVal) {
      netVal.textContent = `₹${netRefund.toLocaleString('en-IN')}`;
      netVal.style.color = 'var(--pastel-green-text)';
    }
    if (netSubtext) {
      netSubtext.textContent = t('refund_to_tenant');
      netSubtext.style.color = 'var(--pastel-green-text)';
    }
  } else if (netDue > 0) {
    if (netCard) {
      netCard.style.backgroundColor = 'var(--pastel-rose-bg)';
      netCard.style.borderColor = 'var(--pastel-rose-border)';
    }
    if (netLabel) {
      netLabel.textContent = t('statement_net_settlement');
      netLabel.style.color = 'var(--pastel-rose-text)';
    }
    if (netVal) {
      netVal.textContent = `₹${netDue.toLocaleString('en-IN')}`;
      netVal.style.color = 'var(--pastel-rose-text)';
    }
    if (netSubtext) {
      netSubtext.textContent = t('due_from_tenant');
      netSubtext.style.color = 'var(--pastel-rose-text)';
    }
  } else {
    if (netCard) {
      netCard.style.backgroundColor = 'var(--pastel-blue-bg)';
      netCard.style.borderColor = 'var(--pastel-blue-border)';
    }
    if (netLabel) {
      netLabel.textContent = t('statement_net_settlement');
      netLabel.style.color = 'var(--pastel-blue-text)';
    }
    if (netVal) {
      netVal.textContent = '₹0';
      netVal.style.color = 'var(--pastel-blue-text)';
    }
    if (netSubtext) {
      netSubtext.textContent = t('all_settled');
      netSubtext.style.color = 'var(--text-muted)';
    }
  }

  const listContainer = document.getElementById('statement-months-list');
  if (ledger.bills.length === 0) {
    listContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 2rem;">No bill records found for this room.</div>`;
  } else {
    listContainer.innerHTML = ledger.bills.map(b => {
      const isRentPaid = b.rent_status === 'paid';
      const isLightPaid = b.light_status === 'paid';
      const rentPaidDate = b.rent_paid_date ? formatLongDate(b.rent_paid_date) : '';
      const lightPaidDate = b.light_paid_date ? formatLongDate(b.light_paid_date) : '';

      return `
        <div style="background: var(--bg-card); border: 1.5px solid var(--border-subtle); border-radius: var(--radius-md); padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-subtle); padding-bottom: 0.4rem;">
            <strong style="font-size: 0.95rem; color: var(--text-main);">${formatBillingMonth(b.billing_month)}</strong>
            <span class="bill-status-pill ${b.status === 'paid' ? 'paid' : (b.status === 'partial' ? 'partial' : 'unpaid')}">
              ${b.status === 'paid' ? t('status_paid') : (b.status === 'partial' ? (isRentPaid ? t('status_rent_paid_light_due') : t('status_light_paid_rent_due')) : t('status_unpaid'))}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; font-size: 0.86rem;">
            <!-- Electricity record -->
            <div style="background: var(--bg-primary); padding: 0.6rem 0.75rem; border-radius: var(--radius-sm);">
              <div style="color: var(--text-dim); font-size: 0.76rem;">⚡ ${t('label_light_bill')} (${b.units_consumed}u @ ₹${b.electricity_rate})</div>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; margin-top: 2px;">₹${Number(b.electricity_amount).toLocaleString('en-IN')}</div>
              <div style="margin-top: 3px; font-size: 0.78rem; font-weight: 700; color: ${isLightPaid ? 'var(--pastel-green-text)' : 'var(--pastel-amber-text)'};">
                ${isLightPaid ? `✅ ${t('btn_light_paid')} (${lightPaidDate})` : '⚪ Due'}
              </div>
            </div>

            <!-- Rent record -->
            <div style="background: var(--bg-primary); padding: 0.6rem 0.75rem; border-radius: var(--radius-sm);">
              <div style="color: var(--text-dim); font-size: 0.76rem;">🏠 ${t('label_room_rent')}</div>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; margin-top: 2px;">₹${Number(b.rent_amount).toLocaleString('en-IN')}</div>
              <div style="margin-top: 3px; font-size: 0.78rem; font-weight: 700; color: ${isRentPaid ? 'var(--pastel-green-text)' : 'var(--pastel-amber-text)'};">
                ${isRentPaid ? `✅ ${t('btn_rent_paid')} (${rentPaidDate})` : '⚪ Due'}
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem; font-weight: 700; padding-top: 0.2rem;">
            <span>${t('label_total_amount')}:</span>
            <span style="font-family: var(--font-mono); font-size: 1.05rem;">₹${Number(b.total_amount).toLocaleString('en-IN')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('tenant-statement-modal').classList.add('active');
}

function shareStatementWhatsApp() {
  if (!currentStatementData) return;
  const l = currentStatementData;
  const settings = state.settings || {};
  const landlordName = settings.landlord_name || 'Malganga Niwas';
  const isMr = getAppLanguage() === 'mr';

  const deposit = Number(l.deposit_amount || l.room?.security_deposit || 0);
  const balanceDue = Number(l.balance_due || 0);
  const netRefund = deposit > balanceDue ? (deposit - balanceDue) : 0;
  const netDue = balanceDue > deposit ? (balanceDue - deposit) : 0;

  let msg = '';

  if (isMr) {
    msg += `📢 *भाडेकरू अंतिम हिशोब व पावती*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `प्रिय ${l.tenant_name},\n`;
    msg += `*${landlordName}* येथील *खोली क्र. ${l.room?.room_number || ''}* चा एकूण बिलांचा व जमा रकमेचा हिशोब:\n\n`;
    msg += `📊 *एकूण सारांश:*\n`;
    msg += `• एकूण बिल रक्कम: ₹${l.total_billed.toLocaleString('en-IN')}\n`;
    msg += `• एकूण जमा रक्कम: ₹${l.total_paid.toLocaleString('en-IN')}\n`;
    msg += `• बाकी थकबाकी: ₹${balanceDue.toLocaleString('en-IN')}\n`;
    msg += `• जमा सिक्युरिटी डिपॉझिट: ₹${deposit.toLocaleString('en-IN')}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (netRefund > 0) {
      msg += `👉 *भाडेकरूस परत करावयाची रक्कम (डिपॉझिट मधून): ₹${netRefund.toLocaleString('en-IN')}*\n`;
    } else if (netDue > 0) {
      msg += `👉 *भाडेकरूकडून येणे बाकी रक्कम: ₹${netDue.toLocaleString('en-IN')}*\n`;
    } else {
      msg += `👉 *सर्व हिशोब पूर्ण झाला आहे (बाकी ₹0)*\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📜 *दर महिन्याचा तपशील:*\n`;

    for (const b of l.bills) {
      const isRentPaid = b.rent_status === 'paid';
      const isLightPaid = b.light_status === 'paid';
      const rentDate = b.rent_paid_date ? ` (जमा तारीख: ${formatLongDate(b.rent_paid_date)})` : '';
      const lightDate = b.light_paid_date ? ` (जमा तारीख: ${formatLongDate(b.light_paid_date)})` : '';

      msg += `• *${formatBillingMonth(b.billing_month)}*: एकूण ₹${b.total_amount.toLocaleString('en-IN')}\n`;
      msg += `   - महिना भाडे: ₹${b.rent_amount.toLocaleString('en-IN')} [${isRentPaid ? '✅ जमा' + rentDate : '⚪ बाकी'}]\n`;
      msg += `   - लाईट बिल (${b.units_consumed}u): ₹${b.electricity_amount.toLocaleString('en-IN')} [${isLightPaid ? '✅ जमा' + lightDate : '⚪ बाकी'}]\n`;
    }
  } else {
    msg += `📢 *TENANT ACCOUNT STATEMENT & SETTLEMENT*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Dear ${l.tenant_name},\n`;
    msg += `Here is your complete billing & payment ledger for *Room ${l.room?.room_number || ''}* at *${landlordName}*:\n\n`;
    msg += `📊 *SUMMARY:*\n`;
    msg += `• Total Billed: ₹${l.total_billed.toLocaleString('en-IN')}\n`;
    msg += `• Total Paid: ₹${l.total_paid.toLocaleString('en-IN')}\n`;
    msg += `• Balance Due: ₹${balanceDue.toLocaleString('en-IN')}\n`;
    msg += `• Security Deposit Held: ₹${deposit.toLocaleString('en-IN')}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (netRefund > 0) {
      msg += `👉 *NET REFUND TO TENANT: ₹${netRefund.toLocaleString('en-IN')}*\n`;
    } else if (netDue > 0) {
      msg += `👉 *NET DUE FROM TENANT: ₹${netDue.toLocaleString('en-IN')}*\n`;
    } else {
      msg += `👉 *ALL DUES FULLY SETTLED (₹0)*\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📜 *MONTHLY RECORDS:*\n`;

    for (const b of l.bills) {
      const isRentPaid = b.rent_status === 'paid';
      const isLightPaid = b.light_status === 'paid';
      const rentDate = b.rent_paid_date ? ` (Paid on ${formatLongDate(b.rent_paid_date)})` : '';
      const lightDate = b.light_paid_date ? ` (Paid on ${formatLongDate(b.light_paid_date)})` : '';

      msg += `• *${formatBillingMonth(b.billing_month)}*: Total ₹${b.total_amount.toLocaleString('en-IN')}\n`;
      msg += `   - Rent: ₹${b.rent_amount.toLocaleString('en-IN')} [${isRentPaid ? '✅ Paid' + rentDate : '⚪ Due'}]\n`;
      msg += `   - Light (${b.units_consumed}u): ₹${b.electricity_amount.toLocaleString('en-IN')} [${isLightPaid ? '✅ Paid' + lightDate : '⚪ Due'}]\n`;
    }
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (settings.upi_id) {
    msg += `💳 *UPI ID:* ${settings.upi_id}\n`;
  }
  if (settings.landlord_phone) {
    msg += `📞 *GPay / PhonePe:* ${settings.landlord_phone}\n`;
  }
  msg += `Thank you!\n— *${landlordName}*`;

  const phone = (l.tenant_phone || '').replace(/[^0-9]/g, '');
  const cleanPhone = phone.length === 10 ? '91' + phone : phone;
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function exportTenantCsv() {
  if (!currentStatementData) return;
  const l = currentStatementData;
  const deposit = Number(l.deposit_amount || l.room?.security_deposit || 0);
  const balanceDue = Number(l.balance_due || 0);
  const netRefund = deposit > balanceDue ? (deposit - balanceDue) : 0;
  const netDue = balanceDue > deposit ? (balanceDue - deposit) : 0;

  let csv = 'Month,Room,Tenant Name,Tenant Phone,Security Deposit Held (INR),Previous Reading,Current Reading,Units Consumed,Electricity Rate (INR),Electricity Amount (INR),Electricity Status,Electricity Paid Date,Rent Amount (INR),Rent Status,Rent Paid Date,Total Due (INR),Total Paid (INR),Overall Status\n';

  for (const b of l.bills) {
    const isRentPaid = b.rent_status === 'paid';
    const isLightPaid = b.light_status === 'paid';
    const rentPaidDate = b.rent_paid_date ? formatLongDate(b.rent_paid_date) : (isRentPaid ? (formatLongDate(b.paid_date) || '') : '');
    const lightPaidDate = b.light_paid_date ? formatLongDate(b.light_paid_date) : (isLightPaid ? (formatLongDate(b.paid_date) || '') : '');
    const totalPaid = b.paid_amount !== undefined ? b.paid_amount : (b.status === 'paid' ? b.total_amount : 0);
    csv += `"${b.billing_month}","${l.room?.room_number || b.room_number}","${b.tenant_name || l.tenant_name}","${b.tenant_phone || l.tenant_phone}",${deposit},${b.previous_reading},${b.current_reading},${b.units_consumed},${b.electricity_rate},${b.electricity_amount},"${b.light_status || 'unpaid'}","${lightPaidDate}",${b.rent_amount},"${b.rent_status || 'unpaid'}","${rentPaidDate}",${b.total_amount},${totalPaid},"${b.status}"\n`;
  }

  // Add final settlement summary row
  csv += `\n"SUMMARY","Security Deposit Held: ${deposit}","Total Billed: ${l.total_billed}","Total Paid: ${l.total_paid}","Balance Due: ${balanceDue}","Net Settlement: ${netRefund > 0 ? ('Refund ₹' + netRefund) : ('Due ₹' + netDue)}"\n`;

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (l.tenant_name || 'Tenant').replace(/\s+/g, '_');
  a.download = `tenant-statement-Room-${l.room?.room_number || ''}-${safeName}.csv`;
  a.click();
  showToast('Tenant statement exported to Excel (CSV)!', 'success');
}

// Vacate / Change Tenant Logic
let vacateTargetRoomId = null;

async function openVacateTenantModal(roomId) {
  vacateTargetRoomId = roomId;
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;

  document.getElementById('vacate-room-id').value = roomId;
  document.getElementById('vacate-modal-subtitle').textContent = `Room ${room.room_number} • Currently: ${room.tenant_name} (${room.tenant_phone || 'No phone'})`;

  // Reset inputs
  document.getElementById('vacate-action-type').value = 'replace';
  document.getElementById('new-tenant-fields').style.display = 'flex';
  document.getElementById('vacate-new-name').value = '';
  document.getElementById('vacate-new-phone').value = '';
  document.getElementById('vacate-new-rent').value = room.base_rent || state.defaultRent;
  document.getElementById('vacate-new-deposit').value = room.security_deposit || 15000;
  document.getElementById('vacate-new-reading').value = room.effective_previous_reading || room.meter_initial_reading || 0;

  const depositInfo = document.getElementById('vacate-deposit-info');
  if (depositInfo) {
    depositInfo.textContent = t('deposit_held_text', { amount: Number(room.security_deposit || 0).toLocaleString('en-IN') });
  }

  document.getElementById('vacate-tenant-modal').classList.add('active');
}

function viewLeavingTenantStatement() {
  if (vacateTargetRoomId) {
    openTenantStatementModal(vacateTargetRoomId);
  }
}

function toggleVacateFormMode() {
  const type = document.getElementById('vacate-action-type').value;
  const fields = document.getElementById('new-tenant-fields');
  const submitBtn = document.getElementById('vacate-submit-btn');
  fields.style.display = type === 'replace' ? 'flex' : 'none';
  if (submitBtn) {
    submitBtn.textContent = type === 'replace' ? 'Save New Tenant' : 'Confirm Delete Details';
  }
}

async function confirmDeleteTenantVacant() {
  if (!vacateTargetRoomId) return;
  const room = state.rooms.find(r => r.id === Number(vacateTargetRoomId));
  const tenantName = room ? room.tenant_name : 'this tenant';
  if (!confirm(`Delete ${tenantName}'s details and mark Room ${room ? room.room_number : ''} as vacant? Past bills and payments will be safely preserved in history.`)) {
    return;
  }
  try {
    await API.vacateTenant(vacateTargetRoomId, null);
    showToast(`Tenant details deleted. Room ${room ? room.room_number : ''} marked as vacant.`, 'success');
    closeModal('vacate-tenant-modal');
    await loadBillingDashboard();
    await loadRoomsTable();
  } catch (err) {
    showToast('Failed to delete tenant: ' + err.message, 'error');
  }
}

async function deleteTenantDirectly() {
  const id = document.getElementById('room-form-id').value;
  if (!id) return;
  const room = state.rooms.find(r => r.id === Number(id));
  const tenantName = room ? room.tenant_name : 'this tenant';
  if (!confirm(`Are you sure you want to delete ${tenantName}'s details? Past billing and payment history will remain preserved in history.`)) {
    return;
  }
  try {
    await API.vacateTenant(id, null);
    showToast(`Tenant details deleted. Room marked as vacant.`, 'success');
    closeModal('room-modal');
    await loadBillingDashboard();
    await loadRoomsTable();
  } catch (err) {
    showToast('Failed to delete tenant: ' + err.message, 'error');
  }
}

async function handleVacateTenantSubmit(e) {
  e.preventDefault();
  const roomId = Number(document.getElementById('vacate-room-id').value);
  const actionType = document.getElementById('vacate-action-type').value;

  try {
    if (actionType === 'replace') {
      const newName = document.getElementById('vacate-new-name').value.trim();
      const newPhone = document.getElementById('vacate-new-phone').value.trim();
      const newRent = Number(document.getElementById('vacate-new-rent').value);
      const newDeposit = Number(document.getElementById('vacate-new-deposit').value) || 0;
      const newReading = Number(document.getElementById('vacate-new-reading').value);

      if (!newName || !newPhone) {
        showToast('Please enter new tenant name and phone number', 'error');
        return;
      }

      await API.vacateTenant(roomId, {
        tenant_name: newName,
        tenant_phone: newPhone,
        base_rent: newRent,
        security_deposit: newDeposit,
        meter_initial_reading: newReading
      });

      showToast(`New tenant ${newName} assigned to room!`, 'success');
    } else {
      await API.vacateTenant(roomId, null);
      showToast('Room marked as vacant and tenant cleared', 'info');
    }

    closeModal('vacate-tenant-modal');
    await loadBillingDashboard();
    await loadRoomsTable();
  } catch (err) {
    showToast('Failed to update tenant: ' + err.message, 'error');
  }
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

  if (waBtn) {
    waBtn.onclick = () => {
      API.recordDispatch(bill.id, 'whatsapp');
      window.open(data.whatsapp_url, '_blank');
    };
  }

  if (smsBtn) {
    smsBtn.onclick = () => {
      API.recordDispatch(bill.id, 'sms');
      window.location.href = data.sms_url;
    };
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(data.message);
      showToast('Notice copied to clipboard!', 'success');
    };
  }

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
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">No rooms configured yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rooms.map(r => `
      <tr>
        <td><strong>Room ${r.room_number}</strong></td>
        <td>${r.floor || 'Ground'}</td>
        <td><strong>${escapeHtml(r.tenant_name)}</strong></td>
        <td>${r.tenant_phone}</td>
        <td>₹${Number(r.base_rent).toLocaleString('en-IN')}</td>
        <td><strong>₹${Number(r.security_deposit || 0).toLocaleString('en-IN')}</strong></td>
        <td>${r.meter_initial_reading} units</td>
        <td>
          <span class="bill-status-pill ${r.status === 'occupied' ? 'paid' : 'unbilled'}">
            ${r.status === 'occupied' ? (getAppLanguage() === 'mr' ? 'भाडेकरू आहे' : 'Occupied') : (getAppLanguage() === 'mr' ? 'रिकामी' : 'Vacant')}
          </span>
        </td>
        <td style="text-align: right; display: flex; gap: 0.35rem; justify-content: flex-end; flex-wrap: wrap;">
          <button class="btn-sm-action" onclick="openTenantStatementModal(${r.id})" title="View tenant statement & settlement records">📋 ${getAppLanguage() === 'mr' ? 'हिशोब' : 'Statement'}</button>
          <button class="btn-sm-action" style="color: var(--pastel-blue-text);" onclick="openVacateTenantModal(${r.id})" title="Vacate or change tenant details">🚪 ${getAppLanguage() === 'mr' ? 'भाडेकरू बदला' : 'Change Tenant'}</button>
          <button class="btn-sm-action" onclick="openEditRoomModal(${r.id})">✏️ ${t('btn_edit_tenant')}</button>
          <button class="btn-sm-action" style="color: var(--pastel-rose-text);" onclick="deleteRoomConfirm(${r.id}, '${r.room_number}')">🗑️</button>
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
  document.getElementById('room-form-title').textContent = t('modal_add_room_title');
  document.getElementById('room-form').reset();
  document.getElementById('room-form-rent').value = state.defaultRent;
  document.getElementById('room-form-deposit').value = '15000';
  document.getElementById('room-form-reading').value = '0';
  const delBtn = document.getElementById('btn-modal-delete-tenant');
  if (delBtn) delBtn.style.display = 'none';
  document.getElementById('room-modal').classList.add('active');
}

async function openEditRoomModal(id) {
  try {
    const res = await API.getRoom(id);
    if (!res.success) return;
    const r = res.room;

    document.getElementById('room-form-id').value = r.id;
    document.getElementById('room-form-title').textContent = `${t('modal_edit_room_title')} • Room ${r.room_number}`;
    document.getElementById('room-form-number').value = r.room_number;
    document.getElementById('room-form-floor').value = r.floor || 'Ground Floor';
    document.getElementById('room-form-tenant').value = r.tenant_name;
    document.getElementById('room-form-phone').value = r.tenant_phone;
    document.getElementById('room-form-rent').value = r.base_rent;
    document.getElementById('room-form-deposit').value = r.security_deposit !== undefined ? r.security_deposit : 0;
    document.getElementById('room-form-reading').value = r.meter_initial_reading;
    document.getElementById('room-form-status').value = r.status;

    const delBtn = document.getElementById('btn-modal-delete-tenant');
    if (delBtn) delBtn.style.display = r.status === 'occupied' ? 'inline-flex' : 'none';

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
    security_deposit: Number(document.getElementById('room-form-deposit').value) || 0,
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
          <span class="bill-status-pill ${b.status === 'paid' ? 'paid' : (b.status === 'partial' ? 'partial' : 'unpaid')}">
            ${b.status === 'paid' ? 'All Paid' : (b.status === 'partial' ? 'Partial' : 'Unpaid')}
          </span>
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 3px;">
            Rent: ${b.rent_status === 'paid' ? '✅' : '⚪'} | Light: ${b.light_status === 'paid' ? '✅' : '⚪'}
          </div>
        </td>
        <td>
          <button class="btn-whatsapp" style="padding: 0.45rem 0.85rem; font-size: 0.82rem; border-radius: var(--radius-sm);" onclick="sendWhatsAppNotification(${b.room_id})">💬 WhatsApp</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load history: ' + err.message, 'error');
  }
}

// Export History to CSV (Excel compatible with separate Rent & Light bill dates)
async function exportHistoryCsv() {
  try {
    const res = await API.getBills();
    const bills = res.bills || [];
    if (bills.length === 0) {
      showToast('No bills to export', 'info');
      return;
    }

    let csv = 'Month,Room,Tenant Name,Tenant Phone,Previous Reading,Current Reading,Units Consumed,Electricity Rate (INR),Electricity Amount (INR),Electricity Status,Electricity Paid Date,Rent Amount (INR),Rent Status,Rent Paid Date,Total Due (INR),Total Paid (INR),Overall Status\n';
    for (const b of bills) {
      const isRentPaid = b.rent_status === 'paid';
      const isLightPaid = b.light_status === 'paid';
      const rentPaidDate = b.rent_paid_date ? formatLongDate(b.rent_paid_date) : (isRentPaid ? (formatLongDate(b.paid_date) || '') : '');
      const lightPaidDate = b.light_paid_date ? formatLongDate(b.light_paid_date) : (isLightPaid ? (formatLongDate(b.paid_date) || '') : '');
      const totalPaid = b.paid_amount !== undefined ? b.paid_amount : (b.status === 'paid' ? b.total_amount : 0);
      csv += `"${b.billing_month}","${b.room_number}","${b.tenant_name}","${b.tenant_phone}",${b.previous_reading},${b.current_reading},${b.units_consumed},${b.electricity_rate},${b.electricity_amount},"${b.light_status || 'unpaid'}","${lightPaidDate}",${b.rent_amount},"${b.rent_status || 'unpaid'}","${rentPaidDate}",${b.total_amount},${totalPaid},"${b.status}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentflow-bills-${state.currentMonth}.csv`;
    a.click();
    showToast('Excel CSV exported with split payment records!', 'success');
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
    const smsGatewayEl = document.getElementById('setting-sms-gateway');
    const smsKeyEl = document.getElementById('setting-sms-key');
    if (smsGatewayEl) smsGatewayEl.value = settings.sms_gateway || 'none';
    if (smsKeyEl) smsKeyEl.value = settings.sms_api_key || '';
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
    sms_gateway: document.getElementById('setting-sms-gateway') ? document.getElementById('setting-sms-gateway').value : 'none',
    sms_api_key: document.getElementById('setting-sms-key') ? document.getElementById('setting-sms-key').value : ''
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
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      themeBtn.innerHTML = next === 'light' ? '<span>🌙</span> Dark' : '<span>☀️</span> Light';
    });
  }

  // Room form
  const roomForm = document.getElementById('room-form');
  if (roomForm) roomForm.addEventListener('submit', handleRoomFormSubmit);

  // Vacate / Change Tenant form
  const vacateForm = document.getElementById('vacate-tenant-form');
  if (vacateForm) vacateForm.addEventListener('submit', handleVacateTenantSubmit);

  // Settings form
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) settingsForm.addEventListener('submit', handleSettingsFormSubmit);

  // Carousel touch scroll listener
  setupCarouselScrollListener();
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initApp);
