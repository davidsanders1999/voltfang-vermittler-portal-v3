import { createClient } from '@/lib/supabase/client';
import type { AdminOverview, AdminUser, AdminCompany, AdminProject, Angebot } from '@/types';

async function invoke(action: string, payload?: Record<string, unknown>) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('hubspot-admin', {
    body: { action, payload },
  });
  if (error) throw error;
  return data;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const data = await invoke('get_admin_overview');
  return data as AdminOverview;
}

export async function getAllCompanies(): Promise<AdminCompany[]> {
  const data = await invoke('get_all_companies');
  return data?.companies ?? [];
}

export async function getAllUsers(): Promise<AdminUser[]> {
  const data = await invoke('get_all_users');
  return data?.users ?? [];
}

export async function unlockUser(userId: string): Promise<void> {
  await invoke('unlock_user', { user_id: userId });
}

export async function lockUser(userId: string): Promise<void> {
  await invoke('lock_user', { user_id: userId });
}

export async function updateCompany(
  companyId: string,
  fields: { hubspot_id?: number | null; partnerType?: string },
): Promise<void> {
  await invoke('update_company', { company_id: companyId, fields });
}

export async function updateUser(
  userId: string,
  fields: { hubspot_id?: number | null; company_id?: string | null },
): Promise<void> {
  await invoke('update_user', { user_id: userId, fields });
}

export async function getAllProjects(): Promise<AdminProject[]> {
  const data = await invoke('get_all_projects');
  return data?.projects ?? [];
}

export async function getCompanyDeals(companyHubspotId: number): Promise<AdminProject[]> {
  const data = await invoke('get_company_deals', { company_hubspot_id: companyHubspotId });
  return data?.projects ?? [];
}

export async function getCompanyAngebote(companyHubspotId: number): Promise<Angebot[]> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke('hubspot-context', {
    body: { action: 'get_angebote', payload: { company_hubspot_id: companyHubspotId } },
  });
  if (error) throw error;
  return data?.angebote ?? [];
}

export async function getAllAngebote(): Promise<Angebot[]> {
  const data = await invoke('get_all_angebote');
  return data?.angebote ?? [];
}

export async function deleteUser(userId: string): Promise<void> {
  await invoke('delete_user', { user_id: userId });
}

export async function importCompany(hubspotId: number): Promise<{ id: string; hubspot_id: number; name?: string; invite_code?: string }> {
  const data = await invoke('import_company', { hubspot_id: hubspotId });
  return data.company;
}

export async function deleteCompany(companyId: string): Promise<void> {
  await invoke('delete_company', { company_id: companyId });
}

export async function previewContact(hubspotContactId: number): Promise<{ email: string | null; fname: string | null; lname: string | null }> {
  return await invoke('preview_contact', { hubspot_contact_id: hubspotContactId });
}

export async function importUser(payload: {
  hubspot_contact_id: number;
  password: string;
  company_id?: string | null;
}): Promise<{ id: string; email: string }> {
  const data = await invoke('import_user', payload);
  return data.user;
}

export async function updateProject(
  projectId: string,
  fields: { hubspot_id?: number | null; dealstage?: string },
): Promise<void> {
  await invoke('update_project', { project_id: projectId, fields });
}

export type BulkImportRow = {
  company_hubspot_id: number;
  contact_ids: number[];
};

export type BulkPreviewCompanyResult = {
  company_hubspot_id: number;
  company_name: string | null;
  company_found: boolean;
  users: Array<{
    contact_id: number;
    email: string | null;
    contact_found: boolean;
  }>;
};

export async function bulkPreview(rows: BulkImportRow[]): Promise<BulkPreviewCompanyResult[]> {
  const data = await invoke('bulk_preview', { rows });
  return data.results;
}

export type BulkImportCompanyResult = {
  company_hubspot_id: number;
  company_name: string | null;
  company_status: 'imported' | 'already_exists' | 'error';
  company_error?: string;
  users: Array<{
    contact_id: number;
    email: string | null;
    status: 'imported' | 'already_exists' | 'error';
    error?: string;
  }>;
};

export async function bulkImport(rows: BulkImportRow[]): Promise<BulkImportCompanyResult[]> {
  const data = await invoke('bulk_import', { rows });
  return data.results;
}
