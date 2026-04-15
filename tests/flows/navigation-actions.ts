import { expect, Page } from '@playwright/test';

/**
 * Navigiert zur Profilseite über die Sidebar
 */
export async function navigateToProfile(page: Page): Promise<void> {
  await page.locator('button:has-text("Profil")').click();
  await expect(page.locator('h3:has-text("Persönliche Informationen")')).toBeVisible({ timeout: 15000 });
}

/**
 * Navigiert zum Dashboard über die Sidebar
 */
export async function navigateToDashboard(page: Page): Promise<void> {
  await page.locator('button:has-text("Dashboard")').click();
  await expect(page.locator('h2:has-text("Willkommen zurück")')).toBeVisible({ timeout: 15000 });
}

/**
 * Öffnet die Detailansicht eines Projekts anhand des Projektnamens
 */
export async function openProjectDetail(page: Page, projectName: string): Promise<void> {
  await page.locator(`text=${projectName}`).first().click();
  await expect(page.locator('button:has-text("Zurück zur Übersicht")')).toBeVisible({ timeout: 10000 });
}

/**
 * Liest den Wert einer KPI-Karte anhand ihres Titels
 */
export async function expectKpiCardValue(page: Page, title: string): Promise<string> {
  const card = page.locator(`.bg-white:has-text("${title}")`).first();
  await expect(card).toBeVisible();
  return await card.locator('p.text-xl').innerText();
}

/**
 * Gibt Text in das Suchfeld der Projektübersicht ein
 */
export async function enterFilterText(page: Page, text: string): Promise<void> {
  const searchInput = page.locator('input[placeholder*="durchsuchen"]');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(text);
}

/**
 * Öffnet das Status-Filter-Dropdown in der Projektübersicht
 */
export async function openStatusFilter(page: Page): Promise<void> {
  await page.locator('button:has-text("Status")').click();
  await expect(page.locator('text=Technische Klärung')).toBeVisible({ timeout: 5000 });
}
