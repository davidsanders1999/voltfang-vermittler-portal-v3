import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { handleCors, json, logMetrics, errorResponse, toHubSpotId } from "../_shared/helpers.ts";
import { HUBSPOT_CONTACT_STATUS_PENDING } from "../_shared/constants.ts";
import { createMetrics } from "../_shared/hubspot-client.ts";
import {
  ensureAuthUserExists,
  upsertLocalCompanyByHubSpotId,
  upsertLocalUserMapping,
  supabaseAdmin,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
} from "../_shared/supabase-admin.ts";
import {
  createOrReuseContact,
  createOrReusePartner,
  associateContactWithPartner,
} from "../_shared/hubspot-entities.ts";
import type { RegisterPartnerPayload, JoinPartnerPayload } from "../_shared/types.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return json({ error: "Supabase env missing" }, 500);
    }

    const body = await req.json();
    if (!body?.action) return json({ error: "Missing action" }, 400);

    const action = String(body.action);
    const startedAt = performance.now();
    const metrics = createMetrics();

    if (action === "register_partner") {
      const payload = body.payload as RegisterPartnerPayload;
      if (!payload?.auth_id || !payload?.email || !payload?.company_name) {
        return json({ error: "Missing required fields" }, 400);
      }

      await ensureAuthUserExists(payload.auth_id);

      const hubspotPartner = await createOrReusePartner(payload, metrics);
      const hubspotContact = await createOrReuseContact(
        {
          kontakt_salutation: payload.salutation,
          kontakt_fname: payload.fname,
          kontakt_lname: payload.lname,
          kontakt_rolle_im_unternehmen: payload.rolle_im_unternehmen,
          kontakt_email: payload.email,
          kontakt_phone: payload.phone,
        },
        HUBSPOT_CONTACT_STATUS_PENDING,
        metrics,
      );

      await associateContactWithPartner(
        (hubspotContact as Record<string, unknown>).id as string,
        (hubspotPartner as Record<string, unknown>).id as string,
        metrics,
      );

      const companyRow = await upsertLocalCompanyByHubSpotId(
        toHubSpotId((hubspotPartner as Record<string, unknown>).id as string)!,
      );
      const userId = await upsertLocalUserMapping(
        payload.auth_id,
        companyRow.id,
        toHubSpotId((hubspotContact as Record<string, unknown>).id as string)!,
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json(
        {
          user_id: userId,
          company_id: companyRow.id,
          invite_code: companyRow.invite_code,
          hubspot_contact_id: toHubSpotId((hubspotContact as Record<string, unknown>).id as string),
          hubspot_partner_id: toHubSpotId((hubspotPartner as Record<string, unknown>).id as string),
        },
        201,
      );
    }

    if (action === "join_partner_with_invite") {
      const payload = body.payload as JoinPartnerPayload;
      if (!payload?.auth_id || !payload?.email || !payload?.invitation_code) {
        return json({ error: "Missing required fields" }, 400);
      }

      await ensureAuthUserExists(payload.auth_id);

      const invitationCode = payload.invitation_code.trim().toUpperCase();
      if (!invitationCode) return json({ error: "Invalid invitation code" }, 400);

      const { data: companyRow, error: companyError } = await supabaseAdmin
        .from("usercompany")
        .select("id,invite_code,hubspot_id")
        .eq("invite_code", invitationCode)
        .single();
      if (companyError || !companyRow) return json({ error: "Invalid invitation code" }, 400);
      if (!companyRow.hubspot_id) return json({ error: "Company has no HubSpot mapping" }, 400);

      const hubspotContact = await createOrReuseContact(
        {
          kontakt_salutation: payload.salutation,
          kontakt_fname: payload.fname,
          kontakt_lname: payload.lname,
          kontakt_rolle_im_unternehmen: payload.rolle_im_unternehmen,
          kontakt_email: payload.email,
          kontakt_phone: payload.phone,
        },
        HUBSPOT_CONTACT_STATUS_PENDING,
        metrics,
      );

      await associateContactWithPartner(
        (hubspotContact as Record<string, unknown>).id as string,
        companyRow.hubspot_id,
        metrics,
      );

      const userId = await upsertLocalUserMapping(
        payload.auth_id,
        companyRow.id,
        toHubSpotId((hubspotContact as Record<string, unknown>).id as string)!,
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json(
        {
          user_id: userId,
          company_id: companyRow.id,
          invite_code: companyRow.invite_code,
          hubspot_contact_id: toHubSpotId((hubspotContact as Record<string, unknown>).id as string),
          hubspot_partner_id: companyRow.hubspot_id,
        },
        201,
      );
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
});
