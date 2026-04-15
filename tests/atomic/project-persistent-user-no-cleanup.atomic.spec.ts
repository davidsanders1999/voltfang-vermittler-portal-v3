import { expect, test } from '@playwright/test';
import type { CompanySeed, ProjectSeed, UserSeed } from '../flows/scenario';
import {
  continueToStep2,
  createProject,
  fillCompanyData,
  fillPersonalData,
  gotoLoginFromSuccess,
  gotoRegister,
  login,
  openProjects,
  setupErrorLogging,
  submitRegistrationAndExpectSuccess,
} from '../flows/ui-actions';
import {
  confirmUserEmail,
  getProjectsWithHubSpotMappings,
  getUserByEmail,
  getUserCompanyId,
  unlockUser,
} from '../utils/supabase-admin';

const PERSISTENT_USER: UserSeed = {
  email: 'david.sanders@online.de',
  password: '123456789',
  salutation: 'Herr',
  fname: 'Persistent',
  lname: 'Owner',
  rolle_im_unternehmen: 'Geschaeftsfuehrer',
  phone: '+49 123 456789',
};

const PERSISTENT_COMPANY: CompanySeed = {
  name: 'E2E Persistent Company',
  branche_partner: 'Energieberater',
  street: 'Teststrasse 42',
  zip: '12345',
  city: 'Berlin',
  bundesland: 'Berlin',
  country: 'Deutschland',
  website: 'https://persistent-company.example',
};

function createPersistentProjectSeed(timestamp: number): ProjectSeed {
  return {
    name: `E2E Persistent Projekt ${timestamp}`,
    description: `E2E Zusatzinfo Persistent ${timestamp}: Bitte Zufahrt und Kranfenster vorab abstimmen.`,
    estimated_order_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    estimated_capacity: '500 - 1000 kWh',
    location_street: 'Projektstrasse 1',
    location_zip: '10115',
    location_city: 'Berlin',
    location_state: 'Berlin',
    unternehmen_name: 'Persistent Endkunde GmbH',
    unternehmen_website: 'https://persistent-endkunde.example',
    unternehmen_street: 'Endkundenweg 5',
    unternehmen_zip: '10117',
    unternehmen_city: 'Berlin',
    unternehmen_state: 'Berlin',
    kontakt_salutation: 'Herr',
    kontakt_fname: 'Peter',
    kontakt_lname: 'Persistent',
    kontakt_rolle_im_unternehmen: 'Einkaufsleiter',
    kontakt_email: 'peter.persistent@endkunde.de',
    kontakt_phone: '+49 30 12345678',
  };
}

test.describe('@atomic-project-persistent-user Ein Nutzer, viele Projekte (ohne Cleanup)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    setupErrorLogging(page, testInfo.title);
  });

  test('@atomic-project-persistent-user erstellt pro Lauf genau ein neues Projekt beim selben Nutzer', async ({ page }) => {
    const timestamp = Date.now();
    const project = createPersistentProjectSeed(timestamp);

    const existingUser = await getUserByEmail(PERSISTENT_USER.email);
    if (!existingUser) {
      await gotoRegister(page);
      await fillPersonalData(page, PERSISTENT_USER);
      await continueToStep2(page);
      await fillCompanyData(page, PERSISTENT_COMPANY);
      await submitRegistrationAndExpectSuccess(page, 'Registrieren');
      await expect(page.locator(`text=${PERSISTENT_USER.email}`)).toBeVisible();
      await gotoLoginFromSuccess(page);
    }

    expect(await confirmUserEmail(PERSISTENT_USER.email)).toBe(true);
    expect(await unlockUser(PERSISTENT_USER.email)).toBe(true);

    await login(page, PERSISTENT_USER.email, PERSISTENT_USER.password);
    await openProjects(page);
    await createProject(page, project);
    await expect(page.locator(`text=${project.name}`)).toBeVisible({ timeout: 15000 });

    const companyId = await getUserCompanyId(PERSISTENT_USER.email);
    expect(companyId).toBeTruthy();

    const projects = await getProjectsWithHubSpotMappings(companyId!);
    const created = projects.find((item) => item.name === project.name);
    expect(created).toBeTruthy();
    expect(created?.hubspot_id).toBeTruthy();
    expect(created?.hubspot_project_contact_id).toBeTruthy();
    expect(created?.hubspot_project_company_id).toBeTruthy();
  });
});
