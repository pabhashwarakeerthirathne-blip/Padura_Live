/**
 * PADURA LIVE - STUDENT DASHBOARD CONTROLLER
 * Loads student profile, authorized live broadcasts,
 * initializes custom player and dynamic watermark.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Enforce student authentication
  const profile = await window.PaduraAuth.requireAuth(["student"]);
  if (!profile) return;

  const client = window.getSupabaseClient();
  let currentStudent = null;
  let activePlayer = null;

  // 2. Fetch student-specific details (student_number, academic_year)
  try {
    const { data: student, error } = await client
      .from("students")
      .select("student_number, academic_year")
      .eq("id", profile.id)
      .single();

    if (error || !student) {
      window.showToast("Could not load student record.", "error");
      return;
    }

    currentStudent = student;

    // Update UI elements
    const studentNumEl = document.getElementById("student-number-pill");
    const academicYearEl = document.getElementById("student-year-pill");
    const studentNameEl = document.getElementById("student-welcome-name");

    if (studentNumEl) studentNumEl.textContent = student.student_number;
    if (academicYearEl) academicYearEl.textContent = `Year ${student.academic_year}`;
    if (studentNameEl) studentNameEl.textContent = profile.full_name;

    // 3. Initialize dynamic anti-recording watermark
    window.PaduraSecurity.init(student.student_number);

    // 4. Load broadcasts
    await loadStudentBroadcasts(student);
  } catch (err) {
    console.error("Student dashboard error:", err);
    window.showToast(err.message, "error");
  }

  /**
   * Load authorized broadcasts (Live, Upcoming, and Past)
   */
  async function loadStudentBroadcasts(student) {
    const livePlayerSection = document.getElementById("live-player-section");
    const noLiveBroadcastCard = document.getElementById("no-live-broadcast-card");
    const upcomingList = document.getElementById("upcoming-broadcasts-list");
    const pastList = document.getElementById("past-broadcasts-list");

    try {
      // Query published broadcasts (RLS automatically restricts to authorized)
      const { data: broadcasts, error } = await client
        .from("broadcasts")
        .select("*")
        .eq("is_published", true)
        .order("event_date", { ascending: false });

      if (error) throw error;

      const liveBroadcast = (broadcasts || []).find((b) => b.status === "live");
      const upcomingBroadcasts = (broadcasts || []).filter((b) => b.status === "upcoming");
      const pastBroadcasts = (broadcasts || []).filter((b) => b.status === "ended");

      // Handle Current Live Broadcast
      if (liveBroadcast) {
        if (noLiveBroadcastCard) noLiveBroadcastCard.classList.add("hidden");
        if (livePlayerSection) livePlayerSection.classList.remove("hidden");

        const liveTitle = document.getElementById("current-broadcast-title");
        const liveDesc = document.getElementById("current-broadcast-desc");
        if (liveTitle) liveTitle.textContent = liveBroadcast.title;
        if (liveDesc) liveDesc.textContent = liveBroadcast.description || "Live university broadcast in progress.";

        // Initialize Custom Video Player
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
          upcomingList.innerHTML = `<div class="empty-state-small" style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No upcoming events scheduled at this moment.</div>`;
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
          pastList.innerHTML = `<div class="empty-state-small" style="padding: 1.5rem; text-align: center; color: var(--text-dim);">No previous recordings available.</div>`;
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
      console.warn("Broadcast query error:", err);
      if (noLiveBroadcastCard) noLiveBroadcastCard.classList.remove("hidden");
    }
  }

  // Bind logout button
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => window.PaduraAuth.logout());
  }
});
