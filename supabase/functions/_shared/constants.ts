// HubSpot Custom Object Type IDs
export const HUBSPOT_ENDKUNDE_OBJECT_TYPE = "2-57928694";
export const HUBSPOT_PARTNER_OBJECT_TYPE = "2-57928699";
export const HUBSPOT_ANGEBOT_OBJECT_TYPE = "2-57928700";

// Association label: Deal → Contact (USER_DEFINED, typeId 225)
// 224 = Contact→Deal, 225 = Deal→Contact (HubSpot label pairs)
export const HUBSPOT_KUNDENKONTAKT_ASSOC_TYPE_ID = 225;

export const HUBSPOT_CONTACT_STATUS_PENDING = "Freischaltung ausstehend";
export const HUBSPOT_CONTACT_STATUS_ACTIVE = "Aktiv";

// Default deal stage: 01_Eingangsprüfung (02_Partnerprojekte pipeline)
export const HUBSPOT_DEAL_STAGE_DEFAULT = "141674304";

// Mapping between application field names and HubSpot internal property names.
export const HUBSPOT_FIELDS = {
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

export const PARTNER_BRANCH_OPTION_MAP: Record<string, string> = {
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

// HubSpot delivers stage IDs — the UI needs readable status values.
export const HUBSPOT_STAGE_TO_PROJECT_STATUS: Record<string, string> = {
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

// HubSpot API configuration
export const HUBSPOT_BATCH_MAX = 100;
export const HUBSPOT_BATCH_CONCURRENCY = 5;
export const HUBSPOT_REQUEST_TIMEOUT_MS = 8000;
export const HUBSPOT_REQUEST_MAX_RETRIES = 2;
export const HUBSPOT_RETRY_BASE_DELAY_MS = 250;
