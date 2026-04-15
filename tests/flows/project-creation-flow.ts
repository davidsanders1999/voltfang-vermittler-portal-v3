import { expect, Page } from '@playwright/test';
import type { E2EScenario } from './scenario';
import { createProject, login, logout, openProjects } from './ui-actions';
import { openProjectDetail } from './navigation-actions';
import { getProjectsWithHubSpotMappings, getUserCompanyId } from '../utils/supabase-admin';

export async function runProjectCreationFlow(page: Page, scenario: E2EScenario): Promise<void> {
  for (let i = 0; i < scenario.users.length; i++) {
    const user = scenario.users[i];
    const project = scenario.projects[i];

    await login(page, user.email, user.password);
    await openProjects(page);
    await createProject(page, project);
    await logout(page);
  }

  // Team-weit sichtbar: User 1 muss alle 3 Projekte sehen.
  await login(page, scenario.users[0].email, scenario.users[0].password);
  await openProjects(page);

  for (const project of scenario.projects) {
    await expect(page.locator(`text=${project.name}`)).toBeVisible({ timeout: 10000 });

    // Neue Description-Logik: Zusatzinfos muessen in der Detailansicht sichtbar sein.
    await openProjectDetail(page, project.name);
    await expect(page.locator('text=Sonstige Projektinformationen')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${project.description}`)).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Zurück zur Übersicht")').click();
    await expect(page.locator('h1:has-text("Projektverwaltung")')).toBeVisible({ timeout: 10000 });
  }

  // Verifiziere, dass pro Projekt alle 3 HubSpot-Zuordnungen persistiert wurden.
  const companyId = await getUserCompanyId(scenario.users[0].email);
  if (!companyId) {
    throw new Error('Konnte company_id für Mapping-Validierung nicht bestimmen.');
  }

  const dbProjects = await getProjectsWithHubSpotMappings(companyId);
  expect(dbProjects.length).toBeGreaterThanOrEqual(scenario.projects.length);

  for (const seededProject of scenario.projects) {
    const mapped = dbProjects.find(p => p.name === seededProject.name);
    expect(mapped, `Projekt ${seededProject.name} fehlt in DB`).toBeTruthy();
    expect(mapped?.hubspot_id, `${seededProject.name}: fehlende Deal-ID`).toBeTruthy();
    expect(mapped?.hubspot_project_contact_id, `${seededProject.name}: fehlende Kontakt-ID`).toBeTruthy();
    expect(mapped?.hubspot_project_company_id, `${seededProject.name}: fehlende Unternehmens-ID`).toBeTruthy();
  }
}
