import { test } from '@playwright/test';
import { runProjectCreationFlow } from '../flows/project-creation-flow';
import { createScenario } from '../flows/scenario';
import { runUserOnboardingFlow } from '../flows/user-onboarding-flow';
import { setupErrorLogging } from '../flows/ui-actions';

const scenario = createScenario('e2eatomic.3users-3projects');

test.describe('@atomic-3users-3projects Drei Nutzer + drei Projekte (End-to-End)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    setupErrorLogging(page, testInfo.title);
  });

  test('@atomic-3users-3projects registriert 3 Nutzer und legt für jeden ein Projekt an', async ({ page }) => {
    // User 1: normal
    // User 2: per Partner-Link
    // User 3: per Partner-Code
    await runUserOnboardingFlow(page, scenario);

    // Danach legt jeder Nutzer ein Projekt an (insgesamt 3 Projekte).
    await runProjectCreationFlow(page, scenario);
  });
});
