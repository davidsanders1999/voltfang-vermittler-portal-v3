import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { handleCors, json, logMetrics, errorResponse, toHubSpotId } from "../_shared/helpers.ts";
import {
  HUBSPOT_FIELDS,
  HUBSPOT_ENDKUNDE_OBJECT_TYPE,
  HUBSPOT_PARTNER_OBJECT_TYPE,
  HUBSPOT_ANGEBOT_OBJECT_TYPE,
  HUBSPOT_DEAL_STAGE_DEFAULT,
  HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID,
} from "../_shared/constants.ts";
import { hubspotRequest, createMetrics } from "../_shared/hubspot-client.ts";
import {
  createOrReuseContact,
  associateContactWithEndkunde,
} from "../_shared/hubspot-entities.ts";
import {
  resolveAuthUser,
  loadLocalUser,
  supabaseAdmin,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/supabase-admin.ts";
import type { ProjectPayload, RequestMetrics } from "../_shared/types.ts";

// ─── Create Project ──────────────────────────────────────────────────────────

async function createProject(
  localUser: { id: string; company_id: string | null; hubspot_id: number | null },
  payload: ProjectPayload,
  metrics: RequestMetrics,
) {
  if (!localUser.company_id) throw new Error("User has no company mapping");
  if (!localUser.hubspot_id) throw new Error("User has no HubSpot contact mapping");
  if (!payload?.name) throw new Error("Project name is required");

  const { data: localCompany, error: localCompanyError } = await supabaseAdmin
    .from("usercompany")
    .select("hubspot_id")
    .eq("id", localUser.company_id)
    .single();
  if (localCompanyError) throw localCompanyError;
  if (!localCompany?.hubspot_id) throw new Error("Company has no HubSpot partner mapping");

  // 1) Create or reuse Endkunde
  let hubspotEndkunde: Record<string, unknown>;
  try {
    hubspotEndkunde = await hubspotRequest(
      `/crm/v3/objects/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}`,
      "POST",
      {
        properties: {
          [HUBSPOT_FIELDS.endkunde.name]: payload.unternehmen_name,
          [HUBSPOT_FIELDS.endkunde.website]: payload.unternehmen_website ?? "",
          [HUBSPOT_FIELDS.endkunde.street]: payload.unternehmen_street,
          [HUBSPOT_FIELDS.endkunde.zip]: payload.unternehmen_zip,
          [HUBSPOT_FIELDS.endkunde.city]: payload.unternehmen_city,
          [HUBSPOT_FIELDS.endkunde.state]: payload.unternehmen_state,
          [HUBSPOT_FIELDS.endkunde.country]: payload.unternehmen_country,
        },
      },
      { metrics },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isUniqueNameConflict =
      message.includes(HUBSPOT_FIELDS.endkunde.name) &&
      message.includes("already has that value");
    if (!isUniqueNameConflict) throw error;

    const searchResult = await hubspotRequest(
      `/crm/v3/objects/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/search`,
      "POST",
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: HUBSPOT_FIELDS.endkunde.name,
                operator: "EQ",
                value: payload.unternehmen_name,
              },
            ],
          },
        ],
        properties: [HUBSPOT_FIELDS.endkunde.name],
        limit: 1,
      },
      { metrics },
    );

    const results = (searchResult as Record<string, unknown[]>)?.results;
    if (!results?.length) throw error;
    hubspotEndkunde = results[0] as Record<string, unknown>;
  }

  // 2) Create or reuse project contact
  const hubspotContact = await createOrReuseContact(
    {
      kontakt_salutation: payload.kontakt_salutation,
      kontakt_fname: payload.kontakt_fname,
      kontakt_lname: payload.kontakt_lname,
      kontakt_rolle_im_unternehmen: payload.kontakt_rolle_im_unternehmen,
      kontakt_email: payload.kontakt_email,
      kontakt_phone: payload.kontakt_phone,
    },
    undefined,
    metrics,
  );

  // 3) Create deal
  const hubspotDeal = await hubspotRequest(
    "/crm/v3/objects/deals",
    "POST",
    {
      properties: {
        [HUBSPOT_FIELDS.deal.name]: payload.name,
        [HUBSPOT_FIELDS.deal.stage]: HUBSPOT_DEAL_STAGE_DEFAULT,
        [HUBSPOT_FIELDS.deal.estimatedOrderDate]: payload.estimated_order_date ?? undefined,
        [HUBSPOT_FIELDS.deal.estimatedCapacity]: payload.estimated_capacity ?? undefined,
        [HUBSPOT_FIELDS.deal.locationStreet]: payload.location_street,
        [HUBSPOT_FIELDS.deal.locationZip]: payload.location_zip,
        [HUBSPOT_FIELDS.deal.locationCity]: payload.location_city,
        [HUBSPOT_FIELDS.deal.locationState]: payload.location_state,
        [HUBSPOT_FIELDS.deal.locationCountry]: payload.location_country,
        [HUBSPOT_FIELDS.deal.source]: "Vermittlerportal",
        [HUBSPOT_FIELDS.deal.description]: payload.description?.trim() || undefined,
      },
    },
    { metrics },
  );

  // 4) Associate deal <-> endkunde, deal <-> project contact (Kundenkontakt label)
  await hubspotRequest(
    `/crm/v4/objects/deals/${hubspotDeal.id}/associations/default/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/${hubspotEndkunde.id}`,
    "PUT",
    undefined,
    { metrics },
  );

  await hubspotRequest(
    "/crm/v4/associations/deals/contacts/batch/create",
    "POST",
    {
      inputs: [
        {
          types: [{ associationCategory: "USER_DEFINED", associationTypeId: HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID }],
          from: { id: String(hubspotDeal.id) },
          to: { id: String(hubspotContact.id) },
        },
      ],
    },
    { metrics },
  );

  // 5) Direct contact <-> endkunde association
  await associateContactWithEndkunde(
    (hubspotContact as Record<string, unknown>).id as string,
    hubspotEndkunde.id as string,
    metrics,
  );

  // 6) Deal <-> partner association
  await hubspotRequest(
    `/crm/v4/objects/deals/${hubspotDeal.id}/associations/default/${HUBSPOT_PARTNER_OBJECT_TYPE}/${localCompany.hubspot_id}`,
    "PUT",
    undefined,
    { metrics },
  );

  // 7) Deal <-> logged-in Vermittler contact (skip if same as project contact)
  const projectContactId = toHubSpotId((hubspotContact as Record<string, unknown>).id as string);
  if (projectContactId !== localUser.hubspot_id) {
    await hubspotRequest(
      `/crm/v4/objects/deals/${hubspotDeal.id}/associations/default/contacts/${localUser.hubspot_id}`,
      "PUT",
      undefined,
      { metrics },
    );
  }

  return { project: { id: String(hubspotDeal.id), hubspot_id: toHubSpotId(hubspotDeal.id as string) } };
}

