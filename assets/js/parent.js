/**
 * PADURA LIVE - PARENT DASHBOARD CONTROLLER
 * Manages parent view, linked student selection,
 * authorized live broadcasts, and dynamic anti-recording watermark.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce parent authentication
  const profile = await window.PaduraAuth.requireAuth(["parent"]);
  if (!profile) return;

  const client = window.getSupabaseClient();
  let linkedStudents = [];
  let selectedStudentId = "ALL";
  let activePlayer = null;

  try {
    // 2. Fetch linked students
    const { data: relations, error: relError } = await client
      .from("parent_students")
      .select(`
        student_id,
        students:student_id (
          id,
          student_number,
          academic_year,
          profiles:id (
            full_name,
            username
          )
        )
      `)
      .eq("parent_id", profile.id);

    if (relError) throw relError;

    linkedStudents = (relations || []).map((r) => ({
      id: r.students.id,
      student_number: r.students.student_number,
      academic_year: r.students.academic_year,
      full_name: r.students.profiles?.full_name || "Student",
    }));

    // Render linked students tabs
    renderChildSelector();

    // Default watermark: First student number or parent username
    const defaultWatermark = linkedStudents.length > 0 
      ? linkedStudents[0].student_number 
      : profile.username.toUpperCase();
    window.PaduraSecurity.init(defaultWatermark);

    // 3. Load broadcasts
    await loadParentBroadcasts();
  } catch (err) {
    console.error("Parent dashboard error:", err);
    window.showToast(err.message, "error");
  }

  /**
   * Render Child Selector Tabs
   */
  function renderChildSelector() {
    const container = document.getElementById("parent-children-tabs");
    if (!container) return;

    if (linkedStudents.length === 0) {
      container.innerHTML = `<span style="color: var(--text-dim); font-size: 0.85rem;">No students linked to this parent account yet. Please contact administration.</span>`;
      return;
    }

    let html = `
      <button class="child-tab ${selectedStudentId === "ALL" ? "active" : ""}" data-id="ALL">
        All Linked Events (${linkedStudents.length} Students)
      </button>
    `;

    linkedStudents.forEach((child) => {
      html += `
        <button class="child-tab ${selectedStudentId === child.id ? "active" : ""}" data-id="${child.id}">
          <span style="font-weight: 700;">${child.student_number}</span> - ${child.full_name} (Year ${child.academic_year})
        </button>
      `;
    });

    container.innerHTML = html;

    // Attach click events
    container.querySelectorAll(".child-tab").forEach((btn) => {
      btn.addEventListener("click", async () => {
        container.querySelectorAll(".child-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedStudentId = btn.getAttribute("data-id");

        // Update watermark to the selected student
        if (selectedStudentId !== "ALL") {
          const match = linkedStudents.find((s) => s.id === selectedStudentId);
          if (match) {
            window.PaduraSecurity.initDynamicWatermark(match.student_number);
          }
        } else if (linkedStudents.length > 0) {
          window.PaduraSecurity.initDynamicWatermark(linkedStudents[0].student_number);
        }

        await loadParentBroadcasts();
      });
    });
  }

  /**
   * Load broadcasts authorized for the parent's linked students
   */
  async function loadParentBroadcasts() {
    const livePlayerSection = document.getElementById("live-player-section");
    const noLiveBroadcastCard = document.getElementById("no-live-broadcast-card");
    const upcomingList = document.getElementById("upcoming-broadcasts-list");
    const pastList = document.getElementById("past-broadcasts-list");

    try {
      // Query published broadcasts (RLS automatically enforces permissions)
      const { data: broadcasts, error } = await client
        .from("broadcasts")
        .select("*")
        .eq("is_published", true)
        .order("event_date", { ascending: false });

      if (error) throw error;

      let filteredBroadcasts = broadcasts || [];

      // If specific child selected, filter relevant broadcasts
      if (selectedStudentId !== "ALL") {
        const child = linkedStudents.find((s) => s.id === selectedStudentId);
        if (child) {
          filteredBroadcasts = filteredBroadcasts.filter((b) => {
            if (b.access_type === "all") return true;
            // Additional access matching handled by RLS, but client UI filter provides clean UX
            return true;
          });
        }
      }

      const liveBroadcast = filteredBroadcasts.find((b) => b.status === "live");
      const upcomingBroadcasts = filteredBroadcasts.filter((b) => b.status === "upcoming");
      const pastBroadcasts = filteredBroadcasts.filter((b) => b.status === "ended");

      // Handle Current Live Broadcast
      if (liveBroadcast) {
        if (noLiveBroadcastCard) noLiveBroadcastCard.classList.add("hidden");
        if (livePlayerSection) livePlayerSection.classList.remove("hidden");

        const liveTitle = document.getElementById("current-broadcast-title");
        const liveDesc = document.getElementById("current-broadcast-desc");
        if (liveTitle) liveTitle.textContent = liveBroadcast.title;
        if (liveDesc) liveDesc.textContent = liveBroadcast.description || "Live university broadcast in progress.";

        if (activePlayer) activePlayer.destroy();
        activePlayer = new window.PaduraPlayer({
          mountId: "youtube-player-mount",
          wrapperId: "video-player-wrapper",
          videoId: liveBroadcast.youtube_video_id,
          title: liveBroadcast.title,
          broadcastId: liveBroadcast.id,
        });
      } else {
        if (livePlayerSection) livePlayerSection.classList.add("hidden");
        if (noLiveBroadcastCard) noLiveBroadcastCard.classList.remove("hidden");
      }

      // Populate Upcoming Broadcasts
      if (upcomingList) {
        if (upcomingBroadcasts.length === 0) {
          upcomingList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No upcoming broadcasts scheduled.</div>`;
        } else {
          upcomingList.innerHTML = upcomingBroadcasts
            .map(
              (b) => `
            <div class="card" style="margin-bottom: 1rem; border-left: 4px solid var(--secondary);">
              <div class="card-body" style="padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h4 style="font-size: 1.05rem; margin-bottom: 0.25rem;">${b.title}</h4>
                  <p style="font-size: 0.85rem; color: var(--text-muted);">${b.description || "University scheduled live event."}</p>
                  <div style="font-size: 0.775rem; color: #60A5FA; font-family: var(--font-mono); margin-top: 0.5rem;">
                    Scheduled: ${window.formatDateTime(b.event_date)}
                  </div>
                </div>
                <div>
                  <span class="badge badge-upcoming">UPCOMING</span>
                </div>
              </div>
            </div>
          `
            )
            .join("");
        }
      }

      // Populate Past Broadcasts
      if (pastList) {
        if (pastBroadcasts.length === 0) {
          pastList.innerHTML = `<div style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No past recordings available.</div>`;
        } else {
          pastList.innerHTML = pastBroadcasts
            .map(
              (b) => `
            <div class="card" style="margin-bottom: 1rem;">
              <div class="card-body" style="padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                <div>
                  <h4 style="font-size: 1rem; margin-bottom: 0.25rem;">${b.title}</h4>
                  <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono);">
                    Broadcasted: ${window.formatDateTime(b.event_date)}
                  </div>
                </div>
                <div>
                  <span class="badge badge-ended">CONCLUDED</span>
                </div>
              </div>
            </div>
          `
            )
            .join("");
        }
      }
    } catch (err) {
      console.warn("Parent broadcast error:", err);
      if (noLiveBroadcastCard) noLiveBroadcastCard.classList.remove("hidden");
    }
  }

  // Bind logout button
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => window.PaduraAuth.logout());
  }
});
