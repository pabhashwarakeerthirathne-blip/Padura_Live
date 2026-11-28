// PADURA LIVE — PUBLIC STUDENT SELF-REGISTRATION
// Deploy with --no-verify-jwt because new students do not have a session yet.
// Privileged database access stays on the server; never expose the service-role key.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAdminKey(): string {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const parsed = JSON.parse(secretKeysRaw);
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
      const first = Object.values(parsed).find((value): value is string => typeof value === "string" && !!value);
      if (first) return first;
    } catch { /* use legacy service-role key below */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) return respond({ error: "Registration service is not configured." }, 500);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return respond({ error: "Invalid request body." }, 400); }

  const studentNumber = String(body.studentNumber ?? "").trim().toUpperCase();
  const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ");
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const numberPattern = /^[A-Z]{2}\/[0-9]{4}\/[0-9]+$/;
  const usernamePattern = /^[a-z0-9_]{3,24}$/;

  if (!numberPattern.test(studentNumber)) return respond({ error: "Enter a valid student number, for example PS/2023/174." }, 400);
  if (fullName.length < 2 || fullName.length > 120) return respond({ error: "Enter your full name (2–120 characters)." }, 400);
  if (!usernamePattern.test(username)) return respond({ error: "Username must be 3–24 characters using letters, numbers and underscores." }, 400);
  if (password.length < 8 || password.length > 128) return respond({ error: "Password must be between 8 and 128 characters." }, 400);

  const admin = createClient(supabaseUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const syntheticEmail = `${username.replace(/[^a-z0-9]/g, "_")}@paduralive.local`;
  const academicYear = Number(studentNumber.split("/")[1]);
  if (academicYear < 2000 || academicYear > 2100) return respond({ error: "The year in your student number is not valid." }, 400);

  // Friendly pre-checks; database unique constraints remain the final authority.
  const [{ data: existingStudent }, { data: existingProfile }] = await Promise.all([
    admin.from("students").select("id").eq("student_number", studentNumber).maybeSingle(),
    admin.from("profiles").select("id").eq("username", username).maybeSingle(),
  ]);
  if (existingStudent) return respond({ error: "This student number is already registered. If this is your number, contact the administrator." }, 409);
  if (existingProfile) return respond({ error: "That username is already taken. Please choose another one." }, 409);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName, role: "student" },
  });
  if (createError || !created.user) {
    const message = createError?.message ?? "Could not create the authentication account.";
    if (/already|registered|exists/i.test(message)) return respond({ error: "That username is already taken. Please choose another one." }, 409);
    return respond({ error: "Could not create your account. Please check your details and try again." }, 400);
  }

  const userId = created.user.id;
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId, role: "student", username, full_name: fullName, status: "active",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    if (profileError.code === "23505") return respond({ error: "That username or student number is already registered." }, 409);
    console.error("Student profile insert failed:", profileError.message);
    return respond({ error: "Your account could not be completed. Please contact the administrator." }, 500);
  }

  const { error: studentError } = await admin.from("students").insert({
    id: userId, student_number: studentNumber, academic_year: academicYear,
  });
  if (studentError) {
    await admin.auth.admin.deleteUser(userId); // cascades the profile row
    if (studentError.code === "23505") return respond({ error: "This student number is already registered." }, 409);
    console.error("Student record insert failed:", studentError.message);
    return respond({ error: "Your student record could not be created. Please contact the administrator." }, 500);
  }

  return respond({ success: true, message: "Student account created." }, 201);
});
