# DyPOS — Independent POS System

**Version:** 1.33.0 | **Architecture:** Vue 3 + Pinia + Express + SQLite/PostgreSQL | **Production:** https://dypos.smartportssoft.com/

DyPOS is a standalone smart professional Point of Sale system. It runs independently and connects to any external ERP, accounting, or payment app only through the dedicated integration unit (`/api/integrations` + `server/lib/integrations/`).

---

## Quick Start

### 1. Install Server
```bash
cd server
npm install
cp .env.example .env
node db/seed.js          # Create admin/admin123 + sample data
npm run dev              # Start on port 3001
```

### 2. Install Frontend
```bash
cd POS
npm install
cp .env.example .env     # Set VITE_DYPOS_API=http://localhost:3001/api
npm run dev              # Start on port 5173
```

### 3. Login
- **Admin:** admin / admin123
- **Cashier:** cashier / cashier123

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    DyPOS Frontend                    │
│         Vue 3 + Pinia + Tailwind + PWA              │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Cart     │  │ Payments │  │ Offline (Dexie)  │  │
│  │ Offers   │  │ Shifts   │  │ Sync Protocol    │  │
│  │ Stock    │  │ Reports  │  │ Conflict Res.    │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │          Backend Adapter (pluggable)          │   │
│  │   REST API ◄──► Frappe API ◄──► Firebase     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                   DyPOS Server                       │
│              Express + SQLite/PostgreSQL              │
│                                                     │
│  /api/auth      — JWT login/register                │
│  /api/products  — CRUD + search + barcode           │
│  /api/customers — CRUD + loyalty + credit           │
│  /api/invoices  — Sale + payments + reports         │
│  /api/shifts    — Open/close/X-report/Z-report     │
│  /api/stock     — Levels + adjust + reservations    │
│  /api/sync      — Pull/push for ERP integration     │
│                                                     │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              External ERP Integration                │
│                                                     │
│  DyPOS / ERPNext / Odoo / Custom                    │
│  via REST API or WebSocket sync                      │
│                                                     │
│  GET  /api/sync/pull?checkpoint=0   ← ERP reads     │
│  POST /api/sync/push                → ERP writes    │
│  WS   /ws/pos/inventory-updates     → Real-time     │
└─────────────────────────────────────────────────────┘
```

---

## Features

### Sales & Checkout
- Barcode/QR/SKU search + manual entry
- Product variants, UoM, weights, bundles
- Per-line and order-level discounts
- Coupon codes (percentage/fixed)
- Loyalty points earn + redemption
- Wallet balance + credit sales
- Split payments (cash + card + wallet)
- Partial payments + installments
- Hold/resume invoices
- Returns with disposition (restock/waste/damaged)

### Payment Methods
Cash, Card, MADA, STC Pay, Tamara, Tabby, Transfer, Cheque, Wallet, Credit, Gift Card — all configurable.

### Shift Management
- Open shift with opening cash
- Mid-shift X-report (cash count)
- Close shift with variance approval
- Z-report generation
- Multi-cashier support

### Offline-First
- 100% offline via IndexedDB (Dexie)
- Web Worker for background sync
- Conflict resolution (keep-local / auto-merger)
- Checkpoint-based incremental sync
- Auto-sync on reconnection

### ERP Integration
- Generic REST API (any ERP can connect)
- Sync protocol: pull/push with checkpoint
- Product catalog sync
- Customer sync
- Invoice push to ERP
- Real-time stock updates via WebSocket

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login (returns JWT) |
| POST | /api/auth/register | Create user |
| GET | /api/auth/me | Current user |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List (search, filter) |
| GET | /api/products/:id | Get by ID |
| POST | /api/products | Create |
| PUT | /api/products/:id | Update |
| DELETE | /api/products/:id | Soft delete |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/invoices | Create sale (idempotent) |
| GET | /api/invoices | List (filter by status/date) |
| GET | /api/invoices/:id | Get with items + payments |
| POST | /api/invoices/:id/pay | Add payment |
| GET | /api/invoices/reports/daily | Daily summary |

### Shifts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/shifts/open | Open shift |
| GET | /api/shifts/open/:terminal | Get open shift |
| POST | /api/shifts/:id/close | Close shift |
| GET | /api/shifts/:id/report | Shift report |

### Stock
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/stock | Bulk levels |
| GET | /api/stock/:productId | Single level |
| POST | /api/stock/adjust | Manual adjustment |

### Sync (ERP Integration)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/sync/pull | Pull pending changes |
| POST | /api/sync/push | Push changes from ERP |
| GET | /api/sync/checkpoint | Last sync checkpoint |

---

## Deployment

### Development
```bash
# Terminal 1: Server
cd server && npm run dev

# Terminal 2: Frontend
cd POS && npm run dev
```

### Production
```bash
# Build frontend
cd POS && npm run build

# The server serves the built frontend from POS/dist/
cd server && NODE_ENV=production node server.js
```

### Docker
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server/ ./server/
COPY POS/dist/ ./POS/dist/
EXPOSE 3001
CMD ["node", "server/server.js"]
```

### Environment Variables

**Server (.env):**
| Variable | Default | Description |
|----------|---------|-------------|
| DYPOS_PORT | 3001 | Server port |
| DYPOS_HOST | 0.0.0.0 | Bind address |
| DYPOS_JWT_SECRET | (required) | JWT signing secret |
| DYPOS_JWT_EXPIRES | 24h | Token expiry |
| DYPOS_DB_PATH | ./data/dypos.db | SQLite path |
| DYPOS_CORS_ORIGIN | * | Allowed origins |

**Frontend (.env):**
| Variable | Default | Description |
|----------|---------|-------------|
| VITE_DYPOS_BACKEND | rest | Backend type (rest/frappe) |
| VITE_DYPOS_API | /api | API base URL |

---

## ERP Sync Setup

### With DyPOS
1. DyPOS exposes `/api/pos/*` endpoints
2. DyPOS sync adapter calls DyPOS API
3. Products, customers, invoices sync bidirectionally

### With Any ERP
1. ERP implements `/api/sync/pull` and `/api/sync/push`
2. DyPOS polls `/api/sync/pull` every 30s
3. DyPOS pushes invoices via `/api/sync/push`
4. Checkpoint-based: no data loss, no duplicates

---

## License

Open Source — Free for commercial use.
