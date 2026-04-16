import { hubspotRequest } from "./hubspot-client.ts";
import {
  HUBSPOT_FIELDS,
  HUBSPOT_PARTNER_OBJECT_TYPE,
  HUBSPOT_ENDKUNDE_OBJECT_TYPE,
  HUBSPOT_CONTACT_STATUS_ACTIVE,
  PARTNER_BRANCH_OPTION_MAP,
} from "./constants.ts";
import { getExistingHubSpotIdFromConflictMessage } from "./helpers.ts";
import type { HubSpotContactInput, RegisterPartnerPayload, RequestMetrics } from "./types.ts";

const contactProperties = [
  HUBSPOT_FIELDS.contact.salutation,
  HUBSPOT_FIELDS.contact.firstName,
  HUBSPOT_FIELDS.contact.lastName,
  HUBSPOT_FIELDS.contact.role,
  HUBSPOT_FIELDS.contact.email,
  HUBSPOT_FIELDS.contact.phone,
  HUBSPOT_FIELDS.contact.portalStatus,
];

/**
 * Creates a HubSpot contact. On email conflict, reuses the existing contact.
 */
export async function createOrReuseContact(
  payload: HubSpotContactInput,
  portalStatus?: string,
  metrics?: RequestMetrics,
): Promise<Record<string, unknown>> {
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
    return await hubspotRequest(
      "/crm/v3/objects/contacts",
      "POST",
      { properties },
      { metrics },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isConflict =
      message.includes("(409)") &&
      message.toLowerCase().includes("contact already exists");
    if (!isConflict) throw error;

    const existingId = getExistingHubSpotIdFromConflictMessage(message);
    if (existingId) {
      const existingContact = await hubspotRequest(
        `/crm/v3/objects/contacts/${existingId}?properties=${contactProperties.join(",")}`,
        "GET",
        undefined,
        { metrics },
      );
      if (
        portalStatus &&
        (existingContact as Record<string, Record<string, unknown>>)
          ?.properties?.[HUBSPOT_FIELDS.contact.portalStatus] !==
          HUBSPOT_CONTACT_STATUS_ACTIVE
      ) {
        await hubspotRequest(
          `/crm/v3/objects/contacts/${existingId}`,
          "PATCH",
          { properties: { [HUBSPOT_FIELDS.contact.portalStatus]: portalStatus } },
          { metrics },
        );
      }
      return existingContact;
    }

    const searchResult = await hubspotRequest(
      "/crm/v3/objects/contacts/search",
      "POST",
      {
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
        properties: contactProperties,
        limit: 1,
      },
      { metrics },
    );

    const results = (searchResult as Record<string, unknown[]>)?.results;
    if (!results?.length) throw error;
    const found = results[0] as Record<string, Record<string, unknown>>;
    if (
      portalStatus &&
      found?.properties?.[HUBSPOT_FIELDS.contact.portalStatus] !==
        HUBSPOT_CONTACT_STATUS_ACTIVE
    ) {
      await hubspotRequest(
        `/crm/v3/objects/contacts/${(found as Record<string, unknown>).id}`,
        "PATCH",
        { properties: { [HUBSPOT_FIELDS.contact.portalStatus]: portalStatus } },
        { metrics },
      );
    }
    return found;
  }
}

/**
 * Creates a HubSpot partner. On name conflict, reuses the existing partner.
 */
export async function createOrReusePartner(
  payload: RegisterPartnerPayload,
  metrics?: RequestMetrics,
): Promise<Record<string, unknown>> {
  const normalizedBranch =
    PARTNER_BRANCH_OPTION_MAP[payload.branche_partner] ??
    payload.branche_partner;

  try {
    return await hubspotRequest(
      `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}`,
      "POST",
      {
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
      },
      { metrics },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const uniqueNameConflict =
      message.includes(HUBSPOT_FIELDS.partner.name) &&
      message.includes("already has that value");
    if (!uniqueNameConflict) throw error;

    const searchResult = await hubspotRequest(
      `/crm/v3/objects/${HUBSPOT_PARTNER_OBJECT_TYPE}/search`,
      "POST",
      {
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
      },
      { metrics },
    );

    const results = (searchResult as Record<string, unknown[]>)?.results;
    if (!results?.length) throw error;
    return results[0] as Record<string, unknown>;
  }
}

export async function associateContactWithPartner(
  contactId: string | number,
  partnerId: string | number,
  metrics?: RequestMetrics,
) {
  await hubspotRequest(
    `/crm/v4/objects/contacts/${contactId}/associations/default/${HUBSPOT_PARTNER_OBJECT_TYPE}/${partnerId}`,
    "PUT",
    undefined,
    { metrics },
  );
}

export async function associateContactWithEndkunde(
  contactId: string | number,
  endkundeId: string | number,
  metrics?: RequestMetrics,
) {
  await hubspotRequest(
    `/crm/v4/objects/contacts/${contactId}/associations/default/${HUBSPOT_ENDKUNDE_OBJECT_TYPE}/${endkundeId}`,
    "PUT",
    undefined,
    { metrics },
  );
}
