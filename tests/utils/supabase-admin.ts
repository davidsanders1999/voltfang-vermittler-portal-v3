import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Lade Umgebungsvariablen aus dem Projekt-Root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Für Tests brauchen wir den Service Role Key, um RLS zu umgehen!
// Der normale anon/publishable key ist an RLS-Policies gebunden.
// Da der Test-Client nicht als User authentifiziert ist, blockiert RLS alle Abfragen.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL nicht konfiguriert. Bitte .env Datei prüfen.');
}

if (!supabaseServiceRoleKey) {
  console.warn(
    '⚠️  SUPABASE_SERVICE_ROLE_KEY nicht konfiguriert!\n' +
    '   Für E2E-Tests wird der Service Role Key benötigt, um RLS zu umgehen.\n' +
    '   Den Key findest du im Supabase Dashboard unter: Settings > API > service_role (secret)\n' +
    '   Füge SUPABASE_SERVICE_ROLE_KEY=... zur .env Datei hinzu.'
  );
  // Fallback: Versuche es mit dem normalen Key (wird wahrscheinlich fehlschlagen wegen RLS)
  const fallbackKey = process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!fallbackKey) {
    throw new Error('Weder SUPABASE_SERVICE_ROLE_KEY noch VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY konfiguriert.');
  }
}

/**
 * Supabase-Client für Test-Zugriff mit Service Role Key
 * ACHTUNG: Dieser Client umgeht RLS! Nur für Tests verwenden!
 */
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl, 
  supabaseServiceRoleKey || process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function findAuthUserByEmail(email: string): Promise<{ id: string; email?: string } | null> {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('Fehler beim Laden der Auth-User:', error);
      return null;
    }
    const user = (data?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (user) return { id: user.id, email: user.email || undefined };
    if (!data?.users?.length || data.users.length < 200) break;
    page++;
  }
  return null;
}

async function findAuthUsersByPrefix(emailPrefix: string): Promise<Array<{ id: string; email?: string }>> {
  const result: Array<{ id: string; email?: string }> = [];
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('Fehler beim Laden der Auth-User:', error);
      return result;
    }
    const users = data?.users || [];
    result.push(
      ...users
        .filter(u => (u.email || '').startsWith(emailPrefix))
        .map(u => ({ id: u.id, email: u.email || undefined }))
    );
    if (!users.length || users.length < 200) break;
    page++;
  }
  return result;
}

/**
 * Holt den Einladungscode eines Unternehmens anhand der ID
 */
export async function getCompanyInviteCode(companyId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('usercompany')
    .select('invite_code')
    .eq('id', companyId)
    .single();

  if (error) {
    console.error('Fehler beim Abrufen des Einladungscodes:', error);
    return null;
  }

  return data?.invite_code || null;
}

/**
 * Holt die company_id eines Users anhand der E-Mail
 */
export async function getUserCompanyId(email: string): Promise<string | null> {
  const authUser = await findAuthUserByEmail(email);
  if (!authUser) return null;
  const { data, error } = await supabaseAdmin
    .from('user')
    .select('company_id')
    .eq('auth_id', authUser.id)
    .single();

  if (error) {
    console.error('Fehler beim Abrufen der company_id:', error);
    return null;
  }

  return data?.company_id || null;
}

/**
 * Holt User-Daten anhand der E-Mail
 */
export async function getUserByEmail(email: string): Promise<{
  id: string;
  company_id: string | null;
  auth_id: string;
} | null> {
  const authUser = await findAuthUserByEmail(email);
  if (!authUser) return null;
  const { data, error } = await supabaseAdmin
    .from('user')
    .select('id, company_id, auth_id')
    .eq('auth_id', authUser.id)
    .single();

  if (error) {
    console.error('Fehler beim Abrufen des Users:', error);
    return null;
  }

  return data;
}

/**
 * Holt Unternehmensdaten anhand der ID
 */
export async function getCompanyById(companyId: string): Promise<{
  id: string;
  name: string;
  invite_code: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('usercompany')
    .select('id, name, invite_code')
    .eq('id', companyId)
    .single();

  if (error) {
    console.error('Fehler beim Abrufen des Unternehmens:', error);
    return null;
  }

  return data;
}

/**
 * Zählt die Anzahl der User in einem Unternehmen
 */
