#!/usr/bin/env node
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const confirmed = args.has('--confirm');

const REQUIRED_ENVS = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'HUBSPOT_ACCESS_TOKEN'];
const missingEnvs = REQUIRED_ENVS.filter((key) => !process.env[key]);

if (missingEnvs.length > 0) {
  console.error(`Fehlende Umgebungsvariablen: ${missingEnvs.join(', ')}`);
  process.exit(1);
}

if (!dryRun) {
  if (process.env.ALLOW_DESTRUCTIVE_E2E_RESET !== 'true') {
    console.error('Blockiert: Setze ALLOW_DESTRUCTIVE_E2E_RESET=true für destruktiven Full-Reset.');
    process.exit(1);
  }
  if (!confirmed) {
    console.error('Blockiert: Starte destruktiven Lauf nur mit --confirm.');
    process.exit(1);
  }
}

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const HUBSPOT_ENDKUNDE_OBJECT_TYPE = process.env.HUBSPOT_ENDKUNDE_OBJECT_TYPE || '2-57928694';
const HUBSPOT_PARTNER_OBJECT_TYPE = process.env.HUBSPOT_PARTNER_OBJECT_TYPE || '2-57928699';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

const summary = {
  mode: dryRun ? 'dry-run' : 'execute',
  hubspot: {
    deals: { discovered: 0, deleted: 0, failed: 0 },
    endkunden: { discovered: 0, deleted: 0, failed: 0 },
    partners: { discovered: 0, deleted: 0, failed: 0 },
    contacts: { discovered: 0, deleted: 0, failed: 0 },
  },
  supabase: {
    project: { discovered: 0, deleted: 0 },
    user: { discovered: 0, deleted: 0 },
    usercompany: { discovered: 0, deleted: 0 },
    authUsers: { discovered: 0, deleted: 0, failed: 0 },
  },
};

function logStep(message) {
  console.log(`\n[reset] ${message}`);
}

async function hubspotRequest(pathname, init = {}) {
  return fetch(`${HUBSPOT_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function listHubSpotObjectIds(objectType) {
  const ids = [];
  let after;
  let pages = 0;

  while (pages < 500) {
    const query = new URLSearchParams({
      limit: '100',
      archived: 'false',
    });
    if (after) query.set('after', after);

    const response = await hubspotRequest(`/crm/v3/objects/${objectType}?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`HubSpot Listing fehlgeschlagen (${objectType}): ${await response.text()}`);
    }

    const payload = await response.json();
    const batchIds = (payload.results || []).map((entry) => entry.id).filter(Boolean);
    ids.push(...batchIds);

    const nextAfter = payload.paging?.next?.after;
    if (!nextAfter) break;
    after = nextAfter;
    pages += 1;
  }

  return ids;
}

async function deleteHubSpotObjectsByType(objectType, bucketKey) {
  const ids = await listHubSpotObjectIds(objectType);
  summary.hubspot[bucketKey].discovered = ids.length;
  if (dryRun) return;

  for (const id of ids) {
    const response = await hubspotRequest(`/crm/v3/objects/${objectType}/${id}`, { method: 'DELETE' });
    if (response.ok || response.status === 404) {
      summary.hubspot[bucketKey].deleted += 1;
    } else {
      summary.hubspot[bucketKey].failed += 1;
      console.error(`[hubspot:${objectType}] Fehler beim Löschen ${id}: ${await response.text()}`);
    }
  }
}

async function countTableRows(tableName) {
  const { count, error } = await supabaseAdmin
    .from(tableName)
    .select('*', { count: 'exact', head: true });
  if (error) {
    throw new Error(`Supabase Count fehlgeschlagen (${tableName}): ${error.message}`);
  }
  // count kann je nach Client-Version number oder string sein; immer als Zahl
  const n = typeof count === 'number' ? count : parseInt(String(count), 10);
  return Number.isFinite(n) ? n : 0;
}

async function deleteTableRows(tableName) {
  const discovered = await countTableRows(tableName);
  summary.supabase[tableName].discovered = discovered;
  if (dryRun || discovered === 0) return;

  const { error } = await supabaseAdmin
    .from(tableName)
    .delete()
    .not('id', 'is', null);
  if (error) {
    throw new Error(`Supabase Delete fehlgeschlagen (${tableName}): ${error.message}`);
  }
  summary.supabase[tableName].deleted = discovered;
}

