import { createClient } from '@/lib/supabase/client';
import type { Angebot } from '@/types';

export type EdgeProjectPayload = {
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

export interface CreateAngebotPayload {
  dealHubspotId: string;
  partnerHubspotId: number;
  dealName: string;
  produkt: string;
  menge?: number;
  leistungKw?: number;
  nettokapazitaetKwh?: number;
  garantie?: string;
  betonfundament?: string;
  monitoring?: string;
  steuerungsalgorithmen?: string[];
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

function getSupabase() {
  return createClient();
}

export async function getHubSpotContext(targetCompanyId?: string | null) {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: {
      action: 'get_context',
      ...(targetCompanyId ? { payload: { target_company_id: targetCompanyId } } : {}),
    },
  });
  if (error) throw error;
  return data;
}

export async function createHubSpotProject(payload: EdgeProjectPayload) {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: { action: 'create_project', payload },
  });
  if (error) throw error;
  return data;
}

export async function registerHubSpotPartner(payload: RegisterPartnerPayload) {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: { action: 'register_partner', payload },
  });
  if (error) throw error;
  return data;
}

export async function joinHubSpotPartnerWithInvite(payload: JoinPartnerPayload) {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: { action: 'join_partner_with_invite', payload },
  });
  if (error) throw error;
  return data;
}

export async function getHubSpotUserContext() {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: { action: 'get_user_context' },
  });
  if (error) throw error;
  return data;
}

export async function getHubSpotAngebote(companyHubspotId: number): Promise<Angebot[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: { action: 'get_angebote', payload: { company_hubspot_id: companyHubspotId } },
  });
  if (error) throw error;
  return data?.angebote ?? [];
}

export async function createHubSpotAngebot(payload: CreateAngebotPayload): Promise<Angebot> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('hubspot-projects', {
    body: {
      action: 'create_angebot',
      payload: {
        deal_hubspot_id: payload.dealHubspotId,
        partner_hubspot_id: payload.partnerHubspotId,
        deal_name: payload.dealName,
        produkt_c_i: payload.produkt,
        leistung: payload.leistungKw,
        nettokapazitat: payload.nettokapazitaetKwh,
        garantie: payload.garantie,
        betonfundament: payload.betonfundament,
        monitoring: payload.monitoring ?? 'Ja',
        steuerungsalgorithmen: payload.steuerungsalgorithmen,
        rechnungsadresse_unternehmensname: payload.rechnungsadresse_unternehmensname,
        rechnungsadresse_strasse: payload.rechnungsadresse_strasse,
        rechnungsadresse_plz: payload.rechnungsadresse_plz,
        rechnungsadresse_ort: payload.rechnungsadresse_ort,
        rechnungsadresse_bundesland: payload.rechnungsadresse_bundesland,
        rechnungsadresse_land: payload.rechnungsadresse_land,
        lieferadresse_unternehmensname: payload.lieferadresse_unternehmensname,
        lieferadresse_strasse: payload.lieferadresse_strasse,
        lieferadresse_plz: payload.lieferadresse_plz,
        lieferadresse_ort: payload.lieferadresse_ort,
        lieferadresse_bundesland: payload.lieferadresse_bundesland,
        lieferadresse_land: payload.lieferadresse_land,
      },
    },
  });
  if (error) throw error;
  return data.angebot;
}
