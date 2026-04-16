import { HUBSPOT_STAGE_TO_PROJECT_STATUS, HUBSPOT_FIELDS } from "./constants.ts";
import type { VoltfangContactInfo } from "./types.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function normalizeDealstage(raw: string | undefined): string {
  if (!raw) return "Eingangsprüfung";
  return HUBSPOT_STAGE_TO_PROJECT_STATUS[raw] ?? "Eingangsprüfung";
}

export function parseHubSpotNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toHubSpotId(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses a HubSpot createdate value (epoch ms string or ISO string) into an ISO string.
 */
export function parseCreatedAt(raw: unknown): string {
  if (!raw) return new Date().toISOString();
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) {
    return new Date(asNum).toISOString();
  }
  const d = new Date(String(raw));
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

// Owner mapping — will be replaced by HubSpot Owners API in a future iteration
const HUBSPOT_OWNER_ID_TO_CONTACT: Record<string, VoltfangContactInfo> = {
  "12355261": {
    name: "Roman Alberti",
    email: "roman.alberti@voltfang.de",
    phone: "+49 123 4567890",
  },
};

export function mapHubSpotOwnerIdToContact(
  ownerId: unknown,
): VoltfangContactInfo | undefined {
  if (ownerId === null || ownerId === undefined) return undefined;
  const normalized = String(ownerId).trim();
  if (!normalized) return undefined;
  return (
    HUBSPOT_OWNER_ID_TO_CONTACT[normalized] ?? {
      name: "Ansprechpartner fehlerhaft",
    }
  );
}

export function getEndkundeName(
  properties: Record<string, unknown> | undefined,
  fallback = "",
): string {
  if (!properties) return fallback;
  return (
    (properties[HUBSPOT_FIELDS.endkunde.name] as string) ??
    (properties.name as string) ??
    (properties.unternehmen_name as string) ??
    fallback
  );
}

/**
 * Legacy fallback: older versions stored a JSON payload in the description field.
 */
export function parseEmbeddedDescription(
  description: string | undefined,
): Record<string, unknown> {
  if (!description) return {};
  try {
    return JSON.parse(description);
  } catch {
    return {};
  }
}

/**
 * For new records, description is free text.
 * If old JSON is still stored there, return undefined.
 */
export function extractFreeTextDescription(
  description: string | undefined,
): string | undefined {
  if (!description) return undefined;
  const trimmed = description.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return undefined;
  } catch {
    // Not JSON — expected free text
  }
  return trimmed;
}

export function getExistingHubSpotIdFromConflictMessage(
  message: string,
): string | null {
  const byPrefix = message.match(/Existing ID:\s*([0-9]+)/i);
  if (byPrefix?.[1]) return byPrefix[1];
  const bySentence = message.match(/object with id\s+([0-9]+)/i);
  if (bySentence?.[1]) return bySentence[1];
  return null;
}

export function mapAngebotStatus(raw: string | undefined): string {
  switch (raw) {
    case "Abgelaufen":
    case "Verloren":
      return "Abgelaufen";
    case "Gewonnen":
      return "Gewonnen";
    default:
      return "Offen";
  }
}

/**
 * Logs request metrics to console.
 */
export function logMetrics(
  action: string,
  startedAt: number,
  hubspotCalls: number,
) {
  console.log(
    `[edge-fn] action=${action} duration_ms=${Math.round(performance.now() - startedAt)} hubspot_calls=${hubspotCalls}`,
  );
}

/**
 * Returns a sanitized error response. Internal details are logged but not sent to the client.
 */
export function errorResponse(error: unknown, fallbackStatus = 500): Response {
  const msg = error instanceof Error ? error.message : "Unknown error";
  console.error("[edge-fn] Error:", msg);

  // Don't leak internal HubSpot error details to client
  const clientMessage = msg.includes("HubSpot")
    ? "Ein interner Fehler ist aufgetreten. Bitte versuchen Sie es später erneut."
    : msg;

  return json({ error: clientMessage }, fallbackStatus);
}
