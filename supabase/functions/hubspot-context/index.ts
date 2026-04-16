import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  handleCors,
  json,
  logMetrics,
  errorResponse,
  normalizeDealstage,
  parseHubSpotNumber,
  parseCreatedAt,
  mapHubSpotOwnerIdToContact,
  getEndkundeName,
  parseEmbeddedDescription,
  extractFreeTextDescription,
  mapAngebotStatus,
} from "../_shared/helpers.ts";
import {
  HUBSPOT_FIELDS,
  HUBSPOT_PARTNER_OBJECT_TYPE,
  HUBSPOT_ENDKUNDE_OBJECT_TYPE,
  HUBSPOT_ANGEBOT_OBJECT_TYPE,
  HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID,
  HUBSPOT_CONTACT_STATUS_PENDING,
  HUBSPOT_CONTACT_STATUS_ACTIVE,
} from "../_shared/constants.ts";
import {
  hubspotRequest,
  batchReadHubspotObjects,
  createMetrics,
} from "../_shared/hubspot-client.ts";
import {
  resolveAuthUser,
  checkSuperAdmin,
  loadLocalUser,
  supabaseAdmin,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
} from "../_shared/supabase-admin.ts";
import type { RequestMetrics } from "../_shared/types.ts";

// ── get_context ──────────────────────────────────────────────────────────────

