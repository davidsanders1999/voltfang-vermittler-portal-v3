// @ts-nocheck
/*
  ------------------------------------------------------------
  Edge Function: hubspot-projects
  ------------------------------------------------------------
  Was diese Function macht (vereinfacht):

  1) Sie nimmt Requests aus dem Frontend an.
  2) Sie prueft, welcher Supabase-User den Request ausfuehrt.
  3) Sie liest/erstellt Daten in HubSpot (Deal, Kontakt, Endkunde).
  4) Sie speichert nur die noetigen Zuordnungs-IDs in Supabase.

  Wichtige Architektur-Idee:
  - Fachdaten liegen in HubSpot.
  - Supabase dient hier vor allem fuer Authentifizierung + Mapping.
*/
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ProjectPayload = {
  name: string;
  description?: string;
  estimated_order_date?: string;
  estimated_capacity?: string;
  location_street: string;
  location_zip: string;
  location_city: string;
  location_state: string;
  location_country: string;
  unternehmen_name: string;
  unternehmen_website?: string;
  unternehmen_street: string;
  unternehmen_zip: string;
  unternehmen_city: string;
  unternehmen_state: string;
  unternehmen_country: string;
  kontakt_salutation: string;
  kontakt_fname: string;
  kontakt_lname: string;
  kontakt_email: string;
  kontakt_phone: string;
  kontakt_rolle_im_unternehmen: string;
};

type RegisterPartnerPayload = {
  auth_id: string;
  email: string;
  salutation: string;
  fname: string;
  lname: string;
  rolle_im_unternehmen: string;
  phone?: string;
  company_name: string;
  website?: string;
  street: string;
  zip: string;
  city: string;
  bundesland: string;
  country: string;
  branche_partner: string;
};

type JoinPartnerPayload = {
  auth_id: string;
  email: string;
  salutation: string;
  fname: string;
  lname: string;
  rolle_im_unternehmen: string;
  phone?: string;
  invitation_code: string;
};

type HubSpotContactInput = {
  kontakt_salutation: string;
  kontakt_fname: string;
  kontakt_lname: string;
  kontakt_rolle_im_unternehmen: string;
  kontakt_email: string;
  kontakt_phone?: string;
};

// Die lokale Supabase-Projektzeile enthaelt nur Referenzen zu HubSpot-Objekten.
type LocalProject = {
  id: string;
  created_at: string;
  created_by_user_id: string;
  hubspot_id: number | null;
};

// Konfigurationen und Secrets aus der Laufzeitumgebung.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const HUBSPOT_ACCESS_TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") ?? "";
const HUBSPOT_ENDKUNDE_OBJECT_TYPE = "2-57928694";
const HUBSPOT_PARTNER_OBJECT_TYPE = "2-57928699";
const HUBSPOT_ANGEBOT_OBJECT_TYPE = "2-57928700";
// Zuordnungslabel Deal → Kontakt (USER_DEFINED, typeId 225 = Deal→Contact Richtung)
// Hinweis: 224 = Contact→Deal, 225 = Deal→Contact (HubSpot erstellt Label-Paare)
const HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID = 225;
const HUBSPOT_CONTACT_STATUS_PENDING = "Freischaltung ausstehend";
const HUBSPOT_CONTACT_STATUS_ACTIVE = "Aktiv";

const HUBSPOT_DEAL_STAGE_DEFAULT = "141674304"; // 01_Eingangsprüfung (02_Partnerprojekte)

// Zentrale Zuordnung zwischen App-Feldern und HubSpot-internen Property-Namen.
const HUBSPOT_FIELDS = {
  deal: {
    stage: "dealstage",
    name: "dealname",
    ownerId: "hubspot_owner_id",
    estimatedOrderDate: "voraussichtliches_bestelldatum",
    estimatedCapacity: "geschatzte_speichergro_e",
    offeredCapacity: "speicherkapazitat__kwh___angebot_",
    locationStreet: "adresse_des_projektstandorts__angebot_fp_",
    locationZip: "postleitzahl_projekt__ek_",
    locationCity: "projektort__angebot__fp_",
    locationState: "bundesland_projekt_dropdown__ek_",
    locationCountry: "land_projekt__ek_",
    source: "quelle",
    description: "description",
    amount: "amount",
    closeDate: "closedate",
  },
  endkunde: {
    name: "name_des_endkunen",
    website: "webseite",
    street: "stra_e",
    zip: "postleitzahl",
    city: "ort",
    state: "bundesland",
    country: "land",
  },
  contact: {
    salutation: "salutation",
    firstName: "firstname",
    lastName: "lastname",
    role: "rolle_im_unternehmen",
    email: "email",
    phone: "phone",
    portalStatus: "vermittlerportal_status",
  },
  partner: {
    name: "partnername",
    website: "webseite",
    street: "strasse_partner",
    zip: "postleitzahl_partner",
    city: "ort",
    state: "bundesland",
    country: "land",
    partnerType: "partnerart",
    branch: "branche_partner",
  },
  angebot: {
    name: "name_des_angebot",
    produkt: "produkt_c_i",
    leistung: "leistung",
    nettokapazitat: "nettokapazitat",
    nettopreis: "nettopreis",
    ablaufdatum: "ablaufdatum",
    status: "status",
  },
} as const;

const PARTNER_BRANCH_OPTION_MAP: Record<string, string> = {
  "Agentur": "agentur",
  "Berater": "berater",
  "Dienstleister": "dienstleister",
  "Elektriker": "elektriker",
  "Energieberater": "energieberater",
  "EPC": "epc",
  "EVU / Stadtwerke": "evu_stadtwerk",
  "Gewerblicher Endkunde": "gewerblicher_endkunde",
  "Großhandel": "grosshandel",
  "Ladesäulenbetreiber": "ladesaeulenbetreiber",
  "OEM": "oem",
  "Planungsbüro": "planungsbuero",
  "Privater Endkunde": "privater_endkunde",
  "Solarinstallateur": "solarinstallateur",
  "Sonstiger Multiplikator": "multiplikator",
  "Voltfang Freelancer": "freelancer",
};

// HubSpot liefert Stage-IDs. Die UI braucht sprechende Statuswerte.
const HUBSPOT_STAGE_TO_PROJECT_STATUS: Record<string, string> = {
  "141674304": "Eingangsprüfung",
  "247783798": "Technische Klärung",
  "141674308": "Angebotsklärung",
  "143381378": "Closing",
  "247783799": "Gewonnen",
  "141674309": "Gewonnen",
  "247783800": "Verloren",
  "141674310": "Verloren",
  "145716270": "Verloren",
};

type VoltfangContactInfo = {
  name: string;
  email?: string;
  phone?: string;
};

// Kurzfristiges Owner-Mapping fuer eine saubere Anzeige im Portal.
// Kann spaeter auf HubSpot Owners API umgestellt werden.
const HUBSPOT_OWNER_ID_TO_CONTACT: Record<string, VoltfangContactInfo> = {
  "12355261": {
    name: "Roman Alberti",
    email: "roman.alberti@voltfang.de", // Mock-Daten laut Anforderung
    phone: "+49 123 4567890", // Mock-Daten laut Anforderung
  },
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HUBSPOT_BATCH_MAX = 100;
const HUBSPOT_BATCH_CONCURRENCY = 5;
const HUBSPOT_REQUEST_TIMEOUT_MS = 8000;
const HUBSPOT_REQUEST_MAX_RETRIES = 2;
const HUBSPOT_RETRY_BASE_DELAY_MS = 250;
const CREATOR_CONTACT_CACHE_TTL_MS = 120_000;

// Einfache Laufzeit-Metrik: Anzahl HubSpot-Calls pro Request.
// Hinweis: In hochgradig parallelen Runs ist diese Metrik best effort.
let hubspotRequestCount = 0;

const creatorContactCache = new Map<string, { expiresAt: number; value: any }>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(limit, tasks.length));
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  const workers = Array.from({ length: safeLimit }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= tasks.length) break;
      results[current] = await tasks[current]();
    }
  });

  await Promise.all(workers);
  return results;
}

// Einheitliche JSON-Antworten inkl. CORS-Header.
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Uebersetzt HubSpot-Dealstage-ID in den UI-Status.
// Fallback auf "Eingangspruefung", damit unbekannte IDs den Flow nicht brechen.
function normalizeDealstage(raw: string | undefined): string {
  if (!raw) return "Eingangsprüfung";
  return HUBSPOT_STAGE_TO_PROJECT_STATUS[raw] ?? "Eingangsprüfung";
}