async function listAllAuthUserIds() {
  const ids = [];
  let page = 1;

  while (page <= 100) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Auth-Listing fehlgeschlagen: ${error.message}`);
    }
    const users = data?.users || [];
    if (!users.length) break;
    ids.push(...users.map((user) => user.id));
    if (users.length < 200) break;
    page += 1;
  }

  return ids;
}

async function deleteAuthUsers() {
  const ids = await listAllAuthUserIds();
  summary.supabase.authUsers.discovered = ids.length;
  if (dryRun) return;

  for (const id of ids) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      summary.supabase.authUsers.failed += 1;
      console.error(`[auth] Fehler beim Löschen ${id}: ${error.message}`);
    } else {
      summary.supabase.authUsers.deleted += 1;
    }
  }
}

function printSummary() {
  logStep('Zusammenfassung');
  // HubSpot = API-Liste zum Start; Supabase = Tabellen-Count zum Zeitpunkt des Laufs (gleiche .env)
  const supabaseOrigin = new URL(process.env.VITE_SUPABASE_URL || '').origin;
  console.log(`[reset] HubSpot: API-Zählung. Supabase: Live-Count aus DB (${supabaseOrigin})`);
  console.table([
    {
      system: 'hubspot',
      object: 'deals',
      discovered: summary.hubspot.deals.discovered,
      deleted: summary.hubspot.deals.deleted,
      failed: summary.hubspot.deals.failed,
    },
    {
      system: 'hubspot',
      object: 'endkunden',
      discovered: summary.hubspot.endkunden.discovered,
      deleted: summary.hubspot.endkunden.deleted,
      failed: summary.hubspot.endkunden.failed,
    },
    {
      system: 'hubspot',
      object: 'partners',
      discovered: summary.hubspot.partners.discovered,
      deleted: summary.hubspot.partners.deleted,
      failed: summary.hubspot.partners.failed,
    },
    {
      system: 'hubspot',
      object: 'contacts',
      discovered: summary.hubspot.contacts.discovered,
      deleted: summary.hubspot.contacts.deleted,
      failed: summary.hubspot.contacts.failed,
    },
    {
      system: 'supabase',
      object: 'project',
      discovered: summary.supabase.project.discovered,
      deleted: summary.supabase.project.deleted,
      failed: 0,
    },
    {
      system: 'supabase',
      object: 'user',
      discovered: summary.supabase.user.discovered,
      deleted: summary.supabase.user.deleted,
      failed: 0,
    },
    {
      system: 'supabase',
      object: 'usercompany',
      discovered: summary.supabase.usercompany.discovered,
      deleted: summary.supabase.usercompany.deleted,
      failed: 0,
    },
    {
      system: 'supabase',
      object: 'auth.users',
      discovered: summary.supabase.authUsers.discovered,
      deleted: summary.supabase.authUsers.deleted,
      failed: summary.supabase.authUsers.failed,
    },
  ]);
}

async function main() {
  logStep(`Starte Full-Reset (${summary.mode})`);

  // Reihenfolge HubSpot: erst Deals, dann abhängige Objekte, Kontakte zuletzt.
  await deleteHubSpotObjectsByType('deals', 'deals');
  await deleteHubSpotObjectsByType(HUBSPOT_ENDKUNDE_OBJECT_TYPE, 'endkunden');
  await deleteHubSpotObjectsByType(HUBSPOT_PARTNER_OBJECT_TYPE, 'partners');
  await deleteHubSpotObjectsByType('contacts', 'contacts');

  // Supabase danach: Mapping-Tabellen und Auth.
  await deleteTableRows('project');
  await deleteTableRows('user');
  await deleteTableRows('usercompany');
  await deleteAuthUsers();

  printSummary();
  if (dryRun) {
    console.log('\nDry-Run abgeschlossen: Es wurden keine Datensätze gelöscht.');
  } else {
    console.log('\nFull-Reset erfolgreich abgeschlossen.');
  }
}

main().catch((error) => {
  console.error('\nFull-Reset fehlgeschlagen:', error instanceof Error ? error.message : error);
  process.exit(1);
});
