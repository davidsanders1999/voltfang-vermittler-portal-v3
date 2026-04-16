import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY };

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

/**
 * Resolves the authenticated user from the request's Authorization header.
 * Important: verify_jwt is disabled, so we perform the check manually.
 */
export async function resolveAuthUser(
  req: Request,
): Promise<{ id: string; [key: string]: unknown }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseAuth.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

/**
 * Validates that an auth user exists.
 */
export async function ensureAuthUserExists(authId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authId);
  if (error || !data?.user) {
    throw new Error("Auth user not found");
  }
  return data.user;
}

/**
 * Checks if the authenticated user is a superadmin.
 * Returns the admin record or null.
 */
export async function checkSuperAdmin(authId: string) {
  const { data } = await supabaseAdmin
    .from("superadmin")
    .select("id,auth_id,fname,lname")
    .eq("auth_id", authId)
    .maybeSingle();
  return data;
}

/**
 * Requires superadmin access. Throws if not an admin.
 */
export async function requireAdmin(
  authId: string,
): Promise<{ id: string; auth_id: string; fname: string; lname: string }> {
  const admin = await checkSuperAdmin(authId);
  if (!admin) throw new Error("Forbidden");
  return admin;
}

/**
 * Loads a regular user from Supabase by auth_id.
 */
export async function loadLocalUser(authId: string) {
  const { data, error } = await supabaseAdmin
    .from("user")
    .select("id,auth_id,company_id,hubspot_id,created_at")
    .eq("auth_id", authId)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Generates a unique 16-char invite code.
 */
export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
    const { data: existing } = await supabaseAdmin
      .from("usercompany")
      .select("id")
      .eq("invite_code", code)
      .maybeSingle();
    if (!existing) return code;
  }
  throw new Error("Could not generate unique invite code");
}

/**
 * Finds or creates a local company by HubSpot partner ID.
 */
export async function upsertLocalCompanyByHubSpotId(partnerId: number) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("usercompany")
    .select("id,invite_code")
    .eq("hubspot_id", partnerId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const inviteCode = await generateUniqueInviteCode();
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("usercompany")
    .insert({ invite_code: inviteCode, hubspot_id: partnerId })
    .select("id,invite_code")
    .single();
  if (insertError) throw insertError;
  return inserted;
}

/**
 * Creates or updates a local user mapping.
 */
export async function upsertLocalUserMapping(
  authId: string,
  companyId: string,
  hubspotContactId: number,
): Promise<string> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("user")
      .update({ company_id: companyId, hubspot_id: hubspotContactId })
      .eq("auth_id", authId);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("user")
    .insert({
      auth_id: authId,
      company_id: companyId,
      hubspot_id: hubspotContactId,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted.id;
}
