import type { Locator, Page } from '@playwright/test';
import { hasAutomatedContentPrefix } from '../../config/automation';
import type { RequiredEntityReferenceConfig } from '../../config/content-types';

export async function verifyEntityReferenceFixture(
  page: Page,
  fixture: RequiredEntityReferenceConfig,
): Promise<void> {
  if (!hasAutomatedContentPrefix(fixture.expectedLabel)) {
    throw new Error(`${fixture.label} fixture label is not automation-owned.`);
  }
  const response = await page.goto(fixture.fixtureEditPath, {
    waitUntil: 'domcontentloaded',
  });
  if (!response || response.status() >= 400) {
    throw new Error(
      `${fixture.label} fixture ${fixture.expectedId} failed to load with HTTP ${response?.status() ?? 'unknown'}.`,
    );
  }
  const title = page.locator(fixture.fixtureTitleSelector);
  if ((await title.count()) !== 1 || (await title.inputValue()) !== fixture.expectedLabel) {
    throw new Error(
      `${fixture.label} fixture ${fixture.expectedId} ownership could not be proven exactly.`,
    );
  }
}

export async function selectEntityReferenceFixture(
  page: Page,
  form: Locator,
  fixture: RequiredEntityReferenceConfig,
): Promise<void> {
  const input = form.locator(fixture.selector);
  if ((await input.count()) !== 1) {
    throw new Error(`${fixture.label} autocomplete was not found uniquely.`);
  }
  await input.fill(fixture.expectedLabel);
  const menu = page.locator('.ui-autocomplete:visible').last();
  await menu.waitFor({ state: 'visible' });
  const exactOptions = menu
    .locator('[role="option"], .ui-menu-item')
    .filter({ hasText: fixture.expectedLabel });
  const exactIndexes: number[] = [];
  for (let index = 0; index < (await exactOptions.count()); index += 1) {
    if ((await exactOptions.nth(index).innerText()).trim() === fixture.expectedLabel) {
      exactIndexes.push(index);
    }
  }
  if (exactIndexes.length !== 1) {
    throw new Error(
      `${fixture.label} autocomplete returned ${exactIndexes.length} exact owned matches.`,
    );
  }
  await exactOptions.nth(exactIndexes[0]).click();
  await assertEntityReferenceFixture(form, fixture);
}

export async function assertEntityReferenceFixture(
  form: Locator,
  fixture: RequiredEntityReferenceConfig,
): Promise<void> {
  const input = form.locator(fixture.selector);
  if ((await input.count()) !== 1) {
    throw new Error(`${fixture.label} reference was not found uniquely.`);
  }
  const value = await input.inputValue();
  const match = value.match(/^(.*) \((\d+)\)$/);
  if (
    !match ||
    match[1] !== fixture.expectedLabel ||
    match[2] !== fixture.expectedId
  ) {
    throw new Error(
      `${fixture.label} reference did not resolve to exact entity ${fixture.expectedId}.`,
    );
  }
}
