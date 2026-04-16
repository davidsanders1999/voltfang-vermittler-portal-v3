export type ProjectPayload = {
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

export type RegisterPartnerPayload = {
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

export type JoinPartnerPayload = {
  auth_id: string;
  email: string;
  salutation: string;
  fname: string;
  lname: string;
  rolle_im_unternehmen: string;
  phone?: string;
  invitation_code: string;
};

export type HubSpotContactInput = {
  kontakt_salutation: string;
  kontakt_fname: string;
  kontakt_lname: string;
  kontakt_rolle_im_unternehmen: string;
  kontakt_email: string;
  kontakt_phone?: string;
};

export type LocalUser = {
  id: string;
  auth_id: string;
  company_id: string | null;
  hubspot_id: number | null;
  created_at: string;
};

export type VoltfangContactInfo = {
  name: string;
  email?: string;
  phone?: string;
};

export type RequestMetrics = {
  hubspotRequestCount: number;
};
