# PADURA LIVE – PRIVATE LIVE STREAMING PLATFORM
> *Your Private Gateway to Padura Live Events.*

A production-ready, fully authenticated web application designed for university students and parents to watch private Padura live events through a custom, branded video player powered by Unlisted YouTube Live streams.

Built with **100% Free-Tier Technologies**: **Cloudflare Pages**, **Supabase (PostgreSQL, Auth, RLS, Edge Functions)**, and **Vanilla ES6+ JavaScript**.

---

## 🌟 Key Features

### 1. Custom YouTube Live Player
- **Integrated YouTube IFrame Player API:** Custom-branded overlay with zero external YouTube branding or recommended video distractions.
- **Playback Controls:** Play, pause, 10s backward seek, 10s forward seek.
- **DVR Live Timeline:** Dynamic seeker detecting seekable YouTube DVR live windows; "LIVE" badge button to instantly jump to the live edge.
- **Speed Selector:** Multi-speed playback (`0.25x`, `0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`, `1.75x`, `2x`), validated dynamically against player capabilities.
- **Volume & Fullscreen:** Volume slider, mute toggle, and HTML5 Fullscreen mode that maintains custom controls and watermark in fullscreen.
- **Error Handling:** Graceful offline banners, scheduled upcoming countdowns, stream concluded messages, and embedding restriction diagnostics.

### 2. Multi-Role User Account System
- **Student Accounts:** Validated student registration number format (`XX/YYYY/NNN` e.g., `PS/2023/174`, `SC/2024/021`), academic year, and active/inactive status.
- **Parent Accounts:** Linked to one or multiple students; dynamically switches access based on linked children.
- **Administrator Accounts:** Full platform management suite. No public self-registration.

### 3. Administrator Dashboard
- **Analytics Overview:** Real-time counters for students, parents, admins, active/inactive accounts, current live broadcast status, and recent activity logs.
- **Broadcast Management:** Add, schedule, publish/unpublish, and toggle live streams. Features automatic YouTube Video ID extraction and format validation.
- **Student Management:** Add individual students, filter by academic year or status, search by registration number, reset passwords, and deactivate accounts.
- **Bulk CSV & Excel (.xlsx) Import:** Drag-and-drop file upload, automated format validation, duplicate detection, pre-import preview table, real-time progress bar, success/failure counts, and downloadable CSV error reports.
- **Parent Management:** Create parent accounts, assign students via comma-separated student numbers, and manage relationships.
- **Security Audit Logs:** Immutable logs of administrative actions and viewer heartbeats.

### 4. Anti-Recording Deterrents
- **Dynamic Moving Watermark:** Student-specific watermark (`PADURA LIVE | PS/2023/174 | PRIVATE VIEWING`) smoothly relocating across random screen coordinates every 20 seconds. Fully visible in fullscreen.
- **Interface Protections:** Right-click context menu disabled, URL inspection obscured, dev shortcuts blocked (`Ctrl+S`, `Ctrl+U`).
- **Heartbeat & Inactivity Watcher:** 30-second viewer heartbeat logging (`viewing_logs`) and auto-logout after 15 minutes of inactivity.

---

## 🏗 Technology Stack

| Layer | Technology | Cost Tier |
|---|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) | 100% Free |
| **Hosting** | Cloudflare Pages (Free Plan) | 100% Free |
| **Database** | PostgreSQL 15 on Supabase | 100% Free |
| **Authentication** | Supabase Auth (bcrypt hashed passwords) | 100% Free |
| **Access Control** | PostgreSQL Row Level Security (RLS) | 100% Free |
| **Serverless Logic** | Supabase Edge Functions (Deno) | 100% Free |
| **Live Streaming** | YouTube Live Unlisted Streaming + YouTube IFrame API | 100% Free |

*No paid subscriptions, no Node.js hosting servers, and no paid video hosting required.*

---

## 📁 Project File Structure

