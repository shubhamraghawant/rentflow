const API = {
  // Settings & Factors
  async getSettings() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    return data.settings;
  },

  async updateSettings(settings) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return await res.json();
  },

  async updateFactors(electricity_rate, default_rent) {
    const res = await fetch('/api/settings/factors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ electricity_rate, default_rent })
    });
    return await res.json();
  },

  // Rooms & Tenants
  async getRooms(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/rooms?${query}`);
    return await res.json();
  },

  async getRoom(id) {
    const res = await fetch(`/api/rooms/${id}`);
    return await res.json();
  },

  async createRoom(roomData) {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    return await res.json();
  },

  async updateRoom(id, roomData) {
    const res = await fetch(`/api/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    return await res.json();
  },

  async deleteRoom(id) {
    const res = await fetch(`/api/rooms/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  // Bills
  async getBills(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/bills?${query}`);
    return await res.json();
  },

  async getSummary(month) {
    const res = await fetch(`/api/bills/summary?month=${encodeURIComponent(month)}`);
    return await res.json();
  },

  async calculatePreview(payload) {
    const res = await fetch('/api/bills/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  async saveBill(billData) {
    const res = await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(billData)
    });
    return await res.json();
  },

  async updateBillStatus(id, status, paid_amount = null) {
    const res = await fetch(`/api/bills/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, paid_amount })
    });
    return await res.json();
  },

  async deleteBill(id) {
    const res = await fetch(`/api/bills/${id}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  // Notifications
  async getNoticePreview(bill_id) {
    const res = await fetch(`/api/notifications/preview/${bill_id}`);
    return await res.json();
  },

  async recordDispatch(bill_id, channel = 'whatsapp') {
    const res = await fetch('/api/notifications/record-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill_id, channel })
    });
    return await res.json();
  },

  async sendSms(bill_id) {
    const res = await fetch('/api/notifications/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill_id })
    });
    return await res.json();
  },

  async getNotificationLogs() {
    const res = await fetch('/api/notifications/logs');
    return await res.json();
  }
};

window.API = API;
