import { expect, test } from '@playwright/test';
import { getEnvironmentConfig } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import { ContentTypeRunner } from '../src/content/content-type-runner';

const originalEnvironment = process.env.DRUPAL_ENVIRONMENT;
const originalBaseUrl = process.env.DRUPAL_BASE_URL;

test.afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.DRUPAL_ENVIRONMENT;
  else process.env.DRUPAL_ENVIRONMENT = originalEnvironment;
  if (originalBaseUrl === undefined) delete process.env.DRUPAL_BASE_URL;
  else process.env.DRUPAL_BASE_URL = originalBaseUrl;
});

test('DEVV is the exact writable Drupal target and resolves canonically', () => {
  process.env.DRUPAL_ENVIRONMENT = 'develop';
  process.env.DRUPAL_BASE_URL = 'https://devv.leidos.com/';
  expect(assertExplicitNonProductionEnvironment()).toBe('develop');
  expect(getEnvironmentConfig().baseUrl).toBe('https://devv.leidos.com');
});

for (const [label, environment, baseUrl] of [
  ['production environment', 'production', 'https://devv.leidos.com'],
  ['staging environment', 'staging', 'https://devv.leidos.com'],
  ['unexpected host', 'develop', 'https://example.test'],
  ['lookalike subdomain', 'develop', 'https://devv.leidos.com.example.test'],
  ['insecure protocol', 'develop', 'http://devv.leidos.com'],
  ['alternate port', 'develop', 'https://devv.leidos.com:8443'],
  ['embedded credentials', 'develop', 'https://user:password@devv.leidos.com'],
  ['path-prefixed target', 'develop', 'https://devv.leidos.com/drupal'],
  ['query-bearing target', 'develop', 'https://devv.leidos.com/?preview=1'],
  ['fragment-bearing target', 'develop', 'https://devv.leidos.com/#preview'],
] as const) {
  test(`write safety rejects ${label}`, () => {
    process.env.DRUPAL_ENVIRONMENT = environment;
    process.env.DRUPAL_BASE_URL = baseUrl;
    expect(() => assertExplicitNonProductionEnvironment()).toThrow();
  });
}

test('generic content creation invokes the DEVV write guard before using its context', async () => {
  process.env.DRUPAL_ENVIRONMENT = 'staging';
  process.env.DRUPAL_BASE_URL = 'https://devv.leidos.com';
  await expect(new ContentTypeRunner().run(undefined as never)).rejects.toThrow(
    'DRUPAL_ENVIRONMENT=develop',
  );
});
