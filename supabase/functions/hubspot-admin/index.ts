import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  handleCors,
  json,
  logMetrics,
  errorResponse,
  normalizeDealstage,
  parseHubSpotNumber,
  parseCreatedAt,
  mapAngebotStatus,
} from "../_shared/helpers.ts";
import {
  HUBSPOT_FIELDS,
  HUBSPOT_ENDKUNDE_OBJECT_TYPE,
  HUBSPOT_PARTNER_OBJECT_TYPE,
  HUBSPOT_ANGEBOT_OBJECT_TYPE,
  HUBSPOT_CONTACT_STATUS_ACTIVE,
  HUBSPOT_CONTACT_STATUS_PENDING,
} from "../_shared/constants.ts";
import {
  hubspotRequest,
  batchReadHubspotObjects,
  createMetrics,
} from "../_shared/hubspot-client.ts";
import {
  resolveAuthUser,
  requireAdmin,
  upsertLocalCompanyByHubSpotId,
  supabaseAdmin,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../_shared/supabase-admin.ts";
import type { RequestMetrics } from "../_shared/types.ts";

const BULK_IMPORT_DEFAULT_PASSWORD = Deno.env.get("BULK_IMPORT_DEFAULT_PASSWORD") ?? "";

// ─── Helper: getAngebote (reused by get_all_angebote) ────────────────────────

async function getAngebote(companyHubspotId: number, metrics: RequestMetrics) {
  const dealAssocResponse = await hubspotRequest(
    `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}/associations/deals`,
    "GET",
    undefined,
    { metrics },
  );
  const dealIds = ((dealAssocResponse?.results ?? []) as Array<Record<string, unknown>>).map(
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
        for (const r of ((angebotAssoc?.results ?? []) as Array<Record<string, unknown>>)) {
          dealAngebotPairs.push({ dealId, angebotId: String(r.toObjectId) });
        }
      } catch {
        // No angebote for this deal
      }
    }),
  );
  if (dealAngebotPairs.length === 0) return [];

  const angebotIds = [...new Set(dealAngebotPairs.map((p) => p.angebotId))];

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
      const obj = angebotMap.get(id);
      if (!obj) return null;
      const props = (obj as Record<string, Record<string, unknown>>).properties ?? {};
      return {
        hubspotId: id,
        dealHubspotId: angebotDealMap.get(id) ?? "",
        produkt: props[HUBSPOT_FIELDS.angebot.produkt] ?? null,
        leistungKw: parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.leistung]) ?? null,
        nettokapazitaetKwh: parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.nettokapazitat]) ?? null,
        nettopreis: parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.nettopreis]) ?? null,
        status: mapAngebotStatus(props[HUBSPOT_FIELDS.angebot.status] as string | undefined),
        erstellungsdatum: props["hs_createdate"] ?? "",
        ablaufdatum: props[HUBSPOT_FIELDS.angebot.ablaufdatum] ?? null,
      };
    })
    .filter(Boolean);
}

// ─── Helper: paginated listUsers ─────────────────────────────────────────────

