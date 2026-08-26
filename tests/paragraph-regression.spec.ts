import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { ParagraphRegressionRunner } from '../src/content/paragraphs/paragraph-runner';

test('four low-complexity Paragraphs can be created and updated on one owned Draft node', async ({ page }) => {
  test.setTimeout(300_000);
  expect(assertExplicitNonProductionEnvironment()).toBe('develop');
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const result = await new ParagraphRegressionRunner().run(page);
  expect(result.host.createdParagraphCount).toBe(4);
  expect(result.host.saves).toBe(2);
  expect(result.host.moderationState).toMatch(/draft|unpublished/i);
  expect(result.components).toHaveLength(4);
  expect(result.components.every((component) => component.initialPersistenceResult === 'passed')).toBe(true);
  expect(result.components.every((component) => component.finalPersistenceResult === 'passed')).toBe(true);
  expect(result.serverErrors).toBe(0);
  expect(result.fatalPageDetected).toBe(false);
});
