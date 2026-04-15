export interface RegistrationSuccessData {
  email: string;
  fname: string;
  companyName?: string;
}

export type ProjectStatus =
  | 'Eingangsprüfung'
  | 'Technische Klärung'
  | 'Angebotsklärung'
  | 'Closing'
  | 'Gewonnen'
  | 'Verloren';

export type EstimatedCapacity =
  | '100 - 500 kWh'
  | '500 - 1000 kWh'
  | '1000 - 5000 kWh'
  | '>5000 kWh';

export const GERMAN_STATES = [
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
] as const;

export const SALUTATIONS = ['Herr', 'Frau', 'divers', 'Herr Dr.', 'Frau Dr.'] as const;

export interface Project {
  id: string;
  name: string;
  description?: string;
  dealstage: ProjectStatus;
  location_street: string;
  location_zip: string;
  location_city: string;
  location_state: string;
  location_country: string;
  estimated_order_date?: string;
  estimated_capacity?: EstimatedCapacity;
  offered_capacity?: number;
  deal_value?: number;
  close_date?: string;
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
  created_at: string;
  company_id?: string;
  hubspot_id?: number;
  vf_contact_name?: string;
  vf_contact_email?: string;
  vf_contact_phone?: string;
  created_by_user_id: string;
  company_name?: string;
  creator: { fname: string; lname: string };
}

export interface UserCompany {
  id: string;
  name?: string;
  website?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  bundesland?: string;
  branche_partner?: string;
  invite_code?: string;
  hubspot_id?: number;
  created_at: string;
  partnerType?: 'Vermittler' | 'Vertriebspartner';
}

export type AngebotStatus = 'Offen' | 'Abgelaufen' | 'Gewonnen';

export interface Angebot {
  hubspotId: string;
  dealHubspotId: string;
  partnerHubspotId?: number;
  projektName?: string;
  produkt: 'Voltfang 3' | 'Voltfang 3 Plus' | null;
  leistungKw: number | null;
  nettokapazitaetKwh: number | null;
  nettopreis: number | null;
  status: AngebotStatus;
  erstellungsdatum: string;
  ablaufdatum: string | null;
}

export interface SuperAdmin {
  id: string;
  auth_id: string;
  fname: string;
  lname: string;
}

export interface User {
  id: string;
  auth_id?: string;
  company_id?: string;
  hubspot_id?: number;
  fname: string;
  lname: string;
  salutation?: string;
  rolle_im_unternehmen?: string;
  email?: string;
  phone?: string;
  created_at: string;
  vermittlerportal_status?: 'Freischaltung ausstehend' | 'Aktiv';
  is_unlocked?: boolean;
}

// ─── Admin Types ──────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  auth_id?: string;
  company_id?: string;
  company_name?: string;
  hubspot_id?: number;
  fname: string;
  lname: string;
  email?: string;
  phone?: string;
  salutation?: string;
  rolle_im_unternehmen?: string;
  vermittlerportal_status?: 'Freischaltung ausstehend' | 'Aktiv';
  created_at: string;
  partner_type?: 'Vermittler' | 'Vertriebspartner';
}

export interface AdminCompany {
  id: string;
  hubspot_id?: number;
  name?: string;
  website?: string;
  street?: string;
  zip?: string;
  city?: string;
  bundesland?: string;
  country?: string;
  branche_partner?: string;
  partnerType?: 'Vermittler' | 'Vertriebspartner';
  invite_code?: string;
  created_at: string;
  user_count: number;
  project_count: number;
}

export interface AdminProject {
  id: string;
  name: string;
  dealstage: string;
  company_id?: string;
  company_name?: string;
  created_by_user_id: string;
  creator_name?: string;
  hubspot_id?: number;
  created_at: string;
  location_city?: string;
  location_country?: string;
}

export interface AdminOverview {
  total_companies: number;
  total_users: number;
  active_users: number;
  pending_users: number;
  total_projects: number;
  open_projects: number;
  total_angebote: number;
}
