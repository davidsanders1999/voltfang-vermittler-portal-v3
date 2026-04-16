import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/*
  ────────────────────────────────────────────────────────────────────────────
  Legacy Router: hubspot-projects
  ────────────────────────────────────────────────────────────────────────────
  This function now acts as a thin proxy that delegates to the new split
  edge functions. It exists so the frontend can migrate gradually — once all
  frontend code calls the new functions directly, this file can be deleted.
*/

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Maps each action to the new edge function that handles it.
const ACTION_TO_FUNCTION: Record<string, string> = {
  // hubspot-auth
  register_partner: "hubspot-auth",
  join_partner_with_invite: "hubspot-auth",

  // hubspot-context
  get_context: "hubspot-context",
  get_user_context: "hubspot-context",
  get_angebote: "hubspot-context",

  // hubspot-mutations
  create_project: "hubspot-mutations",
  create_angebot: "hubspot-mutations",

  // hubspot-admin
  get_admin_overview: "hubspot-admin",
  get_all_companies: "hubspot-admin",
  get_all_users: "hubspot-admin",
  get_all_projects: "hubspot-admin",
  get_all_angebote: "hubspot-admin",
  unlock_user: "hubspot-admin",
  lock_user: "hubspot-admin",
  delete_user: "hubspot-admin",
  reassign_user_company: "hubspot-admin",
  update_company: "hubspot-admin",
  update_user: "hubspot-admin",
  update_project: "hubspot-admin",
  get_company_deals: "hubspot-admin",
  import_company: "hubspot-admin",
  delete_company: "hubspot-admin",
  preview_contact: "hubspot-admin",
  import_user: "hubspot-admin",
  bulk_preview: "hubspot-admin",
  bulk_import: "hubspot-admin",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body?.action ? String(body.action) : "";

    if (!action) return jsonResponse({ error: "Missing action" }, 400);

    const targetFunction = ACTION_TO_FUNCTION[action];
    if (!targetFunction) return jsonResponse({ error: "Unknown action" }, 400);

    // Forward the request to the appropriate edge function
    const targetUrl = `${SUPABASE_URL}/functions/v1/${targetFunction}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    };

    // Forward the Authorization header if present
    const authHeader = req.headers.get("Authorization");
    if (authHeader) headers["Authorization"] = authHeader;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Forward the response from the target function
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[hubspot-projects] Router error:", msg);
    return jsonResponse({ error: "Ein interner Fehler ist aufgetreten." }, 500);
  }
});
