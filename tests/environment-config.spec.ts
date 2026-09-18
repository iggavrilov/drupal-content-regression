import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { applySelectedDrupalTarget, resolveDrupalTarget, resolveEffectiveCredentials } from '../src/config/environments';

const configPath = path.resolve(process.cwd(), 'config/environments.yml');

for (const [target, baseUrl, id] of [
  ['devv', 'https://devv.leidos.com', '17636'],
  ['benefits', 'https://benefits-dev.leidos.com', '15686'],
  ['qtcm', 'https://dev.qtcm.com', '21'],
] as const) {
  test(`${target} resolves its exact approved mapping`, () => {
    const selected = resolveDrupalTarget(target, configPath);
    expect(selected.baseUrl).toBe(baseUrl);
    expect(selected.workflowAssignee).toEqual({ username: 'igor.gavrilov', id });
    expect(selected.credentialsProfile).toBe('default');
  });
}

test('cms resolves with a null workflow assignee', () => {
  const selected = resolveDrupalTarget('cms', configPath);
  expect(selected.baseUrl).toBe('https://dev-cms.leidos.com');
  expect(selected.workflowAssignee).toBeNull();
  expect(selected.credentialsProfile).toBe('cms');
});

test('unknown target is rejected', () => {
  expect(() => resolveDrupalTarget('unknown', configPath)).toThrow('Unknown DRUPAL_TARGET');
});

test('missing target is rejected', () => {
  const original = process.env.DRUPAL_TARGET;
  try {
    delete process.env.DRUPAL_TARGET;
    expect(() => resolveDrupalTarget()).toThrow('DRUPAL_TARGET is required');
  } finally {
    if (original === undefined) delete process.env.DRUPAL_TARGET; else process.env.DRUPAL_TARGET = original;
  }
});

test('selected YAML values override stale site-specific environment values', () => {
  const original = { target: process.env.DRUPAL_TARGET, base: process.env.DRUPAL_BASE_URL, id: process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID };
  try {
    process.env.DRUPAL_TARGET = 'qtcm';
    process.env.DRUPAL_BASE_URL = 'https://benefits-dev.leidos.com';
    process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID = '15686';
    const selected = applySelectedDrupalTarget();
    expect(selected.baseUrl).toBe('https://dev.qtcm.com');
    expect(process.env.DRUPAL_BASE_URL).toBe('https://dev.qtcm.com');
    expect(process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID).toBe('21');
  } finally {
    if (original.target === undefined) delete process.env.DRUPAL_TARGET; else process.env.DRUPAL_TARGET = original.target;
    if (original.base === undefined) delete process.env.DRUPAL_BASE_URL; else process.env.DRUPAL_BASE_URL = original.base;
    if (original.id === undefined) delete process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID; else process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID = original.id;
  }
});

