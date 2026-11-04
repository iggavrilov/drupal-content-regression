import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { applySelectedDrupalTarget, resolveDrupalTarget, resolveEffectiveCredentials } from '../src/config/environments';

const configPath = path.resolve(process.cwd(), 'config/environments.yml');

for (const [target, tier, baseUrl, id, profile] of [
  ['leidos', 'development', 'https://devv.leidos.com', '17636', 'default'],
  ['leidos', 'stage', 'https://stage.leidos.com', '17636', 'default'],
  ['benefits', 'development', 'https://benefits-dev.leidos.com', '15686', 'default'],
  ['benefits', 'stage', 'https://benefits-stage.leidos.com', '15686', 'default'],
  ['qtcm', 'development', 'https://dev.qtcm.com', '21', 'default'],
  ['cms', 'development', 'https://dev-cms.leidos.com', null, 'cms'],
] as const) {
  test(`${target} + ${tier} resolves its exact approved mapping`, () => {
    const selected = resolveDrupalTarget(target, configPath, tier);
    expect(selected).toMatchObject({ target, tier, baseUrl, credentialsProfile: profile });
    expect(selected.workflowAssignee?.id ?? null).toBe(id);
  });
}

for (const target of ['qtcm', 'cms'] as const) test(`${target} + stage is unsupported`, () => {
  expect(() => resolveDrupalTarget(target, configPath, 'stage')).toThrow(`Unsupported target+tier combination: ${target} + stage`);
});

test('legacy devv alias resolves only to Leidos development', () => {
  expect(resolveDrupalTarget('devv', configPath, 'development')).toMatchObject({ target: 'devv', tier: 'development', baseUrl: 'https://devv.leidos.com' });
  expect(() => resolveDrupalTarget('devv', configPath, 'stage')).toThrow('supports only');
});

test('invalid target is rejected', () => expect(() => resolveDrupalTarget('unknown', configPath, 'development')).toThrow('Unknown DRUPAL_TARGET'));
test('invalid tier is rejected', () => expect(() => resolveDrupalTarget('leidos', configPath, 'dev')).toThrow('Invalid DRUPAL_TIER'));

test('selected YAML values override stale site-specific environment values', () => {
  const original = { target: process.env.DRUPAL_TARGET, tier: process.env.DRUPAL_TIER, base: process.env.DRUPAL_BASE_URL, id: process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID };
  try {
    process.env.DRUPAL_TARGET = 'leidos'; process.env.DRUPAL_TIER = 'stage';
    process.env.DRUPAL_BASE_URL = 'https://benefits-dev.leidos.com'; process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID = '15686';
    expect(applySelectedDrupalTarget()).toMatchObject({ baseUrl: 'https://stage.leidos.com', tier: 'stage' });
    expect(process.env.DRUPAL_BASE_URL).toBe('https://stage.leidos.com'); expect(process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID).toBe('17636');
  } finally {
    for (const [key, value] of Object.entries({ DRUPAL_TARGET: original.target, DRUPAL_TIER: original.tier, DRUPAL_BASE_URL: original.base, DRUPAL_WORKFLOW_ASSIGNEE_ID: original.id })) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

function withYaml(contents: string, assertion: (fixturePath: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drupal-env-config-')); const fixturePath = path.join(directory, 'environments.yml');
  try { fs.writeFileSync(fixturePath, contents, 'utf8'); assertion(fixturePath); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

const leidosFixture = (url: string, extra = '') => `default_environment: leidos\ndefault_tier: development\nenvironments:\n  leidos:\n    name: Leidos\n    credentials_profile: default\n    workflow_assignee: null\n    urls:\n      development: "${url}"\n${extra}`;
test('unapproved YAML origin is rejected', () => withYaml(leidosFixture('https://example.com'), (fixture) => expect(() => resolveDrupalTarget('leidos', fixture, 'development')).toThrow('not an exact approved origin')));
test('malformed YAML is rejected', () => withYaml('environments: [unterminated', (fixture) => expect(() => resolveDrupalTarget('leidos', fixture, 'development')).toThrow('YAML is invalid')));
test('missing YAML is rejected', () => expect(() => resolveDrupalTarget('leidos', path.join(os.tmpdir(), 'missing-environments.yml'), 'development')).toThrow('file is missing'));
test('invalid workflow assignee is rejected', () => withYaml('environments:\n  leidos:\n    name: Leidos\n    credentials_profile: default\n    workflow_assignee:\n      username: igor.gavrilov\n      id: invalid\n    urls:\n      development: https://devv.leidos.com\n', (fixture) => expect(() => resolveDrupalTarget('leidos', fixture, 'development')).toThrow('positive numeric ID')));

const fakeDefaultCredentials = { DRUPAL_USERNAME: 'fake-user', DRUPAL_PASSWORD: 'fake-password', BASIC_AUTH_USERNAME: 'fake-basic-user', BASIC_AUTH_PASSWORD: 'fake-basic-password' };
const fakeCmsCredentials = { CMS_DRUPAL_USERNAME: 'fake-cms-user', CMS_DRUPAL_PASSWORD: 'fake-cms-password', CMS_BASIC_AUTH_USERNAME: 'fake-cms-basic-user', CMS_BASIC_AUTH_PASSWORD: 'fake-cms-basic-password' };
for (const [target, tier] of [['leidos', 'development'], ['leidos', 'stage'], ['benefits', 'development'], ['benefits', 'stage'], ['qtcm', 'development']] as const) test(`${target} ${tier} selects default credentials`, () => expect(resolveEffectiveCredentials(resolveDrupalTarget(target, configPath, tier), fakeDefaultCredentials).drupalUsername).toBe(fakeDefaultCredentials.DRUPAL_USERNAME));
test('cms selects CMS credentials', () => expect(resolveEffectiveCredentials(resolveDrupalTarget('cms', configPath, 'development'), fakeCmsCredentials).drupalUsername).toBe(fakeCmsCredentials.CMS_DRUPAL_USERNAME));
test('missing default credential is rejected', () => expect(() => resolveEffectiveCredentials(resolveDrupalTarget('leidos', configPath, 'stage'), { ...fakeDefaultCredentials, DRUPAL_PASSWORD: '' })).toThrow('DRUPAL_PASSWORD'));
test('CMS never falls back to default credentials', () => expect(() => resolveEffectiveCredentials(resolveDrupalTarget('cms', configPath, 'development'), fakeDefaultCredentials)).toThrow('CMS_DRUPAL_USERNAME'));