// HubSpot-Zahlen koennen als String oder Number kommen.
// Diese Funktion normalisiert Formate wie "1.500", "1500", "1500,5".
function parseHubSpotNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toHubSpotId(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Zentrale HubSpot-HTTP-Funktion:
// - fuegt Auth-Header ein
// - wirft bei API-Fehlern eine aussagekraeftige Meldung
async function hubspotRequest(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  options?: {
    timeoutMs?: number;
    maxRetries?: number;
  },
) {
  const timeoutMs = options?.timeoutMs ?? HUBSPOT_REQUEST_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? HUBSPOT_REQUEST_MAX_RETRIES;
  let attempt = 0;

  while (attempt <= maxRetries) {
    hubspotRequestCount += 1;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort("timeout"), timeoutMs);

    try {
      const response = await fetch(`https://api.hubapi.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text();
        const retriable = response.status === 429 || response.status >= 500;
        if (retriable && attempt < maxRetries) {
          const backoff = HUBSPOT_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 100);
          await sleep(backoff);
          attempt += 1;
          continue;
        }
        throw new Error(`HubSpot request failed (${response.status}): ${details}`);
      }

      const raw = await response.text();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    } catch (error) {
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      if ((isAbort || error instanceof TypeError) && attempt < maxRetries) {
        const backoff = HUBSPOT_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 100);
        await sleep(backoff);
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw new Error("HubSpot request failed after retries");
}

async function batchReadHubspotObjects(
  objectType: string,
  ids: Array<number | string>,
  properties: string[],
) {
  const normalizedIds = [...new Set(ids.map((id) => String(id)).filter(Boolean))];
  if (normalizedIds.length === 0) return new Map<string, any>();

  const resultMap = new Map<string, any>();
  const chunks = chunkArray(normalizedIds, HUBSPOT_BATCH_MAX);
  const tasks = chunks.map((chunk) => async () => {
    const response = await hubspotRequest(
      `/crm/v3/objects/${objectType}/batch/read`,
      "POST",
      {
        properties,
        inputs: chunk.map((id) => ({ id })),
      },
    );
    for (const entry of response?.results ?? []) {
      if (entry?.id) resultMap.set(String(entry.id), entry);
    }
  });

  await runWithConcurrencyLimit(tasks, HUBSPOT_BATCH_CONCURRENCY);
  return resultMap;
}

// Sicherheitspruefung: den Benutzer aus dem mitgesendeten Token aufloesen.
// Wichtig, weil verify_jwt deaktiviert ist und wir die Pruefung selbst machen.
async function resolveAuthUser(req: Request) {
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

async function ensureAuthUserExists(authId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authId);
  if (error || !data?.user) {
    throw new Error("Auth user not found");
  }
  return data.user;
}

// Legacy-Fallback:
// In frueheren Versionen wurde in "description" ein JSON-Payload abgelegt.
// Beim Lesen nutzen wir dieses alte Format weiter als Fallback.
function parseEmbeddedDescription(description: string | undefined) {
  if (!description) return {};
  try {
    return JSON.parse(description);
  } catch {
    return {};
  }
}

// Fuer neue Datensaetze wird "description" als reiner Freitext gespeichert.
// Falls dort noch ein altes JSON steckt, geben wir absichtlich keinen Text zurueck.
function extractFreeTextDescription(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const trimmed = description.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return undefined;
  } catch {
    // Kein JSON => erwarteter Freitext.
  }
  return trimmed;
}

// Liefert Ansprechpartner-Daten statt technischer Owner-ID.
function mapHubSpotOwnerIdToContact(ownerId: unknown): VoltfangContactInfo | undefined {
  if (ownerId === null || ownerId === undefined) return undefined;
  const normalized = String(ownerId).trim();
  if (!normalized) return undefined;
  return HUBSPOT_OWNER_ID_TO_CONTACT[normalized] ?? { name: "Ansprechpartner fehlerhaft" };
}

// Endkunde-Name robust lesen (je nach Portal/Feldhistorie).
function getEndkundeName(properties: Record<string, any> | undefined, fallback = ""): string {
  if (!properties) return fallback;
  return (
    properties[HUBSPOT_FIELDS.endkunde.name] ??
    properties.name ??
    properties.unternehmen_name ??
    fallback
  );
}

// Extrahiert eine bestehende HubSpot-ID aus typischen Konflikt-Fehlermeldungen.
function getExistingHubSpotIdFromConflictMessage(message: string): string | null {
  const byPrefix = message.match(/Existing ID:\s*([0-9]+)/i);
  if (byPrefix?.[1]) return byPrefix[1];
  const bySentence = message.match(/object with id\s+([0-9]+)/i);
  if (bySentence?.[1]) return bySentence[1];
  return null;
}

// Kontakt wird angelegt; bei E-Mail-Konflikt wird bestehender Kontakt wiederverwendet.
// So vermeiden wir 409-Fehler bei wiederholten Testlaeufen.
async function createOrReuseContact(payload: HubSpotContactInput, portalStatus?: string) {
  const properties: Record<string, string> = {
    [HUBSPOT_FIELDS.contact.salutation]: payload.kontakt_salutation,
    [HUBSPOT_FIELDS.contact.firstName]: payload.kontakt_fname,
    [HUBSPOT_FIELDS.contact.lastName]: payload.kontakt_lname,
    [HUBSPOT_FIELDS.contact.role]: payload.kontakt_rolle_im_unternehmen,
    [HUBSPOT_FIELDS.contact.email]: payload.kontakt_email,
    [HUBSPOT_FIELDS.contact.phone]: payload.kontakt_phone ?? "",
  };
  if (portalStatus) {
    properties[HUBSPOT_FIELDS.contact.portalStatus] = portalStatus;
  }

  try {
    return await hubspotRequest("/crm/v3/objects/contacts", "POST", {
      properties,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict = message.includes("(409)") && message.toLowerCase().includes("contact already exists");
    if (!isConflict) throw error;

    const existingId = getExistingHubSpotIdFromConflictMessage(message);
    if (existingId) {
      const existingContact = await hubspotRequest(
        `/crm/v3/objects/contacts/${existingId}?properties=${[
          HUBSPOT_FIELDS.contact.salutation,
          HUBSPOT_FIELDS.contact.firstName,
          HUBSPOT_FIELDS.contact.lastName,
          HUBSPOT_FIELDS.contact.role,
          HUBSPOT_FIELDS.contact.email,
          HUBSPOT_FIELDS.contact.phone,
          HUBSPOT_FIELDS.contact.portalStatus,
        ].join(",")}`,
        "GET",
      );
      if (portalStatus && existingContact?.properties?.[HUBSPOT_FIELDS.contact.portalStatus] !== HUBSPOT_CONTACT_STATUS_ACTIVE) {
        await hubspotRequest(`/crm/v3/objects/contacts/${existingId}`, "PATCH", {
          properties: {
            [HUBSPOT_FIELDS.contact.portalStatus]: portalStatus,
          },
        });
      }
      return existingContact;
    }

    const searchResult = await hubspotRequest("/crm/v3/objects/contacts/search", "POST", {
      filterGroups: [
        {
          filters: [
            {
              propertyName: HUBSPOT_FIELDS.contact.email,
              operator: "EQ",
              value: payload.kontakt_email,
            },
          ],
        },
      ],
      properties: [
        HUBSPOT_FIELDS.contact.salutation,
        HUBSPOT_FIELDS.contact.firstName,
        HUBSPOT_FIELDS.contact.lastName,
        HUBSPOT_FIELDS.contact.role,
        HUBSPOT_FIELDS.contact.email,
        HUBSPOT_FIELDS.contact.phone,
        HUBSPOT_FIELDS.contact.portalStatus,
      ],
      limit: 1,
    });

    if (!searchResult?.results?.length) throw error;
    if (
      portalStatus &&
      searchResult.results[0]?.properties?.[HUBSPOT_FIELDS.contact.portalStatus] !== HUBSPOT_CONTACT_STATUS_ACTIVE
    ) {
      await hubspotRequest(`/crm/v3/objects/contacts/${searchResult.results[0].id}`, "PATCH", {
        properties: {
          [HUBSPOT_FIELDS.contact.portalStatus]: portalStatus,
        },
      });
    }
    return searchResult.results[0];
  }
}

async function createOrReusePartner(payload: RegisterPartnerPayload) {
  const normalizedBranch = PARTNER_BRANCH_OPTION_MAP[payload.branche_partner] ?? payload.branche_partner;

  try {
    return await hubspotRequest(`/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}`, "POST", {
      properties: {
        [HUBSPOT_FIELDS.partner.name]: payload.company_name,
        [HUBSPOT_FIELDS.partner.website]: payload.website ?? "",
        [HUBSPOT_FIELDS.partner.street]: payload.street,
        [HUBSPOT_FIELDS.partner.zip]: payload.zip,
        [HUBSPOT_FIELDS.partner.city]: payload.city,
        [HUBSPOT_FIELDS.partner.state]: payload.bundesland,
        [HUBSPOT_FIELDS.partner.country]: payload.country,
        [HUBSPOT_FIELDS.partner.branch]: normalizedBranch,
        [HUBSPOT_FIELDS.partner.partnerType]: "Vermittler",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const uniqueNameConflict =
      message.includes(HUBSPOT_FIELDS.partner.name) && message.includes("already has that value");
    if (!uniqueNameConflict) throw error;

    const searchResult = await hubspotRequest(`/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/search`, "POST", {
      filterGroups: [
        {
          filters: [
            {
              propertyName: HUBSPOT_FIELDS.partner.name,
              operator: "EQ",
              value: payload.company_name,
            },
          ],
        },
      ],
      properties: [HUBSPOT_FIELDS.partner.name],
      limit: 1,
    });
    if (!searchResult?.results?.length) throw error;
    return searchResult.results[0];
  }
}

async function associateContactWithPartner(contactId: string | number, partnerId: string | number) {
  await hubspotRequest(
    `/crm/v4/objects/contacts/${contactId}/associations/default/${HUBSPOT_PARTNER_OBJECT_TYPE}/${partnerId}`,
    "PUT",
  );
}

async function associateContactWithEndkunde(contactId: string | number, endkundeId: string | number) {
  await hubspotRequest(
    `/crm/v4/objects/contacts/${contactId}/associations/default/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/${endkundeId}`,
    "PUT",
  );
}

async function generateUniqueInviteCode() {
  for (let attempts = 0; attempts < 10; attempts += 1) {
    // randomUUID liefert 32 Hex-Zeichen (ohne Bindestriche) und ist damit
    // stabil genug, um immer einen Invite-Code mit fixer Länge zu erzeugen.
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

async function upsertLocalCompanyByHubSpotId(partnerId: number) {
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
    .insert({
      invite_code: inviteCode,
      hubspot_id: partnerId,
    })
    .select("id,invite_code")
    .single();
  if (insertError) throw insertError;
  return inserted;
}

async function upsertLocalUserMapping(authId: string, companyId: string, hubspotContactId: number) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("user")
      .update({
        company_id: companyId,
        hubspot_id: hubspotContactId,
      })
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

/*
  GET-CONTEXT FLOW
  ----------------
  Ziel:
  - Alle Deals der Partner-Company direkt aus HubSpot laden (kein Supabase project-Tabelle)
  - Zu jedem Deal die Detaildaten aus HubSpot anreichern
  - Ersteller: nur anzeigen wenn genau 1 User in der Company
  - Erstellungsdatum aus HubSpot createdate
*/
async function getContext(localUser: { id: string; company_id: string | null }) {
  if (!localUser.company_id) return { projects: [], user: localUser };

  // HubSpot Partner-ID der Company holen
  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from("usercompany")
    .select("hubspot_id")
    .eq("id", localUser.company_id)
    .single();
  if (companyError || !companyRow?.hubspot_id) return { projects: [], user: localUser };

  // Alle User der Company holen (für Ersteller-Logik)
  const { data: companyUsers } = await supabaseAdmin
    .from("user")
    .select("id,hubspot_id")
    .eq("company_id", localUser.company_id);
  const users = companyUsers ?? [];
  const singleUser = users.length === 1 ? users[0] : null;
  const creatorContactId = singleUser?.hubspot_id ? String(singleUser.hubspot_id) : null;

  // Alle Deal-IDs aus HubSpot Partner→Deals Assoziation laden
  let dealIds: string[] = [];
  try {
    const assocResponse = await hubspotRequest(
      `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyRow.hubspot_id}/associations/deals`,
      "GET",
    );
    dealIds = (assocResponse?.results ?? [])
      .map((r: any) => String(r.toObjectId))
      .filter(Boolean);
    console.log(`[getContext] partner_hubspot_id=${companyRow.hubspot_id} found ${dealIds.length} associated deals`);
  } catch (assocError) {
    console.error(`[getContext] Failed to fetch deals for partner ${companyRow.hubspot_id}:`, assocError);
    return { projects: [], user: localUser };
  }

  if (dealIds.length === 0) return { projects: [], user: localUser };

  const dealKundenkontaktIdMap = new Map<string, string>();
  const dealEndkundeIdMap = new Map<string, string>();
  let dealById = new Map<string, any>();
  let contactById = new Map<string, any>();
  let endkundeById = new Map<string, any>();

  try {
    // Runde 1: Deals + beide Assoziations-Listen parallel laden
    const [resolvedDeals, contactAssocResponse, endkundeAssocResponse] = await Promise.all([
      batchReadHubspotObjects("deals", dealIds, [
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
      ]),
      hubspotRequest(
        "/crm/v4/associations/deals/contacts/batch/read",
        "POST",
        { inputs: dealIds.map((id) => ({ id })) },
      ),
      hubspotRequest(
        `/crm/v4/associations/deals/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/batch/read`,
        "POST",
        { inputs: dealIds.map((id) => ({ id })) },
      ),
    ]);

    dealById = resolvedDeals;
    console.log(`[getContext] batch-read returned ${dealById.size} deals out of ${dealIds.length} requested`);

    // Kontakt-Assoziationen: nur Kundenkontakt-Label (typeId 225)
    for (const item of contactAssocResponse?.results ?? []) {
      const dealId = String(item.from?.id);
      const toList: any[] = item.to ?? [];
      if (toList.length === 0) continue;
      const isKundenkontakt = (t: any) =>
        (t.associationTypes ?? []).some(
          (at: any) =>
            Number(at.typeId) === HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID ||
            String(at.label ?? "").toLowerCase() === "kundenkontakt",
        );
      const matched = toList.find(isKundenkontakt);
      if (matched) dealKundenkontaktIdMap.set(dealId, String(matched.toObjectId));
    }

    // Endkunde-Assoziationen: ersten Endkunden nehmen (niedrigste ID)
    for (const item of endkundeAssocResponse?.results ?? []) {
      const dealId = String(item.from?.id);
      const toList: any[] = item.to ?? [];
      if (toList.length > 0) {
        const sorted = [...toList].sort((a, b) => Number(a.toObjectId) - Number(b.toObjectId));
        dealEndkundeIdMap.set(dealId, String(sorted[0].toObjectId));
      }
    }

    // Runde 2: Kontakte + Endkunden parallel batch-lesen
    const kundenkontaktIds = [...new Set(dealKundenkontaktIdMap.values())];
    const endkundeIdsFromAssoc = [...new Set(dealEndkundeIdMap.values())];
    const allContactIds = [...new Set([...kundenkontaktIds, ...(creatorContactId ? [creatorContactId] : [])])];

    const [resolvedContacts, resolvedEndkunden] = await Promise.all([
      allContactIds.length > 0
        ? batchReadHubspotObjects("contacts", allContactIds, [
            HUBSPOT_FIELDS.contact.salutation,
            HUBSPOT_FIELDS.contact.firstName,
            HUBSPOT_FIELDS.contact.lastName,
            HUBSPOT_FIELDS.contact.role,
            HUBSPOT_FIELDS.contact.email,
            HUBSPOT_FIELDS.contact.phone,
            HUBSPOT_FIELDS.contact.portalStatus,
          ])
        : Promise.resolve(new Map()),
      endkundeIdsFromAssoc.length > 0
        ? batchReadHubspotObjects(HUBSPOT_ENDKUNDE_OBJECT_TYPE, endkundeIdsFromAssoc, [
            HUBSPOT_FIELDS.endkunde.name,
            HUBSPOT_FIELDS.endkunde.website,
            HUBSPOT_FIELDS.endkunde.street,
            HUBSPOT_FIELDS.endkunde.zip,
            HUBSPOT_FIELDS.endkunde.city,
            HUBSPOT_FIELDS.endkunde.state,
            HUBSPOT_FIELDS.endkunde.country,
          ])
        : Promise.resolve(new Map()),
    ]);

    contactById = resolvedContacts;
    endkundeById = resolvedEndkunden;
  } catch (error) {
    console.error("Batch hydration failed, fallback to minimal DTOs", error);
  }

  // Ersteller: nur wenn genau 1 User in der Company, sonst leer
  const creatorContact = creatorContactId ? contactById.get(creatorContactId) : null;
  const creator = creatorContact
    ? {
        fname: creatorContact.properties?.[HUBSPOT_FIELDS.contact.firstName] ?? "",
        lname: creatorContact.properties?.[HUBSPOT_FIELDS.contact.lastName] ?? "",
      }
    : { fname: "", lname: "" };

  const hydrated = dealIds.map((dealId) => {
    try {
      const deal = dealById.get(dealId);
      const kundenkontaktId = dealKundenkontaktIdMap.get(dealId);
      const contact = kundenkontaktId ? contactById.get(kundenkontaktId) : null;
      const endkundeId = dealEndkundeIdMap.get(dealId);
      const endkunde = endkundeId ? endkundeById.get(endkundeId) : null;

      const rawDescription = deal?.properties?.[HUBSPOT_FIELDS.deal.description];
      const embedded = parseEmbeddedDescription(rawDescription);
      const freeTextDescription = extractFreeTextDescription(rawDescription);

      const offeredCapacity =
        parseHubSpotNumber(deal?.properties?.[HUBSPOT_FIELDS.deal.offeredCapacity]) ?? undefined;
      const vfContact = mapHubSpotOwnerIdToContact(deal?.properties?.[HUBSPOT_FIELDS.deal.ownerId]);

      // Erstellungsdatum aus HubSpot createdate (Epoch-ms-String oder ISO-String)
      const rawCreateDate = deal?.properties?.createdate;
      let createdAt = new Date().toISOString();
      if (rawCreateDate) {
        const asNum = Number(rawCreateDate);
        if (Number.isFinite(asNum)) {
          createdAt = new Date(asNum).toISOString();
        } else {
          const d = new Date(rawCreateDate);
          if (!isNaN(d.getTime())) createdAt = d.toISOString();
        }
      }

      return {
        id: dealId,
        name: deal?.properties?.[HUBSPOT_FIELDS.deal.name] ?? "",
        description: freeTextDescription,
        vf_contact_name: vfContact?.name ?? embedded.vf_contact_name ?? undefined,
        vf_contact_email: vfContact?.email ?? embedded.vf_contact_email ?? undefined,
        vf_contact_phone: vfContact?.phone ?? embedded.vf_contact_phone ?? undefined,
        dealstage: normalizeDealstage(deal?.properties?.[HUBSPOT_FIELDS.deal.stage]),
        location_street: deal?.properties?.[HUBSPOT_FIELDS.deal.locationStreet] ?? embedded.location_street ?? "",
        location_zip: deal?.properties?.[HUBSPOT_FIELDS.deal.locationZip] ?? embedded.location_zip ?? "",
        location_city: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCity] ?? embedded.location_city ?? "",
        location_state: deal?.properties?.[HUBSPOT_FIELDS.deal.locationState] ?? embedded.location_state ?? "",
        location_country: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCountry] ?? embedded.location_country ?? "",
        estimated_order_date:
          deal?.properties?.[HUBSPOT_FIELDS.deal.estimatedOrderDate] ?? embedded.estimated_order_date ?? undefined,
        estimated_capacity:
          deal?.properties?.[HUBSPOT_FIELDS.deal.estimatedCapacity] ?? embedded.estimated_capacity ?? undefined,
        offered_capacity: offeredCapacity,
        deal_value: parseHubSpotNumber(deal?.properties?.[HUBSPOT_FIELDS.deal.amount]) ?? undefined,
        close_date: deal?.properties?.[HUBSPOT_FIELDS.deal.closeDate] ?? undefined,
        unternehmen_name: getEndkundeName(endkunde?.properties, embedded.unternehmen_name ?? ""),
        company_name: getEndkundeName(endkunde?.properties, embedded.unternehmen_name ?? ""),
        unternehmen_website: endkunde?.properties?.[HUBSPOT_FIELDS.endkunde.website] ?? embedded.unternehmen_website ?? "",
        unternehmen_street: endkunde?.properties?.[HUBSPOT_FIELDS.endkunde.street] ?? embedded.unternehmen_street ?? "",
        unternehmen_zip: endkunde?.properties?.[HUBSPOT_FIELDS.endkunde.zip] ?? embedded.unternehmen_zip ?? "",
        unternehmen_city: endkunde?.properties?.[HUBSPOT_FIELDS.endkunde.city] ?? embedded.unternehmen_city ?? "",
        unternehmen_state: endkunde?.properties?.[HUBSPOT_FIELDS.endkunde.state] ?? embedded.unternehmen_state ?? "",
        unternehmen_country: endkunde?.properties?.[HUBSPOT_FIELDS.endkunde.country] ?? embedded.unternehmen_country ?? "",
        kontakt_salutation: contact?.properties?.[HUBSPOT_FIELDS.contact.salutation] ?? embedded.kontakt_salutation ?? "",
        kontakt_fname: contact?.properties?.[HUBSPOT_FIELDS.contact.firstName] ?? embedded.kontakt_fname ?? "",
        kontakt_lname: contact?.properties?.[HUBSPOT_FIELDS.contact.lastName] ?? embedded.kontakt_lname ?? "",
        kontakt_email: contact?.properties?.[HUBSPOT_FIELDS.contact.email] ?? embedded.kontakt_email ?? "",
        kontakt_phone: contact?.properties?.[HUBSPOT_FIELDS.contact.phone] ?? embedded.kontakt_phone ?? "",
        kontakt_rolle_im_unternehmen:
          contact?.properties?.[HUBSPOT_FIELDS.contact.role] ?? embedded.kontakt_rolle_im_unternehmen ?? "",
        created_at: createdAt,
        created_by_user_id: singleUser?.id ?? "",
        creator,
        hubspot_id: Number(dealId),
      };
    } catch (error) {
      console.error(`Hydration for deal ${dealId} failed`, error);
      return {
        id: dealId,
        name: "",
        description: undefined,
        vf_contact_name: undefined,
        vf_contact_email: undefined,
        vf_contact_phone: undefined,
        dealstage: "Eingangsprüfung",
        location_street: "",
        location_zip: "",
        location_city: "",
        location_state: "",
        location_country: "",
        estimated_order_date: undefined,
        estimated_capacity: undefined,
        offered_capacity: undefined,
        unternehmen_name: "",
        company_name: "",
        unternehmen_website: "",
        unternehmen_street: "",
        unternehmen_zip: "",
        unternehmen_city: "",
        unternehmen_state: "",
        unternehmen_country: "",
        kontakt_salutation: "",
        kontakt_fname: "",
        kontakt_lname: "",
        kontakt_email: "",
        kontakt_phone: "",
        kontakt_rolle_im_unternehmen: "",
        created_at: new Date().toISOString(),
        created_by_user_id: "",
        creator: { fname: "", lname: "" },
        hubspot_id: Number(dealId),
      };
    }
  });

  // Neueste zuerst
  hydrated.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { projects: hydrated, user: localUser };
}

async function registerPartner(payload: RegisterPartnerPayload) {
  await ensureAuthUserExists(payload.auth_id);

  const hubspotPartner = await createOrReusePartner(payload);
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
  );

  await associateContactWithPartner(hubspotContact.id, hubspotPartner.id);

  const companyRow = await upsertLocalCompanyByHubSpotId(toHubSpotId(hubspotPartner.id)!);
  const userId = await upsertLocalUserMapping(
    payload.auth_id,
    companyRow.id,
    toHubSpotId(hubspotContact.id)!,
  );

  return {
    user_id: userId,
    company_id: companyRow.id,
    invite_code: companyRow.invite_code,
    hubspot_contact_id: toHubSpotId(hubspotContact.id),
    hubspot_partner_id: toHubSpotId(hubspotPartner.id),
  };
}

async function joinPartnerWithInvite(payload: JoinPartnerPayload) {
  await ensureAuthUserExists(payload.auth_id);

  const invitationCode = payload.invitation_code.trim().toUpperCase();
  if (!invitationCode) throw new Error("Invalid invitation code");

  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from("usercompany")
    .select("id,invite_code,hubspot_id")
    .eq("invite_code", invitationCode)
    .single();
  if (companyError || !companyRow) throw new Error("Invalid invitation code");
  if (!companyRow.hubspot_id) throw new Error("Company has no HubSpot mapping");

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
  );

  await associateContactWithPartner(hubspotContact.id, companyRow.hubspot_id);

  const userId = await upsertLocalUserMapping(
    payload.auth_id,
    companyRow.id,
    toHubSpotId(hubspotContact.id)!,
  );

  return {
    user_id: userId,
    company_id: companyRow.id,
    invite_code: companyRow.invite_code,
    hubspot_contact_id: toHubSpotId(hubspotContact.id),
    hubspot_partner_id: companyRow.hubspot_id,
  };
}

async function getUserContext(localUser: {
  id: string;
  auth_id: string;
  company_id: string | null;
  hubspot_id: number | null;
  created_at: string;
}) {
  if (!localUser.company_id) {
    return { user: localUser, company: null, team_members: [] };
  }

  const { data: companyRow, error: companyError } = await supabaseAdmin
    .from("usercompany")
    .select("id,invite_code,hubspot_id,created_at,partnerart")
    .eq("id", localUser.company_id)
    .single();
  if (companyError || !companyRow) throw new Error("Local company not found");

  const contact =
    localUser.hubspot_id
      ? await hubspotRequest(
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
        )
      : null;

  const partner =
    companyRow.hubspot_id
      ? await hubspotRequest(
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
        )
      : null;

  const { data: teamRows, error: teamError } = await supabaseAdmin
    .from("user")
    .select("id,hubspot_id,created_at")
    .eq("company_id", localUser.company_id)
    .order("created_at", { ascending: true });
  if (teamError) throw teamError;

  const teamMembers = await Promise.all(
    (teamRows ?? []).map(async (row) => {
      const memberContact =
        row.hubspot_id
          ? await hubspotRequest(
              `/crm/v3/objects/contacts/${row.hubspot_id}?properties=${[
                HUBSPOT_FIELDS.contact.firstName,
                HUBSPOT_FIELDS.contact.lastName,
                HUBSPOT_FIELDS.contact.email,
                HUBSPOT_FIELDS.contact.portalStatus,
              ].join(",")}`,
              "GET",
            )
          : null;
      const memberStatus = memberContact?.properties?.[HUBSPOT_FIELDS.contact.portalStatus] ?? HUBSPOT_CONTACT_STATUS_PENDING;
      return {
        id: row.id,
        fname: memberContact?.properties?.[HUBSPOT_FIELDS.contact.firstName] ?? "",
        lname: memberContact?.properties?.[HUBSPOT_FIELDS.contact.lastName] ?? "",
        email: memberContact?.properties?.[HUBSPOT_FIELDS.contact.email] ?? undefined,
        vermittlerportal_status: memberStatus,
        is_unlocked: memberStatus === HUBSPOT_CONTACT_STATUS_ACTIVE,
        created_at: row.created_at,
      };
    }),
  );

  const userStatus = contact?.properties?.[HUBSPOT_FIELDS.contact.portalStatus] ?? HUBSPOT_CONTACT_STATUS_PENDING;
  return {
    user: {
      id: localUser.id,
      auth_id: localUser.auth_id,
      company_id: localUser.company_id,
      hubspot_id: localUser.hubspot_id ?? undefined,
      created_at: localUser.created_at,
      fname: contact?.properties?.[HUBSPOT_FIELDS.contact.firstName] ?? "",
      lname: contact?.properties?.[HUBSPOT_FIELDS.contact.lastName] ?? "",
      email: contact?.properties?.[HUBSPOT_FIELDS.contact.email] ?? undefined,
      phone: contact?.properties?.[HUBSPOT_FIELDS.contact.phone] ?? undefined,
      rolle_im_unternehmen: contact?.properties?.[HUBSPOT_FIELDS.contact.role] ?? undefined,
      salutation: contact?.properties?.[HUBSPOT_FIELDS.contact.salutation] ?? undefined,
      vermittlerportal_status: userStatus,
      is_unlocked: userStatus === HUBSPOT_CONTACT_STATUS_ACTIVE,
    },
    company: {
      id: companyRow.id,
      hubspot_id: companyRow.hubspot_id ?? undefined,
      invite_code: companyRow.invite_code,
      created_at: companyRow.created_at,
      name: partner?.properties?.[HUBSPOT_FIELDS.partner.name] ?? "",
      website: partner?.properties?.[HUBSPOT_FIELDS.partner.website] ?? undefined,
      street: partner?.properties?.[HUBSPOT_FIELDS.partner.street] ?? "",
      zip: partner?.properties?.[HUBSPOT_FIELDS.partner.zip] ?? "",
      city: partner?.properties?.[HUBSPOT_FIELDS.partner.city] ?? "",
      bundesland: partner?.properties?.[HUBSPOT_FIELDS.partner.state] ?? undefined,
      country: partner?.properties?.[HUBSPOT_FIELDS.partner.country] ?? "",
      branche_partner: partner?.properties?.[HUBSPOT_FIELDS.partner.branch] ?? "",
      partnerType: (companyRow.partnerart ?? "Vermittler") as "Vermittler" | "Vertriebspartner",
    },
    team_members: teamMembers,
  };
}

function mapAngebotStatus(raw: string | undefined): string {
  switch (raw) {
    case "Abgelaufen":
    case "Verloren": return "Abgelaufen";
    case "Gewonnen": return "Gewonnen";
    default: return "Offen"; // 'In Arbeit', 'Senden', 'Gesendet', 'Final besprochen'
  }
}

async function getAngebote(companyHubspotId: number) {
  // Step 1: Get all deals associated with this Partner (standard←custom GET works fine)
  const dealAssocResponse = await hubspotRequest(
    `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}/associations/deals`,
    "GET",
  );
  const dealIds = (dealAssocResponse?.results ?? []).map((r: any) => String(r.toObjectId));
  if (dealIds.length === 0) return [];

  // Step 2: For each deal, get associated Angebote (standard→custom GET works fine)
  const dealAngebotPairs: Array<{ dealId: string; angebotId: string }> = [];
  await Promise.all(
    dealIds.map(async (dealId) => {
      try {
        const angebotAssoc = await hubspotRequest(
          `/crm/v4/objects/deals/${dealId}/associations/${HUBSPOT_ANGEBOT_OBJECT_TYPE}`,
          "GET",
        );
        for (const r of (angebotAssoc?.results ?? [])) {
          dealAngebotPairs.push({ dealId, angebotId: String(r.toObjectId) });
        }
      } catch {
        // No angebote for this deal — skip
      }
    }),
  );
  if (dealAngebotPairs.length === 0) return [];

  const angebotIds = [...new Set(dealAngebotPairs.map((p) => p.angebotId))];

  // Step 3: Batch-read Angebot properties
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
  );

  // Build angebotId → dealId lookup from the pairs we already have
  const angebotDealMap = new Map<string, string>(
    dealAngebotPairs.map(({ dealId, angebotId }) => [angebotId, dealId]),
  );

  return angebotIds
    .map((id) => {
      const obj = angebotMap.get(id);
      if (!obj) return null;
      const props = obj.properties ?? {};
      return {
        hubspotId: id,
        dealHubspotId: angebotDealMap.get(id) ?? "",
        produkt: props[HUBSPOT_FIELDS.angebot.produkt] ?? null,
        leistungKw: parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.leistung]) ?? null,
        nettokapazitaetKwh: parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.nettokapazitat]) ?? null,
        nettopreis: parseHubSpotNumber(props[HUBSPOT_FIELDS.angebot.nettopreis]) ?? null,
        status: mapAngebotStatus(props[HUBSPOT_FIELDS.angebot.status]),
        erstellungsdatum: props["hs_createdate"] ?? "",
        ablaufdatum: props[HUBSPOT_FIELDS.angebot.ablaufdatum] ?? null,
      };
    })
    .filter(Boolean);
}

async function createAngebot(
  dealHubspotId: string,
  partnerHubspotId: number,
  produkt: string,
  dealName: string,
  leistung?: number,
  nettokapazitat?: number,
  garantie?: string,
  betonfundament?: string,
  monitoring?: string,
  steuerungsalgorithmen?: string[] | string,
  rechnungsadresse_unternehmensname?: string,
  rechnungsadresse_strasse?: string,
  rechnungsadresse_plz?: string,
  rechnungsadresse_ort?: string,
  rechnungsadresse_bundesland?: string,
  rechnungsadresse_land?: string,
  lieferadresse_unternehmensname?: string,
  lieferadresse_strasse?: string,
  lieferadresse_plz?: string,
  lieferadresse_ort?: string,
  lieferadresse_bundesland?: string,
  lieferadresse_land?: string,
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const angebotName = `${timestamp} - ${dealName}_${produkt}`;

  const properties: Record<string, string | number> = {
    [HUBSPOT_FIELDS.angebot.name]: angebotName,
    [HUBSPOT_FIELDS.angebot.produkt]: produkt,
    [HUBSPOT_FIELDS.angebot.status]: "In Arbeit",
  };
  if (leistung !== undefined) properties[HUBSPOT_FIELDS.angebot.leistung] = leistung;
  if (nettokapazitat !== undefined) properties[HUBSPOT_FIELDS.angebot.nettokapazitat] = nettokapazitat;
  if (garantie) properties["garantie"] = garantie;
  if (betonfundament) properties["betonfundament_voltfang_2"] = betonfundament;
  if (monitoring) properties["monitoring"] = monitoring;
  if (steuerungsalgorithmen) {
    properties["steuerungsalgorithmen"] = Array.isArray(steuerungsalgorithmen)
      ? steuerungsalgorithmen.join(";")
      : String(steuerungsalgorithmen);
  }
  if (rechnungsadresse_unternehmensname) properties["rechnungsadresse_unternehmensname"] = rechnungsadresse_unternehmensname;
  if (rechnungsadresse_strasse)          properties["rechnungsadresse_stra_e___hausnr_"]  = rechnungsadresse_strasse;
  if (rechnungsadresse_plz)              properties["rechnungsadresse_postleitzahl"]       = rechnungsadresse_plz;
  if (rechnungsadresse_ort)              properties["rechnungsadresse_ort"]                = rechnungsadresse_ort;
  if (rechnungsadresse_bundesland)       properties["rechnungsadresse_bundesland"]         = rechnungsadresse_bundesland;
  if (rechnungsadresse_land)             properties["rechnungsadresse_land"]               = rechnungsadresse_land;
  if (lieferadresse_unternehmensname)    properties["lieferadresse_unternehmensname"]      = lieferadresse_unternehmensname;
  if (lieferadresse_strasse)             properties["adresse_projektstandort"]             = lieferadresse_strasse;
  if (lieferadresse_plz)                 properties["postleitzahl_projekt"]                = lieferadresse_plz;
  if (lieferadresse_ort)                 properties["ort_projekt"]                         = lieferadresse_ort;
  if (lieferadresse_bundesland)          properties["bundesland_projekt_dropdown"]         = lieferadresse_bundesland;
  if (lieferadresse_land)                properties["land_projekt"]                        = lieferadresse_land;

  const created = await hubspotRequest(
    `/crm/v3/objects/${HUBSPOT_ANGEBOT_OBJECT_TYPE}`,
    "POST",
    { properties },
  );

  const angebotId = created.id;

  // Associate Deal → Angebot
  await hubspotRequest(
    `/crm/v4/objects/deals/${dealHubspotId}/associations/default/${HUBSPOT_ANGEBOT_OBJECT_TYPE}/${angebotId}`,
    "PUT",
  );

  // Associate Partner → Angebot
  if (partnerHubspotId) {
    await hubspotRequest(
      `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${partnerHubspotId}/associations/default/${HUBSPOT_ANGEBOT_OBJECT_TYPE}/${angebotId}`,
      "PUT",
    );
  }

  return {
    hubspotId: angebotId,
    dealHubspotId: String(dealHubspotId),
    produkt: created.properties?.[HUBSPOT_FIELDS.angebot.produkt] ?? produkt,
    leistungKw: leistung ?? null,
    nettokapazitaetKwh: nettokapazitat ?? null,
    nettopreis: null,
    status: "Offen",
    erstellungsdatum: created.properties?.hs_createdate ?? new Date().toISOString(),
    ablaufdatum: null,
  };
}

/*
  CREATE-PROJECT FLOW
  -------------------
  Reihenfolge:
  1) Endkunde anlegen (oder bei Duplikat wiederverwenden)
  2) Kontakt anlegen (oder bei Duplikat wiederverwenden)
  3) Deal anlegen
  4) Deal mit Endkunde + Projektkontakt + Partner + Vermittlerkontakt verknuepfen
  5) Direkte Kontakt<->Endkunde Association erstellen
  6) Nur HubSpot-IDs + Minimaldaten in Supabase speichern
*/
async function createProject(
  localUser: { id: string; company_id: string | null; hubspot_id: number | null },
  payload: ProjectPayload,
) {
  if (!localUser.company_id) throw new Error("User has no company mapping");
  if (!localUser.hubspot_id) throw new Error("User has no HubSpot contact mapping");
  if (!payload?.name) throw new Error("Project name is required");

  // Das lokale Unternehmen muss auf ein HubSpot-Partnerobjekt zeigen.
  const { data: localCompany, error: localCompanyError } = await supabaseAdmin
    .from("usercompany")
    .select("hubspot_id")
    .eq("id", localUser.company_id)
    .single();
  if (localCompanyError) throw localCompanyError;
  if (!localCompany?.hubspot_id) throw new Error("Company has no HubSpot partner mapping");

  // 1) Create project endkunde (custom object) in HubSpot.
  // If name is unique and already exists, re-use existing record instead of failing.
  let hubspotEndkunde: any;
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
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isUniqueNameConflict =
      message.includes(HUBSPOT_FIELDS.endkunde.name) && message.includes("already has that value");

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
    );

    if (!searchResult?.results?.length) throw error;
    hubspotEndkunde = searchResult.results[0];
  }

  // 2) Create project contact in HubSpot (or re-use existing on email conflict)
  const hubspotContact = await createOrReuseContact(payload);

  // 3) Create deal in HubSpot
  const hubspotDeal = await hubspotRequest("/crm/v3/objects/deals", "POST", {
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
  });

  // 4) Associate deal <-> endkunde(custom object) and deal <-> project contact
  await hubspotRequest(
    `/crm/v4/objects/deals/${hubspotDeal.id}/associations/default/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/${hubspotEndkunde.id}`,
    "PUT",
  );
  // Kundenkontakt-Label (typeId 224, USER_DEFINED) via batch/create setzen
  await hubspotRequest("/crm/v4/associations/deals/contacts/batch/create", "POST", {
    inputs: [
      {
        types: [{ associationCategory: "USER_DEFINED", associationTypeId: HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID }],
        from: { id: String(hubspotDeal.id) },
        to: { id: String(hubspotContact.id) },
      },
    ],
  });

  // 5) Zusätzlich direkte Association Kontakt <-> Endkunde erstellen.
  // So bleibt die Beziehung auch ohne Deal-Kontext in HubSpot sichtbar.
  await associateContactWithEndkunde(hubspotContact.id, hubspotEndkunde.id);

  // Deal <-> Partner (Vermittlerunternehmen) verknuepfen.
  await hubspotRequest(
    `/crm/v4/objects/deals/${hubspotDeal.id}/associations/default/${HUBSPOT_PARTNER_OBJECT_TYPE}/${localCompany.hubspot_id}`,
    "PUT",
  );

  // Deal <-> eingeloggter Vermittlerkontakt verknuepfen.
  // Falls Projektkontakt und Vermittlerkontakt identisch sind, keine zweite Association senden.
  const projectContactId = toHubSpotId(hubspotContact.id);
  if (projectContactId !== localUser.hubspot_id) {
    await hubspotRequest(
      `/crm/v4/objects/deals/${hubspotDeal.id}/associations/default/contacts/${localUser.hubspot_id}`,
      "PUT",
    );
  }

  return { project: { id: String(hubspotDeal.id), hubspot_id: toHubSpotId(hubspotDeal.id) } };
}

Deno.serve(async (req) => {
  // Browser schickt bei CORS oft zuerst OPTIONS (Preflight).
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Frueher Abbruch, wenn Kern-Konfiguration fehlt.
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      return json({ error: "Supabase env missing" }, 500);
    }
    if (!HUBSPOT_ACCESS_TOKEN) {
      return json({ error: "HubSpot token missing" }, 500);
    }

    const body = await req.json();
    if (!body?.action) return json({ error: "Missing action" }, 400);
    const action = String(body.action);
    const actionStartedAt = performance.now();
    hubspotRequestCount = 0;

    // Registrierung/Join erfolgt direkt nach SignUp und kann ohne Session erfolgen.
    if (body.action === "register_partner") {
      const result = await registerPartner(body.payload as RegisterPartnerPayload);
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json(result, 201);
    }
    if (body.action === "join_partner_with_invite") {
      const result = await joinPartnerWithInvite(body.payload as JoinPartnerPayload);
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json(result, 201);
    }

    // Für alle anderen Actions ist ein gültiger User-Kontext erforderlich.
    const authUser = await resolveAuthUser(req);

    // Prüfe zuerst ob der Auth-User ein Superadmin ist.
    const { data: localSuperAdmin } = await supabaseAdmin
      .from("superadmin")
      .select("id,auth_id,fname,lname")
      .eq("auth_id", authUser.id)
      .maybeSingle();
    const isAdmin = localSuperAdmin !== null;

    // Lade regulären User nur wenn kein Admin.
    let localUser: any = null;
    if (!isAdmin) {
      const { data: userData, error: localUserError } = await supabaseAdmin
        .from("user")
        .select("id,auth_id,company_id,hubspot_id,created_at")
        .eq("auth_id", authUser.id)
        .single();
      if (localUserError || !userData) return json({ error: "Local user not found" }, 404);
      localUser = userData;
    }

    if (body.action === "get_context") {
      if (isAdmin) {
        // Admins können eine fremde company_id übergeben (Impersonation).
        if (body.payload?.target_company_id) {
          const fakeUser = {
            id: localSuperAdmin!.id,
            auth_id: localSuperAdmin!.auth_id,
            company_id: String(body.payload.target_company_id),
            hubspot_id: null,
            created_at: new Date().toISOString(),
          };
          const context = await getContext(fakeUser);
          console.log(
            `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
          );
          return json(context);
        }
        return json({ admin: localSuperAdmin });
      }
      const context = await getContext(localUser!);
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json(context);
    }
    if (body.action === "get_user_context") {
      if (isAdmin) {
        console.log(
          `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
        );
        return json({ admin: localSuperAdmin });
      }
      const context = await getUserContext(localUser!);
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json(context);
    }

    // Reguläre User-Actions erfordern einen localUser (kein Admin-Zugang).
    if (!localUser && !isAdmin) return json({ error: "Forbidden" }, 403);

    if (body.action === "create_project") {
      const created = await createProject(localUser, body.payload as ProjectPayload);
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json(created, 201);
    }

    if (body.action === "get_angebote") {
      const companyHubspotId = Number(body.payload?.company_hubspot_id);
      if (!companyHubspotId) return json({ error: "Missing company_hubspot_id" }, 400);
      const angebote = await getAngebote(companyHubspotId);
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json({ angebote });
    }

    if (body.action === "create_angebot") {
      const p = body.payload ?? {};
      if (!p.deal_hubspot_id || !p.partner_hubspot_id || !p.produkt_c_i) {
        return json({ error: "Missing required fields" }, 400);
      }
      const garantie   = p.garantie       ? String(p.garantie)       : undefined;
      const betonfund  = p.betonfundament ? String(p.betonfundament) : undefined;
      const monitoring = p.monitoring     ? String(p.monitoring)     : "Ja";
      const steuerung  = p.steuerungsalgorithmen;
      const angebot = await createAngebot(
        String(p.deal_hubspot_id),
        Number(p.partner_hubspot_id),
        String(p.produkt_c_i),
        String(p.deal_name ?? ""),
        p.leistung     !== undefined ? Number(p.leistung)     : undefined,
        p.nettokapazitat !== undefined ? Number(p.nettokapazitat) : undefined,
        garantie,
        betonfund,
        monitoring,
        steuerung,
        p.rechnungsadresse_unternehmensname ? String(p.rechnungsadresse_unternehmensname) : undefined,
        p.rechnungsadresse_strasse          ? String(p.rechnungsadresse_strasse)          : undefined,
        p.rechnungsadresse_plz              ? String(p.rechnungsadresse_plz)              : undefined,
        p.rechnungsadresse_ort              ? String(p.rechnungsadresse_ort)              : undefined,
        p.rechnungsadresse_bundesland       ? String(p.rechnungsadresse_bundesland)       : undefined,
        p.rechnungsadresse_land             ? String(p.rechnungsadresse_land)             : undefined,
        p.lieferadresse_unternehmensname    ? String(p.lieferadresse_unternehmensname)    : undefined,
        p.lieferadresse_strasse             ? String(p.lieferadresse_strasse)             : undefined,
        p.lieferadresse_plz                 ? String(p.lieferadresse_plz)                 : undefined,
        p.lieferadresse_ort                 ? String(p.lieferadresse_ort)                 : undefined,
        p.lieferadresse_bundesland          ? String(p.lieferadresse_bundesland)          : undefined,
        p.lieferadresse_land                ? String(p.lieferadresse_land)                : undefined,
      );
      console.log(
        `[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`,
      );
      return json({ angebot }, 201);
    }

    // ─── Admin Actions ────────────────────────────────────────────────────────
    // Alle Admin-Actions erfordern einen Superadmin-Eintrag.
    if (
      [
        "get_admin_overview",
        "get_all_companies",
        "get_all_users",
        "get_all_projects",
        "get_all_angebote",
        "unlock_user",
        "lock_user",
        "delete_user",
        "reassign_user_company",
        "update_company",
        "update_user",
        "update_project",
        "get_company_deals",
        "import_company",
        "delete_company",
        "preview_contact",
        "import_user",
        "bulk_preview",
        "bulk_import",
      ].includes(body.action)
    ) {
      if (!isAdmin) return json({ error: "Forbidden" }, 403);

      if (body.action === "get_admin_overview") {
        const [usersResult, companiesResult] = await Promise.all([
          supabaseAdmin.from("user").select("id,company_id", { count: "exact" }),
          supabaseAdmin.from("usercompany").select("id", { count: "exact" }),
        ]);
        const allUsers = usersResult.data ?? [];

        // Fetch HubSpot contact statuses for all users with a hubspot_id
        const userHubspotIds = (
          await supabaseAdmin.from("user").select("hubspot_id")
        ).data?.map((u: any) => u.hubspot_id).filter(Boolean) ?? [];
        let activeCount = 0;
        let pendingCount = 0;
        if (userHubspotIds.length > 0) {
          const contactMap = await batchReadHubspotObjects("contacts", userHubspotIds, [HUBSPOT_FIELDS.contact.portalStatus]);
          for (const contact of contactMap.values()) {
            const status = contact?.properties?.[HUBSPOT_FIELDS.contact.portalStatus];
            if (status === HUBSPOT_CONTACT_STATUS_ACTIVE) activeCount++;
            else pendingCount++;
          }
        }

        // Rough angebote count: sum all angebote across all partner companies
        let totalAngebote = 0;
        const companiesWithHubspot = (
          await supabaseAdmin.from("usercompany").select("hubspot_id").not("hubspot_id", "is", null)
        ).data ?? [];
        await Promise.all(
          companiesWithHubspot.slice(0, 20).map(async (c: any) => {
            try {
              const assoc = await hubspotRequest(
                `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${c.hubspot_id}/associations/deals`,
                "GET",
              );
              const dealIds = (assoc?.results ?? []).map((r: any) => String(r.toObjectId));
              await Promise.all(
                dealIds.map(async (dealId) => {
                  try {
                    const angebotAssoc = await hubspotRequest(
                      `/crm/v4/objects/deals/${dealId}/associations/${HUBSPOT_ANGEBOT_OBJECT_TYPE}`,
                      "GET",
                    );
                    totalAngebote += (angebotAssoc?.results ?? []).length;
                  } catch { /* skip */ }
                }),
              );
            } catch { /* skip */ }
          }),
        );

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
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

      if (body.action === "get_all_companies") {
        const { data: companiesData } = await supabaseAdmin
          .from("usercompany")
          .select("id,hubspot_id,invite_code,created_at,partnerart")
          .order("created_at", { ascending: false });

        const companies = companiesData ?? [];
        const companyIds = companies.map((c: any) => c.id);

        // Count users per company
        const { data: userRows } = await supabaseAdmin
          .from("user")
          .select("id,company_id")
          .in("company_id", companyIds);

        const userCountByCompany = new Map<string, number>();
        for (const u of userRows ?? []) {
          if (u.company_id) userCountByCompany.set(u.company_id, (userCountByCompany.get(u.company_id) ?? 0) + 1);
        }

        // Fetch HubSpot partner data for each company
        const hubspotIds = companies.map((c: any) => c.hubspot_id).filter(Boolean);
        const partnerMap = hubspotIds.length > 0
          ? await batchReadHubspotObjects(HUBSPOT_PARTNER_OBJECT_TYPE, hubspotIds, [
              HUBSPOT_FIELDS.partner.name,
              HUBSPOT_FIELDS.partner.website,
              HUBSPOT_FIELDS.partner.street,
              HUBSPOT_FIELDS.partner.zip,
              HUBSPOT_FIELDS.partner.city,
              HUBSPOT_FIELDS.partner.state,
              HUBSPOT_FIELDS.partner.country,
              HUBSPOT_FIELDS.partner.branch,
              HUBSPOT_FIELDS.partner.partnerType,
            ])
          : new Map();

        // Deal-Anzahl pro Company parallel aus HubSpot laden
        const projectCountByCompanyId = new Map<string, number>();
        await Promise.all(
          companies
            .filter((c: any) => c.hubspot_id)
            .map(async (c: any) => {
              try {
                const assoc = await hubspotRequest(
                  `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${c.hubspot_id}/associations/deals`,
                  "GET",
                );
                projectCountByCompanyId.set(c.id, (assoc?.results ?? []).length);
              } catch { /* skip, bleibt 0 */ }
            }),
        );

        const result = companies.map((c: any) => {
          const partner = c.hubspot_id ? partnerMap.get(String(c.hubspot_id)) : null;
          const p = partner?.properties ?? {};
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
            user_count: userCountByCompany.get(c.id) ?? 0,
            project_count: projectCountByCompanyId.get(c.id) ?? 0,
          };
        });

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ companies: result });
      }

      if (body.action === "get_all_users") {
        const { data: usersData } = await supabaseAdmin
          .from("user")
          .select("id,auth_id,company_id,hubspot_id,created_at")
          .order("created_at", { ascending: false });

        const users = usersData ?? [];

        // Fetch company names
        const companyIds = [...new Set(users.map((u: any) => u.company_id).filter(Boolean))];
        const { data: companyRows } = await supabaseAdmin
          .from("usercompany")
          .select("id,partnerart,hubspot_id")
          .in("id", companyIds);

        const companyById = new Map<string, any>();
        for (const c of companyRows ?? []) companyById.set(c.id, c);

        // Batch-fetch HubSpot contacts
        const hubspotContactIds = users.map((u: any) => u.hubspot_id).filter(Boolean);
        const companyHubspotIds = (companyRows ?? []).map((c: any) => c.hubspot_id).filter(Boolean);
        const [contactMap, partnerMap2] = await Promise.all([
          hubspotContactIds.length > 0
            ? batchReadHubspotObjects("contacts", hubspotContactIds, [
                HUBSPOT_FIELDS.contact.firstName,
                HUBSPOT_FIELDS.contact.lastName,
                HUBSPOT_FIELDS.contact.email,
                HUBSPOT_FIELDS.contact.phone,
                HUBSPOT_FIELDS.contact.salutation,
                HUBSPOT_FIELDS.contact.role,
                HUBSPOT_FIELDS.contact.portalStatus,
              ])
            : Promise.resolve(new Map()),
          companyHubspotIds.length > 0
            ? batchReadHubspotObjects(HUBSPOT_PARTNER_OBJECT_TYPE, companyHubspotIds, [HUBSPOT_FIELDS.partner.name])
            : Promise.resolve(new Map()),
        ]);

        const result = users.map((u: any) => {
          const contact = u.hubspot_id ? contactMap.get(String(u.hubspot_id)) : null;
          const cp = contact?.properties ?? {};
          const company = u.company_id ? companyById.get(u.company_id) : null;
          const partner = company?.hubspot_id ? partnerMap2.get(String(company.hubspot_id)) : null;
          const status = cp[HUBSPOT_FIELDS.contact.portalStatus] ?? "Freischaltung ausstehend";
          return {
            id: u.id,
            auth_id: u.auth_id,
            company_id: u.company_id ?? undefined,
            company_name: partner?.properties?.[HUBSPOT_FIELDS.partner.name] ?? undefined,
            hubspot_id: u.hubspot_id ?? undefined,
            fname: cp[HUBSPOT_FIELDS.contact.firstName] ?? "",
            lname: cp[HUBSPOT_FIELDS.contact.lastName] ?? "",
            email: cp[HUBSPOT_FIELDS.contact.email] ?? undefined,
            phone: cp[HUBSPOT_FIELDS.contact.phone] ?? undefined,
            salutation: cp[HUBSPOT_FIELDS.contact.salutation] ?? undefined,
            rolle_im_unternehmen: cp[HUBSPOT_FIELDS.contact.role] ?? undefined,
            vermittlerportal_status: status,
            created_at: u.created_at,
            partner_type: company?.partnerart ?? "Vermittler",
          };
        });

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ users: result });
      }

      if (body.action === "get_all_projects") {
        // Alle Companies mit HubSpot-ID laden
        const { data: allCompanies } = await supabaseAdmin
          .from("usercompany")
          .select("id,hubspot_id")
          .not("hubspot_id", "is", null);

        const companies = allCompanies ?? [];
        const allCompanyIds = companies.map((c: any) => c.id);

        // Alle User pro Company laden (für Ersteller-Logik)
        const { data: allUsersData } = await supabaseAdmin
          .from("user")
          .select("id,company_id,hubspot_id")
          .in("company_id", allCompanyIds);

        const usersByCompanyId = new Map<string, any[]>();
        for (const u of allUsersData ?? []) {
          if (u.company_id) {
            if (!usersByCompanyId.has(u.company_id)) usersByCompanyId.set(u.company_id, []);
            usersByCompanyId.get(u.company_id)!.push(u);
          }
        }

        // Deal-IDs per Company parallel aus HubSpot laden
        const companyDealIds = new Map<string, string[]>();
        const allDealIds = new Set<string>();
        await Promise.all(
          companies.map(async (c: any) => {
            try {
              const assoc = await hubspotRequest(
                `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${c.hubspot_id}/associations/deals`,
                "GET",
              );
              const dealIds = (assoc?.results ?? []).map((r: any) => String(r.toObjectId));
              companyDealIds.set(c.id, dealIds);
              for (const id of dealIds) allDealIds.add(id);
            } catch { /* skip */ }
          }),
        );

        if (allDealIds.size === 0) {
          console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
          return json({ projects: [] });
        }

        // Deal-Details + Partner-Namen + Ersteller-Kontakte parallel laden
        const hubspotPartnerIds = companies.map((c: any) => c.hubspot_id).filter(Boolean);
        const creatorContactIds = new Set<string>();
        for (const users of usersByCompanyId.values()) {
          if (users.length === 1 && users[0].hubspot_id) {
            creatorContactIds.add(String(users[0].hubspot_id));
          }
        }

        const [dealMap, partnerMap3, creatorContactMap2] = await Promise.all([
          batchReadHubspotObjects("deals", [...allDealIds], [
            HUBSPOT_FIELDS.deal.name,
            HUBSPOT_FIELDS.deal.stage,
            HUBSPOT_FIELDS.deal.locationCity,
            HUBSPOT_FIELDS.deal.locationCountry,
            "createdate",
          ]),
          hubspotPartnerIds.length > 0
            ? batchReadHubspotObjects(HUBSPOT_PARTNER_OBJECT_TYPE, hubspotPartnerIds, [HUBSPOT_FIELDS.partner.name])
            : Promise.resolve(new Map()),
          creatorContactIds.size > 0
            ? batchReadHubspotObjects("contacts", [...creatorContactIds], [
                HUBSPOT_FIELDS.contact.firstName,
                HUBSPOT_FIELDS.contact.lastName,
              ])
            : Promise.resolve(new Map()),
        ]);

        const companyById2 = new Map<string, any>();
        for (const c of companies) companyById2.set(c.id, c);

        const result: any[] = [];
        for (const [companyId, dealIds] of companyDealIds.entries()) {
          const company = companyById2.get(companyId);
          const companyName = company?.hubspot_id
            ? partnerMap3.get(String(company.hubspot_id))?.properties?.[HUBSPOT_FIELDS.partner.name]
            : undefined;
          const companyUsers = usersByCompanyId.get(companyId) ?? [];
          const singleUser2 = companyUsers.length === 1 ? companyUsers[0] : null;
          const creatorContact2 = singleUser2?.hubspot_id
            ? creatorContactMap2.get(String(singleUser2.hubspot_id))
            : null;
          const creatorName2 = creatorContact2
            ? `${creatorContact2.properties?.[HUBSPOT_FIELDS.contact.firstName] ?? ""} ${creatorContact2.properties?.[HUBSPOT_FIELDS.contact.lastName] ?? ""}`.trim()
            : undefined;

          for (const dealId of dealIds) {
            const deal = dealMap.get(dealId);
            const rawCreateDate = deal?.properties?.createdate;
            let createdAt = new Date().toISOString();
            if (rawCreateDate) {
              const asNum = Number(rawCreateDate);
              if (Number.isFinite(asNum)) {
                createdAt = new Date(asNum).toISOString();
              } else {
                const d = new Date(rawCreateDate);
                if (!isNaN(d.getTime())) createdAt = d.toISOString();
              }
            }
            result.push({
              id: dealId,
              name: deal?.properties?.[HUBSPOT_FIELDS.deal.name] ?? "",
              dealstage: normalizeDealstage(deal?.properties?.[HUBSPOT_FIELDS.deal.stage]),
              company_id: companyId,
              company_name: companyName,
              created_by_user_id: singleUser2?.id ?? "",
              creator_name: creatorName2,
              hubspot_id: Number(dealId),
              created_at: createdAt,
              location_city: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCity] ?? undefined,
              location_country: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCountry] ?? undefined,
            });
          }
        }

        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ projects: result });
      }

      if (body.action === "get_all_angebote") {
        // Load all companies with hubspot_id
        const { data: allCompanies } = await supabaseAdmin
          .from("usercompany")
          .select("id,hubspot_id")
          .not("hubspot_id", "is", null);

        const allAngebote: any[] = [];
        await Promise.all(
          (allCompanies ?? []).map(async (c: any) => {
            try {
              const angebote = await getAngebote(c.hubspot_id);
              allAngebote.push(...angebote.map((a: any) => ({ ...a, partnerHubspotId: c.hubspot_id })));
            } catch { /* skip */ }
          }),
        );

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ angebote: allAngebote });
      }

      if (body.action === "unlock_user" || body.action === "lock_user") {
        const targetUserId = String(body.payload?.user_id ?? "");
        if (!targetUserId) return json({ error: "Missing user_id" }, 400);

        const { data: targetUser } = await supabaseAdmin
          .from("user")
          .select("hubspot_id")
          .eq("id", targetUserId)
          .single();

        if (!targetUser?.hubspot_id) return json({ error: "User not found or no HubSpot mapping" }, 404);

        const newStatus = body.action === "unlock_user"
          ? HUBSPOT_CONTACT_STATUS_ACTIVE
          : HUBSPOT_CONTACT_STATUS_PENDING;

        await hubspotRequest(`/crm/v3/objects/contacts/${targetUser.hubspot_id}`, "PATCH", {
          properties: { [HUBSPOT_FIELDS.contact.portalStatus]: newStatus },
        });

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ ok: true, status: newStatus });
      }

      if (body.action === "reassign_user_company") {
        const targetUserId = String(body.payload?.user_id ?? "");
        const newCompanyId = String(body.payload?.company_id ?? "");
        if (!targetUserId || !newCompanyId) return json({ error: "Missing user_id or company_id" }, 400);

        const { error: updateErr } = await supabaseAdmin
          .from("user")
          .update({ company_id: newCompanyId })
          .eq("id", targetUserId);

        if (updateErr) throw updateErr;

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ ok: true });
      }

      if (body.action === "update_company") {
        const companyId = String(body.payload?.company_id ?? "");
        const fields = body.payload?.fields ?? {};
        if (!companyId) return json({ error: "Missing company_id" }, 400);

        const updates: Record<string, unknown> = {};
        if (fields.partnerType !== undefined) updates.partnerart = fields.partnerType;
        if (fields.hubspot_id !== undefined) {
          updates.hubspot_id = (fields.hubspot_id === null || fields.hubspot_id === "") ? null : Number(fields.hubspot_id);
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateErr } = await supabaseAdmin
            .from("usercompany")
            .update(updates)
            .eq("id", companyId);
          if (updateErr) throw updateErr;
        }

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ ok: true });
      }

      if (body.action === "update_user") {
        const targetUserId = String(body.payload?.user_id ?? "");
        const fields = body.payload?.fields ?? {};
        if (!targetUserId) return json({ error: "Missing user_id" }, 400);

        const updates: Record<string, unknown> = {};

        if (fields.hubspot_id !== undefined) {
          updates.hubspot_id = (fields.hubspot_id === null || fields.hubspot_id === "") ? null : Number(fields.hubspot_id);
        }

        if (fields.company_id !== undefined) {
          // Empty string means "remove company assignment"
          updates.company_id = fields.company_id || null;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateErr } = await supabaseAdmin
            .from("user")
            .update(updates)
            .eq("id", targetUserId);
          if (updateErr) throw updateErr;
        }

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ ok: true });
      }

      if (body.action === "import_company") {
        const hubspotId = Number(body.payload?.hubspot_id);
        if (!hubspotId) return json({ error: "Ungültige HubSpot-ID" }, 400);

        // Prüfen ob bereits vorhanden
        const { data: existing } = await supabaseAdmin
          .from("usercompany")
          .select("id")
          .eq("hubspot_id", hubspotId)
          .maybeSingle();
        if (existing) return json({ error: "Ein Unternehmen mit dieser HubSpot-ID existiert bereits." }, 409);

        // HubSpot-Objekt laden (Validierung + Name)
        let partnerName: string | undefined;
        try {
          const partner = await hubspotRequest(
            `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${hubspotId}?properties=${HUBSPOT_FIELDS.partner.name}`,
            "GET",
          );
          partnerName = partner?.properties?.[HUBSPOT_FIELDS.partner.name];
        } catch {
          return json({ error: "HubSpot-Objekt nicht gefunden. Bitte prüfe die ID." }, 404);
        }

        // In Supabase anlegen
        const company = await upsertLocalCompanyByHubSpotId(hubspotId);

        console.log(`[hubspot-projects] action=${action} imported company hubspot_id=${hubspotId} duration_ms=${Math.round(performance.now() - actionStartedAt)}`);
        return json({
          ok: true,
          company: { id: company.id, hubspot_id: hubspotId, name: partnerName, invite_code: company.invite_code },
        });
      }

      if (body.action === "delete_company") {
        const companyId = String(body.payload?.company_id ?? "");
        if (!companyId) return json({ error: "Missing company_id" }, 400);

        // Alle Nutzer des Unternehmens auf company_id = null setzen
        const { error: unlinkErr } = await supabaseAdmin
          .from("user")
          .update({ company_id: null })
          .eq("company_id", companyId);
        if (unlinkErr) throw unlinkErr;

        // Unternehmen aus Supabase löschen
        const { error: deleteErr } = await supabaseAdmin
          .from("usercompany")
          .delete()
          .eq("id", companyId);
        if (deleteErr) throw deleteErr;

        console.log(`[hubspot-projects] action=${action} deleted company id=${companyId} duration_ms=${Math.round(performance.now() - actionStartedAt)}`);
        return json({ ok: true });
      }

      if (body.action === "preview_contact") {
        const hubspotContactId = Number(body.payload?.hubspot_contact_id);
        if (!hubspotContactId) return json({ error: "Ungültige HubSpot-Kontakt-ID" }, 400);

        let contact: any;
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
          );
        } catch {
          return json({ error: "HubSpot-Kontakt nicht gefunden. Bitte prüfe die ID." }, 404);
        }

        const p = contact?.properties ?? {};
        console.log(`[hubspot-projects] action=${action} preview hubspot_contact_id=${hubspotContactId} duration_ms=${Math.round(performance.now() - actionStartedAt)}`);
        return json({
          email: p[HUBSPOT_FIELDS.contact.email] ?? null,
          fname: p[HUBSPOT_FIELDS.contact.firstName] ?? null,
          lname: p[HUBSPOT_FIELDS.contact.lastName] ?? null,
        });
      }

      if (body.action === "import_user") {
        const hubspotContactId = Number(body.payload?.hubspot_contact_id);
        const password = String(body.payload?.password ?? "");
        const companyId = body.payload?.company_id ? String(body.payload.company_id) : null;

        if (!hubspotContactId) return json({ error: "Ungültige HubSpot-Kontakt-ID" }, 400);
        if (!password || password.length < 8) return json({ error: "Passwort muss mindestens 8 Zeichen haben" }, 400);

        // HubSpot-Kontakt laden
        let contact: any;
        try {
          contact = await hubspotRequest(
            `/crm/v3/objects/contacts/${hubspotContactId}?properties=${[
              HUBSPOT_FIELDS.contact.email,
              HUBSPOT_FIELDS.contact.firstName,
              HUBSPOT_FIELDS.contact.lastName,
            ].join(",")}`,
            "GET",
          );
        } catch {
          return json({ error: "HubSpot-Kontakt nicht gefunden." }, 404);
        }

        const email = contact?.properties?.[HUBSPOT_FIELDS.contact.email];
        if (!email) return json({ error: "HubSpot-Kontakt hat keine E-Mail-Adresse." }, 400);

        // Prüfen ob Auth-User mit dieser E-Mail bereits existiert
        const { data: existingAuthList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const alreadyExists = (existingAuthList?.users ?? []).some((u: any) => u.email === email);
        if (alreadyExists) return json({ error: `Ein Nutzer mit der E-Mail ${email} existiert bereits.` }, 409);

        // Auth-User anlegen — direkt bestätigt, kein E-Mail-Verify-Flow
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { must_change_password: true },
        });
        if (authErr || !authData?.user) throw authErr ?? new Error("Auth-User konnte nicht erstellt werden");

        const authId = authData.user.id;

        // User-Zeile in Supabase anlegen
        const { data: userRow, error: userInsertErr } = await supabaseAdmin
          .from("user")
          .insert({ auth_id: authId, hubspot_id: hubspotContactId, company_id: companyId })
          .select("id")
          .single();
        if (userInsertErr) throw userInsertErr;

        // HubSpot-Status auf Aktiv setzen
        try {
          await hubspotRequest(`/crm/v3/objects/contacts/${hubspotContactId}`, "PATCH", {
            properties: { [HUBSPOT_FIELDS.contact.portalStatus]: HUBSPOT_CONTACT_STATUS_ACTIVE },
          });
        } catch (hsErr) {
          console.warn(`[hubspot-projects] import_user: HubSpot status update failed`, hsErr);
        }

        console.log(`[hubspot-projects] action=${action} imported user hubspot_id=${hubspotContactId} duration_ms=${Math.round(performance.now() - actionStartedAt)}`);
        return json({ ok: true, user: { id: userRow.id, email } });
      }

      if (body.action === "bulk_preview") {
        type PreviewRow = { company_hubspot_id: number; contact_ids: number[] };
        const rows: PreviewRow[] = body.payload?.rows ?? [];
        if (!Array.isArray(rows) || rows.length === 0) return json({ error: "Keine Zeilen" }, 400);

        const companyIds = [...new Set(rows.map((r) => Number(r.company_hubspot_id)).filter(Boolean))];
        const contactIds = [...new Set(rows.flatMap((r) => (r.contact_ids ?? []).map(Number).filter(Boolean)))];

        const [companyMap, contactMap] = await Promise.all([
          batchReadHubspotObjects(HUBSPOT_PARTNER_OBJECT_TYPE, companyIds, [HUBSPOT_FIELDS.partner.name]),
          contactIds.length > 0
            ? batchReadHubspotObjects("contacts", contactIds, [HUBSPOT_FIELDS.contact.email])
            : Promise.resolve(new Map<string, any>()),
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
              email: contactEntry?.properties?.[HUBSPOT_FIELDS.contact.email] ?? null,
              contact_found: !!contactEntry,
            };
          });
          results.push({
            company_hubspot_id: companyId,
            company_name: companyEntry?.properties?.[HUBSPOT_FIELDS.partner.name] ?? null,
            company_found: !!companyEntry,
            users,
          });
        }

        console.log(`[hubspot-projects] action=${action} bulk_preview companies=${companyIds.length} contacts=${contactIds.length} duration_ms=${Math.round(performance.now() - actionStartedAt)}`);
        return json({ ok: true, results });
      }

      if (body.action === "bulk_import") {
        const BULK_PASSWORD = "Voltfang2026";
        type BulkRow = { company_hubspot_id: number; contact_ids: number[] };
        const rows: BulkRow[] = body.payload?.rows ?? [];

        if (!Array.isArray(rows) || rows.length === 0) return json({ error: "Keine Zeilen" }, 400);
        if (rows.length > 200) return json({ error: "Maximal 200 Zeilen" }, 400);

        // Auth-User-Liste einmalig holen (für Duplikat-Checks)
        const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existingEmails = new Set((authList?.users ?? []).map((u: any) => u.email));

        const results: any[] = [];

        for (const row of rows) {
          const companyHubspotId = Number(row.company_hubspot_id);
          if (!companyHubspotId) continue;

          const companyResult: any = {
            company_hubspot_id: companyHubspotId,
            company_name: null,
            company_status: null,
            company_id: null,
            users: [],
          };

          // Unternehmen importieren oder bestehendes verwenden
          try {
            const { data: existingComp } = await supabaseAdmin
              .from("usercompany").select("id").eq("hubspot_id", companyHubspotId).maybeSingle();

            if (existingComp) {
              companyResult.company_status = "already_exists";
              companyResult.company_id = existingComp.id;
            } else {
              const company = await upsertLocalCompanyByHubSpotId(companyHubspotId);
              companyResult.company_status = "imported";
              companyResult.company_id = company.id;
            }

            // Name aus HubSpot laden
            try {
              const partner = await hubspotRequest(
                `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}?properties=${HUBSPOT_FIELDS.partner.name}`,
                "GET",
              );
              companyResult.company_name = partner?.properties?.[HUBSPOT_FIELDS.partner.name] ?? null;
            } catch { /* Name bleibt null */ }
          } catch (e) {
            companyResult.company_status = "error";
            companyResult.company_error = e instanceof Error ? e.message : "Fehler";
            results.push(companyResult);
            continue;
          }

          // Nutzer importieren
          for (const contactId of (row.contact_ids ?? [])) {
            const userResult: any = { contact_id: contactId, email: null, status: null };

            try {
              // Kontakt aus HubSpot laden
              const contact = await hubspotRequest(
                `/crm/v3/objects/contacts/${contactId}?properties=${HUBSPOT_FIELDS.contact.email},${HUBSPOT_FIELDS.contact.firstName},${HUBSPOT_FIELDS.contact.lastName}`,
                "GET",
              );
              const email = contact?.properties?.[HUBSPOT_FIELDS.contact.email];
              userResult.email = email ?? null;

              if (!email) {
                userResult.status = "error";
                userResult.error = "Kein E-Mail im HubSpot-Kontakt";
                companyResult.users.push(userResult);
                continue;
              }

              if (existingEmails.has(email)) {
                userResult.status = "already_exists";
                companyResult.users.push(userResult);
                continue;
              }

              const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                email, password: BULK_PASSWORD, email_confirm: true,
                user_metadata: { must_change_password: true },
              });
              if (authErr || !authData?.user) throw authErr ?? new Error("Auth-User Fehler");

              existingEmails.add(email);

              await supabaseAdmin.from("user").insert({
                auth_id: authData.user.id,
                hubspot_id: contactId,
                company_id: companyResult.company_id,
              });

              try {
                await hubspotRequest(`/crm/v3/objects/contacts/${contactId}`, "PATCH", {
                  properties: { [HUBSPOT_FIELDS.contact.portalStatus]: HUBSPOT_CONTACT_STATUS_ACTIVE },
                });
              } catch { /* ignorieren */ }

              userResult.status = "imported";
            } catch (e) {
              userResult.status = "error";
              userResult.error = e instanceof Error ? e.message : "Fehler";
            }

            companyResult.users.push(userResult);
          }

          results.push(companyResult);
        }

        console.log(`[hubspot-projects] action=${action} bulk_import rows=${rows.length} duration_ms=${Math.round(performance.now() - actionStartedAt)}`);
        return json({ ok: true, results });
      }

      if (body.action === "update_project") {
        // Projekte werden nicht mehr in Supabase gespeichert
        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ ok: true });
      }

      if (body.action === "delete_user") {
        const targetUserId = String(body.payload?.user_id ?? "");
        if (!targetUserId) return json({ error: "Missing user_id" }, 400);

        // Fetch user record to get hubspot_id and auth_id
        const { data: targetUser, error: fetchErr } = await supabaseAdmin
          .from("user")
          .select("id, auth_id, hubspot_id")
          .eq("id", targetUserId)
          .single();

        if (fetchErr || !targetUser) return json({ error: "User not found" }, 404);

        // Delete from public.user
        const { error: deleteUserErr } = await supabaseAdmin
          .from("user")
          .delete()
          .eq("id", targetUserId);
        if (deleteUserErr) throw deleteUserErr;

        // Delete auth user
        if (targetUser.auth_id) {
          const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(targetUser.auth_id);
          if (deleteAuthErr) throw deleteAuthErr;
        }

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ ok: true });
      }

      if (body.action === "get_company_deals") {
        const companyHubspotId = Number(body.payload?.company_hubspot_id);
        if (!companyHubspotId) return json({ error: "Missing company_hubspot_id" }, 400);

        const dealAssocResponse = await hubspotRequest(
          `/crm/v4/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/${companyHubspotId}/associations/deals`,
          "GET",
        );

        const dealHubspotIds = (dealAssocResponse?.results ?? []).map((r: any) => String(r.toObjectId));

        if (dealHubspotIds.length === 0) {
          console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
          return json({ projects: [] });
        }

        const dealMap = await batchReadHubspotObjects("deals", dealHubspotIds, [
          HUBSPOT_FIELDS.deal.name,
          HUBSPOT_FIELDS.deal.stage,
          HUBSPOT_FIELDS.deal.locationCity,
          HUBSPOT_FIELDS.deal.locationCountry,
          "createdate",
        ]);

        const projects = dealHubspotIds.map((dealId) => {
          const deal = dealMap.get(dealId);
          const rawCreateDate = deal?.properties?.createdate;
          let dealCreatedAt = new Date().toISOString();
          if (rawCreateDate) {
            const asNum = Number(rawCreateDate);
            if (Number.isFinite(asNum)) {
              dealCreatedAt = new Date(asNum).toISOString();
            } else {
              const d = new Date(rawCreateDate);
              if (!isNaN(d.getTime())) dealCreatedAt = d.toISOString();
            }
          }
          return {
            id: dealId,
            name: deal?.properties?.[HUBSPOT_FIELDS.deal.name] ?? `Deal ${dealId}`,
            dealstage: normalizeDealstage(deal?.properties?.[HUBSPOT_FIELDS.deal.stage]),
            hubspot_id: Number(dealId),
            company_id: undefined,
            created_by_user_id: "",
            created_at: dealCreatedAt,
            location_city: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCity] ?? undefined,
            location_country: deal?.properties?.[HUBSPOT_FIELDS.deal.locationCountry] ?? undefined,
          };
        });

        console.log(`[hubspot-projects] action=${action} duration_ms=${Math.round(performance.now() - actionStartedAt)} hubspot_calls=${hubspotRequestCount}`);
        return json({ projects });
      }

    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[hubspot-projects] Unhandled error:", msg);
    return json({ error: msg }, 500);
  }
});