function withYaml(contents: string, assertion: (fixturePath: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drupal-env-config-'));
  const fixturePath = path.join(directory, 'environments.yml');
  try { fs.writeFileSync(fixturePath, contents, 'utf8'); assertion(fixturePath); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('unapproved YAML origin is rejected', () => {
  withYaml('environments:\n  devv:\n    name: Evil\n    base_url: https://example.com\n    workflow_assignee: null\n', (fixturePath) => {
    expect(() => resolveDrupalTarget('devv', fixturePath)).toThrow('not an exact approved origin');
  });
});

test('missing base_url is rejected', () => {
  withYaml('environments:\n  devv:\n    name: Missing URL\n    workflow_assignee: null\n', (fixturePath) => {
    expect(() => resolveDrupalTarget('devv', fixturePath)).toThrow('must define base_url');
  });
});

test('invalid workflow assignee configuration is rejected', () => {
  withYaml('environments:\n  devv:\n    name: DEVV\n    base_url: https://devv.leidos.com\n    credentials_profile: default\n    workflow_assignee:\n      username: igor.gavrilov\n      id: invalid\n', (fixturePath) => {
    expect(() => resolveDrupalTarget('devv', fixturePath)).toThrow('positive numeric ID');
  });
});

test('malformed YAML is rejected', () => {
  withYaml('environments: [unterminated', (fixturePath) => {
    expect(() => resolveDrupalTarget('devv', fixturePath)).toThrow('YAML is invalid');
  });
});

test('missing YAML is rejected', () => {
  expect(() => resolveDrupalTarget('devv', path.join(os.tmpdir(), 'missing-environments.yml'))).toThrow('file is missing');
});

const fakeDefaultCredentials = {
  DRUPAL_USERNAME: 'fake-default-drupal-user', DRUPAL_PASSWORD: 'fake-default-drupal-password',
  BASIC_AUTH_USERNAME: 'fake-default-basic-user', BASIC_AUTH_PASSWORD: 'fake-default-basic-password',
};
const fakeCmsCredentials = {
  CMS_DRUPAL_USERNAME: 'fake-cms-drupal-user', CMS_DRUPAL_PASSWORD: 'fake-cms-drupal-password',
  CMS_BASIC_AUTH_USERNAME: 'fake-cms-basic-user', CMS_BASIC_AUTH_PASSWORD: 'fake-cms-basic-password',
};

for (const target of ['devv', 'benefits', 'qtcm'] as const) {
  test(`${target} selects default credentials`, () => {
    expect(resolveEffectiveCredentials(resolveDrupalTarget(target, configPath), fakeDefaultCredentials)).toEqual({
      drupalUsername: fakeDefaultCredentials.DRUPAL_USERNAME,
      drupalPassword: fakeDefaultCredentials.DRUPAL_PASSWORD,
      basicAuthUsername: fakeDefaultCredentials.BASIC_AUTH_USERNAME,
      basicAuthPassword: fakeDefaultCredentials.BASIC_AUTH_PASSWORD,
    });
  });
}

test('cms selects CMS credentials', () => {
  expect(resolveEffectiveCredentials(resolveDrupalTarget('cms', configPath), fakeCmsCredentials)).toEqual({
    drupalUsername: fakeCmsCredentials.CMS_DRUPAL_USERNAME,
    drupalPassword: fakeCmsCredentials.CMS_DRUPAL_PASSWORD,
    basicAuthUsername: fakeCmsCredentials.CMS_BASIC_AUTH_USERNAME,
    basicAuthPassword: fakeCmsCredentials.CMS_BASIC_AUTH_PASSWORD,
  });
});

test('unknown credentials profile is rejected', () => {
  withYaml('environments:\n  devv:\n    name: DEVV\n    base_url: https://devv.leidos.com\n    credentials_profile: production\n    workflow_assignee: null\n', (fixturePath) => {
    expect(() => resolveDrupalTarget('devv', fixturePath)).toThrow('credentials_profile must be default or cms');
  });
});

test('missing credentials profile is rejected', () => {
  withYaml('environments:\n  devv:\n    name: DEVV\n    base_url: https://devv.leidos.com\n    workflow_assignee: null\n', (fixturePath) => {
    expect(() => resolveDrupalTarget('devv', fixturePath)).toThrow('credentials_profile must be default or cms');
  });
});

test('missing default credential is rejected', () => {
  const incomplete = { ...fakeDefaultCredentials, DRUPAL_PASSWORD: '' };
  expect(() => resolveEffectiveCredentials(resolveDrupalTarget('devv', configPath), incomplete)).toThrow('DRUPAL_PASSWORD');
});

test('missing CMS credential is rejected', () => {
  const incomplete = { ...fakeCmsCredentials, CMS_BASIC_AUTH_PASSWORD: '' };
  expect(() => resolveEffectiveCredentials(resolveDrupalTarget('cms', configPath), incomplete)).toThrow('CMS_BASIC_AUTH_PASSWORD');
});

test('CMS never falls back to default credentials', () => {
  expect(() => resolveEffectiveCredentials(resolveDrupalTarget('cms', configPath), fakeDefaultCredentials)).toThrow('CMS_DRUPAL_USERNAME');
});
