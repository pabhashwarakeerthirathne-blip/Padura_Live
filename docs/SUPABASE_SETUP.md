# PADURA LIVE – SUPABASE DATABASE & AUTHENTICATION SETUP

This technical guide provides the exact SQL execution sequence and Edge Function configuration required to configure Supabase for **PADURA LIVE**.

---

## 1. Schema Architecture Overview

The database uses PostgreSQL with Supabase Row Level Security (RLS) to enforce zero-trust access control.

```
auth.users (Supabase Managed Engine)
    │
    ▼
public.profiles (Role, Username, Full Name, Status)
    ├── public.students (Student Number, Academic Year)
    │       ▲
    │       │
    │   public.parent_students (Many-to-Many Bridge)
    │       │
    │       ▼
    ├── public.parents (Phone, Notes)
    ├── public.broadcasts (YouTube URL, Video ID, Status, Visibility)
    │       ├── public.broadcast_access (Year / Student Restrictions)
    │       └── public.viewing_logs (Audited Viewing Heartbeats)
    ├── public.login_logs (Audit of Login Attempts)
    ├── public.admin_logs (Audit of Admin Actions)
    └── public.user_sessions (Session Expiration Tracking)
```

---

## 2. SQL Execution Sequence

Log in to the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql) and run the scripts in the following order:

### Step 1: Base Schema & Functions
Execute [`supabase/schema.sql`](../supabase/schema.sql).
This creates:
- PostgreSQL extensions (`uuid-ossp`, `pgcrypto`)
- The 10 core tables with foreign keys and check constraints
- Validation rule for student number format: `CHECK (student_number ~ '^[A-Z]{2}/[0-9]{4}/[0-9]+$')`
- Performance indexes on all foreign keys, status fields, and timestamps
- Automatic updated_at trigger functions
- Security Definier helper functions:
  - `public.is_admin()`
  - `public.can_user_access_broadcast(broadcast_id, user_id)`
  - `public.log_viewing_heartbeat(broadcast_id, duration, ip, user_agent)`

### Step 2: Row Level Security (RLS)
Execute [`supabase/rls_policies.sql`](../supabase/rls_policies.sql).
This enforces:
- `profiles`: Admins have full access. Users can read only their own profile. Parents can view profiles of their linked students. Users can update only their display name (cannot elevate role or activate self).
- `students`: Read restricted to admins, the student themselves, and authorized parents.
- `broadcasts`: Publicly invisible unless `is_published = true` and `can_user_access_broadcast()` resolves to true.
- `viewing_logs`: Only users can ping their own viewing logs; admins can audit all.

### Step 3: Initial Administrator Seed
Execute [`supabase/seed_initial_admin.sql`](../supabase/seed_initial_admin.sql).
This creates the initial platform administrator in `auth.users` with bcrypt-hashed credentials and links to `public.profiles`.

Default credentials seeded:
- **Username:** `padura_admin`
- **Email:** `admin@paduralive.local`
- **Password:** `PaduraAdmin@2026!Secure` *(change immediately after first login)*

---

## 3. Edge Functions Configuration

Both Edge Functions are located under `supabase/functions/`:

1. `bulk-import-students`:
   - Validates student number format (`XX/YYYY/NNN`)
   - Checks duplicates within the batch and existing database
   - Hashes passwords using Supabase Auth Admin API
   - Inserts linked records across `auth.users`, `public.profiles`, and `public.students`
   - Logs action to `public.admin_logs`
2. `manage-user`:
   - Handles individual student creation, parent creation, password resetting, status toggling, and deletion
   - Verifies caller has `admin` role before executing

### Local Testing with Supabase CLI
```bash
# Start local Supabase emulation (requires Docker)
supabase start

# Run Edge Functions locally
supabase functions serve --no-verify-jwt
```

### Production Deployment
```bash
supabase functions deploy bulk-import-students
supabase functions deploy manage-user
```
