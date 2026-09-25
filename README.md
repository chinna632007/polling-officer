# Smart Polling Booth Officer Allocation and Notification System

A full-stack web application for government/election administrations to allocate
officers to polling booths while **preventing officers from being posted in
their own residential locality**, then notifying them by SMS.

- **Frontend:** React + Vite + React Router + Axios
- **Backend:** Node.js + Express.js + MongoDB (Mongoose)
- **Excel:** `xlsx` library for bulk import/export
- **Auth:** JWT + bcrypt

---

## Project Structure

```
Polling-Officer-Allocation-System/
├── backend/
│   ├── config/            # db.js (MongoDB connection)
│   ├── controllers/       # auth, officer, booth, allocation, upload, notification
│   ├── models/            # Officer, Booth, Allocation, Admin, Notification
│   ├── routes/            # API routes per resource
│   ├── services/          # allocationService, addressMatchingService,
│   │                      # excelService, smsService
│   ├── middleware/        # auth, upload (multer), error, validation
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/    # Navbar, Sidebar, tables, ExcelUploader, modals...
    │   ├── pages/         # Login, Dashboard, Officers, Booths, UploadExcel,
    │   │                  # Allocation, Notifications, Reports
    │   ├── services/      # api.js (axios), download.js
    │   ├── context/       # AuthContext.jsx
    │   ├── App.jsx
    │   └── main.jsx
    ├── vite.config.js
    ├── package.json
    └── .env.example
└── README.md
```

---

## Prerequisites

| Tool | Version |
| ---- | ------- |
| Node.js | 18 or higher (tested on 20+/24) |
| npm | 9+ |
| MongoDB | 6+ (Community edition running locally) |

Check with `node --version` and `npm --version`.

---

## 1. Backend Setup

```bash
cd backend
npm install
copy .env.example .env    # Windows
# or:  cp .env.example .env   (Linux / macOS)
```

Edit `.env` and set at minimum:

```ini
MONGODB_URI=mongodb://127.0.0.1:27017/polling_system
JWT_SECRET=<a-long-random-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<a-strong-password>
```

> The default admin is created automatically on the first server start.

Start the API:

```bash
npm run dev      # nodemon, auto-restart on changes
# or
npm start        # node server.js
```

The API runs at **http://localhost:5000**.

### Backend health check

```
GET http://localhost:5000/api/health
```

### SMS provider configuration

`SMS_PROVIDER` accepts two values in `.env`:

| Value  | Behaviour |
| ------ | --------- |
| `mock` | **Default.** Logs the message and simulates delivery (no external call). Perfect for development/demo. |
| `http` | Posts the message to `SMS_PROVIDER_API_URL` as JSON `{ to, message, senderId, apiKey }`. Works with MSG91 / TextLocal style gateways (or a wrapper that maps the fields). |

```ini
SMS_PROVIDER=http
SMS_PROVIDER_API_URL=https://api.your-sms-gateway.com/send
SMS_API_KEY=your-key
SMS_SENDER_ID=ELCION
```

Credentials are always read from environment variables – **never hardcoded**.

Notification statuses persisted in MongoDB: `SEND → PENDING/FAILED → DELIVERED`.

---

## 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard runs at **http://localhost:5173** and proxies `/api` calls to
`http://localhost:5000` automatically (see `vite.config.js`).

Open the app in your browser and log in with the admin credentials from the
backend `.env` (default `admin` / `Admin@12345`).

Production build:

```bash
npm run build
npm run preview
```
---

## 3. Workflow

1. **Upload Officers Excel** and **Upload Booths Excel** on the *Excel Upload* page
   (drag & drop → validate → preview → import).
2. Visit the **Allocation** page and click **Run Allocation**.
3. Review the allocation table – rows in **red** highlight invalid address
   conflicts (officer locality matches booth locality).
4. **Approve** each allocation.
5. **Send Notification** (SMS) to each approved officer.
6. Download reports on the **Reports** page or from the Allocation page.

---

## Excel Formats

### Officers sheet

| Column | Required |
| ------ | -------- |
| Officer ID | ✅ |
| Officer Name | ✅ |
| Designation | ✅ |
| Mobile Number | ✅ |
| Email | |
| House Number | |
| Street | |
| Village/Locality | ✅ |
| Ward | |
| Mandal | ✅ |
| District | |
| PIN Code | |

### Booths sheet

| Column | Required |
| ------ | -------- |
| Booth ID | ✅ |
| Booth Number | ✅ |
| Booth Name | ✅ |
| Building Name | |
| Street | |
| Village/Locality | ✅ |
| Ward | |
| Mandal | ✅ |
| District | |
| PIN Code | |
| Required Officers | ✅ |

