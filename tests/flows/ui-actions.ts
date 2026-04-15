import { expect, Page } from '@playwright/test';
import type { CompanySeed, ProjectSeed, UserSeed } from './scenario';

export const DELAY = 0;

export function setupErrorLogging(page: Page, testTitle: string): void {
  const prefix = `[${testTitle}]`;

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') {
      console.error(`${prefix} [console.error] ${msg.text()}`);
    } else if (type === 'warning') {
      console.warn(`${prefix} [console.warn] ${msg.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    console.error(`${prefix} [pageerror] ${error.stack || error.message}`);
  });

  page.on('requestfailed', (request) => {
    console.error(
      `${prefix} [requestfailed] ${request.method()} ${request.url()} -> ${request.failure()?.errorText || 'Unbekannter Fehler'}`
    );
  });

  page.on('response', async (response) => {
    if (response.status() < 400) return;

    const url = response.url();
    const isLikelyApiCall =
      url.includes('supabase.co') ||
      url.includes('/auth/v1/') ||
      url.includes('/rest/v1/') ||
      url.includes('/rpc/') ||
      url.includes('/functions/v1/');

    if (!isLikelyApiCall) return;

    const contentType = (response.headers()['content-type'] || '').toLowerCase();
    const isTextLike =
      contentType.includes('application/json') ||
      contentType.includes('text/') ||
      contentType.includes('application/problem+json');

    let responseBody = '';
    if (isTextLike) {
      try {
        responseBody = await response.text();
      } catch {
        responseBody = '<Response-Body konnte nicht gelesen werden>';
      }
    }

    console.error(
      `${prefix} [http ${response.status()}] ${response.request().method()} ${url}${responseBody ? `\n${responseBody.slice(0, 2000)}` : ''}`
    );
  });
}

export async function gotoRegister(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('h1:has-text("Willkommen zurück")')).toBeVisible();
  await page.locator('button:has-text("Jetzt Partner werden")').click();
  await expect(page.locator('h1:has-text("Partner werden")')).toBeVisible();
}

export async function fillPersonalData(page: Page, user: UserSeed): Promise<void> {
  await expect(page.locator('h2:has-text("Persönliche Daten")')).toBeVisible();
  await page.waitForTimeout(DELAY);
  await page.locator('select[name="salutation"]').selectOption(user.salutation);
  await page.locator('input[name="fname"]').fill(user.fname);
  await page.locator('input[name="lname"]').fill(user.lname);
  await page.locator('input[name="rolle_im_unternehmen"]').fill(user.rolle_im_unternehmen);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('input[name="confirmPassword"]').fill(user.password);
  await page.locator('input[name="phone"]').fill(user.phone);
}

export async function continueToStep2(page: Page): Promise<void> {
  await page.locator('button:has-text("Weiter")').click();
}

export async function fillCompanyData(page: Page, company: CompanySeed): Promise<void> {
  await expect(page.locator('h2:has-text("Unternehmensdaten")')).toBeVisible();
  await page.locator('input[name="companyName"]').fill(company.name);
  await page.locator('select[name="branche_partner"]').selectOption({ value: company.branche_partner });
  await page.locator('input[name="website"]').fill(company.website);
  await page.locator('input[name="street"]').fill(company.street);
  await page.locator('input[name="zip"]').fill(company.zip);
  await page.locator('input[name="city"]').fill(company.city);
  await page.locator('select[name="bundesland"]').selectOption(company.bundesland);
}

export async function enterInviteCode(page: Page, inviteCode: string): Promise<void> {
  const inviteInput = page.locator('input[placeholder*="ABCD1234"]');
  await expect(inviteInput).toBeVisible();
  await inviteInput.fill(inviteCode);
  await page.getByRole('button', { name: 'Einladungscode prüfen' }).click();
  await expect(page.locator('text=Einladung gültig')).toBeVisible({ timeout: 10000 });
}

export async function submitRegistrationAndExpectSuccess(page: Page, buttonText: 'Registrieren' | 'Team beitreten'): Promise<void> {
  await page.locator(`button:has-text("${buttonText}")`).click();

  const successHeading = page.locator('h2:has-text("Registrierung erfolgreich")');
  const registrationErrorBox = page.locator('div.bg-red-50:has-text("Registrierung fehlgeschlagen")');

  await Promise.race([
    successHeading.waitFor({ state: 'visible', timeout: 15000 }),
    registrationErrorBox.waitFor({ state: 'visible', timeout: 15000 }).then(async () => {
      const uiError = (await registrationErrorBox.first().innerText()).trim();
      throw new Error(`Registrierung im UI fehlgeschlagen: ${uiError}`);
    }),
  ]);

  await expect(successHeading).toBeVisible({ timeout: 15000 });
}

export async function gotoLoginFromSuccess(page: Page): Promise<void> {
  await page.locator('button:has-text("Zum Login")').click();
  await expect(page.locator('h1:has-text("Willkommen zurück")')).toBeVisible();
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('h1:has-text("Willkommen zurück")')).toBeVisible();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button:has-text("Anmelden")').click();
  await expect(page.locator('h1:has-text("Dashboard Übersicht")')).toBeVisible({ timeout: 15000 });
}

export async function openProjects(page: Page): Promise<void> {
  await page.locator('button:has-text("Projekte")').first().click();
  await expect(page.locator('h1:has-text("Projektverwaltung")')).toBeVisible({ timeout: 10000 });
}

export async function createProject(page: Page, project: ProjectSeed): Promise<void> {
  await page.locator('button:has-text("Projekt anlegen")').click();
  await expect(page.locator('h2:has-text("Projektdetails")')).toBeVisible({ timeout: 5000 });

  await page.locator('input[name="name"]').fill(project.name);
  await page.locator('textarea[name="description"]').fill(project.description);
  await page.locator('input[name="estimated_order_date"]').fill(project.estimated_order_date);
  await page.locator('select[name="estimated_capacity"]').selectOption(project.estimated_capacity);
  await page.locator('input[name="location_street"]').fill(project.location_street);
  await page.locator('input[name="location_zip"]').fill(project.location_zip);
  await page.locator('input[name="location_city"]').fill(project.location_city);
  await page.locator('select[name="location_state"]').selectOption(project.location_state);
  await page.locator('button:has-text("Weiter")').click();

  await expect(page.locator('h2:has-text("Projektunternehmen")')).toBeVisible({ timeout: 5000 });
  await page.locator('input[name="unternehmen_name"]').fill(project.unternehmen_name);
  await page.locator('input[name="unternehmen_website"]').fill(project.unternehmen_website);
  await page.locator('input[name="unternehmen_street"]').fill(project.unternehmen_street);
  await page.locator('input[name="unternehmen_zip"]').fill(project.unternehmen_zip);
  await page.locator('input[name="unternehmen_city"]').fill(project.unternehmen_city);
  await page.locator('select[name="unternehmen_state"]').selectOption(project.unternehmen_state);
  await page.locator('select[name="kontakt_salutation"]').selectOption(project.kontakt_salutation);
  await page.locator('input[name="kontakt_fname"]').fill(project.kontakt_fname);
  await page.locator('input[name="kontakt_lname"]').fill(project.kontakt_lname);
  await page.locator('input[name="kontakt_rolle_im_unternehmen"]').fill(project.kontakt_rolle_im_unternehmen);
  await page.locator('input[name="kontakt_email"]').fill(project.kontakt_email);
  await page.locator('input[name="kontakt_phone"]').fill(project.kontakt_phone);
  await page.locator('button:has-text("Projekt erstellen")').click();

  await expect(page.locator(`text=${project.name}`)).toBeVisible({ timeout: 15000 });
}

export async function logout(page: Page): Promise<void> {
  await page.locator('button[aria-label="Benutzerprofil öffnen"]').click();
  await page.locator('button:has-text("Abmelden")').click();
  await expect(page.locator('h1:has-text("Willkommen zurück")')).toBeVisible();
}
