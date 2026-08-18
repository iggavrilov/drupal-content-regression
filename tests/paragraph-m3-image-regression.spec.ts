import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { ParagraphM3ImageRunner } from '../src/content/paragraphs/paragraph-m3-image-runner';

test('Milestone 3 Blockquote optional image completes one Draft create/update lifecycle', async ({ page }) => {
  test.setTimeout(300_000);
  expect(['develop', 'staging']).toContain(assertExplicitNonProductionEnvironment());
  await loginToDrupal(page, { username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'), password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD') });
  const result = await new ParagraphM3ImageRunner().run(page);
  expect(result.host.nodeCreations).toBe(1);
  expect(result.host.saves).toBe(2);
  expect(result.host.moderation).toMatch(/draft|unpublished/i);
  expect(result.component.fixtureResolution).toBe('exact unique match');
  expect(result.component.initialPersistedAssociation).toBe('passed');
  expect(result.component.finalPersistedAssociation).toBe('passed');
  expect(result.mediaSelections).toBe(1);
  expect(result.serverErrors).toBe(0);
  expect(result.fatalPageDetected).toBe(false);
});
