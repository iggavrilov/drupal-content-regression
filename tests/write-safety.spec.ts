import { expect, test } from '@playwright/test';
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

for (const approvedOrigin of [
  'https://devv.leidos.com',
  'https://benefits-dev.leidos.com',
  'https://dev.qtcm.com',
  'https://dev-cms.leidos.com',
] as const) {
  test(`${approvedOrigin} is an exact writable Drupal target and resolves canonically`, () => {
    expect(assertExplicitNonProductionEnvironment('develop', `${approvedOrigin}/`)).toBe('develop');
  });
}

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
  ['Benefits DEV lookalike suffix', 'develop', 'https://benefits-dev.leidos.com.evil.example'],
  ['Benefits DEV lookalike subdomain', 'develop', 'https://foo.benefits-dev.leidos.com'],
  ['Benefits DEV insecure protocol', 'develop', 'http://benefits-dev.leidos.com'],
  ['Benefits DEV alternate port', 'develop', 'https://benefits-dev.leidos.com:8443'],
  ['Benefits DEV path-prefixed target', 'develop', 'https://benefits-dev.leidos.com/admin'],
  ['Benefits DEV query-bearing target', 'develop', 'https://benefits-dev.leidos.com/?test=1'],
  ['arbitrary Leidos host', 'develop', 'https://arbitrary.leidos.com'],
  ['arbitrary Acquia host', 'develop', 'https://arbitrary.prod.acquia-sites.com'],
  ['QTCM lookalike suffix', 'develop', 'https://dev.qtcm.com.evil.example'],
  ['QTCM lookalike subdomain', 'develop', 'https://foo.dev.qtcm.com'],
  ['QTCM insecure protocol', 'develop', 'http://dev.qtcm.com'],
  ['QTCM alternate port', 'develop', 'https://dev.qtcm.com:8443'],
  ['QTCM path-prefixed target', 'develop', 'https://dev.qtcm.com/admin'],
  ['QTCM query-bearing target', 'develop', 'https://dev.qtcm.com/?test=1'],
  ['QTCM fragment-bearing target', 'develop', 'https://dev.qtcm.com/#test'],
  ['QTCM apex host', 'develop', 'https://qtcm.com'],
  ['QTCM www host', 'develop', 'https://www.qtcm.com'],
  ['CMS lookalike suffix', 'develop', 'https://dev-cms.leidos.com.evil.example'],
  ['CMS lookalike subdomain', 'develop', 'https://foo.dev-cms.leidos.com'],
  ['CMS insecure protocol', 'develop', 'http://dev-cms.leidos.com'],
  ['CMS alternate port', 'develop', 'https://dev-cms.leidos.com:8443'],
  ['CMS embedded credentials', 'develop', 'https://user:password@dev-cms.leidos.com'],
  ['CMS path-prefixed target', 'develop', 'https://dev-cms.leidos.com/admin'],
  ['CMS query-bearing target', 'develop', 'https://dev-cms.leidos.com/?test=1'],
  ['CMS fragment-bearing target', 'develop', 'https://dev-cms.leidos.com/#test'],
  ['CMS lookalike hyphen host', 'develop', 'https://dev-cms-leidos.com'],
] as const) {
  test(`write safety rejects ${label}`, () => {
    expect(() => assertExplicitNonProductionEnvironment(environment, baseUrl)).toThrow();
  });
}

test('generic content creation invokes the approved-site write guard before using its context', async () => {
  process.env.DRUPAL_ENVIRONMENT = 'staging';
  process.env.DRUPAL_BASE_URL = 'https://devv.leidos.com';
  await expect(new ContentTypeRunner().run(undefined as never)).rejects.toThrow(
    'DRUPAL_ENVIRONMENT=develop',
  );
});
