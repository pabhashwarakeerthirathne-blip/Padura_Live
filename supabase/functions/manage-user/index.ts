// ==============================================================================
// PADURA LIVE - USER MANAGEMENT EDGE FUNCTION (Deno 2 / Supabase Edge)
// Administrative user actions: creation, password resets, status toggle, deletion.
// ==============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toSyntheticEmail(username: string): string {
  const sanitized = username.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `${sanitized}@paduralive.local`;
}

function getAdminKey(): string {
  // Prefer Supabase's newer secret key dictionary; fall back to legacy service_role key
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }
      const firstKey = Object.values(parsed).find(
        (v): v is string => typeof v === "string" && v.length > 0
      );
      if (firstKey) return firstKey;
    } catch {
      // Fall through to legacy env var
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAdminKey = getAdminKey();

    if (!supabaseUrl || !supabaseAdminKey) {
      return jsonResponse({ error: "Missing SUPABASE_URL or admin secret key." }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Missing authorization header." }, 401);
    }

    const adminClient = createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: `Invalid session: ${userError?.message || "Unauthorized"}` }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return jsonResponse(
        { error: `Admin profile check failed (${profileError.code || "DB"}): ${profileError.message}` },
        403
      );
    }

    if (!profile || profile.role !== "admin" || profile.status !== "active") {
      return jsonResponse(
        {
          error: `Access denied for ${user.email} (role=${profile?.role ?? "none"}, status=${profile?.status ?? "none"}). Active Admin credentials required.`,
        },
        403
      );
    }

    const body = await req.json();
    const { action } = body;

    // --------------------------------------------------------------------------
    // ACTION: CREATE INDIVIDUAL STUDENT
    // --------------------------------------------------------------------------
    if (action === "create_student") {
      const { studentNumber, username, password, fullName, academicYear } = body;
      const cleanNumber = (studentNumber || "").trim().toUpperCase();
      const cleanUsername = (username || "").trim().toLowerCase();
      const cleanName = (fullName || "").trim();
      const year = parseInt(academicYear, 10);
      const studentNumberRegex = /^[A-Z]{2}\/[0-9]{4}\/[0-9]+$/;

      if (!cleanNumber || !cleanUsername || !cleanName || isNaN(year) || !password) {
        return jsonResponse({ error: "All student fields are required." }, 400);
      }

      if (!studentNumberRegex.test(cleanNumber)) {
        return jsonResponse({ error: "Invalid student number format. Expected: XX/YYYY/NNN" }, 400);
      }

      const syntheticEmail = toSyntheticEmail(cleanUsername);

      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: { username: cleanUsername, full_name: cleanName, role: "student" },
      });

      if (authErr || !authUser.user) {
        return jsonResponse({ error: authErr?.message || "Failed to create user in auth engine." }, 400);
      }

      const userId = authUser.user.id;

      const { error: profErr } = await adminClient.from("profiles").insert({
        id: userId,
        role: "student",
        username: cleanUsername,
        full_name: cleanName,
        status: "active",
      });

      if (profErr) {
        await adminClient.auth.admin.deleteUser(userId);
        return jsonResponse({ error: `Profile error: ${profErr.message}` }, 400);
      }

      const { error: studErr } = await adminClient.from("students").insert({
        id: userId,
        student_number: cleanNumber,
        academic_year: year,
      });

      if (studErr) {
        await adminClient.from("profiles").delete().eq("id", userId);
        await adminClient.auth.admin.deleteUser(userId);
        return jsonResponse({ error: `Student table error: ${studErr.message}` }, 400);
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "CREATE_STUDENT",
        details: { student_id: userId, student_number: cleanNumber, username: cleanUsername },
      });

      return jsonResponse({ success: true, userId, message: "Student account created successfully." });
    }

    // --------------------------------------------------------------------------
    // ACTION: CREATE PARENT ACCOUNT
    // --------------------------------------------------------------------------
    if (action === "create_parent") {
      const { username, password, fullName, phone, notes, studentIds } = body;
      const cleanUsername = (username || "").trim().toLowerCase();
      const cleanName = (fullName || "").trim();

      if (!cleanUsername || !cleanName || !password) {
        return jsonResponse({ error: "Username, full name, and password are required." }, 400);
      }

      const syntheticEmail = toSyntheticEmail(cleanUsername);

      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: { username: cleanUsername, full_name: cleanName, role: "parent" },
      });

      if (authErr || !authUser.user) {
        return jsonResponse({ error: authErr?.message || "Failed to create parent auth account." }, 400);
      }

      const parentId = authUser.user.id;

      const { error: profErr } = await adminClient.from("profiles").insert({
        id: parentId,
        role: "parent",
        username: cleanUsername,
        full_name: cleanName,
        status: "active",
      });

      if (profErr) {
        await adminClient.auth.admin.deleteUser(parentId);
        return jsonResponse({ error: `Profile error: ${profErr.message}` }, 400);
      }

      const { error: parentErr } = await adminClient.from("parents").insert({
        id: parentId,
        phone: phone || null,
        notes: notes || null,
      });

      if (parentErr) {
        await adminClient.from("profiles").delete().eq("id", parentId);
        await adminClient.auth.admin.deleteUser(parentId);
        return jsonResponse({ error: `Parent table error: ${parentErr.message}` }, 400);
      }

      if (Array.isArray(studentIds) && studentIds.length > 0) {
        const links = studentIds.map((sid: string) => ({
          parent_id: parentId,
          student_id: sid,
        }));
        const { error: linkErr } = await adminClient.from("parent_students").insert(links);
        if (linkErr) {
          return jsonResponse({ error: `Parent created, but linking students failed: ${linkErr.message}` }, 400);
        }
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "CREATE_PARENT",
        details: { parent_id: parentId, username: cleanUsername, linkedCount: studentIds?.length || 0 },
      });

      return jsonResponse({ success: true, parentId, message: "Parent account created successfully." });
    }

    // --------------------------------------------------------------------------
    // ACTION: RESET PASSWORD
    // --------------------------------------------------------------------------
    if (action === "reset_password") {
      const { targetUserId, newPassword } = body;
      if (!targetUserId || !newPassword || newPassword.length < 6) {
        return jsonResponse({ error: "User ID and new password (min 6 chars) required." }, 400);
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

      if (updateErr) {
        return jsonResponse({ error: updateErr.message }, 400);
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "RESET_PASSWORD",
        details: { target_user_id: targetUserId },
      });

      return jsonResponse({ success: true, message: "Password updated successfully." });
    }

    // --------------------------------------------------------------------------
    // ACTION: TOGGLE STATUS (ACTIVE / INACTIVE)
    // --------------------------------------------------------------------------
    if (action === "toggle_status") {
      const { targetUserId, status } = body;
      if (!targetUserId || !["active", "inactive"].includes(status)) {
        return jsonResponse({ error: "Invalid target user or status." }, 400);
      }

      const { error: statusErr } = await adminClient
        .from("profiles")
        .update({ status })
        .eq("id", targetUserId);

      if (statusErr) {
        return jsonResponse({ error: statusErr.message }, 400);
      }

      const { error: banErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: status === "inactive" ? "876000h" : "none",
      });

      if (banErr) {
        return jsonResponse({ error: banErr.message }, 400);
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "TOGGLE_USER_STATUS",
        details: { target_user_id: targetUserId, new_status: status },
      });

      return jsonResponse({ success: true, message: `Account status updated to ${status}.` });
    }

    // --------------------------------------------------------------------------
    // ACTION: DELETE USER
    // --------------------------------------------------------------------------
    if (action === "delete_user") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return jsonResponse({ error: "targetUserId is required." }, 400);
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        return jsonResponse({ error: delErr.message }, 400);
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "DELETE_USER",
        details: { target_user_id: targetUserId },
      });

      return jsonResponse({ success: true, message: "User deleted completely." });
    }

    return jsonResponse({ error: `Unknown action '${action}'` }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server exception";
    return jsonResponse({ error: message }, 500);
  }
});