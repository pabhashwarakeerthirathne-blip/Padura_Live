# PADURA LIVE – ADMINISTRATOR OPERATIONS MANUAL

Welcome to the **PADURA LIVE** Administrator Handbook. This manual provides instructions for configuring livestreams, managing undergraduate accounts, onboarding parents, and monitoring security.

---

## 1. Accessing the Administrator Portal

1. Open your browser and navigate to the application URL:
   `https://padura-live.pages.dev/login.html` (or your custom domain).
2. Click the **"Admin"** tab on the role selector.
3. Enter your administrator username (`padura_admin`) and your secure password.
4. Upon successful authentication, you will be redirected to `admin-dashboard.html`.

> **Note:** Administrator accounts cannot be created through public self-registration. They can only be provisioned through the database setup script or Supabase Studio.

---

## 2. Live Broadcast Management

Administrators can switch, schedule, or modify the active livestream at any time **without touching any website source code**.

### Adding a New Livestream:
1. In the sidebar, select **"Live Broadcasts"**.
2. Click the **"Add Live Stream"** button.
3. Fill in the broadcast details:
   - **Broadcast Title:** Name of the event (e.g., *Padura 2026 Opening Ceremony*).
   - **Description:** Timetable, guidelines, or details.
   - **YouTube Live Stream URL or Video ID:** Paste any valid YouTube link (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, `https://youtu.be/dQw4w9WgXcQ`, or `https://www.youtube.com/live/dQw4w9WgXcQ`).
     - *The system automatically extracts and validates the 11-character YouTube Video ID in real time.*
   - **Scheduled Date & Time:** Select the target start time.
   - **Broadcast Status:**
     - `Draft`: Not broadcasted yet.
     - `Upcoming`: Scheduled; displayed in the student/parent upcoming schedule.
     - `Live Now`: Currently streaming. The custom video player will automatically mount this stream.
     - `Ended`: Broadcast concluded.
   - **Audience Access:** Choose **All Academic Years** or restrict access to specific academic cohorts (e.g., Year 2023, Year 2024).
   - **Publish Toggle:** Keep checked to make the stream visible to students and parents.
4. Click **"Save Broadcast"**.

### Quick Broadcast Controls:
- **▶ Live:** Instantly switches the broadcast status to `live`. Any previously active live stream is safely retired to `ended`.
- **⏹ End:** Concludes the livestream.
- **Publish / Unpublish:** Toggles visibility on the student and parent dashboards.

> **YouTube Streaming Checklist:**
> 1. In YouTube Studio, set your livestream visibility to **Unlisted**.
> 2. Under Stream Settings, ensure **"Allow embedding"** is enabled (otherwise the YouTube player will return an embedding restriction error).
> 3. If you want viewers to rewind and seek through the event, enable **DVR** in YouTube Studio stream options.

---

## 3. Student Account Management

### Student Registration Number Format:
The university registration number follows the strict format:
`XX/YYYY/NNN`
- `XX`: Any two uppercase English letters (e.g., `PS`, `SC`, `ST`, `EG`, `MD`).
- `YYYY`: 4-digit academic year (e.g., `2023`, `2024`, `2025`).
- `NNN`: Registration sequence number.
- *Examples:* `PS/2023/174`, `SC/2024/021`, `ST/2025/105`.

### Adding an Individual Student:
1. Go to **"Student Accounts"** in the sidebar.
2. Click **"Add Student"**.
3. Fill in the student registration number, full name, username, academic year, and temporary password.
4. Click **"Create Student Account"**.

### Managing Existing Students:
- **Search & Filter:** Search by registration number or student name; filter by academic year or account status.
- **Reset Password:** Click **"Reset PW"** to assign a new password immediately.
- **Deactivate / Activate:** Toggle access. Deactivated accounts are blocked from logging in or viewing streams.
- **Delete:** Permanently remove an account.

---

## 4. Bulk Student Registration (CSV & Excel)

For batch onboarding large university cohorts:

1. In the sidebar, select **"Bulk Registration"**.
2. Download the sample template by clicking **"Download Sample CSV Template"** or prepare an Excel `.xlsx` / `.csv` file.

### Required Column Headers:
| Student Number | Username | Password | Full Name | Academic Year |
|---|---|---|---|---|
| PS/2023/174 | ps2023174 | Temporary123 | Student One | 2023 |
| PS/2023/175 | ps2023175 | Temporary456 | Student Two | 2023 |
| SC/2024/021 | sc2024021 | Temporary789 | Student Three | 2024 |

### Upload & Validation Workflow:
1. Drag and drop the file into the upload zone or click to browse.
2. The platform performs instant pre-import validation:
   - Validates student number regex (`^[A-Z]{2}/[0-9]{4}/[0-9]+$`).
   - Checks for duplicate student numbers within the file.
   - Checks for duplicate usernames within the file.
   - Identifies any missing columns or rows.
3. Inspect the **File Data Preview** table. Invalid or duplicate rows are highlighted in red/amber with explicit error explanations.
4. Click **"Start Account Creation"**.
5. The system communicates with the secure Supabase Edge Function to hash passwords and create user records in batches.
6. Upon completion, a metrics summary appears displaying total processed, created accounts, and failed rows.
7. If any rows failed (e.g., student number already registered in database), click **"Download Error Report (.csv)"** to inspect and rectify.

---

## 5. Parent Account Management

Parents are provisioned with dedicated login credentials and can be linked to one or multiple students.

### Creating a Parent Account:
1. Go to **"Parent Accounts"** in the sidebar.
2. Click **"Add Parent Account"**.
3. Fill in the parent full name, username, contact phone number, and password.
4. In **Assign Student Numbers**, enter comma-separated student registration numbers (e.g., `PS/2023/174, SC/2024/021`).
5. Click **"Create Parent Account"**.

Parents only have access to streams authorized for their linked students.

---

## 6. Anti-Recording Deterrents & Security Measures

Padura Live implements multiple layers of anti-piracy deterrence:

1. **Dynamic Moving Watermark:**
   - Overlaid directly above the video player container (and visible in fullscreen mode).
   - Displays the logged-in student's registration number (e.g., `PADURA LIVE | PS/2023/174 | PRIVATE VIEWING`).
   - Automatically jumps to random quadrants of the player every 20 seconds.
2. **Context Menu & Shortcut Blocking:**
   - Disables right-click context menus on the video player and interface.
   - Intercepts common shortcuts (`Ctrl+S`, `Ctrl+U`).
3. **Hidden Stream URLs:**
   - The YouTube unlisted URL is never displayed in the frontend markup or user controls.
4. **Active Heartbeat Auditing:**
   - The player sends a 30-second ping to `public.viewing_logs` to maintain an audit trail of active viewers.
5. **Inactivity Auto-Logout:**
   - Sessions automatically expire after 15 minutes of inactivity.

> **Important Security Disclosure:**
> As YouTube Unlisted streams are not DRM-encrypted, web-based deterrents cannot technically prevent external hardware capture cards (HDMI capture), operating system screen recorders (OBS), or physical cameras pointed at a display. The watermarking mechanism acts as a legal deterrent by embedding identity indicators into any leaked recording.
