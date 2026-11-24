# PADURA LIVE – PRODUCTION DEPLOYMENT GUIDE (100% FREE TIER)

This guide walks you through deploying **PADURA LIVE** using completely free-tier services:
- **Frontend Hosting:** Cloudflare Pages (Free plan: Unlimited requests, unlimited bandwidth, global CDN)
- **Source Code Management:** GitHub (Free public/private repositories)
- **Database, Auth & Edge Functions:** Supabase (Free tier: 500 MB database, 50,000 monthly active users, 500,000 Edge Function invocations)
- **Live Video Streaming:** YouTube Live (Unlisted stream embedded via custom YouTube IFrame Player API)

---

## 1. Prerequisites
- A free [GitHub Account](https://github.com)
- A free [Supabase Account](https://supabase.com)
- A free [Cloudflare Account](https://dash.cloudflare.com)
- A Google/YouTube account with Live Streaming enabled

---

## 2. Step 1: Push Project to GitHub

1. Open your terminal or PowerShell and navigate to the project directory:
   ```bash
   cd "C:\Users\kavin\.gemini\antigravity\scratch\padura-live"
   ```
2. Initialize Git and commit the files:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of PADURA LIVE production application"
   ```
3. Create a new repository on GitHub named `padura-live` (Private or Public).
4. Link and push your local repository:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/padura-live.git
   git push -u origin main
   ```

---

## 3. Step 2: Set Up Supabase Project

1. Log in to [Supabase Dashboard](https://supabase.com/dashboard) and click **"New project"**.
2. Fill in:
   - **Name:** `Padura-Live`
   - **Database Password:** Enter a secure password and save it in a safe place.
   - **Region:** Choose the region closest to your audience (e.g., `Singapore` or `Frankfurt`).
   - **Pricing Plan:** Select **Free Tier ($0/month)**.
3. Once the database is provisioned (approx. 1-2 minutes):
   - Go to **Project Settings > API**.
   - Note down:
     - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
     - **anon / public key** (Client-safe API key)
     - **service_role key** (Secret server key – *never expose in client code*)

---

## 4. Step 3: Run Database Schema & Security Policies

1. In the Supabase Dashboard, click on **SQL Editor** in the left sidebar.
2. Click **"New query"**.
3. Copy the entire contents of [`supabase/schema.sql`](../supabase/schema.sql) and paste it into the editor.
4. Click **"Run"** (Ctrl+Enter). Confirm that all 10 tables, triggers, and helper functions are created.
5. Create another new query in the SQL Editor.
6. Copy the entire contents of [`supabase/rls_policies.sql`](../supabase/rls_policies.sql) and paste it into the editor.
7. Click **"Run"** to enforce strict Row Level Security on every table.

---

## 5. Step 4: Configure Supabase Authentication

1. Go to **Authentication > Providers** in the Supabase Dashboard.
2. Ensure **Email** is enabled.
3. Under **Authentication > URL Configuration**:
   - Set **Site URL** to your Cloudflare Pages domain (e.g., `https://padura-live.pages.dev` or `http://localhost:3000` during testing).
4. Under **Authentication > General**:
   - Turn **OFF** "Allow new users to sign up" (preventing unauthorized public self-registration). User creation is handled exclusively by administrators.

---

## 6. Step 5: Seed the First Administrator Account

1. In Supabase Dashboard, open the **SQL Editor**.
2. Open [`supabase/seed_initial_admin.sql`](../supabase/seed_initial_admin.sql).
3. If desired, customize the initial credentials:
   - `v_admin_username := 'padura_admin';`
   - `v_admin_password := 'YourStrongAdminPassword!2026';`
   - `v_admin_email := 'admin@paduralive.local';`
4. Click **"Run"**.
5. Your first administrator is now created securely with bcrypt hashing in Supabase Auth and registered in `public.profiles` with `role = 'admin'`.

---

## 7. Step 6: Deploy Edge Functions

For bulk student creation and administrative account management using the service role key on the secure edge:

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```
2. Log in and link your project:
   ```bash
   supabase login
   supabase link --project-ref your-project-id
   ```
3. Deploy both Edge Functions:
   ```bash
   supabase functions deploy bulk-import-students
   supabase functions deploy manage-user
   ```
4. Set the function secrets (automatically provided in Supabase Edge environment, or verify via):
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

---

## 8. Step 7: Configure Frontend Credentials

Open [`assets/js/config.js`](../assets/js/config.js) and update the credentials with your actual project keys:

```javascript
window.PADURA_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  // ...
};
```

Commit and push this change to GitHub:
```bash
git add assets/js/config.js
git commit -m "Configure production Supabase URL and anon key"
git push origin main
```

*(Note: Users can also configure this dynamically in the browser via the "Configure Supabase API Keys" link on `login.html`)*.

---

## 9. Step 8: Deploy to Cloudflare Pages (Free Tier)

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Go to **Workers & Pages > Create application > Pages > Connect to Git**.
3. Select your GitHub account and choose the `padura-live` repository.
4. Set up deployment details:
   - **Project Name:** `padura-live`
   - **Production Branch:** `main`
   - **Framework Preset:** `None` (Static HTML/JS/CSS)
   - **Build command:** *(Leave empty)*
   - **Build output directory:** `.` (or root directory)
5. Click **"Save and Deploy"**.
6. Cloudflare Pages will build and deploy the application within 15 seconds.
7. You will receive a free `*.pages.dev` subdomain (e.g., `https://padura-live.pages.dev`).

---

## 10. Step 9: Post-Deployment Verification

1. Navigate to `https://padura-live.pages.dev/login.html`.
2. Sign in with the administrator credentials seeded in Step 5 (`padura_admin`).
3. Verify navigation to `admin-dashboard.html`.
4. Go to the **Live Broadcasts** tab:
   - Click **"Add Live Stream"**.
   - Paste an unlisted YouTube Live URL (e.g. `https://www.youtube.com/watch?v=YOUR_VIDEO_ID`).
   - Set status to **Live Now** and check **Publish**.
   - Click **Save**.
5. Go to the **Bulk Registration** tab:
   - Drag and drop `sample_students.csv`.
   - Preview the validated rows and click **Start Account Creation**.
6. Open an incognito browser window, navigate to `https://padura-live.pages.dev/login.html`, and log in as `ps2023174`.
7. Verify that the Student Portal opens, the YouTube stream plays inside the custom player, and the dynamic watermark (`PADURA LIVE | PS/2023/174 | PRIVATE VIEWING`) moves smoothly across the screen.

---

## 11. Free-Tier Quota Reference & Limitations

| Service | Free Tier Limit | Production Impact & Best Practices |
|---|---|---|
| **Cloudflare Pages** | Unlimited bandwidth, 500 builds/month | Completely sufficient for high-volume video viewer traffic as video streams are served via YouTube CDN. |
| **Supabase Database** | 500 MB PostgreSQL storage | Stores tens of thousands of student records and audit logs. Periodically prune old viewing logs if needed. |
| **Supabase Auth** | 50,000 monthly active users | More than sufficient for university student body and parents. |
| **Supabase Edge Functions** | 500,000 requests/month | Used strictly for admin bulk creation and user management actions. |
| **YouTube Live** | Unlimited bandwidth | Zero streaming server costs. Use YouTube Live Unlisted stream mode with embedding enabled. |
