// ==============================================================================
// PADURA LIVE - USER MANAGEMENT EDGE FUNCTION (Deno / Supabase Edge)
// Administrative user actions: creation, password resets, status toggle, deletion.
// Service role key runs isolated on Edge server. Admin JWT strictly verified.
// ==============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing server environment variables." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify Admin JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin" || profile.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Access denied. Active Admin credentials required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        return new Response(
          JSON.stringify({ error: "All student fields are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!studentNumberRegex.test(cleanNumber)) {
        return new Response(
          JSON.stringify({ error: "Invalid student number format. Expected: XX/YYYY/NNN" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const syntheticEmail = `${cleanUsername.replace(/[^a-z0-9_.-]/g, "")}@paduralive.local`;

      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: password,
        email_confirm: true,
        user_metadata: { username: cleanUsername, full_name: cleanName, role: "student" },
      });

      if (authErr || !authUser.user) {
        return new Response(
          JSON.stringify({ error: authErr?.message || "Failed to create user in auth engine." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        return new Response(
          JSON.stringify({ error: `Profile error: ${profErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: studErr } = await adminClient.from("students").insert({
        id: userId,
        student_number: cleanNumber,
        academic_year: year,
      });

      if (studErr) {
        await adminClient.from("profiles").delete().eq("id", userId);
        await adminClient.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: `Student table error: ${studErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "CREATE_STUDENT",
        details: { student_id: userId, student_number: cleanNumber, username: cleanUsername },
      });

      return new Response(
        JSON.stringify({ success: true, userId, message: "Student account created successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: CREATE PARENT ACCOUNT
    // --------------------------------------------------------------------------
    if (action === "create_parent") {
      const { username, password, fullName, phone, notes, studentIds } = body;
      const cleanUsername = (username || "").trim().toLowerCase();
      const cleanName = (fullName || "").trim();

      if (!cleanUsername || !cleanName || !password) {
        return new Response(
          JSON.stringify({ error: "Username, full name, and password are required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const syntheticEmail = `${cleanUsername.replace(/[^a-z0-9_.-]/g, "")}@paduralive.local`;

      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: password,
        email_confirm: true,
        user_metadata: { username: cleanUsername, full_name: cleanName, role: "parent" },
      });

      if (authErr || !authUser.user) {
        return new Response(
          JSON.stringify({ error: authErr?.message || "Failed to create parent auth account." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const parentId = authUser.user.id;

      await adminClient.from("profiles").insert({
        id: parentId,
        role: "parent",
        username: cleanUsername,
        full_name: cleanName,
        status: "active",
      });

      await adminClient.from("parents").insert({
        id: parentId,
        phone: phone || null,
        notes: notes || null,
      });

      // Link assigned students if provided
      if (Array.isArray(studentIds) && studentIds.length > 0) {
        const links = studentIds.map((sid: string) => ({
          parent_id: parentId,
          student_id: sid,
        }));
        await adminClient.from("parent_students").insert(links);
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "CREATE_PARENT",
        details: { parent_id: parentId, username: cleanUsername, linkedCount: studentIds?.length || 0 },
      });

      return new Response(
        JSON.stringify({ success: true, parentId, message: "Parent account created successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: RESET PASSWORD
    // --------------------------------------------------------------------------
    if (action === "reset_password") {
      const { targetUserId, newPassword } = body;
      if (!targetUserId || !newPassword || newPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "User ID and new password (min 6 chars) required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });

      if (updateErr) {
        return new Response(
          JSON.stringify({ error: updateErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "RESET_PASSWORD",
        details: { target_user_id: targetUserId },
      });

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: TOGGLE STATUS (ACTIVE / INACTIVE)
    // --------------------------------------------------------------------------
    if (action === "toggle_status") {
      const { targetUserId, status } = body;
      if (!targetUserId || !["active", "inactive"].includes(status)) {
        return new Response(
          JSON.stringify({ error: "Invalid target user or status." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: statusErr } = await adminClient
        .from("profiles")
        .update({ status })
        .eq("id", targetUserId);

      if (statusErr) {
        return new Response(
          JSON.stringify({ error: statusErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If deactivated, revoke/ban auth session
      if (status === "inactive") {
        await adminClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: "876000h", // effectively suspended
        });
      } else {
        await adminClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: "none",
        });
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "TOGGLE_USER_STATUS",
        details: { target_user_id: targetUserId, new_status: status },
      });

      return new Response(
        JSON.stringify({ success: true, message: `Account status updated to ${status}.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: DELETE USER
    // --------------------------------------------------------------------------
    if (action === "delete_user") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: "targetUserId is required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete from auth engine (cascades to profiles, students, etc.)
      const { error: delErr } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (delErr) {
        return new Response(
          JSON.stringify({ error: delErr.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminClient.from("admin_logs").insert({
        admin_id: user.id,
        action: "DELETE_USER",
        details: { target_user_id: targetUserId },
      });

      return new Response(
        JSON.stringify({ success: true, message: "User deleted completely." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action '${action}'` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Server exception" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