async function getContext(
  localUser: { id: string; company_id: string | null },
  metrics: RequestMetrics,
) {
  if (!localUser.company_id) return { projects: [], user: localUser };

  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from("usercompany")
    .select("hubspot_id")
    .eq("id", localUser.company_id)
    .single();
  if (companyError || !companyRow?.hubspot_id)
    return { projects: [], user: localUser };

  // Get all users of the company (for creator logic)
  const { data: companyUsers } = await supabaseAdmin
    .from("user")
    .select("id,hubspot_id")
    .eq("company_id", localUser.company_id);
  const users = companyUsers ?? [];
  const singleUser = users.length === 1 ? users[0] : null;
  const creatorContactId = singleUser?.hubspot_id
    ? String(singleUser.hubspot_id)
    : null;

  // Load all deal IDs from HubSpot Partner→Deals association
  let dealIds: string[] = [];
  try {
    const assocResponse = await hubspotRequest(
      `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyRow.hubspot_id}/associations/deals`,
      "GET",
      undefined,
      { metrics },
    );
    dealIds = ((assocResponse?.results ?? []) as Array<{ toObjectId: unknown }>)
      .map((r) => String(r.toObjectId))
      .filter(Boolean);
  } catch (assocError) {
    console.error(
      `[getContext] Failed to fetch deals for partner ${companyRow.hubspot_id}:`,
      assocError,
    );
    return { projects: [], user: localUser };
  }

  if (dealIds.length === 0) return { projects: [], user: localUser };

  const dealKundenkontaktIdMap = new Map<string, string>();
  const dealEndkundeIdMap = new Map<string, string>();
  let dealById = new Map<string, Record<string, unknown>>();
  let contactById = new Map<string, Record<string, unknown>>();
  let endkundeById = new Map<string, Record<string, unknown>>();

  try {
    // Round 1: Deals + both association lists in parallel
    const [resolvedDeals, contactAssocResponse, endkundeAssocResponse] =
      await Promise.all([
        batchReadHubspotObjects(
          "deals",
          dealIds,
          [
            HUBSPOT_FIELDS.deal.name,
            HUBSPOT_FIELDS.deal.ownerId,
            HUBSPOT_FIELDS.deal.stage,
            HUBSPOT_FIELDS.deal.estimatedOrderDate,
            HUBSPOT_FIELDS.deal.estimatedCapacity,
            HUBSPOT_FIELDS.deal.offeredCapacity,
            HUBSPOT_FIELDS.deal.locationStreet,
            HUBSPOT_FIELDS.deal.locationZip,
            HUBSPOT_FIELDS.deal.locationCity,
            HUBSPOT_FIELDS.deal.locationState,
            HUBSPOT_FIELDS.deal.locationCountry,
            HUBSPOT_FIELDS.deal.source,
            HUBSPOT_FIELDS.deal.description,
            HUBSPOT_FIELDS.deal.amount,
            HUBSPOT_FIELDS.deal.closeDate,
            "createdate",
          ],
          metrics,
        ),
        hubspotRequest(
          "/crm/v4/associations/deals/contacts/batch/read",
          "POST",
          { inputs: dealIds.map((id) => ({ id })) },
          { metrics },
        ),
        hubspotRequest(
          `/crm/v4/associations/deals/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/batch/read`,
          "POST",
          { inputs: dealIds.map((id) => ({ id })) },
          { metrics },
        ),
      ]);

    dealById = resolvedDeals;

    // Contact associations: only Kundenkontakt label (typeId 225)
    for (const item of (contactAssocResponse?.results ?? []) as Array<{
      from?: { id: unknown };
      to?: Array<{
        toObjectId: unknown;
        associationTypes?: Array<{ typeId: unknown; label?: string }>;
      }>;
    }>) {
      const dealId = String(item.from?.id);
      const toList = item.to ?? [];
      if (toList.length === 0) continue;
      const matched = toList.find((t) =>
        (t.associationTypes ?? []).some(
          (at) =>
            Number(at.typeId) === HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID ||
            String(at.label ?? "").toLowerCase() === "kundenkontakt",
        ),
      );
      if (matched)
        dealKundenkontaktIdMap.set(dealId, String(matched.toObjectId));
    }

    // Endkunde associations: take first (lowest ID)
    for (const item of (endkundeAssocResponse?.results ?? []) as Array<{
      from?: { id: unknown };
      to?: Array<{ toObjectId: unknown }>;
    }>) {
      const dealId = String(item.from?.id);
      const toList = item.to ?? [];
      if (toList.length > 0) {
        const sorted = [...toList].sort(
          (a, b) => Number(a.toObjectId) - Number(b.toObjectId),
        );
        dealEndkundeIdMap.set(dealId, String(sorted[0].toObjectId));
      }
    }

    // Round 2: Contacts + Endkunden in parallel batch
    const kundenkontaktIds = [...new Set(dealKundenkontaktIdMap.values())];
    const endkundeIdsFromAssoc = [...new Set(dealEndkundeIdMap.values())];
    const allContactIds = [
      ...new Set([
        ...kundenkontaktIds,
        ...(creatorContactId ? [creatorContactId] : []),
      ]),
    ];

    const [resolvedContacts, resolvedEndkunden] = await Promise.all([
      allContactIds.length > 0
        ? batchReadHubspotObjects(
            "contacts",
            allContactIds,
            [
              HUBSPOT_FIELDS.contact.salutation,
              HUBSPOT_FIELDS.contact.firstName,
              HUBSPOT_FIELDS.contact.lastName,
              HUBSPOT_FIELDS.contact.role,
              HUBSPOT_FIELDS.contact.email,
              HUBSPOT_FIELDS.contact.phone,
              HUBSPOT_FIELDS.contact.portalStatus,
            ],
            metrics,
          )
        : Promise.resolve(new Map<string, Record<string, unknown>>()),
      endkundeIdsFromAssoc.length > 0
        ? batchReadHubspotObjects(
            HUBSPOT_ENDKUNDE_OBJECT_TYPE,
            endkundeIdsFromAssoc,
            [
              HUBSPOT_FIELDS.endkunde.name,
              HUBSPOT_FIELDS.endkunde.website,
              HUBSPOT_FIELDS.endkunde.street,
              HUBSPOT_FIELDS.endkunde.zip,
              HUBSPOT_FIELDS.endkunde.city,
              HUBSPOT_FIELDS.endkunde.state,
              HUBSPOT_FIELDS.endkunde.country,
            ],
            metrics,
          )
        : Promise.resolve(new Map<string, Record<string, unknown>>()),
    ]);

    contactById = resolvedContacts;
    endkundeById = resolvedEndkunden;
  } catch (error) {
    console.error("Batch hydration failed, fallback to minimal DTOs", error);
  }

  const creatorContact = creatorContactId
    ? contactById.get(creatorContactId)
    : null;
  const creatorProps = (creatorContact as Record<string, Record<string, unknown>> | null)?.properties;
  const creator = creatorProps
    ? {
        fname: (creatorProps[HUBSPOT_FIELDS.contact.firstName] as string) ?? "",
        lname: (creatorProps[HUBSPOT_FIELDS.contact.lastName] as string) ?? "",
      }
    : { fname: "", lname: "" };

  const hydrated = dealIds.map((dealId) => {
    try {
      const deal = dealById.get(dealId) as Record<string, Record<string, unknown>> | undefined;
      const dp = deal?.properties ?? {};
      const kundenkontaktId = dealKundenkontaktIdMap.get(dealId);
      const contact = kundenkontaktId
        ? (contactById.get(kundenkontaktId) as Record<string, Record<string, unknown>> | undefined)
        : null;
      const cp = contact?.properties ?? {};
      const endkundeId = dealEndkundeIdMap.get(dealId);
      const endkunde = endkundeId
        ? (endkundeById.get(endkundeId) as Record<string, Record<string, unknown>> | undefined)
        : null;
      const ep = endkunde?.properties ?? {};

      const rawDescription = dp[HUBSPOT_FIELDS.deal.description] as string | undefined;
      const embedded = parseEmbeddedDescription(rawDescription);
      const freeTextDescription = extractFreeTextDescription(rawDescription);
      const offeredCapacity =
        parseHubSpotNumber(dp[HUBSPOT_FIELDS.deal.offeredCapacity]) ??
        undefined;
      const vfContact = mapHubSpotOwnerIdToContact(dp[HUBSPOT_FIELDS.deal.ownerId]);

      return {
        id: dealId,
        name: (dp[HUBSPOT_FIELDS.deal.name] as string) ?? "",
        description: freeTextDescription,
        vf_contact_name: vfContact?.name ?? (embedded.vf_contact_name as string) ?? undefined,
        vf_contact_email: vfContact?.email ?? (embedded.vf_contact_email as string) ?? undefined,
        vf_contact_phone: vfContact?.phone ?? (embedded.vf_contact_phone as string) ?? undefined,
        dealstage: normalizeDealstage(dp[HUBSPOT_FIELDS.deal.stage] as string | undefined),
        location_street: (dp[HUBSPOT_FIELDS.deal.locationStreet] as string) ?? (embedded.location_street as string) ?? "",
        location_zip: (dp[HUBSPOT_FIELDS.deal.locationZip] as string) ?? (embedded.location_zip as string) ?? "",
        location_city: (dp[HUBSPOT_FIELDS.deal.locationCity] as string) ?? (embedded.location_city as string) ?? "",
        location_state: (dp[HUBSPOT_FIELDS.deal.locationState] as string) ?? (embedded.location_state as string) ?? "",
        location_country: (dp[HUBSPOT_FIELDS.deal.locationCountry] as string) ?? (embedded.location_country as string) ?? "",
        estimated_order_date: (dp[HUBSPOT_FIELDS.deal.estimatedOrderDate] as string) ?? (embedded.estimated_order_date as string) ?? undefined,
        estimated_capacity: (dp[HUBSPOT_FIELDS.deal.estimatedCapacity] as string) ?? (embedded.estimated_capacity as string) ?? undefined,
        offered_capacity: offeredCapacity,
        deal_value: parseHubSpotNumber(dp[HUBSPOT_FIELDS.deal.amount]) ?? undefined,
        close_date: (dp[HUBSPOT_FIELDS.deal.closeDate] as string) ?? undefined,
        unternehmen_name: getEndkundeName(ep as Record<string, unknown>, (embedded.unternehmen_name as string) ?? ""),
        company_name: getEndkundeName(ep as Record<string, unknown>, (embedded.unternehmen_name as string) ?? ""),
        unternehmen_website: (ep[HUBSPOT_FIELDS.endkunde.website] as string) ?? (embedded.unternehmen_website as string) ?? "",
        unternehmen_street: (ep[HUBSPOT_FIELDS.endkunde.street] as string) ?? (embedded.unternehmen_street as string) ?? "",
        unternehmen_zip: (ep[HUBSPOT_FIELDS.endkunde.zip] as string) ?? (embedded.unternehmen_zip as string) ?? "",
        unternehmen_city: (ep[HUBSPOT_FIELDS.endkunde.city] as string) ?? (embedded.unternehmen_city as string) ?? "",
        unternehmen_state: (ep[HUBSPOT_FIELDS.endkunde.state] as string) ?? (embedded.unternehmen_state as string) ?? "",
        unternehmen_country: (ep[HUBSPOT_FIELDS.endkunde.country] as string) ?? (embedded.unternehmen_country as string) ?? "",
        kontakt_salutation: (cp[HUBSPOT_FIELDS.contact.salutation] as string) ?? (embedded.kontakt_salutation as string) ?? "",
        kontakt_fname: (cp[HUBSPOT_FIELDS.contact.firstName] as string) ?? (embedded.kontakt_fname as string) ?? "",
        kontakt_lname: (cp[HUBSPOT_FIELDS.contact.lastName] as string) ?? (embedded.kontakt_lname as string) ?? "",
        kontakt_email: (cp[HUBSPOT_FIELDS.contact.email] as string) ?? (embedded.kontakt_email as string) ?? "",
        kontakt_phone: (cp[HUBSPOT_FIELDS.contact.phone] as string) ?? (embedded.kontakt_phone as string) ?? "",
        kontakt_rolle_im_unternehmen: (cp[HUBSPOT_FIELDS.contact.role] as string) ?? (embedded.kontakt_rolle_im_unternehmen as string) ?? "",
        created_at: parseCreatedAt(dp.createdate),
        created_by_user_id: singleUser?.id ?? "",
        creator,
        hubspot_id: Number(dealId),
      };
    } catch (error) {
      console.error(`Hydration for deal ${dealId} failed`, error);
      return {
        id: dealId, name: "", description: undefined,
        vf_contact_name: undefined, vf_contact_email: undefined, vf_contact_phone: undefined,
        dealstage: "Eingangsprüfung",
        location_street: "", location_zip: "", location_city: "", location_state: "", location_country: "",
        estimated_order_date: undefined, estimated_capacity: undefined, offered_capacity: undefined,
        deal_value: undefined, close_date: undefined,
        unternehmen_name: "", company_name: "",
        unternehmen_website: "", unternehmen_street: "", unternehmen_zip: "",
        unternehmen_city: "", unternehmen_state: "", unternehmen_country: "",
        kontakt_salutation: "", kontakt_fname: "", kontakt_lname: "",
        kontakt_email: "", kontakt_phone: "", kontakt_rolle_im_unternehmen: "",
        created_at: new Date().toISOString(), created_by_user_id: "",
        creator: { fname: "", lname: "" }, hubspot_id: Number(dealId),
      };
    }
  });

  hydrated.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { projects: hydrated, user: localUser };
}

