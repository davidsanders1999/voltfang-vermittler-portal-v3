import { expect, test } from '@playwright/test';
import { createScenario } from '../flows/scenario';
import {
  continueToStep2,
  fillCompanyData,
  fillPersonalData,
  gotoLoginFromSuccess,
  gotoRegister,
  login,
  setupErrorLogging,
  submitRegistrationAndExpectSuccess,
} from '../flows/ui-actions';
import {
  confirmUserEmail,
  getCompanyInviteCode,
  getUserByEmail,
  getUserCompanyId,
  unlockUser,
} from '../utils/supabase-admin';

const scenario = createScenario('e2eatomic.registration-no-cleanup');
const user = scenario.users[0];
const company = scenario.company;

test.describe('@atomic-registration-no-cleanup Registrierung ohne Cleanup', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    setupErrorLogging(page, testInfo.title);
  });

  test('@atomic-registration-no-cleanup registriert neuen Nutzer und schaltet ihn frei (ohne Cleanup)', async ({ page }) => {
    // 1) Registrierung eines neuen Nutzers inkl. neuem Unternehmen.
    await gotoRegister(page);
    await fillPersonalData(page, user);
    await continueToStep2(page);
    await fillCompanyData(page, company);
    await submitRegistrationAndExpectSuccess(page, 'Registrieren');
    await expect(page.locator(`text=${user.email}`)).toBeVisible();

    // 2) Mapping in Supabase pruefen.
    const userInDb = await getUserByEmail(user.email);
    expect(userInDb).not.toBeNull();

    const companyId = await getUserCompanyId(user.email);
    expect(companyId).toBeTruthy();

    const inviteCode = await getCompanyInviteCode(companyId!);
    expect(inviteCode).toBeTruthy();
    expect(inviteCode?.length).toBe(16);

    // 3) Fuer Login vorbereiten: E-Mail bestaetigen + HubSpot-Status auf Aktiv.
    expect(await confirmUserEmail(user.email)).toBe(true);
    expect(await unlockUser(user.email)).toBe(true);

    // 4) Login pruefen.
    await gotoLoginFromSuccess(page);
    await login(page, user.email, user.password);
    await expect(page.locator('h1:has-text("Dashboard Übersicht")')).toBeVisible({ timeout: 15000 });

    // Absichtlich kein Cleanup:
    // Der Nutzer bleibt in Supabase/HubSpot bestehen fuer manuelle Folgepruefungen.
  });
});
