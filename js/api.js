/**
 * RentFlow Unified Offline-First API Adapter
 * Directly uses offline device storage (offlineStore) for 100% offline capability,
 * while allowing optional sync with backend server when connected.
 */

const API = {
  // --- Settings & Factors ---
  async getSettings() {
    return window.offlineStore.getSettings();
  },

  async updateSettings(settings) {
    const updated = window.offlineStore.updateSettings(settings);
    return { success: true, settings: updated, message: 'Settings saved offline successfully' };
  },

  async updateFactors(electricity_rate, default_rent) {
    const updated = window.offlineStore.updateFactors(electricity_rate, default_rent);
    return { success: true, factors: updated, message: 'Factors updated locally' };
  },

  // --- Rooms & Tenants ---
  async getRooms(params = {}) {
    const rooms = window.offlineStore.getRooms(params);
    return { success: true, count: rooms.length, rooms };
  },

  async getRoom(id) {
    const data = window.offlineStore.getRoom(id);
    if (!data) return { success: false, error: 'Room not found' };
    return { success: true, ...data };
  },

  async createRoom(roomData) {
    try {
      const room = window.offlineStore.createRoom(roomData);
      return { success: true, message: 'Room created successfully', room };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async updateRoom(id, roomData) {
    try {
      const room = window.offlineStore.updateRoom(id, roomData);
      return { success: true, message: 'Room updated successfully', room };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async deleteRoom(id) {
    try {
      window.offlineStore.deleteRoom(id);
      return { success: true, message: 'Room deleted successfully' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // --- Bills ---
  async getBills(params = {}) {
    const bills = window.offlineStore.getBills(params);
    return { success: true, count: bills.length, bills };
  },

  async getSummary(month) {
    const summary = window.offlineStore.getSummary(month);
    return { success: true, month, summary };
  },

  async saveBill(billData) {
    try {
      const bill = window.offlineStore.saveBill(billData);
      return {
        success: true,
        message: `Bill for Room ${bill.room_number} saved successfully`,
        bill
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async updateBillStatus(id, status, paid_amount = null) {
    try {
      const bill = window.offlineStore.updateBillStatus(id, status, paid_amount);
      return { success: true, message: `Status updated to ${status}`, bill };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async deleteBill(id) {
    try {
      window.offlineStore.deleteBill(id);
      return { success: true, message: 'Bill deleted successfully' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // --- Notifications & URLs ---
  async getNoticePreview(bill_id) {
    const bills = window.offlineStore.getBills();
    const bill = bills.find(b => b.id === Number(bill_id));
    if (!bill) return { success: false, error: 'Bill not found' };

    return {
      success: true,
      data: {
        bill,
        message: bill.formatted_message,
        whatsapp_url: bill.whatsapp_url,
        sms_url: bill.sms_url,
        phone: bill.tenant_phone,
        tenant_name: bill.tenant_name,
        room_number: bill.room_number
      }
    };
  },

  async recordDispatch(bill_id, channel = 'whatsapp') {
    window.offlineStore.recordDispatch(bill_id, channel);
    return { success: true };
  },

  async sendSms(bill_id) {
    // In 100% offline mode, we trigger the phone's native SMS app directly
    const preview = await this.getNoticePreview(bill_id);
    return {
      success: false,
      fallback_url: preview.data.sms_url,
      reason: 'Offline mode: launching native SMS app'
    };
  },

  // --- Backup & Restore ---
  exportBackup() {
    return window.offlineStore.exportBackupJson();
  },

  importBackup(jsonString) {
    try {
      window.offlineStore.importBackupJson(jsonString);
      return { success: true, message: 'Backup restored successfully!' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

window.API = API;