// ─── Create Angebot ──────────────────────────────────────────────────────────

interface CreateAngebotParams {
  deal_hubspot_id: string;
  partner_hubspot_id: number;
  produkt_c_i: string;
  deal_name?: string;
  leistung?: number;
  nettokapazitat?: number;
  garantie?: string;
  betonfundament?: string;
  monitoring?: string;
  steuerungsalgorithmen?: string[] | string;
  rechnungsadresse_unternehmensname?: string;
  rechnungsadresse_strasse?: string;
  rechnungsadresse_plz?: string;
  rechnungsadresse_ort?: string;
  rechnungsadresse_bundesland?: string;
  rechnungsadresse_land?: string;
  lieferadresse_unternehmensname?: string;
  lieferadresse_strasse?: string;
  lieferadresse_plz?: string;
  lieferadresse_ort?: string;
  lieferadresse_bundesland?: string;
  lieferadresse_land?: string;
}

async function createAngebot(params: CreateAngebotParams, metrics: RequestMetrics) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const angebotName = `${timestamp} - ${params.deal_name ?? ""}_${params.produkt_c_i}`;

  const properties: Record<string, string | number> = {
    [HUBSPOT_FIELDS.angebot.name]: angebotName,
    [HUBSPOT_FIELDS.angebot.produkt]: params.produkt_c_i,
    [HUBSPOT_FIELDS.angebot.status]: "In Arbeit",
  };
  if (params.leistung !== undefined) properties[HUBSPOT_FIELDS.angebot.leistung] = params.leistung;
  if (params.nettokapazitat !== undefined) properties[HUBSPOT_FIELDS.angebot.nettokapazitat] = params.nettokapazitat;
  if (params.garantie) properties["garantie"] = params.garantie;
  if (params.betonfundament) properties["betonfundament_voltfang_2"] = params.betonfundament;
  if (params.monitoring) properties["monitoring"] = params.monitoring;
  if (params.steuerungsalgorithmen) {
    properties["steuerungsalgorithmen"] = Array.isArray(params.steuerungsalgorithmen)
      ? params.steuerungsalgorithmen.join(";")
      : String(params.steuerungsalgorithmen);
  }
  if (params.rechnungsadresse_unternehmensname) properties["rechnungsadresse_unternehmensname"] = params.rechnungsadresse_unternehmensname;
  if (params.rechnungsadresse_strasse) properties["rechnungsadresse_stra_e___hausnr_"] = params.rechnungsadresse_strasse;
  if (params.rechnungsadresse_plz) properties["rechnungsadresse_postleitzahl"] = params.rechnungsadresse_plz;
  if (params.rechnungsadresse_ort) properties["rechnungsadresse_ort"] = params.rechnungsadresse_ort;
  if (params.rechnungsadresse_bundesland) properties["rechnungsadresse_bundesland"] = params.rechnungsadresse_bundesland;
  if (params.rechnungsadresse_land) properties["rechnungsadresse_land"] = params.rechnungsadresse_land;
  if (params.lieferadresse_unternehmensname) properties["lieferadresse_unternehmensname"] = params.lieferadresse_unternehmensname;
  if (params.lieferadresse_strasse) properties["adresse_projektstandort"] = params.lieferadresse_strasse;
  if (params.lieferadresse_plz) properties["postleitzahl_projekt"] = params.lieferadresse_plz;
  if (params.lieferadresse_ort) properties["ort_projekt"] = params.lieferadresse_ort;
  if (params.lieferadresse_bundesland) properties["bundesland_projekt_dropdown"] = params.lieferadresse_bundesland;
  if (params.lieferadresse_land) properties["land_projekt"] = params.lieferadresse_land;

  const created = await hubspotRequest(
    `/crm/v3/objects/${HUBSPOT_ANGEBOT_OBJECT_TYPE}`,
    "POST",
    { properties },
    { metrics },
  );

  const angebotId = created.id;

  // Associate Deal → Angebot
  await hubspotRequest(
    `/crm/v4/objects/deals/${params.deal_hubspot_id}/associations/default/${HUBSPOT_ANGEBOT_OBJECT_TYPE}/${angebotId}`,
    "PUT",
    undefined,
    { metrics },
  );

  // Associate Partner → Angebot
  if (params.partner_hubspot_id) {
    await hubspotRequest(
      `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${params.partner_hubspot_id}/associations/default/${HUBSPOT_ANGEBOT_OBJECT_TYPE}/${angebotId}`,
      "PUT",
      undefined,
      { metrics },
    );
  }

  return {
    hubspotId: angebotId,
    dealHubspotId: String(params.deal_hubspot_id),
    produkt: (created as Record<string, Record<string, unknown>>).properties?.[HUBSPOT_FIELDS.angebot.produkt] ?? params.produkt_c_i,
    leistungKw: params.leistung ?? null,
    nettokapazitaetKwh: params.nettokapazitat ?? null,
    nettopreis: null,
    status: "Offen",
    erstellungsdatum: (created as Record<string, Record<string, unknown>>).properties?.hs_createdate ?? new Date().toISOString(),
    ablaufdatum: null,
  };
}

