# 🧾 TuldokBenta

**TuldokBenta** is a Point-of-Sale (POS) web application designed for small to medium-scale businesses. It allows users to manage items, services, and sales transactions seamlessly — with support for open/closed sales, payment tracking, and receipt printing.

It is built as a full-stack web application, responsive for both desktop and mobile devices.

🔗 **Live Demo:** [tuldokbenta.vercel.app](https://tuldokbenta-demo.vercel.app)

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [Sales & Payment Logic](#sales--payment-logic)
- [Receipt Printing](#receipt-printing)

---

## ✨ Features

- 🛒 **Product and Service Management**  
  - Add items and classify them (e.g., goods, consumables, etc.)  
  - Add services with optional freebies (each service can include 1 classification of freebies)  

- 💰 **Sales Management**  
  - Open Sales: Orders that are ongoing (payment pending)  
  - Closed Sales: Fully paid transactions  
  - Choose between **Cash** or **GCash** payment methods  

- 📅 **Sales Reporting**  
  - View and filter sales by date ranges  
  - Check revenue summaries and transaction breakdowns  

- 🧾 **Receipt Printing**  
  - Supports **thermal POS printers**  
  - For **mobile devices**, recommended app: **[RAWBT](https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter&hl=en)**  
  - For **desktop PCs**, use standard printer drivers  

- 🔐 **Authentication**  
  - Local authentication (simple password system)  
  - No external services; minimal hashing for local authorized access  

- 📱 **Responsive UI**  
  - Fully optimized for mobile and tablet devices using Tailwind CSS  

---

## 🧠 Tech Stack

| Layer | Technology |
|-------|-------------|
| **Frontend** | React.js, Tailwind CSS |
| **Backend** | Express.js (Node.js) |
| **Database** | PostgreSQL (via NeonDB) |
| **Queries** | Raw SQL |
| **Authentication** | Local (password) |
| **Deployment** | Frontend → Vercel • Backend → Render |

---

### Prerequisites

- Node.js (v16+ recommended)  
- pnpm / npm / yarn  
- Access to NeonDB PostgreSQL instance  
- Clerk API & frontend / backend keys  
- (Optional) Postman / HTTP client for testing APIs  

### Setup Backend

1. Clone the repo (if not already)  
   ```bash
   git clone https://github.com/lyle0129/Cashly.git
   cd Cashly/backend
   npm install
   
2. Configure environment variables (see next section)

3. Run migrations / initialize DB (if applicable)

4. Start server (in dev mode)
   ```bash
   npm run dev
5. The backend should now listen (e.g. http://localhost:5001 or your configured port)

### Setup Frontend

1. Move to the webapp directory
    ```bash
   cd ../
2. Clone the repo (if not already)  
   ```bash
   git clone https://github.com/lyle0129/Cashly.git
   cd Cashly/webapp
   npm install
3. Add environment variables (e.g. Clerk frontend key, backend API URL)

4. Run development server
   ```bash
   npm run dev
5. Access via http://localhost:5173 (or your configured port)

---

💳 Sales & Payment Logic

Open Sales:
Sales that are still ongoing and have not received payment.
These can be updated or modified (e.g., adding/removing items).

Closed Sales:
Once payment is received, sales are marked closed.

Payment Methods:
Users can select either Cash or GCash during closing sale.

Reporting / Filtering:
You can query sales between date ranges to get revenue or transaction summaries.

---

🧾 Receipt Printing

TuldokBenta supports thermal printing for receipts.

For Mobile:
Use the RAWBT app
 to connect to Bluetooth or USB thermal printers.

For Desktop:
Install printer drivers for your POS printer (Epson, Xprinter, etc.).
Use the browser’s native print dialog to print formatted receipts.