```
padura-live/
│
├── index.html                  # Public portal landing page
├── login.html                  # Unified role-based authentication portal
├── student-dashboard.html      # Student live streaming & schedule portal
├── parent-dashboard.html       # Parent portal with linked child switcher
├── admin-dashboard.html        # Comprehensive administrative control suite
├── sample_students.csv         # Ready-to-test CSV bulk import file
│
├── assets/
│   ├── css/
│   │   ├── style.css           # Global design tokens, dark navy theme, typography, modals
│   │   ├── dashboard.css       # Sidebar, stats grid, tables, drag-and-drop dropzone
│   │   └── player.css          # Custom YouTube player shell, controls overlay, watermark
│   │
│   ├── js/
│   │   ├── config.js           # Supabase client initialization & YouTube URL parsers
│   │   ├── auth.js             # Authentication engine, role guards & auto-logout
│   │   ├── security.js         # Dynamic watermark, contextmenu lock, heartbeat logger
│   │   ├── player.js           # YouTube IFrame API controller, DVR manager & fullscreen
│   │   ├── student.js          # Student dashboard controller & stream loader
│   │   ├── parent.js           # Parent dashboard controller & multi-child selector
│   │   └── admin.js            # Admin analytics, broadcast CRUD, CSV/XLSX import & logs
│   │
│   └── images/
│       └── logo.svg            # Official PADURA LIVE vector logo
│
├── supabase/
│   ├── schema.sql              # Complete PostgreSQL schema (10 tables, triggers, functions)
│   ├── rls_policies.sql        # Row Level Security (RLS) policies
│   ├── seed_initial_admin.sql  # Script to provision the initial administrator
│   └── functions/
│       ├── bulk-import-students/
│       │   └── index.ts        # Edge function for secure bulk student creation
│       └── manage-user/
│           └── index.ts        # Edge function for admin user management & password resets
│
├── docs/
│   ├── DEPLOYMENT_GUIDE.md     # Step-by-step Cloudflare Pages + Supabase deployment
│   ├── SUPABASE_SETUP.md       # Database schema and RLS policies guide
│   └── ADMIN_MANUAL.md         # Administrator operation manual
│
├── .gitignore
└── README.md
```

---

## 🚀 Quickstart & Local Testing

You can run and test PADURA LIVE immediately on any modern web browser or local static server.

### Option A: Local Static Server (PowerShell / Python / Node)
Using Python:
```bash
cd "C:\Users\kavin\.gemini\antigravity\scratch\padura-live"
python -m http.server 3000
```
Using Node/npx:
```bash
npx serve .
```

Open `http://localhost:3000` in your web browser.

### Option B: Zero-Code Browser Configuration
1. Open `login.html`.
2. Click the link at the bottom: **"Configure Supabase API Keys"**.
3. Paste your Supabase Project URL and Public Anon Key.
4. Click **Save Credentials**; your browser will save them in `localStorage`.

---

## 🔒 Security Architecture

1. **Zero Secret Leakage:**
   The Supabase `service_role` key is never bundled in frontend JavaScript or GitHub repositories. All privileged actions (bulk user creation, password resets) execute in isolated Supabase Edge Functions with caller JWT validation.
2. **Row Level Security (RLS):**
   Database rows are guarded by PostgreSQL RLS. Students can never view administrator logs or other students' records. Parents can only access records and broadcasts belonging to their linked children.
3. **Password Security:**
   All passwords are encrypted with bcrypt inside Supabase Auth.
4. **Student Number Validation:**
   Enforced at both client-side and database-level constraint:
   ```sql
   CHECK (student_number ~ '^[A-Z]{2}/[0-9]{4}/[0-9]+$')
   ```

---

## 📖 Documentation
- [Production Deployment Guide (Cloudflare Pages + Supabase)](docs/DEPLOYMENT_GUIDE.md)
- [Supabase Setup & SQL Guide](docs/SUPABASE_SETUP.md)
- [Administrator Operations Manual](docs/ADMIN_MANUAL.md)

---

## 📄 License
Educational & University Institutional Use. Developed for Padura Live Events.
