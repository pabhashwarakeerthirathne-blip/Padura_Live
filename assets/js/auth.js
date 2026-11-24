/**
 * PADURA LIVE - AUTHENTICATION & ROUTE GUARD
 * Secure Role-Based Authentication with Supabase Auth,
 * Inactive Account Protection & Auto-Logout System.
 */

const PaduraAuth = {
  currentUser: null,
  currentProfile: null,
  inactivityTimer: null,

  async logAttempt(client, payload) {
    const { error } = await client.from("login_logs").insert(payload);
    if (error) {
      console.warn("Could not write login_logs:", error.message);
    }
  },

  /**
   * Log in user using username, student number, or email
   */
  async login(identifier, password) {
    const client = window.getSupabaseClient();
    if (!client) throw new Error("Supabase client is not initialized.");

    const cleanId = (identifier || "").trim();
    if (!cleanId || !password) {
      throw new Error("Please enter both username and password.");
    }

    // Convert username or student number to synthetic email
    let emailToUse = cleanId;
    if (!cleanId.includes("@")) {
      const sanitized = cleanId.toLowerCase().replace(/[^a-z0-9]/g, "_");
      emailToUse = `${sanitized}@paduralive.local`;
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: emailToUse,
      password: password,
    });

    if (error) {
      await this.logAttempt(client, {
        username: cleanId,
        status: "failed",
        user_agent: navigator.userAgent,
      });
      throw new Error(error.message || "Invalid login credentials.");
    }

    const authUser = data.user;

    const { data: profile, error: profileErr } = await client
      .from("profiles")
      .select("id, role, username, full_name, status")
      .eq("id", authUser.id)
      .single();

    if (profileErr || !profile) {
      await client.auth.signOut();
      throw new Error("User profile not found. Please contact an administrator.");
    }

    // Log blocked_inactive BEFORE signing out so the session token is still valid
    if (profile.status !== "active") {
      await this.logAttempt(client, {
        user_id: authUser.id,
        username: cleanId,
        status: "blocked_inactive",
        user_agent: navigator.userAgent,
      });
      await client.auth.signOut();
      throw new Error("Your account has been deactivated. Please contact university administration.");
    }

    await this.logAttempt(client, {
      user_id: authUser.id,
      username: cleanId,
      status: "success",
      user_agent: navigator.userAgent,
    });

    this.currentUser = authUser;
    this.currentProfile = profile;
    sessionStorage.setItem("padura_user_profile", JSON.stringify(profile));

    this.redirectByRole(profile.role);
    return profile;
  },

  redirectByRole(role) {
    if (role === "admin") {
      window.location.href = "admin-dashboard.html";
    } else if (role === "student") {
      window.location.href = "student-dashboard.html";
    } else if (role === "parent") {
      window.location.href = "parent-dashboard.html";
    } else {
      window.location.href = "login.html";
    }
  },

  async logout(reason = "") {
    try {
      const client = window.getSupabaseClient();
      if (client) {
        await client.auth.signOut();
      }
    } catch (err) {
      console.warn("Sign out error:", err);
    } finally {
      clearTimeout(this.inactivityTimer);
      this.currentUser = null;
      this.currentProfile = null;
      sessionStorage.clear();
      const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : "";
      window.location.href = `login.html${suffix}`;
    }
  },

  async requireAuth(allowedRoles = []) {
    const client = window.getSupabaseClient();
    if (!client) {
      window.location.href = "login.html";
      return null;
    }

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session || !session.user) {
      window.location.href = "login.html";
      return null;
    }

    this.currentUser = session.user;

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, role, username, full_name, status")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile || profile.status !== "active") {
      await this.logout();
      return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
      window.showToast("Unauthorized page access. Redirecting...", "error");
      this.redirectByRole(profile.role);
      return null;
    }

    this.currentProfile = profile;
    sessionStorage.setItem("padura_user_profile", JSON.stringify(profile));

    this.updateUserUI(profile);
    this.setupInactivityWatcher();

    return profile;
  },

  updateUserUI(profile) {
    const userNameEl = document.getElementById("nav-user-name");
    const userRoleEl = document.getElementById("nav-user-role");
    const userAvatarEl = document.getElementById("nav-user-avatar");

    const safeName = profile.full_name || profile.username || "User";

    if (userNameEl) userNameEl.textContent = safeName;
    if (userRoleEl) userRoleEl.textContent = (profile.role || "").toUpperCase();
    if (userAvatarEl) {
      const initials = safeName
        .trim()
        .split(/\s+/)
        .map((n) => n[0] || "")
        .slice(0, 2)
        .join("")
        .toUpperCase();
      userAvatarEl.textContent = initials || "U";
    }
  },

  setupInactivityWatcher() {
    const resetTimer = () => {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        // Log out immediately without blocking on alert()
        PaduraAuth.logout("timeout");
      }, window.PADURA_CONFIG.INACTIVITY_TIMEOUT_MS);
    };

    ["mousedown", "keydown", "scroll", "touchstart"].forEach((evt) => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer();
  },
};

// Show timeout notice automatically if redirected back to login.html
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reason") === "timeout" && window.showToast) {
    window.showToast("You were logged out after 15 minutes of inactivity.", "warning", 6000);
  }
});

window.PaduraAuth = PaduraAuth;