Duplicate IDs, invalid mobile numbers and invalid PIN codes are reported with
their exact row numbers. Duplicate IDs already present in the database are
skipped during import (never overwritten).

Sample templates can be downloaded from the *Excel Upload* page.

---

## Allocation Algorithm (9 steps)

Implemented in `backend/services/allocationService.js` + `addressMatchingService.js`:

1. Group booths by Mandal.
2. Group officers by Mandal.
3. Find booths with available capacity (`requiredOfficers − allocatedOfficerCount`).
4. For each officer, check **every** booth in their Mandal.
5. Reject booths where the officer address is related to the booth locality.
6. Score suitable booths (locality difference, ward difference, available capacity).
7. Allocate the officer to the best scored booth (atomic capacity reservation).
8. Mark officers with no suitable booth as `Unallocated`.
9. Save all allocations to MongoDB.

### Address comparison rules (`addressMatchingService.js`)

- Officer and booth **must be in the same Mandal**.
- **Exact locality/village match → reject.**
- High address similarity (fuzzy `Levenshtein` ratio ≥ 0.75) → reject.
- Address text is normalized (lowercase, trimmed, punctuation stripped) and
  tokenized (common stopwords removed).
- **Multiple matched important tokens** (locality/street/ward) → reject.
- **PIN code alone never rejects** – several booths can share a PIN.
- A weighted conflict score is produced for audit (stored as `addressMatchScore`).

Every officer can hold at most **one** allocation (enforced by a partial unique
index in MongoDB), and booth capacity is never exceeded.
---

## Gmail (E-mail) Sending

Notification e-mails go out through the **Gmail API** (OAuth 2.0) - no SMTP
passwords anywhere. Access tokens are refreshed automatically and the refresh
token is persisted in MongoDB, so the connection survives server restarts.
While no account is connected, every mail endpoint answers `503` with a clear
hint instead of failing silently.

### One-time Google Cloud setup

1. Open <https://console.cloud.google.com> and create/select a project.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → type *External* → fill the app
   name and support e-mail → add the sending Gmail address under **Test users**
   (required while the consent screen is in *Testing*).
4. **Credentials → Create credentials → OAuth client ID** → *Web application* →
   Authorized redirect URI: `http://localhost:5000/auth/google/callback`
   (it must match `GOOGLE_REDIRECT_URI` and the running `PORT`).

### Connect the Gmail account (once per server)

With the backend running, open <http://localhost:5000/auth/google> in a browser
and accept the consent screen. The callback page confirms the linked account
and shows the (optionally pinnable) `.env` snippet. Without pinning, the token
is loaded from MongoDB on every boot; when `GOOGLE_REFRESH_TOKEN` is set in
`.env`, that value wins.

### Related `.env` variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client credentials (step 4) |
| `GOOGLE_REDIRECT_URI` | must equal the redirect URI registered in Google Cloud |
| `GOOGLE_REFRESH_TOKEN` | optional manual override of the MongoDB-stored token |
| `GMAIL_FROM` / `GMAIL_FROM_NAME` | sender address / display name for outgoing mail |

### Mail endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/mail/status` | Connection state (configured / connected / account) |
| POST | `/api/mail/send` | Free-form e-mail (`to`, `subject`, `text`/`html`, `cc`, `bcc`, `replyTo`) |
| POST | `/api/mail/allocation/:allocationId` | Polling-duty letter for one allocation |
| POST | `/api/mail/allocation` | Bulk letters - body `{ "allocationIds": [...] }` or `{ "mandal": "..." }`, max 100 |
| POST | `/api/mail/test` | Test message to the connected mailbox |
| POST | `/api/mail/disconnect` | Forget the stored token (Super Admin) |

In the frontend, **Allocation → Allocated Officers** has a **Send Mail** button
on every row (next to *Send Notification*) and **Mail All Allocated** plus
**Notify All Allocated** buttons on the card header. Officers without an
e-mail address / mobile number are skipped and counted, so the summary always
explains what happened.

## Swagger API Documentation

Interactive OpenAPI 3 documentation is served by the backend:

- **Swagger UI:** `http://localhost:5000/api-docs`
- **Raw JSON:** `http://localhost:5000/api-docs.json`

Click **Authorize**, paste the JWT from `/api/auth/login`, and every protected
endpoint can be executed directly from the browser (the UI keeps the token
across page reloads).