async function listAllAuthUsers(): Promise<Array<{ id: string; email?: string }>> {
  const allUsers: Array<{ id: string; email?: string }> = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    const users = data?.users ?? [];
    allUsers.push(...users.map((u) => ({ id: u.id, email: u.email })));
    if (users.length < perPage) break;
    page += 1;
  }
  return allUsers;
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

    // All admin actions require authentication + superadmin role
    const authUser = await resolveAuthUser(req);
    await requireAdmin(authUser.id);

    // ─── get_admin_overview ──────────────────────────────────────────────────

    if (action === "get_admin_overview") {
      const [usersResult, companiesResult] = await Promise.all([
        supabaseAdmin.from("user").select("id,company_id", { count: "exact" }),
        supabaseAdmin.from("usercompany").select("id", { count: "exact" }),
      ]);
      const allUsers = usersResult.data ?? [];

      const userHubspotIds = (
        await supabaseAdmin.from("user").select("hubspot_id")
      ).data?.map((u: Record<string, unknown>) => u.hubspot_id).filter(Boolean) ?? [];

      let activeCount = 0;
      let pendingCount = 0;
      if (userHubspotIds.length > 0) {
        const contactMap = await batchReadHubspotObjects(
          "contacts",
          userHubspotIds as Array<number | string>,
          [HUBSPOT_FIELDS.contact.portalStatus],
          metrics,
        );
        for (const contact of contactMap.values()) {
          const status = (contact as Record<string, Record<string, unknown>>)?.properties?.[HUBSPOT_FIELDS.contact.portalStatus];
          if (status === HUBSPOT_CONTACT_STATUS_ACTIVE) activeCount++;
          else pendingCount++;
        }
      }

      // Angebote count: limited to first 20 companies to avoid timeout
      let totalAngebote = 0;
      const companiesWithHubspot = (
        await supabaseAdmin.from("usercompany").select("hubspot_id").not("hubspot_id", "is", null)
      ).data ?? [];

      await Promise.all(
        companiesWithHubspot.slice(0, 20).map(async (c: Record<string, unknown>) => {
          try {
            const assoc = await hubspotRequest(
              `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${c.hubspot_id}/associations/deals`,
              "GET",
              undefined,
              { metrics },
            );
            const dealIds = ((assoc?.results ?? []) as Array<Record<string, unknown>>).map(
              (r) => String(r.toObjectId),
            );
            await Promise.all(
              dealIds.map(async (dealId) => {
                try {
                  const angebotAssoc = await hubspotRequest(
                    `/crm/v4/objects/deals/${dealId}/associations/${HUBSPOT_ANGEBOT_OBJECT_TYPE}`,
                    "GET",
                    undefined,
                    { metrics },
                  );
                  totalAngebote += ((angebotAssoc?.results ?? []) as unknown[]).length;
                } catch { /* skip */ }
              }),
            );
          } catch { /* skip */ }
        }),
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({
        total_companies: companiesResult.count ?? 0,
        total_users: allUsers.length,
        active_users: activeCount,
        pending_users: pendingCount,
        total_projects: 0,
        open_projects: 0,
        total_angebote: totalAngebote,
      });
    }

    // ─── get_all_companies ───────────────────────────────────────────────────

    if (action === "get_all_companies") {
      const { data: companiesData } = await supabaseAdmin
        .from("usercompany")
        .select("id,hubspot_id,invite_code,created_at,partnerart")
        .order("created_at", { ascending: false });

      const companies = companiesData ?? [];
      const companyIds = companies.map((c: Record<string, unknown>) => c.id as string);

      const { data: userRows } = await supabaseAdmin
        .from("user")
        .select("id,company_id")
        .in("company_id", companyIds);

      const userCountByCompany = new Map<string, number>();
      for (const u of (userRows ?? []) as Array<Record<string, unknown>>) {
        if (u.company_id) {
          userCountByCompany.set(
            u.company_id as string,
            (userCountByCompany.get(u.company_id as string) ?? 0) + 1,
          );
        }
      }

      const hubspotIds = companies.map((c: Record<string, unknown>) => c.hubspot_id).filter(Boolean);
      const partnerMap = hubspotIds.length > 0
        ? await batchReadHubspotObjects(
            HUBSPOT_PARTNER_OBJECT_TYPE,
            hubspotIds as Array<number | string>,
            [
              HUBSPOT_FIELDS.partner.name,
              HUBSPOT_FIELDS.partner.website,
              HUBSPOT_FIELDS.partner.street,
              HUBSPOT_FIELDS.partner.zip,
              HUBSPOT_FIELDS.partner.city,
              HUBSPOT_FIELDS.partner.state,
              HUBSPOT_FIELDS.partner.country,
              HUBSPOT_FIELDS.partner.branch,
              HUBSPOT_FIELDS.partner.partnerType,
            ],
            metrics,
          )
        : new Map();

      const projectCountByCompanyId = new Map<string, number>();
      await Promise.all(
        companies
          .filter((c: Record<string, unknown>) => c.hubspot_id)
          .map(async (c: Record<string, unknown>) => {
            try {
              const assoc = await hubspotRequest(
                `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${c.hubspot_id}/associations/deals`,
                "GET",
                undefined,
                { metrics },
              );
              projectCountByCompanyId.set(
                c.id as string,
                ((assoc?.results ?? []) as unknown[]).length,
              );
            } catch { /* skip */ }
          }),
      );

      const result = companies.map((c: Record<string, unknown>) => {
        const partner = c.hubspot_id
          ? partnerMap.get(String(c.hubspot_id))
          : null;
        const p = (partner as Record<string, Record<string, unknown>> | null)?.properties ?? {};
        return {
          id: c.id,
          hubspot_id: c.hubspot_id ?? undefined,
          name: p[HUBSPOT_FIELDS.partner.name] ?? undefined,
          website: p[HUBSPOT_FIELDS.partner.website] ?? undefined,
          street: p[HUBSPOT_FIELDS.partner.street] ?? undefined,
          zip: p[HUBSPOT_FIELDS.partner.zip] ?? undefined,
          city: p[HUBSPOT_FIELDS.partner.city] ?? undefined,
          bundesland: p[HUBSPOT_FIELDS.partner.state] ?? undefined,
          country: p[HUBSPOT_FIELDS.partner.country] ?? undefined,
          branche_partner: p[HUBSPOT_FIELDS.partner.branch] ?? undefined,
          partnerType: (c.partnerart ?? p[HUBSPOT_FIELDS.partner.partnerType] ?? "Vermittler") as string,
          invite_code: c.invite_code ?? undefined,
          created_at: c.created_at,
          user_count: userCountByCompany.get(c.id as string) ?? 0,
          project_count: projectCountByCompanyId.get(c.id as string) ?? 0,
        };
      });

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ companies: result });
    }

    // ─── get_all_users ───────────────────────────────────────────────────────

    if (action === "get_all_users") {
      const { data: usersData } = await supabaseAdmin
        .from("user")
        .select("id,auth_id,company_id,hubspot_id,created_at")
        .order("created_at", { ascending: false });

      const users = usersData ?? [];

      const companyIds = [...new Set(
        (users as Array<Record<string, unknown>>)
          .map((u) => u.company_id as string)
          .filter(Boolean),
      )];
      const { data: companyRows } = await supabaseAdmin
        .from("usercompany")
        .select("id,partnerart,hubspot_id")
        .in("id", companyIds);

      const companyById = new Map<string, Record<string, unknown>>();
      for (const c of (companyRows ?? []) as Array<Record<string, unknown>>) {
        companyById.set(c.id as string, c);
      }

      const hubspotContactIds = (users as Array<Record<string, unknown>>)
        .map((u) => u.hubspot_id)
        .filter(Boolean);
      const companyHubspotIds = ((companyRows ?? []) as Array<Record<string, unknown>>)
        .map((c) => c.hubspot_id)
        .filter(Boolean);

      const [contactMap, partnerMap] = await Promise.all([
        hubspotContactIds.length > 0
          ? batchReadHubspotObjects(
              "contacts",
              hubspotContactIds as Array<number | string>,
              [
                HUBSPOT_FIELDS.contact.firstName,
                HUBSPOT_FIELDS.contact.lastName,
                HUBSPOT_FIELDS.contact.email,
                HUBSPOT_FIELDS.contact.phone,
                HUBSPOT_FIELDS.contact.salutation,
                HUBSPOT_FIELDS.contact.role,
                HUBSPOT_FIELDS.contact.portalStatus,
              ],
              metrics,
            )
          : Promise.resolve(new Map()),
        companyHubspotIds.length > 0
          ? batchReadHubspotObjects(
              HUBSPOT_PARTNER_OBJECT_TYPE,
              companyHubspotIds as Array<number | string>,
              [HUBSPOT_FIELDS.partner.name],
              metrics,
            )
          : Promise.resolve(new Map()),
      ]);

      const result = (users as Array<Record<string, unknown>>).map((u) => {
        const contact = u.hubspot_id ? contactMap.get(String(u.hubspot_id)) : null;
        const cp = (contact as Record<string, Record<string, unknown>> | null)?.properties ?? {};
        const company = u.company_id ? companyById.get(u.company_id as string) : null;
        const partner = company?.hubspot_id ? partnerMap.get(String(company.hubspot_id)) : null;
        const status = cp[HUBSPOT_FIELDS.contact.portalStatus] ?? "Freischaltung ausstehend";
        return {
          id: u.id,
          auth_id: u.auth_id,
          company_id: u.company_id ?? undefined,
          company_name: (partner as Record<string, Record<string, unknown>> | null)?.properties?.[HUBSPOT_FIELDS.partner.name] ?? undefined,
          hubspot_id: u.hubspot_id ?? undefined,
          fname: cp[HUBSPOT_FIELDS.contact.firstName] ?? "",
          lname: cp[HUBSPOT_FIELDS.contact.lastName] ?? "",
          email: cp[HUBSPOT_FIELDS.contact.email] ?? undefined,
          phone: cp[HUBSPOT_FIELDS.contact.phone] ?? undefined,
          salutation: cp[HUBSPOT_FIELDS.contact.salutation] ?? undefined,
          rolle_im_unternehmen: cp[HUBSPOT_FIELDS.contact.role] ?? undefined,
          vermittlerportal_status: status,
          created_at: u.created_at,
          partner_type: (company?.partnerart ?? "Vermittler") as string,
        };
      });

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ users: result });
    }

    // ─── get_all_projects ────────────────────────────────────────────────────

    if (action === "get_all_projects") {
      const { data: allCompanies } = await supabaseAdmin
        .from("usercompany")
        .select("id,hubspot_id")
        .not("hubspot_id", "is", null);

      const companies = (allCompanies ?? []) as Array<Record<string, unknown>>;
      const allCompanyIds = companies.map((c) => c.id as string);

      const { data: allUsersData } = await supabaseAdmin
        .from("user")
        .select("id,company_id,hubspot_id")
        .in("company_id", allCompanyIds);

      const usersByCompanyId = new Map<string, Array<Record<string, unknown>>>();
      for (const u of ((allUsersData ?? []) as Array<Record<string, unknown>>)) {
        if (u.company_id) {
          const key = u.company_id as string;
          if (!usersByCompanyId.has(key)) usersByCompanyId.set(key, []);
          usersByCompanyId.get(key)!.push(u);
        }
      }

      const companyDealIds = new Map<string, string[]>();
      const allDealIds = new Set<string>();
      await Promise.all(
        companies.map(async (c) => {
          try {
            const assoc = await hubspotRequest(
              `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${c.hubspot_id}/associations/deals`,
              "GET",
              undefined,
              { metrics },
            );
            const dealIds = ((assoc?.results ?? []) as Array<Record<string, unknown>>).map(
              (r) => String(r.toObjectId),
            );
            companyDealIds.set(c.id as string, dealIds);
            for (const id of dealIds) allDealIds.add(id);
          } catch { /* skip */ }
        }),
      );

      if (allDealIds.size === 0) {
        logMetrics(action, startedAt, metrics.hubspotRequestCount);
        return json({ projects: [] });
      }

      const hubspotPartnerIds = companies.map((c) => c.hubspot_id).filter(Boolean);
      const creatorContactIds = new Set<string>();
      for (const users of usersByCompanyId.values()) {
        if (users.length === 1 && users[0].hubspot_id) {
          creatorContactIds.add(String(users[0].hubspot_id));
        }
      }

      const [dealMap, partnerMap, creatorContactMap] = await Promise.all([
        batchReadHubspotObjects(
          "deals",
          [...allDealIds],
          [
            HUBSPOT_FIELDS.deal.name,
            HUBSPOT_FIELDS.deal.stage,
            HUBSPOT_FIELDS.deal.locationCity,
            HUBSPOT_FIELDS.deal.locationCountry,
            "createdate",
          ],
          metrics,
        ),
        hubspotPartnerIds.length > 0
          ? batchReadHubspotObjects(
              HUBSPOT_PARTNER_OBJECT_TYPE,
              hubspotPartnerIds as Array<number | string>,
              [HUBSPOT_FIELDS.partner.name],
              metrics,
            )
          : Promise.resolve(new Map()),
        creatorContactIds.size > 0
          ? batchReadHubspotObjects(
              "contacts",
              [...creatorContactIds],
              [HUBSPOT_FIELDS.contact.firstName, HUBSPOT_FIELDS.contact.lastName],
              metrics,
            )
          : Promise.resolve(new Map()),
      ]);

      const companyById = new Map<string, Record<string, unknown>>();
      for (const c of companies) companyById.set(c.id as string, c);

      const result: Array<Record<string, unknown>> = [];
      for (const [companyId, dealIds] of companyDealIds.entries()) {
        const company = companyById.get(companyId);
        const companyName = company?.hubspot_id
          ? (partnerMap.get(String(company.hubspot_id)) as Record<string, Record<string, unknown>> | undefined)
              ?.properties?.[HUBSPOT_FIELDS.partner.name]
          : undefined;
        const companyUsers = usersByCompanyId.get(companyId) ?? [];
        const singleUser = companyUsers.length === 1 ? companyUsers[0] : null;
        const creatorContact = singleUser?.hubspot_id
          ? creatorContactMap.get(String(singleUser.hubspot_id))
          : null;
        const creatorProps = (creatorContact as Record<string, Record<string, unknown>> | null)?.properties;
        const creatorName = creatorProps
          ? `${creatorProps[HUBSPOT_FIELDS.contact.firstName] ?? ""} ${creatorProps[HUBSPOT_FIELDS.contact.lastName] ?? ""}`.trim()
          : undefined;

        for (const dealId of dealIds) {
          const deal = dealMap.get(dealId) as Record<string, Record<string, unknown>> | undefined;
          const createdAt = parseCreatedAt(deal?.properties?.createdate);
          result.push({
            id: dealId,
            name: deal?.properties?.[HUBSPOT_FIELDS.deal.name] ?? "",
            dealstage: normalizeDealstage(deal?.properties?.[HUBSPOT_FIELDS.deal.stage] as string | undefined),
            company_id: companyId,
            company_name: companyName,
            created_by_user_id: singleUser?.id ?? "",
            creator_name: creatorName,
            hubspot_id: Number(dealId),
            created_at: createdAt,
            location_city: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCity] ?? undefined,
            location_country: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCountry] ?? undefined,
          });
        }
      }

      result.sort((a, b) =>
        new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ projects: result });
    }

    // ─── get_all_angebote ────────────────────────────────────────────────────

    if (action === "get_all_angebote") {
      const { data: allCompanies } = await supabaseAdmin
        .from("usercompany")
        .select("id,hubspot_id")
        .not("hubspot_id", "is", null);

      const allAngebote: Array<Record<string, unknown>> = [];
      await Promise.all(
        ((allCompanies ?? []) as Array<Record<string, unknown>>).map(async (c) => {
          try {
            const angebote = await getAngebote(c.hubspot_id as number, metrics);
            allAngebote.push(
              ...angebote.map((a) => ({ ...a, partnerHubspotId: c.hubspot_id })),
            );
          } catch { /* skip */ }
        }),
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ angebote: allAngebote });
    }

    // ─── unlock_user / lock_user ─────────────────────────────────────────────

    if (action === "unlock_user" || action === "lock_user") {
      const targetUserId = String(body.payload?.user_id ?? "");
      if (!targetUserId) return json({ error: "Missing user_id" }, 400);

      const { data: targetUser } = await supabaseAdmin
        .from("user")
        .select("hubspot_id")
        .eq("id", targetUserId)
        .single();

      if (!targetUser?.hubspot_id) {
        return json({ error: "User not found or no HubSpot mapping" }, 404);
      }

      const newStatus = action === "unlock_user"
        ? HUBSPOT_CONTACT_STATUS_ACTIVE
        : HUBSPOT_CONTACT_STATUS_PENDING;

      await hubspotRequest(
        `/crm/v3/objects/contacts/${targetUser.hubspot_id}`,
        "PATCH",
        { properties: { [HUBSPOT_FIELDS.contact.portalStatus]: newStatus } },
        { metrics },
      );

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true, status: newStatus });
    }

    // ─── delete_user ─────────────────────────────────────────────────────────

    if (action === "delete_user") {
      const targetUserId = String(body.payload?.user_id ?? "");
      if (!targetUserId) return json({ error: "Missing user_id" }, 400);

      const { data: targetUser, error: fetchErr } = await supabaseAdmin
        .from("user")
        .select("id,auth_id,hubspot_id")
        .eq("id", targetUserId)
        .single();

      if (fetchErr || !targetUser) return json({ error: "User not found" }, 404);

      const { error: deleteUserErr } = await supabaseAdmin
        .from("user")
        .delete()
        .eq("id", targetUserId);
      if (deleteUserErr) throw deleteUserErr;

      if (targetUser.auth_id) {
        const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(
          targetUser.auth_id,
        );
        if (deleteAuthErr) throw deleteAuthErr;
      }

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true });
    }

    // ─── reassign_user_company ───────────────────────────────────────────────

    if (action === "reassign_user_company") {
      const targetUserId = String(body.payload?.user_id ?? "");
      const newCompanyId = String(body.payload?.company_id ?? "");
      if (!targetUserId || !newCompanyId) {
        return json({ error: "Missing user_id or company_id" }, 400);
      }

      const { error: updateErr } = await supabaseAdmin
        .from("user")
        .update({ company_id: newCompanyId })
        .eq("id", targetUserId);
      if (updateErr) throw updateErr;

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true });
    }

    // ─── update_company ──────────────────────────────────────────────────────

    if (action === "update_company") {
      const companyId = String(body.payload?.company_id ?? "");
      const fields = body.payload?.fields ?? {};
      if (!companyId) return json({ error: "Missing company_id" }, 400);

      const updates: Record<string, unknown> = {};
      if (fields.partnerType !== undefined) updates.partnerart = fields.partnerType;
      if (fields.hubspot_id !== undefined) {
        updates.hubspot_id =
          fields.hubspot_id === null || fields.hubspot_id === ""
            ? null
            : Number(fields.hubspot_id);
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from("usercompany")
          .update(updates)
          .eq("id", companyId);
        if (updateErr) throw updateErr;
      }

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true });
    }

    // ─── update_user ─────────────────────────────────────────────────────────

    if (action === "update_user") {
      const targetUserId = String(body.payload?.user_id ?? "");
      const fields = body.payload?.fields ?? {};
      if (!targetUserId) return json({ error: "Missing user_id" }, 400);

      const updates: Record<string, unknown> = {};
      if (fields.hubspot_id !== undefined) {
        updates.hubspot_id =
          fields.hubspot_id === null || fields.hubspot_id === ""
            ? null
            : Number(fields.hubspot_id);
      }
      if (fields.company_id !== undefined) {
        updates.company_id = fields.company_id || null;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from("user")
          .update(updates)
          .eq("id", targetUserId);
        if (updateErr) throw updateErr;
      }

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true });
    }

    // ─── update_project ──────────────────────────────────────────────────────

    if (action === "update_project") {
      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true });
    }

    // ─── import_company ──────────────────────────────────────────────────────

    if (action === "import_company") {
      const hubspotId = Number(body.payload?.hubspot_id);
      if (!hubspotId) return json({ error: "Ungültige HubSpot-ID" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("usercompany")
        .select("id")
        .eq("hubspot_id", hubspotId)
        .maybeSingle();
      if (existing) {
        return json({ error: "Ein Unternehmen mit dieser HubSpot-ID existiert bereits." }, 409);
      }

      let partnerName: string | undefined;
      try {
        const partner = await hubspotRequest(
          `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${hubspotId}?properties=${HUBSPOT_FIELDS.partner.name}`,
          "GET",
          undefined,
          { metrics },
        );
        partnerName = (partner as Record<string, Record<string, unknown>>)?.properties?.[
          HUBSPOT_FIELDS.partner.name
        ] as string | undefined;
      } catch {
        return json({ error: "HubSpot-Objekt nicht gefunden. Bitte prüfe die ID." }, 404);
      }

      const company = await upsertLocalCompanyByHubSpotId(hubspotId);

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({
        ok: true,
        company: {
          id: company.id,
          hubspot_id: hubspotId,
          name: partnerName,
          invite_code: company.invite_code,
        },
      });
    }

    // ─── delete_company ──────────────────────────────────────────────────────

    if (action === "delete_company") {
      const companyId = String(body.payload?.company_id ?? "");
      if (!companyId) return json({ error: "Missing company_id" }, 400);

      const { error: unlinkErr } = await supabaseAdmin
        .from("user")
        .update({ company_id: null })
        .eq("company_id", companyId);
      if (unlinkErr) throw unlinkErr;

      const { error: deleteErr } = await supabaseAdmin
        .from("usercompany")
        .delete()
        .eq("id", companyId);
      if (deleteErr) throw deleteErr;

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true });
    }

    // ─── preview_contact ─────────────────────────────────────────────────────

    if (action === "preview_contact") {
      const hubspotContactId = Number(body.payload?.hubspot_contact_id);
      if (!hubspotContactId) return json({ error: "Ungültige HubSpot-Kontakt-ID" }, 400);

      let contact: Record<string, unknown>;
      try {
        contact = await hubspotRequest(
          `/crm/v3/objects/contacts/${hubspotContactId}?properties=${[
            HUBSPOT_FIELDS.contact.email,
            HUBSPOT_FIELDS.contact.firstName,
            HUBSPOT_FIELDS.contact.lastName,
            HUBSPOT_FIELDS.contact.salutation,
            HUBSPOT_FIELDS.contact.role,
          ].join(",")}`,
          "GET",
          undefined,
          { metrics },
        );
      } catch {
        return json({ error: "HubSpot-Kontakt nicht gefunden. Bitte prüfe die ID." }, 404);
      }

      const p = (contact as Record<string, Record<string, unknown>>)?.properties ?? {};
      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({
        email: p[HUBSPOT_FIELDS.contact.email] ?? null,
        fname: p[HUBSPOT_FIELDS.contact.firstName] ?? null,
        lname: p[HUBSPOT_FIELDS.contact.lastName] ?? null,
      });
    }

    // ─── import_user ─────────────────────────────────────────────────────────

    if (action === "import_user") {
      const hubspotContactId = Number(body.payload?.hubspot_contact_id);
      const password = String(body.payload?.password ?? "");
      const companyId = body.payload?.company_id ? String(body.payload.company_id) : null;

      if (!hubspotContactId) return json({ error: "Ungültige HubSpot-Kontakt-ID" }, 400);
      if (!password || password.length < 8) {
        return json({ error: "Passwort muss mindestens 8 Zeichen haben" }, 400);
      }

      let contact: Record<string, unknown>;
      try {
        contact = await hubspotRequest(
          `/crm/v3/objects/contacts/${hubspotContactId}?properties=${[
            HUBSPOT_FIELDS.contact.email,
            HUBSPOT_FIELDS.contact.firstName,
            HUBSPOT_FIELDS.contact.lastName,
          ].join(",")}`,
          "GET",
          undefined,
          { metrics },
        );
      } catch {
        return json({ error: "HubSpot-Kontakt nicht gefunden." }, 404);
      }

      const email = (contact as Record<string, Record<string, unknown>>)?.properties?.[
        HUBSPOT_FIELDS.contact.email
      ] as string | undefined;
      if (!email) return json({ error: "HubSpot-Kontakt hat keine E-Mail-Adresse." }, 400);

      // Check for existing auth user with this email (paginated)
      const existingAuthUsers = await listAllAuthUsers();
      const alreadyExists = existingAuthUsers.some((u) => u.email === email);
      if (alreadyExists) {
        return json({ error: `Ein Nutzer mit der E-Mail ${email} existiert bereits.` }, 409);
      }

      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });
      if (authErr || !authData?.user) {
        throw authErr ?? new Error("Auth-User konnte nicht erstellt werden");
      }

      const authId = authData.user.id;

      const { data: userRow, error: userInsertErr } = await supabaseAdmin
        .from("user")
        .insert({ auth_id: authId, hubspot_id: hubspotContactId, company_id: companyId })
        .select("id")
        .single();
      if (userInsertErr) throw userInsertErr;

      try {
        await hubspotRequest(
          `/crm/v3/objects/contacts/${hubspotContactId}`,
          "PATCH",
          { properties: { [HUBSPOT_FIELDS.contact.portalStatus]: HUBSPOT_CONTACT_STATUS_ACTIVE } },
          { metrics },
        );
      } catch (hsErr) {
        console.warn("[hubspot-admin] import_user: HubSpot status update failed", hsErr);
      }

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true, user: { id: userRow.id, email } });
    }

    // ─── get_company_deals ───────────────────────────────────────────────────

    if (action === "get_company_deals") {
      const companyHubspotId = Number(body.payload?.company_hubspot_id);
      if (!companyHubspotId) return json({ error: "Missing company_hubspot_id" }, 400);

      const dealAssocResponse = await hubspotRequest(
        `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}/associations/deals`,
        "GET",
        undefined,
        { metrics },
      );

      const dealHubspotIds = ((dealAssocResponse?.results ?? []) as Array<Record<string, unknown>>).map(
        (r) => String(r.toObjectId),
      );

      if (dealHubspotIds.length === 0) {
        logMetrics(action, startedAt, metrics.hubspotRequestCount);
        return json({ projects: [] });
      }

      const dealMap = await batchReadHubspotObjects(
        "deals",
        dealHubspotIds,
        [
          HUBSPOT_FIELDS.deal.name,
          HUBSPOT_FIELDS.deal.stage,
          HUBSPOT_FIELDS.deal.locationCity,
          HUBSPOT_FIELDS.deal.locationCountry,
          "createdate",
        ],
        metrics,
      );

      const projects = dealHubspotIds.map((dealId) => {
        const deal = dealMap.get(dealId) as Record<string, Record<string, unknown>> | undefined;
        const dealCreatedAt = parseCreatedAt(deal?.properties?.createdate);
        return {
          id: dealId,
          name: deal?.properties?.[HUBSPOT_FIELDS.deal.name] ?? `Deal ${dealId}`,
          dealstage: normalizeDealstage(deal?.properties?.[HUBSPOT_FIELDS.deal.stage] as string | undefined),
          hubspot_id: Number(dealId),
          company_id: undefined,
          created_by_user_id: "",
          created_at: dealCreatedAt,
          location_city: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCity] ?? undefined,
          location_country: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCountry] ?? undefined,
        };
      });

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ projects });
    }

    // ─── bulk_preview ────────────────────────────────────────────────────────

    if (action === "bulk_preview") {
      type PreviewRow = { company_hubspot_id: number; contact_ids: number[] };
      const rows: PreviewRow[] = body.payload?.rows ?? [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return json({ error: "Keine Zeilen" }, 400);
      }

      const companyIds = [...new Set(rows.map((r) => Number(r.company_hubspot_id)).filter(Boolean))];
      const contactIds = [
        ...new Set(rows.flatMap((r) => (r.contact_ids ?? []).map(Number).filter(Boolean))),
      ];

      const [companyMap, contactMap] = await Promise.all([
        batchReadHubspotObjects(
          HUBSPOT_PARTNER_OBJECT_TYPE,
          companyIds,
          [HUBSPOT_FIELDS.partner.name],
          metrics,
        ),
        contactIds.length > 0
          ? batchReadHubspotObjects(
              "contacts",
              contactIds,
              [HUBSPOT_FIELDS.contact.email],
              metrics,
            )
          : Promise.resolve(new Map<string, Record<string, unknown>>()),
      ]);

      const results = [];
      for (const row of rows) {
        const companyId = Number(row.company_hubspot_id);
        if (!companyId) continue;
        const companyEntry = companyMap.get(String(companyId));
        const users = (row.contact_ids ?? []).map((contactId: number) => {
          const contactEntry = contactMap.get(String(contactId));
          return {
            contact_id: contactId,
            email: (contactEntry as Record<string, Record<string, unknown>> | undefined)
              ?.properties?.[HUBSPOT_FIELDS.contact.email] ?? null,
            contact_found: !!contactEntry,
          };
        });
        results.push({
          company_hubspot_id: companyId,
          company_name: (companyEntry as Record<string, Record<string, unknown>> | undefined)
            ?.properties?.[HUBSPOT_FIELDS.partner.name] ?? null,
          company_found: !!companyEntry,
          users,
        });
      }

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true, results });
    }

    // ─── bulk_import ─────────────────────────────────────────────────────────

    if (action === "bulk_import") {
      const bulkPassword = BULK_IMPORT_DEFAULT_PASSWORD;
      if (!bulkPassword) return json({ error: "Bulk import password not configured" }, 500);

      type BulkRow = { company_hubspot_id: number; contact_ids: number[] };
      const rows: BulkRow[] = body.payload?.rows ?? [];

      if (!Array.isArray(rows) || rows.length === 0) {
        return json({ error: "Keine Zeilen" }, 400);
      }
      if (rows.length > 200) return json({ error: "Maximal 200 Zeilen" }, 400);

      // Paginated auth user list for duplicate checks
      const existingAuthUsers = await listAllAuthUsers();
      const existingEmails = new Set(existingAuthUsers.map((u) => u.email));

      const results: Array<Record<string, unknown>> = [];

      for (const row of rows) {
        const companyHubspotId = Number(row.company_hubspot_id);
        if (!companyHubspotId) continue;

        const companyResult: Record<string, unknown> = {
          company_hubspot_id: companyHubspotId,
          company_name: null,
          company_status: null,
          company_id: null,
          users: [],
        };

        try {
          const { data: existingComp } = await supabaseAdmin
            .from("usercompany")
            .select("id")
            .eq("hubspot_id", companyHubspotId)
            .maybeSingle();

          if (existingComp) {
            companyResult.company_status = "already_exists";
            companyResult.company_id = existingComp.id;
          } else {
            const company = await upsertLocalCompanyByHubSpotId(companyHubspotId);
            companyResult.company_status = "imported";
            companyResult.company_id = company.id;
          }

          try {
            const partner = await hubspotRequest(
              `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}?properties=${HUBSPOT_FIELDS.partner.name}`,
              "GET",
              undefined,
              { metrics },
            );
            companyResult.company_name = (
              partner as Record<string, Record<string, unknown>>
            )?.properties?.[HUBSPOT_FIELDS.partner.name] ?? null;
          } catch { /* Name stays null */ }
        } catch (e) {
          companyResult.company_status = "error";
          companyResult.company_error = e instanceof Error ? e.message : "Fehler";
          results.push(companyResult);
          continue;
        }

        const userResults: Array<Record<string, unknown>> = [];

        for (const contactId of row.contact_ids ?? []) {
          const userResult: Record<string, unknown> = {
            contact_id: contactId,
            email: null,
            status: null,
          };

          try {
            const contact = await hubspotRequest(
              `/crm/v3/objects/contacts/${contactId}?properties=${HUBSPOT_FIELDS.contact.email},${HUBSPOT_FIELDS.contact.firstName},${HUBSPOT_FIELDS.contact.lastName}`,
              "GET",
              undefined,
              { metrics },
            );
            const email = (contact as Record<string, Record<string, unknown>>)?.properties?.[
              HUBSPOT_FIELDS.contact.email
            ] as string | undefined;
            userResult.email = email ?? null;

            if (!email) {
              userResult.status = "error";
              userResult.error = "Kein E-Mail im HubSpot-Kontakt";
              userResults.push(userResult);
              continue;
            }

            if (existingEmails.has(email)) {
              userResult.status = "already_exists";
              userResults.push(userResult);
              continue;
            }

            const { data: authData, error: authErr } =
              await supabaseAdmin.auth.admin.createUser({
                email,
                password: bulkPassword,
                email_confirm: true,
                user_metadata: { must_change_password: true },
              });
            if (authErr || !authData?.user) {
              throw authErr ?? new Error("Auth-User Fehler");
            }

            existingEmails.add(email);

            await supabaseAdmin.from("user").insert({
              auth_id: authData.user.id,
              hubspot_id: contactId,
              company_id: companyResult.company_id,
            });

            try {
              await hubspotRequest(
                `/crm/v3/objects/contacts/${contactId}`,
                "PATCH",
                {
                  properties: {
                    [HUBSPOT_FIELDS.contact.portalStatus]: HUBSPOT_CONTACT_STATUS_ACTIVE,
                  },
                },
                { metrics },
              );
            } catch { /* ignore */ }

            userResult.status = "imported";
          } catch (e) {
            userResult.status = "error";
            userResult.error = e instanceof Error ? e.message : "Fehler";
          }

          userResults.push(userResult);
        }

        companyResult.users = userResults;
        results.push(companyResult);
      }

      logMetrics(action, startedAt, metrics.hubspotRequestCount);
      return json({ ok: true, results });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return errorResponse(error);
  }
});
