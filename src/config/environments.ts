import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export type DrupalEnvironmentName = 'develop' | 'staging' | 'production';
export type DrupalTarget = 'devv' | 'benefits' | 'qtcm' | 'cms';
export type CredentialsProfile = 'default' | 'cms';
export interface WorkflowAssigneeConfig { username: string; id: string }
export interface EffectiveCredentials { drupalUsername: string; drupalPassword: string; basicAuthUsername: string; basicAuthPassword: string }
export interface SelectedDrupalTarget { target: DrupalTarget; name: string; baseUrl: string; credentialsProfile: CredentialsProfile; workflowAssignee: WorkflowAssigneeConfig | null }
export interface EnvironmentConfig { name: DrupalEnvironmentName; baseUrl: string; target: DrupalTarget }

const APPROVED_TARGET_ORIGINS = new Set([
  'https://devv.leidos.com',
  'https://benefits-dev.leidos.com',
  'https://dev.qtcm.com',
  'https://dev-cms.leidos.com',
]);

interface RawEnvironmentFile {
  environments?: Record<string, { name?: unknown; base_url?: unknown; credentials_profile?: unknown; workflow_assignee?: unknown }>;
}

export function resolveDrupalTarget(targetValue = process.env.DRUPAL_TARGET, configPath = path.resolve(process.cwd(), 'config/environments.yml')): SelectedDrupalTarget {
  const target = targetValue?.trim();
  if (!target) throw new Error('DRUPAL_TARGET is required.');
  if (!fs.existsSync(configPath)) throw new Error('Environment configuration file is missing.');
  let parsed: RawEnvironmentFile;
  try {
    parsed = parse(fs.readFileSync(configPath, 'utf8')) as RawEnvironmentFile;
  } catch {
    throw new Error('Environment configuration YAML is invalid.');
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.environments || typeof parsed.environments !== 'object') {
    throw new Error('Environment configuration must define environments.');
  }
  const selected = parsed.environments[target];
  if (!selected || !['devv', 'benefits', 'qtcm', 'cms'].includes(target)) throw new Error(`Unknown DRUPAL_TARGET: ${target}`);
  if (typeof selected.name !== 'string' || !selected.name.trim()) throw new Error(`Environment ${target} must define a name.`);
  if (typeof selected.base_url !== 'string' || !selected.base_url.trim()) throw new Error(`Environment ${target} must define base_url.`);
  const baseUrl = selected.base_url.trim();
  let parsedUrl: URL;
  try { parsedUrl = new URL(baseUrl); } catch { throw new Error(`Environment ${target} base_url must be a valid absolute URL.`); }
  if (!APPROVED_TARGET_ORIGINS.has(baseUrl) || parsedUrl.origin !== baseUrl || parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') || parsedUrl.search || parsedUrl.hash) {
    throw new Error(`Environment ${target} base_url is not an exact approved origin.`);
  }
  const credentialsProfile = selected.credentials_profile;
  if (credentialsProfile !== 'default' && credentialsProfile !== 'cms') {
    throw new Error(`Environment ${target} credentials_profile must be default or cms.`);
  }
  let workflowAssignee: WorkflowAssigneeConfig | null = null;
  if (selected.workflow_assignee !== null) {
    const raw = selected.workflow_assignee;
    if (!raw || typeof raw !== 'object') throw new Error(`Environment ${target} workflow_assignee is invalid.`);
    const username = (raw as Record<string, unknown>).username;
    const id = (raw as Record<string, unknown>).id;
    if (typeof username !== 'string' || !username.trim() || !Number.isInteger(id) || Number(id) <= 0) throw new Error(`Environment ${target} workflow_assignee must define a username and positive numeric ID.`);
    workflowAssignee = { username: username.trim(), id: String(id) };
  }
  return { target: target as DrupalTarget, name: selected.name.trim(), baseUrl, credentialsProfile, workflowAssignee };
}

export function resolveEffectiveCredentials(
  selected = resolveDrupalTarget(),
  environment: Readonly<Record<string, string | undefined>> = process.env,
): EffectiveCredentials {
  const names = selected.credentialsProfile === 'cms'
    ? ['CMS_DRUPAL_USERNAME', 'CMS_DRUPAL_PASSWORD', 'CMS_BASIC_AUTH_USERNAME', 'CMS_BASIC_AUTH_PASSWORD'] as const
    : ['DRUPAL_USERNAME', 'DRUPAL_PASSWORD', 'BASIC_AUTH_USERNAME', 'BASIC_AUTH_PASSWORD'] as const;
  const values = names.map((name) => environment[name]?.trim());
  const missingIndex = values.findIndex((value) => !value);
  if (missingIndex >= 0) throw new Error(`Missing required ${selected.credentialsProfile} credential variable: ${names[missingIndex]}`);
  return { drupalUsername: values[0]!, drupalPassword: values[1]!, basicAuthUsername: values[2]!, basicAuthPassword: values[3]! };
}

export function getEffectiveCredentials(): EffectiveCredentials {
  return resolveEffectiveCredentials(applySelectedDrupalTarget());
}

export function applySelectedDrupalTarget(): SelectedDrupalTarget {
  const selected = resolveDrupalTarget();
  process.env.DRUPAL_BASE_URL = selected.baseUrl;
  if (selected.workflowAssignee) {
    process.env.DRUPAL_WORKFLOW_ASSIGNEE_SEARCH = selected.workflowAssignee.username;
    process.env.DRUPAL_WORKFLOW_ASSIGNEE_EXPECTED = selected.workflowAssignee.username;
    process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID = selected.workflowAssignee.id;
  } else {
    delete process.env.DRUPAL_WORKFLOW_ASSIGNEE_SEARCH;
    delete process.env.DRUPAL_WORKFLOW_ASSIGNEE_EXPECTED;
    delete process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID;
  }
  return selected;
}

export function getWorkflowAssigneeConfiguration(): WorkflowAssigneeConfig | null { return applySelectedDrupalTarget().workflowAssignee; }

export function getRequiredEnvironmentVariable(name: string): string {
  if (name === 'DRUPAL_BASE_URL' || name.startsWith('DRUPAL_WORKFLOW_ASSIGNEE_')) applySelectedDrupalTarget();
  if (name === 'DRUPAL_USERNAME' || name === 'DRUPAL_PASSWORD' || name === 'BASIC_AUTH_USERNAME' || name === 'BASIC_AUTH_PASSWORD') {
    const credentials = getEffectiveCredentials();
    return {
      DRUPAL_USERNAME: credentials.drupalUsername,
      DRUPAL_PASSWORD: credentials.drupalPassword,
      BASIC_AUTH_USERNAME: credentials.basicAuthUsername,
      BASIC_AUTH_PASSWORD: credentials.basicAuthPassword,
    }[name];
  }
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supportedEnvironments: DrupalEnvironmentName[] = ['develop', 'staging', 'production'];
export function getEnvironmentConfig(): EnvironmentConfig {
  const selected = applySelectedDrupalTarget();
  const configuredName = process.env.DRUPAL_ENVIRONMENT ?? 'develop';
  if (!supportedEnvironments.includes(configuredName as DrupalEnvironmentName)) throw new Error(`Unsupported DRUPAL_ENVIRONMENT: ${configuredName}`);
  return { name: configuredName as DrupalEnvironmentName, baseUrl: selected.baseUrl, target: selected.target };
}
