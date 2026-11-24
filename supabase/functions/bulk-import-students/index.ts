// ==============================================================================
// PADURA LIVE - BULK IMPORT STUDENTS EDGE FUNCTION (Deno / Supabase Edge)
// Handles secure bulk account creation using Supabase Service Role Key.
// Validates admin credentials, hashes passwords via Supabase Auth,
// and enforces strict student number validation.
// ==============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface StudentImportRecord {
  studentNumber: string;
  username: string;
  password?: string;
  fullName: string;
  academicYear: number | string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables on Edge server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate caller and verify Admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    // User client with caller's token to verify identity
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client with Service Role Key for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller has 'admin' role in profiles
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "admin" || profile.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Unauthorized. Admin privileges required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse payload
    const body = await req.json();
    const students: StudentImportRecord[] = body.students;

    if (!Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid payload. 'students' array is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (students.length > 500) {
      return new Response(
        JSON.stringify({ error: "Batch size exceeds 500 records limit per request." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Regex for student number: Two uppercase letters / 4-digit academic year / digits
    const studentNumberRegex = /^[A-Z]{2}\/[0-9]{4}\/[0-9]+$/;

    const successful: Array<{ studentNumber: string; username: string; id: string }> = [];
    const failed: Array<{ studentNumber: string; username: string; reason: string }> = [];

    // Track duplicates within batch
    const seenStudentNumbers = new Set<string>();
    const seenUsernames = new Set<string>();

    for (let i = 0; i < students.length; i++) {
      const row = students[i];
      const rawNumber = (row.studentNumber || "").trim().toUpperCase();
      const rawUsername = (row.username || "").trim().toLowerCase();
      const rawFullName = (row.fullName || "").trim();
      const rawYear = parseInt(String(row.academicYear), 10);
      const rawPassword = (row.password || "").trim() || `Padura@${rawYear || 2026}!`;

      // Validation
      if (!rawNumber || !rawUsername || !rawFullName || isNaN(rawYear)) {
        failed.push({
          studentNumber: rawNumber || `Row ${i + 1}`,
          username: rawUsername || `Row ${i + 1}`,
          reason: "Missing required fields (studentNumber, username, fullName, or academicYear)",
        });
        continue;
      }

      if (!studentNumberRegex.test(rawNumber)) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: "Invalid student number format. Expected format: XX/YYYY/NNN (e.g., PS/2023/174)",
        });
        continue;
      }

      if (rawPassword.length < 6) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: "Password must be at least 6 characters.",
        });
        continue;
      }

      if (seenStudentNumbers.has(rawNumber)) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: "Duplicate student number within the uploaded file.",
        });
        continue;
      }
      seenStudentNumbers.add(rawNumber);

      if (seenUsernames.has(rawUsername)) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: "Duplicate username within the uploaded file.",
        });
        continue;
      }
      seenUsernames.add(rawUsername);

      // Check existing database for duplicate student number or username
      const { data: existingStudent } = await adminClient
        .from("students")
        .select("id")
        .eq("student_number", rawNumber)
        .maybeSingle();

      if (existingStudent) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: "Student number already registered in database.",
        });
        continue;
      }

      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", rawUsername)
        .maybeSingle();

      if (existingProfile) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: "Username already taken in database.",
        });
        continue;
      }

      // Generate synthetic email for Supabase Auth
      const syntheticEmail = `${rawUsername.replace(/[^a-z0-9_.-]/g, "")}@paduralive.local`;

      // 3. Create Auth user via Supabase Admin API (Service Role)
      const { data: authData, error: createAuthError } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: rawPassword,
        email_confirm: true,
        user_metadata: {
          username: rawUsername,
          full_name: rawFullName,
          role: "student",
          student_number: rawNumber,
        },
      });

      if (createAuthError || !authData.user) {
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: `Auth creation failed: ${createAuthError?.message || "Unknown error"}`,
        });
        continue;
      }

      const newUserId = authData.user.id;

      // 4. Create profile record
      const { error: profileInsertError } = await adminClient.from("profiles").insert({
        id: newUserId,
        role: "student",
        username: rawUsername,
        full_name: rawFullName,
        status: "active",
      });

      if (profileInsertError) {
        // Rollback auth user
        await adminClient.auth.admin.deleteUser(newUserId);
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: `Profile creation failed: ${profileInsertError.message}`,
        });
        continue;
      }

      // 5. Create student record
      const { error: studentInsertError } = await adminClient.from("students").insert({
        id: newUserId,
        student_number: rawNumber,
        academic_year: rawYear,
      });

      if (studentInsertError) {
        // Rollback profile and auth user
        await adminClient.from("profiles").delete().eq("id", newUserId);
        await adminClient.auth.admin.deleteUser(newUserId);
        failed.push({
          studentNumber: rawNumber,
          username: rawUsername,
          reason: `Student record creation failed: ${studentInsertError.message}`,
        });
        continue;
      }

      successful.push({
        studentNumber: rawNumber,
        username: rawUsername,
        id: newUserId,
      });
    }

    // 6. Log admin audit entry
    await adminClient.from("admin_logs").insert({
      admin_id: user.id,
      action: "BULK_STUDENT_IMPORT",
      details: {
        totalRows: students.length,
        successCount: successful.length,
        failureCount: failed.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        total: students.length,
        successCount: successful.length,
        failedCount: failed.length,
        successful,
        failed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
