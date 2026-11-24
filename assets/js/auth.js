/**
 * PADURA LIVE - AUTHENTICATION & ROUTE GUARD
 * Secure Role-Based Authentication with Supabase Auth,
 * Inactive Account Protection & Auto-Logout System.
 */

const PaduraAuth = {
  currentUser: null,
  currentProfile: null,
  inactivityTimer: null,

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
    // e.g. "PS/2023/174" -> "ps_2023_174@paduralive.local"
    let emailToUse = cleanId;
    if (!cleanId.includes("@")) {
      const sanitized = cleanId.toLowerCase().replace(/[^a-z0-9]/g, "_");
      emailToUse = `${sanitized}@paduralive.local`;
    }

    // Attempt Supabase Auth signIn
    const { data, error } = await client.auth.signInWithPassword({
      email: emailToUse,
      password: password,
    });

    if (error) {
      // Record failed attempt in login_logs
      try {
        await client.from("login_logs").insert({
          username: cleanId,
          status: "failed",
          user_agent: navigator.userAgent,
        });
      } catch (logErr) {
        console.warn("Could not log failure:", logErr);
      }
      throw new Error(error.message || "Invalid login credentials.");
    }

    const authUser = data.user;

    // Fetch user profile from database to verify active status and role
    const { data: profile, error: profileErr } = await client
      .from("profiles")
      .select("id, role, username, full_name, status")
      .eq("id", authUser.id)
      .single();

    if (profileErr || !profile) {
      await client.auth.signOut();
      throw new Error("User profile not found. Please contact an administrator.");
    }

    // Verify account status
    if (profile.status !== "active") {
      await client.auth.signOut();
      try {
        await client.from("login_logs").insert({
          user_id: authUser.id,
          username: cleanId,
          status: "blocked_inactive",
          user_agent: navigator.userAgent,
        });
      } catch (e) {}
      throw new Error("Your account has been deactivated. Please contact university administration.");
    }

    // Record successful login
    try {
      await client.from("login_logs").insert({
        user_id: authUser.id,
        username: cleanId,
        status: "success",
        user_agent: navigator.userAgent,
      });
    } catch (e) {}

    // Store profile in memory and session cache
    this.currentUser = authUser;
    this.currentProfile = profile;
    sessionStorage.setItem("padura_user_profile", JSON.stringify(profile));

    // Redirect to respective dashboard
    this.redirectByRole(profile.role);
    return profile;
  },

  /**
   * Redirect user to their designated dashboard
   */
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

  /**
   * Sign out current user
   */
  async logout() {
    try {
      const client = window.getSupabaseClient();
      if (client) {
        await client.auth.signOut();
      }
    } catch (err) {
      console.warn("Sign out error:", err);
    } finally {
      this.currentUser = null;
      this.currentProfile = null;
      sessionStorage.clear();
      window.location.href = "login.html";
    }
  },

  /**
   * Protect page by requiring authentication and role validation
   */
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

    // Fetch live profile
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, role, username, full_name, status")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile || profile.status !== "active") {
      await this.logout();
      return null;
    }

    // Role verification
    if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
      window.showToast("Unauthorized page access. Redirecting...", "error");
      this.redirectByRole(profile.role);
      return null;
    }

    this.currentProfile = profile;
    sessionStorage.setItem("padura_user_profile", JSON.stringify(profile));

    // Update Header UI elements
    this.updateUserUI(profile);

    // Initialize auto-logout for inactivity
    this.setupInactivityWatcher();

    return profile;
  },

  /**
   * Update navigation bar with user details
   */
  updateUserUI(profile) {
    const userNameEl = document.getElementById("nav-user-name");
    const userRoleEl = document.getElementById("nav-user-role");
    const userAvatarEl = document.getElementById("nav-user-avatar");

    if (userNameEl) userNameEl.textContent = profile.full_name;
    if (userRoleEl) userRoleEl.textContent = profile.role.toUpperCase();
    if (userAvatarEl) {
      const initials = profile.full_name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      userAvatarEl.textContent = initials || "U";
    }
  },

  /**
   * Auto-logout on 15 minutes of inactivity
   */
  setupInactivityWatcher() {
    const resetTimer = () => {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
        alert("You have been automatically logged out due to 15 minutes of inactivity.");
        PaduraAuth.logout();
      }, window.PADURA_CONFIG.INACTIVITY_TIMEOUT_MS);
    };

    ["mousedown", "keydown", "scroll", "touchstart"].forEach((evt) => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer();
  },
};

window.PaduraAuth = PaduraAuth;