## API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/api/auth/login` | Admin login (JWT) |
| GET | `/api/officers` | List / search / filter officers |
| POST | `/api/officers` | Create officer |
| PUT | `/api/officers/:id` | Update officer |
| DELETE | `/api/officers/:id` | Delete officer |
| GET | `/api/booths` | List / search / filter booths |
| POST | `/api/booths` | Create booth |
| PUT | `/api/booths/:id` | Update booth |
| DELETE | `/api/booths/:id` | Delete booth |
| POST | `/api/upload/officers?mode=preview\|commit` | Upload officers Excel |
| POST | `/api/upload/booths?mode=preview\|commit` | Upload booths Excel |
| GET | `/api/upload/templates/:kind` | Download sample template |
| POST | `/api/allocation/run` | Run the allocation algorithm |
| GET | `/api/allocation` | List allocations |
| PUT | `/api/allocation/:id` | Update an allocation |
| POST | `/api/allocation/:id/approve` | Approve an allocation |
| POST | `/api/allocation/:id/reallocate` | Reallocate officer |
| POST | `/api/allocation/:id/cancel` | Cancel an allocation |
| POST | `/api/notifications/send/:allocationId` | Send SMS to the officer |
| POST | `/api/notifications/send-all` | Bulk SMS to every allocated officer (body optional: `{ "allocationIds": [...] }` or `{ "mandal": "..." }`), max 100 |
| GET | `/api/notifications` | List notification statuses |
| GET | `/api/reports/officers-excel` | Officer list report (.xlsx) |
| GET | `/api/reports/booths-excel` | Booth list report (.xlsx) |
| GET | `/api/reports/allocation-excel` | Allocated officers report (.xlsx) |
| GET | `/api/reports/allocation-by-mandal` | Allocated officers report, **all Mandals in a single sheet** sorted by Officer ID ascending (.xlsx) |
| GET | `/api/reports/allocated-officers/:mandal` | Allocated officers for a single Mandal (.xlsx, case-insensitive) |
| GET | `/api/reports/unallocated-officers` | Unallocated officers report (.xlsx) |
| GET | `/api/reports/notifications-excel` | Notification status report (.xlsx) |
| POST | `/api/mail/send` | Send an e-mail through the Gmail API (OAuth) |
| GET | `/api/mail/status` | Gmail connection status |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/health` | Health check |

All endpoints except `/api/auth/login` and `/api/health` require the JWT header:
`Authorization: Bearer <token>`.

Interactive docs: Swagger UI at `/api-docs`, raw JSON at `/api-docs.json`.

---

## Running the Tests

### 1. Core-Logic Smoke Tests (no MongoDB needed)

The address-matching and allocation-scoring logic is pure and can be verified
without a database. It covers all seven address rules plus the scoring/balance
behaviour of the allocation algorithm:

```bash
cd backend
npm run smoke-test
```

### 2. End-to-End API Test (requires MongoDB + running server)

Exercises the real HTTP stack: login → seed officers/booths → run the
allocation algorithm → verify no same-locality allocation exists → approve an
allocation → send an SMS (mock provider) → reallocate → download the Excel
report → dashboard stats.

```bash
# terminal 1
cd backend
npm start

# terminal 2
cd backend
npm run e2e-test
```

The test is repeatable: it tolerates data left over from previous runs. When
it finishes, wipe its test records (everything named `OFF-E2E-*` /
`BOOTH-E2E-*`) to leave the database pristine:

```bash
npm run cleanup-e2e
```

### 3. Mail + Swagger Verification (requires MongoDB + running server)

Logs in, fetches the Swagger spec, verifies the UI is served, checks the Gmail
connection status and the validation of the mail endpoints. Add `--to=` with a
real address to also deliver one test e-mail:

```bash
cd backend
npm run verify-mail
```

---

## Security Notes

- Passwords are stored as **bcrypt hashes**.
- All admin routes are protected by **JWT** (24 h expiry).
- Input is validated with `express-validator` (body + URL params).
- Excel rows are validated before insertion (required columns, duplicates, formats).
- Database passwords and SMS credentials live in `.env`/**only** – never exposed.
- Gmail OAuth refresh tokens are stored in MongoDB and are never returned by the API (only a masked preview is shown after connecting).

---

## Environment Variables

- `backend/.env.example` – all backend variables (PORT, MONGODB_URI, JWT_SECRET,
  ADMIN_USERNAME/PASSWORD, SMS_*, GOOGLE_*, GMAIL_*).
- `frontend/.env.example` – `VITE_API_BASE_URL` (leave blank to use the dev proxy).

Never commit real `.env` files.
