/**
 * PADURA LIVE - CONFIGURATION & UTILITIES
 * Handles Supabase Client initialization, Environment configuration,
 * and global utility helpers.
 */

window.PADURA_CONFIG = {
  // Remove Devtool Permissions
  SILENCE_NON_ERROR_CONSOLE: true,
  BLOCK_DEVTOOLS: true,
  
  // Replace these with your actual Supabase project credentials in production
  SUPABASE_URL: "https://nepubrjjpfxqtrednevl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_sEcM1v3_A1j_Qf3f64X-nQ_OU0vSG5U",
  
  // Edge Function Endpoints (automatically resolved relative to SUPABASE_URL)
  get EDGE_BULK_IMPORT_URL() {
    return `${this.SUPABASE_URL}/functions/v1/bulk-import-students`;
  },
  get EDGE_MANAGE_USER_URL() {
    return `${this.SUPABASE_URL}/functions/v1/manage-user`;
  },

  // Inactivity timeout in milliseconds (15 minutes)
  INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000,
  
  // Heartbeat ping interval for live stream viewing logs (30 seconds)
  HEARTBEAT_INTERVAL_MS: 30 * 1000,

  // Watermark relocation interval (20 seconds)
  WATERMARK_INTERVAL_MS: 20 * 1000,
};

// Keep console.error working, silence all other console output in production
(function restrictConsoleToErrorsOnly() {
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!window.PADURA_CONFIG.SILENCE_NON_ERROR_CONSOLE || isLocal) return;

  const noop = () => {};
  ["log", "info", "debug", "warn", "table", "dir", "trace", "group", "groupEnd"].forEach(
    (method) => {
      if (typeof console[method] === "function") {
        console[method] = noop;
      }
    }
  );
})();

// Allow runtime override via localStorage for effortless zero-code configuration in demo/testing
if (localStorage.getItem("padura_supabase_url")) {
  window.PADURA_CONFIG.SUPABASE_URL = localStorage.getItem("padura_supabase_url");
}
if (localStorage.getItem("padura_supabase_anon_key")) {
  window.PADURA_CONFIG.SUPABASE_ANON_KEY = localStorage.getItem("padura_supabase_anon_key");
}

// Global Supabase client instance
let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(
      window.PADURA_CONFIG.SUPABASE_URL,
      window.PADURA_CONFIG.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
  return supabaseClient;
}

/**
 * Toast Notification System
 */
/**
 * HTML Escaping Utility (prevents XSS across all dashboards)
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Toast Notification System
 */
function showToast(message, type = "info", duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg = {
    success: `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#10B981"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`,
    error: `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#EF4444"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>`,
    warning: `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#F59E0B"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`,
    info: `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#06B6D4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
  }[type] || "";

  toast.innerHTML = `
    ${iconSvg}
    <div style="flex-grow:1; line-height: 1.4;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * YouTube Video ID Extractor
 * Supports standard watch, short URLs, live streams, shorts, and embeds
 */
function extractYouTubeVideoId(url) {
  if (!url) return null;
  const cleanUrl = url.trim();

  // If already 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  // Regex covering all YouTube URL variants
  const regExp = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = cleanUrl.match(regExp);
  return (match && match[1]) ? match[1] : null;
}

/**
 * Validate Student Number Format
 * Format: XX/YYYY/NNN (Two letters / 4 digit academic year / registration number)
 */
function isValidStudentNumber(studentNumber) {
  if (!studentNumber) return false;
  return /^[A-Z]{2}\/[0-9]{4}\/[0-9]+$/.test(studentNumber.trim().toUpperCase());
}

/**
 * Format Date to readable string
 */
function formatDateTime(dateInput) {
  if (!dateInput) return "N/A";
  const date = new Date(dateInput);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


// Export to window
window.getSupabaseClient = getSupabaseClient;
window.showToast = showToast;
window.extractYouTubeVideoId = extractYouTubeVideoId;
window.isValidStudentNumber = isValidStudentNumber;
window.formatDateTime = formatDateTime;
window.escapeHtml = escapeHtml;