// ── get_user_context ─────────────────────────────────────────────────────────

async function getUserContext(
  localUser: {
    id: string;
    auth_id: string;
    company_id: string | null;
    hubspot_id: number | null;
    created_at: string;
  },
  metrics: RequestMetrics,
) {
  if (!localUser.company_id) {
    return { user: localUser, company: null, team_members: [] };
  }

  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from("usercompany")
    .select("id,invite_code,hubspot_id,created_at,partnerart")
    .eq("id", localUser.company_id)
    .single();
  if (companyError || !companyRow) throw new Error("Local company not found");

  // Fetch contact and partner in parallel
  const [contact, partner] = await Promise.all([
    localUser.hubspot_id
      ? hubspotRequest(
          `/crm/v3/objects/contacts/${localUser.hubspot_id}?properties=${[
            HUBSPOT_FIELDS.contact.salutation,
            HUBSPOT_FIELDS.contact.firstName,
            HUBSPOT_FIELDS.contact.lastName,
            HUBSPOT_FIELDS.contact.role,
            HUBSPOT_FIELDS.contact.email,
            HUBSPOT_FIELDS.contact.phone,
            HUBSPOT_FIELDS.contact.portalStatus,
          ].join(",")}`,
          "GET",
          undefined,
          { metrics },
        )
      : Promise.resolve(null),
    companyRow.hubspot_id
      ? hubspotRequest(
          `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyRow.hubspot_id}?properties=${[
            HUBSPOT_FIELDS.partner.name,
            HUBSPOT_FIELDS.partner.website,
            HUBSPOT_FIELDS.partner.street,
            HUBSPOT_FIELDS.partner.zip,
            HUBSPOT_FIELDS.partner.city,
            HUBSPOT_FIELDS.partner.state,
            HUBSPOT_FIELDS.partner.country,
            HUBSPOT_FIELDS.partner.branch,
            HUBSPOT_FIELDS.partner.partnerType,
          ].join(",")}`,
          "GET",
          undefined,
          { metrics },
        )
      : Promise.resolve(null),
  ]);

  // Team members: batch-read contacts instead of N individual requests
  const { data: teamRows, error: teamError } = await supabaseAdmin
    .from("user")
    .select("id,hubspot_id,created_at")
    .eq("company_id", localUser.company_id)
    .order("created_at", { ascending: true });
  if (teamError) throw teamError;

  const teamHubspotIds = (teamRows ?? [])
    .map((r: { hubspot_id: number | null }) => r.hubspot_id)
    .filter(Boolean) as number[];

  const teamContactMap =
    teamHubspotIds.length > 0
      ? await batchReadHubspotObjects(
          "contacts",
          teamHubspotIds,
          [
            HUBSPOT_FIELDS.contact.firstName,
            HUBSPOT_FIELDS.contact.lastName,
            HUBSPOT_FIELDS.contact.email,
            HUBSPOT_FIELDS.contact.portalStatus,
          ],
          metrics,
        )
      : new Map<string, Record<string, unknown>>();

  const teamMembers = (teamRows ?? []).map(
    (row: { id: string; hubspot_id: number | null; created_at: string }) => {
      const memberContact = row.hubspot_id
        ? (teamContactMap.get(String(row.hubspot_id)) as Record<string, Record<string, unknown>> | undefined)
        : null;
      const mp = memberContact?.properties ?? {};
      const memberStatus =
        (mp[HUBSPOT_FIELDS.contact.portalStatus] as string) ??
        HUBSPOT_CONTACT_STATUS_PENDING;
      return {
        id: row.id,
        fname: (mp[HUBSPOT_FIELDS.contact.firstName] as string) ?? "",
        lname: (mp[HUBSPOT_FIELDS.contact.lastName] as string) ?? "",
        email: (mp[HUBSPOT_FIELDS.contact.email] as string) ?? undefined,
        vermittlerportal_status: memberStatus,
        is_unlocked: memberStatus === HUBSPOT_CONTACT_STATUS_ACTIVE,
        created_at: row.created_at,
      };
    },
  );

  const cp = (contact as Record<string, Record<string, unknown>> | null)?.properties ?? {};
  const pp = (partner as Record<string, Record<string, unknown>> | null)?.properties ?? {};
  const userStatus =
    (cp[HUBSPOT_FIELDS.contact.portalStatus] as string) ??
    HUBSPOT_CONTACT_STATUS_PENDING;

  return {
    user: {
      id: localUser.id,
      auth_id: localUser.auth_id,
      company_id: localUser.company_id,
      hubspot_id: localUser.hubspot_id ?? undefined,
      created_at: localUser.created_at,
      fname: (cp[HUBSPOT_FIELDS.contact.firstName] as string) ?? "",
      lname: (cp[HUBSPOT_FIELDS.contact.lastName] as string) ?? "",
      email: (cp[HUBSPOT_FIELDS.contact.email] as string) ?? undefined,
      phone: (cp[HUBSPOT_FIELDS.contact.phone] as string) ?? undefined,
      rolle_im_unternehmen: (cp[HUBSPOT_FIELDS.contact.role] as string) ?? undefined,
      salutation: (cp[HUBSPOT_FIELDS.contact.salutation] as string) ?? undefined,
      vermittlerportal_status: userStatus,
      is_unlocked: userStatus === HUBSPOT_CONTACT_STATUS_ACTIVE,
    },
    company: {
      id: companyRow.id,
      hubspot_id: companyRow.hubspot_id ?? undefined,
      invite_code: companyRow.invite_code,
      created_at: companyRow.created_at,
      name: (pp[HUBSPOT_FIELDS.partner.name] as string) ?? "",
      website: (pp[HUBSPOT_FIELDS.partner.website] as string) ?? undefined,
      street: (pp[HUBSPOT_FIELDS.partner.street] as string) ?? "",
      zip: (pp[HUBSPOT_FIELDS.partner.zip] as string) ?? "",
      city: (pp[HUBSPOT_FIELDS.partner.city] as string) ?? "",
      bundesland: (pp[HUBSPOT_FIELDS.partner.state] as string) ?? undefined,
      country: (pp[HUBSPOT_FIELDS.partner.country] as string) ?? "",
      branche_partner: (pp[HUBSPOT_FIELDS.partner.branch] as string) ?? "",
      partnerType: (companyRow.partnerart ?? "Vermittler") as
        | "Vermittler"
        | "Vertriebspartner",
    },
    team_members: teamMembers,
  };
}