export async function countUsersInCompany(companyId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('user')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if (error) {
    console.error('Fehler beim Zählen der User:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Bestätigt die E-Mail-Adresse eines Users programmatisch
 * Ermöglicht E-Mail-Bestätigung in Produktion aktiv zu lassen, während Tests automatisch bestätigen
 */
export async function confirmUserEmail(email: string): Promise<boolean> {
  const authUser = await findAuthUserByEmail(email);
  if (!authUser?.id) {
    console.error('Fehler beim Abrufen des Auth-Users für E-Mail-Bestätigung:', email);
    return false;
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(
    authUser.id,
    { email_confirm: true }
  );

  if (error) {
    console.error('Fehler beim Bestätigen der E-Mail:', error);
    return false;
  }
  
  console.log(`E-Mail für ${email} wurde bestätigt.`);
  return true;
}

/**
 * Schaltet einen User frei (setzt is_unlocked auf true)
 * Simuliert die Backend-Freischaltung durch Voltfang
 */
export async function unlockUser(email: string): Promise<boolean> {
  const authUser = await findAuthUserByEmail(email);
  if (!authUser?.id) return false;

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('user')
    .select('hubspot_id')
    .eq('auth_id', authUser.id)
    .single();
  if (userError || !userRow?.hubspot_id) {
    console.error('Fehler beim Laden der HubSpot-ID für Freischaltung:', userError);
    return false;
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.warn('HUBSPOT_ACCESS_TOKEN fehlt, Freischaltung im Test kann nicht gesetzt werden.');
    return false;
  }

  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${userRow.hubspot_id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        vermittlerportal_status: 'Aktiv',
      },
    }),
  });
  if (!response.ok) {
    console.error('Fehler beim Setzen des HubSpot-Status:', await response.text());
    return false;
  }

  console.log(`User ${email} wurde in HubSpot auf Aktiv gesetzt.`);
  return true;
}

/**
 * Bereinigt Test-Daten (Projekte, User, Auth-Users und Unternehmen mit bestimmtem Prefix)
 * ACHTUNG: Nur für Testumgebungen verwenden!
 */
