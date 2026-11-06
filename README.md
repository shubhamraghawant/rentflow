# ⚡ RentFlow

> **Minimal Modern Rent & Electricity Bill Notification Platform for Landlords and Tenants**

RentFlow is a lightweight, responsive, and elegant property billing application designed for landlords. It simplifies monthly tenant billing by tracking electricity meter readings, calculating power consumption differences with runtime rate factors, managing room rents, and dispatching pre-formatted invoices directly through **WhatsApp** and **SMS** with a single click.

---

## ✨ Features

- **⚡ Real-Time Electricity (Light Bill) Calculation**:
  - Automatically loads the tenant's previous recorded meter reading (or custom starting reading).
  - Enter the current reading to instantly calculate:
    $$\text{Units Consumed} = \text{Current Reading} - \text{Previous Reading}$$
    $$\text{Light Bill Amount} = \text{Units Consumed} \times \text{Electricity Rate Factor}$$
  - **+1 Reading Offset Helper**: Quick-click button to offset or increment reading as desired.
- **🎛️ Runtime Configurable Factors**:
  - Change the **Electricity Rate Factor (₹/unit)** at runtime directly from the top banner. Updates are instantly saved to the SQLite database and all room bills recalculate live on screen.
  - Modify the **Default Base Rent (₹/month)** at runtime globally, or customize rent on the fly per room / per monthly bill.
- **💬 1-Click WhatsApp & SMS Dispatch**:
  - **WhatsApp Direct**: Opens WhatsApp Web / Desktop / Mobile app with a formatted, emoji-styled breakdown invoice notice pre-filled.
  - **SMS Direct**: Native SMS trigger or background SMS API gateway (Fast2SMS / Webhooks).
  - **One-Click Clipboard Copy**: Copies the WhatsApp-ready text with one click.
  - **Printable Invoices**: Clean, printable invoice receipts ready for PDF export or printing.
- **🚪 Room & Tenant Management**:
  - Add, edit, and organize rooms, floor levels, tenant names, contact phone numbers, move-in dates, and base rents.
  - Automatic historical tracking of previous meter readings across months.
- **📜 Ledgers & Billing History**:
  - Comprehensive audit trail of all monthly bills.
  - Filter by month and payment status (Paid / Unpaid).
  - 1-click **CSV export** for tax and bookkeeping records.
- **💳 Payment Integration**:
  - Embed your **UPI ID** (GPay / PhonePe / Paytm / BHIM) directly into the tenant invoice notice so tenants can pay you immediately.
- **🌙 Minimal Modern UI**:
  - Dark mode by default with light mode toggle, crisp typography (`Inter` & `JetBrains Mono`), glassmorphic cards, live dynamic calculation badges, and responsive layouts for desktop and mobile.

---

## 🚀 Quickstart

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher; tested on Node v26)
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/shubhamraghawant/rentflow.git
cd rentflow

# Install dependencies
npm install

# Start the application
npm start
```

Visit **`http://localhost:4000`** in your browser.

---

## 🛠️ Configuration (`.env`)

You can create or edit `.env` in the root folder:

```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATA_DIR=./data
DEFAULT_ELECTRICITY_RATE=10
DEFAULT_RENT=6000
LANDLORD_NAME=Shubham Properties
LANDLORD_PHONE=+919876543210
UPI_ID=shubham@upi
```

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```

---

## 📡 API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/settings` | Retrieve system settings and billing factors |
| `PUT` | `/api/settings` | Update settings (template, UPI ID, landlord details) |
| `POST` | `/api/settings/factors` | Update runtime electricity rate and base rent factors |
| `GET` | `/api/rooms` | List rooms with tenant info and effective previous readings |
| `POST` | `/api/rooms` | Add a new room and tenant |
| `PUT` | `/api/rooms/:id` | Update room or tenant details |
| `DELETE` | `/api/rooms/:id` | Remove a room and its associated bills |
| `GET` | `/api/bills` | List generated bills (supports `?month=` and `?status=`) |
| `GET` | `/api/bills/summary` | Summary metrics (collection, power units, rooms billed) |
| `POST` | `/api/bills` | Create or update a bill with auto calculations |
| `PATCH` | `/api/bills/:id/status` | Mark a bill as paid or unpaid |
| `GET` | `/api/notifications/preview/:bill_id` | Get formatted WhatsApp/SMS text & direct URLs |
| `POST` | `/api/notifications/record-dispatch` | Record notification dispatch event |
| `POST` | `/api/notifications/send-sms` | Send SMS via configured gateway |

---

## 📱 Sample Notification Format

```text
📢 *RENT & ELECTRICITY BILL NOTICE*
━━━━━━━━━━━━━━━━━━━━
Dear Rahul Sharma,
Here is your bill summary for *Room 101* (November 2026):

⚡ *Electricity (Light Bill):*
• Previous Reading: 1120 units
• Current Reading: 1240 units
• Units Consumed: 120 units
• Rate: ₹10/unit
• *Light Bill Amount:* ₹1,200

🏠 *Room Rent:* ₹6,500

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL AMOUNT DUE:* *₹7,700*
📅 *Due Date:* 2026-11-05

💳 *Pay via UPI:* `shubham@upi`
📞 *GPay / PhonePe / Paytm:* +919876543210

Please share payment confirmation screenshot once done.
Thank you!
— *Shubham Properties*
```

---

## 📄 License
MIT © [Shubham Raghawant](https://github.com/shubhamraghawant)