// ── get_angebote ─────────────────────────────────────────────────────────────

async function getAngebote(
  companyHubspotId: number,
  metrics: RequestMetrics,
) {
  const dealAssocResponse = await hubspotRequest(
    `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}/associations/deals`,
    "GET",
    undefined,
    { metrics },
  );
  const dealIds = ((dealAssocResponse?.results ?? []) as Array<{ toObjectId: unknown }>).map(
    (r) => String(r.toObjectId),
  );
  if (dealIds.length === 0) return [];

  const dealAngebotPairs: Array<{ dealId: string; angebotId: string }> = [];
  await Promise.all(
    dealIds.map(async (dealId) => {
      try {
        const angebotAssoc = await hubspotRequest(
          `/crm/v4/objects/deals/${dealId}/associations/${HUBSPOT_ANGEBOT_OBJECT_TYPE}`,
          "GET",
          undefined,
          { metrics },
        );
        for (const r of (angebotAssoc?.results ?? []) as Array<{ toObjectId: unknown }>) {
          dealAngebotPairs.push({
            dealId,
            angebotId: String(r.toObjectId),
          });
        }
      } catch {
        // No angebote for this deal
      }
    }),
  );
  if (dealAngebotPairs.length === 0) return [];

  const angebotIds = [
    ...new Set(dealAngebotPairs.map((p) => p.angebotId)),
  ];

  const angebotMap = await batchReadHubspotObjects(
    HUBSPOT_ANGEBOT_OBJECT_TYPE,
    angebotIds,
    [
      HUBSPOT_FIELDS.angebot.produkt,
      HUBSPOT_FIELDS.angebot.leistung,
      HUBSPOT_FIELDS.angebot.nettokapazitat,
      HUBSPOT_FIELDS.angebot.nettopreis,
      HUBSPOT_FIELDS.angebot.ablaufdatum,
      HUBSPOT_FIELDS.angebot.status,
      "hs_createdate",
    ],
    metrics,
  );

  const angebotDealMap = new Map<string, string>(
    dealAngebotPairs.map(({ dealId, angebotId }) => [angebotId, dealId]),
  );

  return angebotIds
    .map((id) => {
      const obj = angebotMap.get(id) as Record<string, Record<string, unknown>> | undefined;
      if (!obj) return null;
      const props = obj.properties ?? {};
      return {
        hubspotId: id,
        dealHubspotId: angebotDealMap.get(id) ?? "",
        produkt: (props[HUBSPOT_FIELDS.angebot.produkt] as string) ?? null,
        leistungKw:
          parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.leistung]) ?? null,
        nettokapazitaetKwh:
          parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.nettokapazitat]) ??
          null,
        nettopreis:
          parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.nettopreis]) ?? null,
        status: mapAngebotStatus(props[HUBSPOT_FIELDS.angebot.status] as string | undefined),
        erstellungsdatum: (props["hs_createdate"] as string) ?? "",
        ablaufdatum:
          (props[HUBSPOT_FIELDS.angebot.ablaufdatum] as string) ?? null,
      };
    })
    .filter(Boolean);
}