export async function cleanupTestData(emailPrefix: string): Promise<void> {
  const authUsers = await findAuthUsersByPrefix(emailPrefix);
  if (!authUsers.length) {
    console.log('Keine Test-Daten zum Bereinigen gefunden.');
    return;
  }

  const authIds = authUsers.map(u => u.id);
  const { data: users } = await supabaseAdmin
    .from('user')
    .select('id, company_id, auth_id, hubspot_id')
    .in('auth_id', authIds);
  const companyIds = [...new Set((users || []).map(u => u.company_id).filter(Boolean))];

  // Sammle HubSpot-IDs für eine Prefix-bezogene Bereinigung.
  const hubspotUserContactIds = new Set<number>();
  for (const user of users || []) {
    if (user.hubspot_id) hubspotUserContactIds.add(user.hubspot_id);
  }

  const { data: projectsForCleanup } = await supabaseAdmin
    .from('project')
    .select('hubspot_id, hubspot_project_contact_id, hubspot_project_company_id')
    .in('company_id', companyIds.length ? companyIds : ['00000000-0000-0000-0000-000000000000']);

  const hubspotDealIds = new Set<number>();
  const hubspotProjectContactIds = new Set<number>();
  const hubspotEndkundeIds = new Set<number>();
  for (const project of projectsForCleanup || []) {
    if (project.hubspot_id) hubspotDealIds.add(project.hubspot_id);
    if (project.hubspot_project_contact_id) hubspotProjectContactIds.add(project.hubspot_project_contact_id);
    if (project.hubspot_project_company_id) hubspotEndkundeIds.add(project.hubspot_project_company_id);
  }

  const { data: companiesForCleanup } = await supabaseAdmin
    .from('usercompany')
    .select('hubspot_id')
    .in('id', companyIds.length ? companyIds : ['00000000-0000-0000-0000-000000000000']);
  const hubspotPartnerIds = new Set<number>();
  for (const company of companiesForCleanup || []) {
    if (company.hubspot_id) hubspotPartnerIds.add(company.hubspot_id);
  }

  // Lösche zuerst alle Projekte der Test-Unternehmen
  let projectsDeleted = 0;
  for (const companyId of companyIds) {
    const { data: deletedProjects, error: projectError } = await supabaseAdmin
      .from('project')
      .delete()
      .eq('company_id', companyId)
      .select('id');

    if (projectError) {
      console.error('Fehler beim Löschen der Test-Projekte:', projectError);
    } else if (deletedProjects) {
      projectsDeleted += deletedProjects.length;
    }
  }

  // Lösche User aus public.user Tabelle
  const { error: userError } = await supabaseAdmin
    .from('user')
    .delete()
    .in('auth_id', authIds);

  if (userError) {
    console.error('Fehler beim Löschen der Test-User:', userError);
  }

  // Lösche Auth-Users über die Admin-API
  let authUsersDeleted = 0;
  for (const authId of authIds) {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(authId);
    if (authError) {
      console.error(`Fehler beim Löschen des Auth-Users ${authId}:`, authError);
    } else {
      authUsersDeleted++;
    }
  }

  // Lösche Unternehmen (nur wenn keine anderen User mehr vorhanden)
  for (const companyId of companyIds) {
    const remainingUsers = await countUsersInCompany(companyId);
    if (remainingUsers === 0) {
      const { error: companyError } = await supabaseAdmin
        .from('usercompany')
        .delete()
        .eq('id', companyId);

      if (companyError) {
        console.error('Fehler beim Löschen des Test-Unternehmens:', companyError);
      }
    }
  }

  // HubSpot-Objekte für dieses Test-Prefix ebenfalls bereinigen (best effort).
  // Reihenfolge: Deals -> Endkunden/Partner -> Kontakte
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  let hubspotDealsDeleted = 0;
  let hubspotEndkundenDeleted = 0;
  let hubspotPartnersDeleted = 0;
  let hubspotContactsDeleted = 0;
  if (!token) {
    console.warn('HUBSPOT_ACCESS_TOKEN fehlt. HubSpot-Testdaten werden bei cleanupTestData nicht gelöscht.');
  } else {
    hubspotDealsDeleted = await deleteHubSpotObjectsByIds('deals', [...hubspotDealIds]);
    hubspotEndkundenDeleted = await deleteHubSpotObjectsByIds(HUBSPOT_ENDKUNDE_OBJECT_TYPE, [...hubspotEndkundeIds]);
    hubspotPartnersDeleted = await deleteHubSpotObjectsByIds(HUBSPOT_PARTNER_OBJECT_TYPE, [...hubspotPartnerIds]);
    const contactIds = new Set<number>([...hubspotUserContactIds, ...hubspotProjectContactIds]);
    hubspotContactsDeleted = await deleteHubSpotObjectsByIds('contacts', [...contactIds]);
  }

  console.log(
    `Test-Daten bereinigt: ${(users || []).length} User, ${authUsersDeleted} Auth-Users, ${projectsDeleted} Projekte, ` +
      `HubSpot Deals=${hubspotDealsDeleted}, Endkunden=${hubspotEndkundenDeleted}, Partner=${hubspotPartnersDeleted}, Kontakte=${hubspotContactsDeleted}`
  );
}

/**
 * Liefert alle Projekte eines Unternehmens inkl. HubSpot-Zuordnungs-IDs.
 */
export async function getProjectsWithHubSpotMappings(companyId: string): Promise<Array<{
  id: string;
  name: string;
  hubspot_id: number | null;
  hubspot_project_contact_id: number | null;
  hubspot_project_company_id: number | null;
}>> {
  const { data, error } = await supabaseAdmin
    .from('project')
    .select('id, name, hubspot_id, hubspot_project_contact_id, hubspot_project_company_id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fehler beim Abrufen der Projekt-Mappings:', error);
    return [];
  }

  return data || [];
}

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_ENDKUNDE_OBJECT_TYPE = process.env.HUBSPOT_ENDKUNDE_OBJECT_TYPE || '2-57928694';
const HUBSPOT_PARTNER_OBJECT_TYPE = process.env.HUBSPOT_PARTNER_OBJECT_TYPE || '2-57928699';

async function hubspotRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error('HUBSPOT_ACCESS_TOKEN fehlt. Vollständige HubSpot-Bereinigung nicht möglich.');
  }

  const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return response;
}

async function deleteHubSpotObjectsByIds(objectType: string, ids: Array<string | number>): Promise<number> {
  let deleted = 0;
  for (const rawId of ids) {
    const id = String(rawId);
    if (!id) continue;
    const response = await hubspotRequest(`/crm/v3/objects/${objectType}/${id}`, {
      method: 'DELETE',
    });
    if (response.ok || response.status === 404) {
      deleted += 1;
      continue;
    }
    console.error(`Fehler beim Löschen von HubSpot-Objekt ${objectType}/${id}:`, await response.text());
  }
  return deleted;
}