// ─── Server ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Supabase env missing" }, 500);
    }

    const body = await req.json();
    if (!body?.action) return json({ error: "Missing action" }, 400);

    const action = String(body.action);
    const startedAt = performance.now();
    const metrics = createMetrics();

    // All mutation actions require an authenticated user
    const authUser = await resolveAuthUser(req);
    const localUser = await loadLocalUser(authUser.id);
    if (!localUser) return json({ error: "Local user not found" }, 404);

    if (action === "create_project") {
      const payload = body.payload as ProjectPayload;
      if (!payload?.name) return json({ error: "Project name is required" }, 400);

      const result = await createProject(localUser, payload, metrics);
      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json(result, 201);
    }

    if (action === "create_angebot") {
      const p = body.payload ?? {};
      if (!p.deal_hubspot_id || !p.partner_hubspot_id || !p.produkt_c_i) {
        return json({ error: "Missing required fields" }, 400);
      }

      const angebot = await createAngebot(
        {
          deal_hubspot_id: String(p.deal_hubspot_id),
          partner_hubspot_id: Number(p.partner_hubspot_id),
          produkt_c_i: String(p.produkt_c_i),
          deal_name: p.deal_name ? String(p.deal_name) : undefined,
          leistung: p.leistung !== undefined ? Number(p.leistung) : undefined,
          nettokapazitat: p.nettokapazitat !== undefined ? Number(p.nettokapazitat) : undefined,
          garantie: p.garantie ? String(p.garantie) : undefined,
          betonfundament: p.betonfundament ? String(p.betonfundament) : undefined,
          monitoring: p.monitoring ? String(p.monitoring) : "Ja",
          steuerungsalgorithmen: p.steuerungsalgorithmen,
          rechnungsadresse_unternehmensname: p.rechnungsadresse_unternehmensname ? String(p.rechnungsadresse_unternehmensname) : undefined,
          rechnungsadresse_strasse: p.rechnungsadresse_strasse ? String(p.rechnungsadresse_strasse) : undefined,
          rechnungsadresse_plz: p.rechnungsadresse_plz ? String(p.rechnungsadresse_plz) : undefined,
          rechnungsadresse_ort: p.rechnungsadresse_ort ? String(p.rechnungsadresse_ort) : undefined,
          rechnungsadresse_bundesland: p.rechnungsadresse_bundesland ? String(p.rechnungsadresse_bundesland) : undefined,
          rechnungsadresse_land: p.rechnungsadresse_land ? String(p.rechnungsadresse_land) : undefined,
          lieferadresse_unternehmensname: p.lieferadresse_unternehmensname ? String(p.lieferadresse_unternehmensname) : undefined,
          lieferadresse_strasse: p.lieferadresse_strasse ? String(p.lieferadresse_strasse) : undefined,
          lieferadresse_plz: p.lieferadresse_plz ? String(p.lieferadresse_plz) : undefined,
          lieferadresse_ort: p.lieferadresse_ort ? String(p.lieferadresse_ort) : undefined,
          lieferadresse_bundesland: p.lieferadresse_bundesland ? String(p.lieferadresse_bundesland) : undefined,
          lieferadresse_land: p.lieferadresse_land ? String(p.lieferadresse_land) : undefined,
        },
        metrics,
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ angebot }, 201);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
});
