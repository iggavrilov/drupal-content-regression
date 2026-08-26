import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { ParagraphM3Runner } from '../src/content/paragraphs/paragraph-m3-runner';

test('Milestone 3 Blockquote completes one Draft create/update lifecycle', async ({ page }) => {
  test.setTimeout(300_000);
  expect(assertExplicitNonProductionEnvironment()).toBe('develop');
  await loginToDrupal(page, { username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'), password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD') });
  const result = await new ParagraphM3Runner().run(page);
  expect(result.host.nodeCreations).toBe(1);
  expect(result.host.saves).toBe(2);
  expect(result.host.moderation).toMatch(/draft|unpublished/i);
  expect(result.component.machineName).toBe('blockquote');
  expect(result.component.finalPersistence).toBe('passed');
  expect(result.component.optionalFieldsUntouched).toBe('passed');
  expect(result.featuredBanner.status).toBe('blocked');
  expect(result.serverErrors).toBe(0);
  expect(result.fatalPageDetected).toBe(false);
});
