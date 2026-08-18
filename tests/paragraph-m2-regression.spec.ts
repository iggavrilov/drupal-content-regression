import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { ParagraphM2Runner } from '../src/content/paragraphs/paragraph-m2-runner';

test('Milestone 2 image-background Paragraph completes a Draft create/update lifecycle', async ({ page }) => {
  test.setTimeout(300_000);
  expect(['develop', 'staging']).toContain(assertExplicitNonProductionEnvironment());
  await loginToDrupal(page, { username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'), password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD') });
  const result = await new ParagraphM2Runner().run(page);
  expect(result.host.nodeCreations).toBe(1);
  expect(result.host.saves).toBe(2);
  expect(result.host.moderation).toMatch(/draft|unpublished/i);
  expect(result.components).toHaveLength(1);
  expect(result.components[0].mediaId).toBe('44706');
  expect(result.components[0].finalPersistence).toBe('passed');
  expect(result.serverErrors).toBe(0);
  expect(result.fatalPageDetected).toBe(false);
});
