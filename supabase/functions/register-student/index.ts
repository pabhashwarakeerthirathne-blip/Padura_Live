// PADURA LIVE — verify against preloaded student roster, then create login.
// Deploy publicly because students do not yet have an authenticated session.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function getAdminKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) { try { const v = JSON.parse(raw); if (typeof v.default === "string") return v.default; const first = Object.values(v).find(x => typeof x === "string"); if (first) return first as string; } catch {} }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = getAdminKey();
  if (!url || !key) return respond({ error: "Registration service is not configured. Contact Web Admin." }, 500);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return respond({ error: "Invalid request." }, 400); }
  const studentNumber = String(body.studentNumber ?? "").trim().toUpperCase();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!/^[A-Z]{2}\/[0-9]{4}\/[0-9]+$/.test(studentNumber)) return respond({ error: "You are not recognized. Contact Web Admin." }, 403);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return respond({ error: "Username must be 3–24 characters using letters, numbers and underscores." }, 400);
  if (password.length < 8 || password.length > 128) return respond({ error: "Password must be between 8 and 128 characters." }, 400);

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  // Atomically claim only a pre-approved, not-yet-registered student row.
  const { data: roster, error: rosterError } = await admin.from("student_roster")
    .update({ is_registered: true, registered_at: new Date().toISOString() })
    .eq("student_number", studentNumber).eq("is_registered", false)
    .select("student_number, full_name, academic_year").maybeSingle();
  if (rosterError) { console.error("Roster lookup/claim failed:", rosterError.message); return respond({ error: "Registration service error. Contact Web Admin." }, 500); }
  if (!roster) return respond({ error: "You are not recognized. Contact Web Admin." }, 403);

  const releaseRoster = async () => {
    await admin.from("student_roster").update({ is_registered: false, registered_at: null, registered_user_id: null }).eq("student_number", studentNumber);
  };
  const syntheticEmail = `${username}@paduralive.local`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail, password, email_confirm: true,
    user_metadata: { username, full_name: roster.full_name, role: "student" },
  });
  if (createError || !created.user) {
    await releaseRoster();
    if (/already|registered|exists/i.test(createError?.message ?? "")) return respond({ error: "That username is already taken. Choose another username." }, 409);
    console.error("Auth create failed:", createError?.message);
    return respond({ error: "Could not create account. Please try again or contact Web Admin." }, 400);
  }
  const userId = created.user.id;
  const { error: profileError } = await admin.from("profiles").insert({ id: userId, role: "student", username, full_name: roster.full_name, status: "active" });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId); await releaseRoster();
    console.error("Profile insert failed:", profileError.message);
    return respond({ error: profileError.code === "23505" ? "That username is already taken. Choose another username." : "Could not complete account. Contact Web Admin." }, 409);
  }
  const { error: studentError } = await admin.from("students").insert({ id: userId, student_number: roster.student_number, academic_year: roster.academic_year });
  if (studentError) {
    await admin.auth.admin.deleteUser(userId); await releaseRoster();
    console.error("Student insert failed:", studentError.message);
    return respond({ error: "Could not complete student account. Contact Web Admin." }, 500);
  }
  const { error: markError } = await admin.from("student_roster").update({ registered_user_id: userId }).eq("student_number", studentNumber);
  if (markError) console.error("Roster user link update failed:", markError.message);
  return respond({ success: true, message: "Account created. You can now sign in." }, 201);
});
