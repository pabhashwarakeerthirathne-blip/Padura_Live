/**
 * PADURA LIVE - ADMINISTRATOR DASHBOARD CONTROLLER
 * Full Management Suite: Overview Analytics, Broadcast Management,
 * Student Management, Bulk CSV/XLSX Import, Parent Management, and Audit Logs.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce Admin Authentication
  const profile = await window.PaduraAuth.requireAuth(["admin"]);
  if (!profile) return;

  const client = window.getSupabaseClient();

  // Navigation Tabs Switching
  const navItems = document.querySelectorAll(".admin-sidebar .nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute("data-tab");

      navItems.forEach((n) => n.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.add("hidden"));

      item.classList.add("active");
      const activePane = document.getElementById(`tab-${targetTab}`);
      if (activePane) activePane.classList.remove("hidden");

      // Load specific tab data on demand
      if (targetTab === "overview") loadOverviewStats();
      if (targetTab === "broadcasts") loadBroadcasts();
      if (targetTab === "students") loadStudents();
      if (targetTab === "parents") loadParents();
      if (targetTab === "logs") loadAuditLogs();
    });
  });

  // ============================================================================
  // TAB 1: OVERVIEW ANALYTICS & RECENT ACTIVITY
  // ============================================================================
  async function loadOverviewStats() {
    try {
      // 1. Fetch total counts
      const { count: studentCount } = await client.from("students").select("*", { count: "exact", head: true });
      const { count: parentCount } = await client.from("parents").select("*", { count: "exact", head: true });
      const { count: adminCount } = await client.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin");
      const { count: activeCount } = await client.from("profiles").select("*", { count: "exact", head: true }).eq("status", "active");
      const { count: inactiveCount } = await client.from("profiles").select("*", { count: "exact", head: true }).eq("status", "inactive");

      // Update counters in UI
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? 0;
      };

      setVal("stat-total-students", studentCount);
      setVal("stat-total-parents", parentCount);
      setVal("stat-total-admins", adminCount);
      setVal("stat-active-accounts", activeCount);
      setVal("stat-inactive-accounts", inactiveCount);

      // 2. Fetch current live broadcast
      const { data: liveStream } = await client
        .from("broadcasts")
        .select("title, status, is_published, event_date")
        .eq("status", "live")
        .maybeSingle();

      const liveCardVal = document.getElementById("stat-live-broadcast-val");
      const liveCardSub = document.getElementById("stat-live-broadcast-sub");
      if (liveCardVal && liveCardSub) {
        if (liveStream) {
          liveCardVal.textContent = "ONLINE NOW";
          liveCardVal.style.color = "var(--live-red)";
          liveCardSub.textContent = `${liveStream.title} (${liveStream.is_published ? "Published" : "Unpublished"})`;
        } else {
          liveCardVal.textContent = "OFFLINE";
          liveCardVal.style.color = "var(--text-dim)";
          liveCardSub.textContent = "No active livestream broadcast";
        }
      }

      // 3. Fetch recent login logs
      const { data: recentLogins } = await client
        .from("login_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(6);

      const loginTableBody = document.getElementById("overview-recent-logins");
      if (loginTableBody) {
        if (!recentLogins || recentLogins.length === 0) {
          loginTableBody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-dim);">No login activity recorded.</td></tr>`;
        } else {
          loginTableBody.innerHTML = recentLogins
            .map(
              (l) => `
            <tr>
              <td><strong>${escapeHtml(l.username)}</strong></td>
              <td>
                <span class="badge ${l.status === "success" ? "badge-active" : "badge-inactive"}">
                  ${l.status.toUpperCase()}
                </span>
              </td>
              <td class="mono">${window.formatDateTime(l.timestamp)}</td>
              <td class="mono" style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(l.ip_address || "Web Client")}</td>
            </tr>
          `
            )
            .join("");
        }
      }

      // 4. Fetch recent admin audit logs
      const { data: recentAdminLogs } = await client
        .from("admin_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(6);

      const adminTableBody = document.getElementById("overview-recent-admin-logs");
      if (adminTableBody) {
        if (!recentAdminLogs || recentAdminLogs.length === 0) {
          adminTableBody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:var(--text-dim);">No administrative activity recorded.</td></tr>`;
        } else {
          adminTableBody.innerHTML = recentAdminLogs
            .map(
              (al) => `
            <tr>
              <td><span class="badge badge-upcoming mono">${escapeHtml(al.action)}</span></td>
              <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(JSON.stringify(al.details))}</td>
              <td class="mono">${window.formatDateTime(al.timestamp)}</td>
            </tr>
          `
            )
            .join("");
        }
      }
    } catch (err) {
      console.warn("Error loading overview stats:", err);
    }
  }

  // ============================================================================
  // TAB 2: BROADCAST MANAGEMENT
  // ============================================================================
  let allBroadcasts = [];

  async function loadBroadcasts() {
    try {
      const { data, error } = await client
        .from("broadcasts")
        .select("*")
        .order("event_date", { ascending: false });

      if (error) throw error;
      allBroadcasts = data || [];
      renderBroadcastsTable(allBroadcasts);
    } catch (err) {
      window.showToast("Failed to load broadcasts: " + err.message, "error");
    }
  }

  function renderBroadcastsTable(list) {
    const tbody = document.getElementById("broadcasts-table-body");
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem; color:var(--text-dim);">No broadcasts created yet. Click "Add Live Stream" above.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (b) => `
      <tr>
        <td>
          <div style="font-weight:700;">${escapeHtml(b.title)}</div>
          <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(b.description || "No description")}</div>
        </td>
        <td class="mono">
          <span style="color:#A78BFA;">${b.youtube_video_id}</span>
        </td>
        <td>
          <span class="badge ${
            b.status === "live" ? "badge-live" : b.status === "upcoming" ? "badge-upcoming" : "badge-ended"
          }">
            ${b.status === "live" ? '<span class="pulse-dot"></span>' : ""}${b.status.toUpperCase()}
          </span>
        </td>
        <td>
          <span class="badge ${b.is_published ? "badge-active" : "badge-inactive"}">
            ${b.is_published ? "PUBLISHED" : "DRAFT"}
          </span>
        </td>
        <td class="mono">${window.formatDateTime(b.event_date)}</td>
        <td>
          <div class="action-btns">
            ${
              b.status !== "live"
                ? `<button class="btn btn-sm btn-primary" onclick="setBroadcastLiveStatus('${b.id}', 'live')" title="Go Live">▶ Live</button>`
                : `<button class="btn btn-sm btn-danger" onclick="setBroadcastLiveStatus('${b.id}', 'ended')" title="End Live Stream">⏹ End</button>`
            }
            <button class="btn btn-sm btn-secondary" onclick="togglePublishBroadcast('${b.id}', ${!b.is_published})">
              ${b.is_published ? "Unpublish" : "Publish"}
            </button>
            <button class="btn btn-sm btn-secondary" onclick="openEditBroadcastModal('${b.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteBroadcast('${b.id}')">Del</button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  }

  // Live Stream URL Validation on input
  const youtubeUrlInput = document.getElementById("broadcast-yt-url");
  const extractedIdPreview = document.getElementById("broadcast-extracted-id-preview");

  if (youtubeUrlInput && extractedIdPreview) {
    youtubeUrlInput.addEventListener("input", () => {
      const vidId = window.extractYouTubeVideoId(youtubeUrlInput.value);
      if (vidId) {
        extractedIdPreview.innerHTML = `✓ Valid YouTube Video ID: <strong style="color:#A78BFA;">${vidId}</strong>`;
        extractedIdPreview.style.color = "var(--success)";
      } else if (youtubeUrlInput.value.trim().length > 0) {
        extractedIdPreview.innerHTML = `✗ Invalid YouTube URL or Video ID.`;
        extractedIdPreview.style.color = "var(--live-red)";
      } else {
        extractedIdPreview.innerHTML = "";
      }
    });
  }

  // Save / Add Broadcast Form
  const broadcastForm = document.getElementById("broadcast-form");
  if (broadcastForm) {
    broadcastForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const broadcastId = document.getElementById("broadcast-id-input").value;
      const title = document.getElementById("broadcast-title").value.trim();
      const description = document.getElementById("broadcast-desc").value.trim();
      const ytUrl = document.getElementById("broadcast-yt-url").value.trim();
      const eventDate = document.getElementById("broadcast-date").value;
      const status = document.getElementById("broadcast-status-select").value;
      const isPublished = document.getElementById("broadcast-publish-toggle").checked;
      const accessType = document.getElementById("broadcast-access-type").value;
      const academicYearsSelected = Array.from(
        document.querySelectorAll('input[name="access_years"]:checked')
      ).map((el) => parseInt(el.value, 10));

      const videoId = window.extractYouTubeVideoId(ytUrl);
      if (!videoId) {
        window.showToast("Please enter a valid YouTube Live Stream URL or Video ID.", "error");
        return;
      }

      try {
        const payload = {
          title,
          description,
          youtube_url: ytUrl,
          youtube_video_id: videoId,
          event_date: eventDate ? new Date(eventDate).toISOString() : new Date().toISOString(),
          status,
          is_published: isPublished,
          access_type: accessType,
          created_by: profile.id,
        };

        if (broadcastId) {
          // Update
          const { error } = await client.from("broadcasts").update(payload).eq("id", broadcastId);
          if (error) throw error;
          window.showToast("Broadcast updated successfully!", "success");
        } else {
          // Insert
          const { data: newBroadcast, error } = await client
            .from("broadcasts")
            .insert(payload)
            .select()
            .single();
          if (error) throw error;

          // If restricted to specific academic years, insert access records
          if (accessType === "academic_year" && academicYearsSelected.length > 0) {
            const accessRows = academicYearsSelected.map((year) => ({
              broadcast_id: newBroadcast.id,
              academic_year: year,
            }));
            await client.from("broadcast_access").insert(accessRows);
          }

          window.showToast("Live stream added successfully!", "success");
        }

        // Close modal and reload
        closeModal("modal-broadcast");
        broadcastForm.reset();
        extractedIdPreview.innerHTML = "";
        await loadBroadcasts();
      } catch (err) {
        window.showToast(err.message, "error");
      }
    });
  }

  // Global window functions for broadcast row actions
  window.setBroadcastLiveStatus = async (id, status) => {
    try {
      // If setting to live, first ensure no other stream is marked live
      if (status === "live") {
        await client.from("broadcasts").update({ status: "ended" }).eq("status", "live");
      }
      const { error } = await client.from("broadcasts").update({ status }).eq("id", id);
      if (error) throw error;
      window.showToast(`Broadcast status changed to ${status.toUpperCase()}`, "success");
      await loadBroadcasts();
    } catch (err) {
      window.showToast(err.message, "error");
    }
  };

  window.togglePublishBroadcast = async (id, isPublished) => {
    try {
      const { error } = await client.from("broadcasts").update({ is_published: isPublished }).eq("id", id);
      if (error) throw error;
      window.showToast(`Broadcast ${isPublished ? "published" : "unpublished"}!`, "success");
      await loadBroadcasts();
    } catch (err) {
      window.showToast(err.message, "error");
    }
  };

  window.deleteBroadcast = async (id) => {
    if (!confirm("Are you sure you want to permanently delete this broadcast?")) return;
    try {
      const { error } = await client.from("broadcasts").delete().eq("id", id);
      if (error) throw error;
      window.showToast("Broadcast deleted.", "success");
      await loadBroadcasts();
    } catch (err) {
      window.showToast(err.message, "error");
    }
  };

  window.openEditBroadcastModal = (id) => {
    const item = allBroadcasts.find((b) => b.id === id);
    if (!item) return;

    document.getElementById("modal-broadcast-title").textContent = "Edit Live Stream Broadcast";
    document.getElementById("broadcast-id-input").value = item.id;
    document.getElementById("broadcast-title").value = item.title;
    document.getElementById("broadcast-desc").value = item.description || "";
    document.getElementById("broadcast-yt-url").value = item.youtube_url;
    document.getElementById("broadcast-status-select").value = item.status;
    document.getElementById("broadcast-publish-toggle").checked = item.is_published;
    document.getElementById("broadcast-access-type").value = item.access_type;

    if (item.event_date) {
      const localIso = new Date(item.event_date).toISOString().slice(0, 16);
      document.getElementById("broadcast-date").value = localIso;
    }

    openModal("modal-broadcast");
  };

  // ============================================================================
  // TAB 3: STUDENT MANAGEMENT
  // ============================================================================
  let allStudents = [];

  async function loadStudents() {
    try {
      const { data, error } = await client
        .from("students")
        .select(`
          id,
          student_number,
          academic_year,
          profiles:id (
            username,
            full_name,
            status,
            created_at
          )
        `)
        .order("student_number", { ascending: true });

      if (error) throw error;
      allStudents = (data || []).map((s) => ({
        id: s.id,
        student_number: s.student_number,
        academic_year: s.academic_year,
        username: s.profiles?.username || "N/A",
        full_name: s.profiles?.full_name || "N/A",
        status: s.profiles?.status || "active",
        created_at: s.profiles?.created_at,
      }));

      renderStudentsTable(allStudents);
    } catch (err) {
      window.showToast("Failed to load students: " + err.message, "error");
    }
  }

  function renderStudentsTable(list) {
    const tbody = document.getElementById("students-table-body");
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem; color:var(--text-dim);">No students found.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (s) => `
      <tr>
        <td class="mono" style="font-weight:700; color:#A78BFA;">${s.student_number}</td>
        <td><strong>${escapeHtml(s.full_name)}</strong></td>
        <td class="mono">${escapeHtml(s.username)}</td>
        <td class="mono">Year ${s.academic_year}</td>
        <td>
          <span class="badge ${s.status === "active" ? "badge-active" : "badge-inactive"}">
            ${s.status.toUpperCase()}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-secondary" onclick="openResetPasswordModal('${s.id}', '${escapeHtml(s.full_name)}')">Reset PW</button>
            <button class="btn btn-sm ${s.status === "active" ? "btn-danger" : "btn-primary"}" onclick="toggleUserStatus('${s.id}', '${s.status === "active" ? "inactive" : "active"}')">
              ${s.status === "active" ? "Deactivate" : "Activate"}
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser('${s.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  }

  // Student Search and Academic Year Filter
  const studentSearchInput = document.getElementById("search-students");
  const studentYearFilter = document.getElementById("filter-student-year");
  const studentStatusFilter = document.getElementById("filter-student-status");

  function filterStudents() {
    const query = (studentSearchInput?.value || "").toLowerCase().trim();
    const yearVal = studentYearFilter?.value || "ALL";
    const statusVal = studentStatusFilter?.value || "ALL";

    const filtered = allStudents.filter((s) => {
      const matchQuery =
        s.student_number.toLowerCase().includes(query) ||
        s.full_name.toLowerCase().includes(query) ||
        s.username.toLowerCase().includes(query);
      const matchYear = yearVal === "ALL" || String(s.academic_year) === yearVal;
      const matchStatus = statusVal === "ALL" || s.status === statusVal;
      return matchQuery && matchYear && matchStatus;
    });

    renderStudentsTable(filtered);
  }

  if (studentSearchInput) studentSearchInput.addEventListener("input", filterStudents);
  if (studentYearFilter) studentYearFilter.addEventListener("change", filterStudents);
  if (studentStatusFilter) studentStatusFilter.addEventListener("change", filterStudents);

  // Add Individual Student Form
  const individualStudentForm = document.getElementById("individual-student-form");
  if (individualStudentForm) {
    individualStudentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const studentNumber = document.getElementById("indiv-student-number").value.trim().toUpperCase();
      const username = document.getElementById("indiv-student-username").value.trim().toLowerCase();
      const fullName = document.getElementById("indiv-student-name").value.trim();
      const academicYear = parseInt(document.getElementById("indiv-student-year").value, 10);
      const password = document.getElementById("indiv-student-password").value.trim();

      if (!window.isValidStudentNumber(studentNumber)) {
        window.showToast("Invalid student number format. Expected format: XX/YYYY/NNN (e.g. PS/2023/174)", "error");
        return;
      }

      try {
        const { data: { session } } = await client.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(window.PADURA_CONFIG.EDGE_MANAGE_USER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "create_student",
            studentNumber,
            username,
            fullName,
            academicYear,
            password,
          }),
        });

        const resData = await response.json();
        if (!response.ok || resData.error) {
          throw new Error(resData.error || "Failed to create student account.");
        }

        window.showToast("Student account created successfully!", "success");
        closeModal("modal-individual-student");
        individualStudentForm.reset();
        await loadStudents();
      } catch (err) {
        window.showToast(err.message, "error");
      }
    });
  }

  // ============================================================================
  // TAB 4: BULK CSV & EXCEL (.XLSX) IMPORT
  // ============================================================================
  let parsedBulkRecords = [];
  let importErrors = [];

  const dropzone = document.getElementById("bulk-dropzone");
  const fileInput = document.getElementById("bulk-file-input");
  const fileInfo = document.getElementById("bulk-file-info");
  const fileNameDisplay = document.getElementById("bulk-file-name");
  const previewContainer = document.getElementById("bulk-preview-container");
  const previewTbody = document.getElementById("bulk-preview-tbody");
  const startImportBtn = document.getElementById("btn-start-bulk-import");
  const progressContainer = document.getElementById("bulk-progress-container");
  const progressBar = document.getElementById("bulk-progress-bar");
  const progressText = document.getElementById("bulk-progress-text");
  const resultsContainer = document.getElementById("bulk-results-container");

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleBulkFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleBulkFile(e.target.files[0]);
      }
    });
  }

  async function handleBulkFile(file) {
    if (!file) return;
    fileNameDisplay.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    fileInfo.classList.remove("hidden");
    resultsContainer.classList.add("hidden");
    progressContainer.classList.add("hidden");

    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      const text = await file.text();
      parseCSVContent(text);
    } else if (ext === "xlsx" || ext === "xls") {
      // Check if SheetJS is available
      if (window.XLSX) {
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonData = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
        parseSheetJSContent(jsonData);
      } else {
        window.showToast("Excel reader library loading... please try again in a second.", "info");
      }
    } else {
      window.showToast("Unsupported file type. Please upload a .csv or .xlsx file.", "error");
    }
  }

  function parseCSVContent(csvText) {
    const lines = csvText.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      window.showToast("Uploaded file is empty or missing headers.", "error");
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      // Split with comma awareness
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 4) continue;

      records.push({
        studentNumber: cols[0] || "",
        username: cols[1] || "",
        password: cols[2] || "",
        fullName: cols[3] || "",
        academicYear: cols[4] || "",
      });
    }

    validateAndPreviewBulk(records);
  }

  function parseSheetJSContent(rows) {
    if (!rows || rows.length < 2) {
      window.showToast("Excel spreadsheet is empty or has no data rows.", "error");
      return;
    }

    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      records.push({
        studentNumber: String(row[0] || "").trim(),
        username: String(row[1] || "").trim(),
        password: String(row[2] || "").trim(),
        fullName: String(row[3] || "").trim(),
        academicYear: String(row[4] || "").trim(),
      });
    }

    validateAndPreviewBulk(records);
  }

  function validateAndPreviewBulk(records) {
    parsedBulkRecords = [];
    const seenNumbers = new Set();
    const seenUsernames = new Set();

    records.forEach((rec, idx) => {
      const rowNum = idx + 2;
      const num = rec.studentNumber.toUpperCase();
      const user = rec.username.toLowerCase();
      let status = "VALID";
      let errorReason = "";

      if (!num || !user || !rec.fullName || !rec.academicYear) {
        status = "INVALID";
        errorReason = "Missing required fields";
      } else if (!window.isValidStudentNumber(num)) {
        status = "INVALID";
        errorReason = "Invalid format (Expected XX/YYYY/NNN)";
      } else if (seenNumbers.has(num)) {
        status = "DUPLICATE";
        errorReason = "Duplicate student number in file";
      } else if (seenUsernames.has(user)) {
        status = "DUPLICATE";
        errorReason = "Duplicate username in file";
      }

      seenNumbers.add(num);
      seenUsernames.add(user);

      parsedBulkRecords.push({
        ...rec,
        studentNumber: num,
        username: user,
        rowNum,
        status,
        errorReason,
      });
    });

    // Render Preview
    previewContainer.classList.remove("hidden");
    const previewSlice = parsedBulkRecords.slice(0, 15);

    previewTbody.innerHTML = previewSlice
      .map(
        (r) => `
      <tr>
        <td class="mono">${r.rowNum}</td>
        <td class="mono" style="font-weight:700;">${r.studentNumber}</td>
        <td class="mono">${r.username}</td>
        <td>${escapeHtml(r.fullName)}</td>
        <td class="mono">${r.academicYear}</td>
        <td>
          <span class="badge ${
            r.status === "VALID" ? "badge-active" : r.status === "DUPLICATE" ? "badge-upcoming" : "badge-inactive"
          }">
            ${r.status}
          </span>
          ${r.errorReason ? `<div style="font-size:0.7rem; color:#F87171; margin-top:2px;">${r.errorReason}</div>` : ""}
        </td>
      </tr>
    `
      )
      .join("");

    const validCount = parsedBulkRecords.filter((r) => r.status === "VALID").length;
    const invalidCount = parsedBulkRecords.length - validCount;

    document.getElementById("bulk-preview-summary").textContent = `Found ${parsedBulkRecords.length} records (${validCount} valid, ${invalidCount} invalid/duplicate)`;
  }

  // Execute Bulk Import
  if (startImportBtn) {
    startImportBtn.addEventListener("click", async () => {
      const validRows = parsedBulkRecords.filter((r) => r.status === "VALID");
      if (validRows.length === 0) {
        window.showToast("No valid rows to import.", "warning");
        return;
      }

      startImportBtn.disabled = true;
      progressContainer.classList.remove("hidden");
      progressBar.style.width = "10%";
      progressText.textContent = "Authenticating and sending batch to secure Edge engine...";

      try {
        const { data: { session } } = await client.auth.getSession();
        const token = session?.access_token;

        progressBar.style.width = "40%";

        const response = await fetch(window.PADURA_CONFIG.EDGE_BULK_IMPORT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            students: validRows,
          }),
        });

        progressBar.style.width = "85%";
        const result = await response.json();

        progressBar.style.width = "100%";
        progressText.textContent = "Import complete!";

        if (!response.ok || result.error) {
          throw new Error(result.error || "Edge bulk import failed.");
        }

        // Show Results
        resultsContainer.classList.remove("hidden");
        document.getElementById("bulk-stat-total").textContent = validRows.length;
        document.getElementById("bulk-stat-success").textContent = result.successCount || 0;
        document.getElementById("bulk-stat-failed").textContent = result.failedCount || 0;

        importErrors = result.failed || [];
        const dlErrorBtn = document.getElementById("btn-download-error-report");
        if (dlErrorBtn) {
          dlErrorBtn.style.display = importErrors.length > 0 ? "inline-flex" : "none";
        }

        window.showToast(`Imported ${result.successCount} student accounts successfully!`, "success");
        await loadStudents();
      } catch (err) {
        window.showToast(err.message, "error");
        progressText.textContent = "Error: " + err.message;
      } finally {
        startImportBtn.disabled = false;
      }
    });
  }

  // Download Error Report CSV
  const downloadErrorBtn = document.getElementById("btn-download-error-report");
  if (downloadErrorBtn) {
    downloadErrorBtn.addEventListener("click", () => {
      if (importErrors.length === 0) return;
      let csvContent = "Student Number,Username,Failure Reason\n";
      importErrors.forEach((e) => {
        csvContent += `"${e.studentNumber}","${e.username}","${(e.reason || "").replace(/"/g, '""')}"\n`;
      });
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `padura_import_errors_${Date.now()}.csv`;
      a.click();
    });
  }

  // ============================================================================
  // TAB 5: PARENT MANAGEMENT
  // ============================================================================
  let allParents = [];

  async function loadParents() {
    try {
      const { data, error } = await client
        .from("parents")
        .select(`
          id,
          phone,
          notes,
          profiles:id (
            username,
            full_name,
            status,
            created_at
          ),
          parent_students (
            students:student_id (
              id,
              student_number,
              profiles:id (
                full_name
              )
            )
          )
        `);

      if (error) throw error;
      allParents = (data || []).map((p) => ({
        id: p.id,
        phone: p.phone,
        notes: p.notes,
        username: p.profiles?.username || "N/A",
        full_name: p.profiles?.full_name || "N/A",
        status: p.profiles?.status || "active",
        linkedStudents: (p.parent_students || []).map((ps) => ({
          id: ps.students.id,
          student_number: ps.students.student_number,
          full_name: ps.students.profiles?.full_name || "",
        })),
      }));

      renderParentsTable(allParents);
    } catch (err) {
      window.showToast("Failed to load parents: " + err.message, "error");
    }
  }

  function renderParentsTable(list) {
    const tbody = document.getElementById("parents-table-body");
    if (!tbody) return;

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 2rem; color:var(--text-dim);">No parent accounts created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (p) => `
      <tr>
        <td>
          <strong>${escapeHtml(p.full_name)}</strong>
          <div class="mono" style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(p.username)}</div>
        </td>
        <td class="mono">${escapeHtml(p.phone || "N/A")}</td>
        <td>
          <div style="display:flex; flex-wrap:wrap; gap:0.35rem;">
            ${
              p.linkedStudents.length === 0
                ? '<span style="color:var(--text-dim); font-size:0.75rem;">None</span>'
                : p.linkedStudents
                    .map(
                      (s) => `<span class="badge badge-upcoming mono" title="${escapeHtml(s.full_name)}">${s.student_number}</span>`
                    )
                    .join("")
            }
          </div>
        </td>
        <td>
          <span class="badge ${p.status === "active" ? "badge-active" : "badge-inactive"}">
            ${p.status.toUpperCase()}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-secondary" onclick="openResetPasswordModal('${p.id}', '${escapeHtml(p.full_name)}')">Reset PW</button>
            <button class="btn btn-sm ${p.status === "active" ? "btn-danger" : "btn-primary"}" onclick="toggleUserStatus('${p.id}', '${p.status === "active" ? "inactive" : "active"}')">
              ${p.status === "active" ? "Deactivate" : "Activate"}
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser('${p.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");
  }

  // Add Parent Form
  const addParentForm = document.getElementById("add-parent-form");
  if (addParentForm) {
    addParentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("parent-username").value.trim().toLowerCase();
      const fullName = document.getElementById("parent-name").value.trim();
      const phone = document.getElementById("parent-phone").value.trim();
      const password = document.getElementById("parent-password").value.trim();
      const notes = document.getElementById("parent-notes").value.trim();
      const studentNumbersInput = document.getElementById("parent-assign-students").value.trim();

      // Resolve student numbers to student IDs
      const rawNumbers = studentNumbersInput
        .split(",")
        .map((n) => n.trim().toUpperCase())
        .filter((n) => n.length > 0);

      const matchedStudentIds = [];
      for (const num of rawNumbers) {
        const found = allStudents.find((s) => s.student_number === num);
        if (found) matchedStudentIds.push(found.id);
      }

      try {
        const { data: { session } } = await client.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(window.PADURA_CONFIG.EDGE_MANAGE_USER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "create_parent",
            username,
            fullName,
            phone,
            password,
            notes,
            studentIds: matchedStudentIds,
          }),
        });

        const resData = await response.json();
        if (!response.ok || resData.error) {
          throw new Error(resData.error || "Failed to create parent account.");
        }

        window.showToast("Parent account created successfully!", "success");
        closeModal("modal-add-parent");
        addParentForm.reset();
        await loadParents();
      } catch (err) {
        window.showToast(err.message, "error");
      }
    });
  }

  // ============================================================================
  // TAB 6: AUDIT LOGS
  // ============================================================================
  async function loadAuditLogs() {
    try {
      const { data: adminLogs } = await client
        .from("admin_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(20);

      const adminTbody = document.getElementById("full-admin-logs-tbody");
      if (adminTbody) {
        adminTbody.innerHTML = (adminLogs || [])
          .map(
            (al) => `
          <tr>
            <td class="mono">${window.formatDateTime(al.timestamp)}</td>
            <td><span class="badge badge-upcoming mono">${escapeHtml(al.action)}</span></td>
            <td style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-mono);">${escapeHtml(JSON.stringify(al.details))}</td>
          </tr>
        `
          )
          .join("");
      }
    } catch (err) {
      console.warn("Could not load audit logs:", err);
    }
  }

  // ============================================================================
  // SHARED USER MANAGEMENT ACTIONS (Reset PW, Toggle Status, Delete)
  // ============================================================================
  let activeResetUserId = null;

  window.openResetPasswordModal = (userId, userName) => {
    activeResetUserId = userId;
    document.getElementById("reset-pw-user-name").textContent = userName;
    document.getElementById("reset-pw-input").value = "";
    openModal("modal-reset-password");
  };

  const resetPwForm = document.getElementById("reset-password-form");
  if (resetPwForm) {
    resetPwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById("reset-pw-input").value.trim();
      if (!activeResetUserId || newPassword.length < 6) {
        window.showToast("Password must be at least 6 characters.", "warning");
        return;
      }

      try {
        const { data: { session } } = await client.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(window.PADURA_CONFIG.EDGE_MANAGE_USER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "reset_password",
            targetUserId: activeResetUserId,
            newPassword,
          }),
        });

        const resData = await response.json();
        if (!response.ok || resData.error) throw new Error(resData.error);

        window.showToast("User password successfully reset!", "success");
        closeModal("modal-reset-password");
      } catch (err) {
        window.showToast(err.message, "error");
      }
    });
  }

  window.toggleUserStatus = async (userId, targetStatus) => {
    if (!confirm(`Are you sure you want to set this account to ${targetStatus.toUpperCase()}?`)) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(window.PADURA_CONFIG.EDGE_MANAGE_USER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "toggle_status",
          targetUserId: userId,
          status: targetStatus,
        }),
      });

      const resData = await response.json();
      if (!response.ok || resData.error) throw new Error(resData.error);

      window.showToast(`Account set to ${targetStatus}!`, "success");
      await loadStudents();
      await loadParents();
    } catch (err) {
      window.showToast(err.message, "error");
    }
  };

  window.deleteUser = async (userId) => {
    if (!confirm("Are you sure you want to permanently delete this user? This cannot be undone.")) return;

    try {
      const { data: { session } } = await client.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(window.PADURA_CONFIG.EDGE_MANAGE_USER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "delete_user",
          targetUserId: userId,
        }),
      });

      const resData = await response.json();
      if (!response.ok || resData.error) throw new Error(resData.error);

      window.showToast("User deleted.", "success");
      await loadStudents();
      await loadParents();
    } catch (err) {
      window.showToast(err.message, "error");
    }
  };

  // Helper Modal Utilities
  window.openModal = (id) => {
    const m = document.getElementById(id);
    if (m) m.classList.add("open");
  };

  window.closeModal = (id) => {
    const m = document.getElementById(id);
    if (m) m.classList.remove("open");
  };

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Bind logout button
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => window.PaduraAuth.logout());
  }

  // Initial Load
  loadOverviewStats();
});
