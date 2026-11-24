/**
 * PADURA LIVE - ANTI-RECORDING DETERRENTS & ACCESS SECURITY
 * Enforces dynamic moving watermarks, contextmenu interception,
 * session heartbeats, and audit trail records.
 */

const PaduraSecurity = {
  watermarkInterval: null,
  heartbeatInterval: null,
  activeBroadcastId: null,

  /**
   * Initialize anti-recording deterrents
   */
  init(watermarkText) {
    this.disableContextMenu();
    this.setupKeyboardProtections();
    if (watermarkText) {
      this.initDynamicWatermark(watermarkText);
    }
  },

  /**
   * Block right-click context menu across viewing elements
   */
  disableContextMenu() {
    document.addEventListener("contextmenu", (e) => {
      // Prevent context menu on player and dashboard media
      if (e.target.closest(".video-player-wrapper") || e.target.closest(".dashboard-main")) {
        e.preventDefault();
        window.showToast("Context menu is disabled for protected university content.", "warning", 2500);
      }
    });
  },

  /**
   * Intercept common developer tool and inspect shortcuts
   */
  setupKeyboardProtections() {
    document.addEventListener("keydown", (e) => {
      // Disable Ctrl+S / Cmd+S (Save Page)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        window.showToast("Saving page is disabled.", "warning", 2000);
      }
      // Disable Ctrl+U / Cmd+U (View Source)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
        e.preventDefault();
        window.showToast("Source inspection is restricted.", "warning", 2000);
      }
    });
  },

  /**
   * Dynamic moving watermark system
   * Moves smoothly to randomized coordinate quadrants every 20 seconds.
   * Visible in standard and HTML5 Fullscreen mode!
   */
  initDynamicWatermark(customIdentifier) {
    const watermarkEl = document.getElementById("player-watermark");
    if (!watermarkEl) return;

    const formattedText = `PADURA LIVE | ${customIdentifier} | PRIVATE VIEWING`;
    watermarkEl.textContent = formattedText;
    watermarkEl.style.display = "block";

    const moveWatermark = () => {
      // Positions in percentage bounds [10% to 80% to avoid spilling outside frame]
      const minX = 6;
      const maxX = 65;
      const minY = 8;
      const maxY = 75;

      const randomX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
      const randomY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

      // Slight opacity fluctuation to enhance anti-tamper security
      const randomOpacity = (Math.random() * 0.25 + 0.35).toFixed(2);

      watermarkEl.style.left = `${randomX}%`;
      watermarkEl.style.top = `${randomY}%`;
      watermarkEl.style.opacity = randomOpacity;
    };

    // Initial position
    moveWatermark();

    // Set recurring timer
    clearInterval(this.watermarkInterval);
    this.watermarkInterval = setInterval(moveWatermark, window.PADURA_CONFIG.WATERMARK_INTERVAL_MS);
  },

  /**
   * Start 30-second heartbeat ping for viewing audit log
   */
  startViewingHeartbeat(broadcastId) {
    this.activeBroadcastId = broadcastId;
    this.stopViewingHeartbeat();

    const client = window.getSupabaseClient();
    if (!client || !broadcastId) return;

    const sendHeartbeat = async () => {
      try {
        await client.rpc("log_viewing_heartbeat", {
          p_broadcast_id: this.activeBroadcastId,
          p_duration_increment: 30,
          p_user_agent: navigator.userAgent,
        });
      } catch (err) {
        console.warn("Heartbeat ping error:", err.message);
      }
    };

    // First ping immediately
    sendHeartbeat();
    // Subsequent pings every 30 seconds
    this.heartbeatInterval = setInterval(sendHeartbeat, window.PADURA_CONFIG.HEARTBEAT_INTERVAL_MS);
  },

  /**
   * Stop viewing heartbeat (when stream paused or navigated away)
   */
  stopViewingHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  },
};

window.PaduraSecurity = PaduraSecurity;
