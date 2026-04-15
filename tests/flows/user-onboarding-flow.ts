import { expect, Page } from '@playwright/test';
import { cleanupTestData, confirmUserEmail, countUsersInCompany, getCompanyInviteCode, getUserByEmail, getUserCompanyId, unlockUser } from '../utils/supabase-admin';
import type { E2EScenario } from './scenario';
import {
  continueToStep2,
  enterInviteCode,
  fillCompanyData,
  fillPersonalData,
  gotoLoginFromSuccess,
  gotoRegister,
  submitRegistrationAndExpectSuccess,
} from './ui-actions';

export interface UserOnboardingResult {
  inviteCode: string;
  companyId: string;
}

export async function runUserOnboardingFlow(page: Page, scenario: E2EScenario): Promise<UserOnboardingResult> {
  // User 1: registriert neues Unternehmen
  await gotoRegister(page);
  await fillPersonalData(page, scenario.users[0]);
  await continueToStep2(page);
  await fillCompanyData(page, scenario.company);
  await submitRegistrationAndExpectSuccess(page, 'Registrieren');
  await expect(page.locator(`text=${scenario.users[0].email}`)).toBeVisible();

  const user1 = await getUserByEmail(scenario.users[0].email);
  expect(user1).not.toBeNull();

  const ownerCompanyId = await getUserCompanyId(scenario.users[0].email);
  expect(ownerCompanyId).toBeTruthy();
  const inviteCode = await getCompanyInviteCode(ownerCompanyId!);
  expect(inviteCode).toBeTruthy();
  expect(inviteCode?.length).toBe(16);

  await gotoLoginFromSuccess(page);

  // User 2: tritt per URL-Einladung bei
  await page.goto(`/?invite=${inviteCode}`);
  await expect(page.locator('h1:has-text("Partner werden")')).toBeVisible();
  await fillPersonalData(page, scenario.users[1]);
  await continueToStep2(page);
  await expect(page.locator('text=Einladung gültig')).toBeVisible({ timeout: 10000 });
  await submitRegistrationAndExpectSuccess(page, 'Team beitreten');
  await expect(page.locator(`text=${scenario.users[1].email}`)).toBeVisible();
  await gotoLoginFromSuccess(page);

  // User 3: tritt per manuell eingegebenem Code bei
  await gotoRegister(page);
  await fillPersonalData(page, scenario.users[2]);
  await continueToStep2(page);
  await enterInviteCode(page, inviteCode!);
  await submitRegistrationAndExpectSuccess(page, 'Team beitreten');
  await expect(page.locator(`text=${scenario.users[2].email}`)).toBeVisible();

  const companyId1 = await getUserCompanyId(scenario.users[0].email);
  const companyId2 = await getUserCompanyId(scenario.users[1].email);
  const companyId3 = await getUserCompanyId(scenario.users[2].email);
  expect(companyId1).toBeTruthy();
  expect(companyId2).toBe(companyId1);
  expect(companyId3).toBe(companyId1);

  const memberCount = await countUsersInCompany(companyId1!);
  expect(memberCount).toBe(3);

  // Fuer Folge-Tests alle Nutzer auf "einloggen moeglich" bringen.
  for (const user of scenario.users) {
    expect(await confirmUserEmail(user.email)).toBe(true);
    expect(await unlockUser(user.email)).toBe(true);
  }

  return {
    inviteCode: inviteCode!,
    companyId: companyId1!,
  };
}

export async function cleanupScenario(scenario: E2EScenario): Promise<void> {
  await cleanupTestData(scenario.emailPrefix);
}