// ── Main Handler ─────────────────────────────────────────────────────────────

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

    const authUser = await resolveAuthUser(req);
    const localSuperAdmin = await checkSuperAdmin(authUser.id);
    const isAdmin = localSuperAdmin !== null;

    if (action === "get_context") {
      if (isAdmin) {
        if (body.payload?.target_company_id) {
          const fakeUser = {
            id: localSuperAdmin!.id,
            company_id: String(body.payload.target_company_id),
          };
          const context = await getContext(fakeUser, metrics);
          logMetrics(action, startedAt, metrics.hubspotRequestCount);
          return json(context);
        }
        return json({ admin: localSuperAdmin });
      }
      const localUser = await loadLocalUser(authUser.id);
      if (!localUser) return json({ error: "Local user not found" }, 404);
      const context = await getContext(localUser, metrics);
      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json(context);
    }

    if (action === "get_user_context") {
      if (isAdmin) {
        logMetrics(action, startedAt, metrics.hubspotRequestCount);
        return json({ admin: localSuperAdmin });
      }
      const localUser = await loadLocalUser(authUser.id);
      if (!localUser) return json({ error: "Local user not found" }, 404);
      const context = await getUserContext(localUser, metrics);
      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json(context);
    }

    if (action === "get_angebote") {
      const companyHubspotId = Number(body.payload?.company_hubspot_id);
      if (!companyHubspotId)
        return json({ error: "Missing company_hubspot_id" }, 400);
      const angebote = await getAngebote(companyHubspotId, metrics);
      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ angebote });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
});
