import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export type DrupalEnvironmentName = 'develop' | 'staging' | 'production';
export type DrupalTarget = 'leidos' | 'benefits' | 'qtcm' | 'cms' | 'devv';
export type CanonicalDrupalTarget = Exclude<DrupalTarget, 'devv'>;
export type DrupalTier = 'development' | 'stage';
export type CredentialsProfile = 'default' | 'cms';
export interface WorkflowAssigneeConfig { username: string; id: string }
export interface EffectiveCredentials { drupalUsername: string; drupalPassword: string; basicAuthUsername: string; basicAuthPassword: string }
export interface SelectedDrupalTarget { target: DrupalTarget; tier: DrupalTier; name: string; baseUrl: string; credentialsProfile: CredentialsProfile; workflowAssignee: WorkflowAssigneeConfig | null }
export interface EnvironmentConfig { name: DrupalEnvironmentName; baseUrl: string; target: DrupalTarget; tier: DrupalTier }

const APPROVED_TARGET_TIER_ORIGINS = new Map<string, string>([
  ['leidos:development', 'https://devv.leidos.com'],
  ['leidos:stage', 'https://stage.leidos.com'],
  ['benefits:development', 'https://benefits-dev.leidos.com'],
  ['benefits:stage', 'https://benefits-stage.leidos.com'],
  ['qtcm:development', 'https://dev.qtcm.com'],
  ['cms:development', 'https://dev-cms.leidos.com'],
]);
const CANONICAL_TARGETS: CanonicalDrupalTarget[] = ['leidos', 'benefits', 'qtcm', 'cms'];
const TIERS: DrupalTier[] = ['development', 'stage'];

interface RawEnvironmentEntry { name?: unknown; credentials_profile?: unknown; workflow_assignee?: unknown; urls?: unknown }
interface RawEnvironmentFile { default_environment?: unknown; default_tier?: unknown; environments?: Record<string, RawEnvironmentEntry> }

function loadEnvironmentFile(configPath: string): RawEnvironmentFile {
  if (!fs.existsSync(configPath)) throw new Error('Environment configuration file is missing.');
  try { return parse(fs.readFileSync(configPath, 'utf8')) as RawEnvironmentFile; }
  catch { throw new Error('Environment configuration YAML is invalid.'); }
}

export function resolveDrupalTarget(
  targetValue = process.env.DRUPAL_TARGET,
  configPath = path.resolve(process.cwd(), 'config/environments.yml'),
  tierValue = process.env.DRUPAL_TIER,
): SelectedDrupalTarget {
  const parsed = loadEnvironmentFile(configPath);
  if (!parsed || typeof parsed !== 'object' || !parsed.environments || typeof parsed.environments !== 'object') throw new Error('Environment configuration must define environments.');
  const requestedTarget = targetValue?.trim() || (typeof parsed.default_environment === 'string' ? parsed.default_environment.trim() : '');
  const legacyDevv = requestedTarget === 'devv';
  const target = (legacyDevv ? 'leidos' : requestedTarget) as CanonicalDrupalTarget;
  if (!CANONICAL_TARGETS.includes(target)) throw new Error(`Unknown DRUPAL_TARGET: ${requestedTarget || '(missing)'}`);
  const requestedTier = tierValue?.trim() || (legacyDevv ? 'development' : typeof parsed.default_tier === 'string' ? parsed.default_tier.trim() : '');
  if (!TIERS.includes(requestedTier as DrupalTier)) throw new Error(`Invalid DRUPAL_TIER: ${requestedTier || '(missing)'}`);
  const tier = requestedTier as DrupalTier;
  if (legacyDevv && tier !== 'development') throw new Error('Legacy DRUPAL_TARGET=devv supports only DRUPAL_TIER=development; use DRUPAL_TARGET=leidos for tier selection.');
  const selected = parsed.environments[target];
  if (!selected) throw new Error(`Unknown DRUPAL_TARGET: ${target}`);
  if (typeof selected.name !== 'string' || !selected.name.trim()) throw new Error(`Environment ${target} must define a name.`);
  const urls = selected.urls;
  if (!urls || typeof urls !== 'object' || Array.isArray(urls)) throw new Error(`Environment ${target} must define urls.`);
  const configuredUrl = (urls as Record<string, unknown>)[tier];
  if (typeof configuredUrl !== 'string' || !configuredUrl.trim()) throw new Error(`Unsupported target+tier combination: ${target} + ${tier}`);
  const baseUrl = configuredUrl.trim();
  let parsedUrl: URL;
  try { parsedUrl = new URL(baseUrl); } catch { throw new Error(`Environment ${target} ${tier} URL must be a valid absolute URL.`); }
  const approvedOrigin = APPROVED_TARGET_TIER_ORIGINS.get(`${target}:${tier}`);
  if (baseUrl !== approvedOrigin || parsedUrl.origin !== baseUrl || parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') || parsedUrl.search || parsedUrl.hash) throw new Error(`Environment ${target} ${tier} URL is not an exact approved origin.`);
  const credentialsProfile = selected.credentials_profile;
  if (credentialsProfile !== 'default' && credentialsProfile !== 'cms') throw new Error(`Environment ${target} credentials_profile must be default or cms.`);
  let workflowAssignee: WorkflowAssigneeConfig | null = null;
  if (selected.workflow_assignee !== null) {
    const raw = selected.workflow_assignee;
    if (!raw || typeof raw !== 'object') throw new Error(`Environment ${target} workflow_assignee is invalid.`);
    const username = (raw as Record<string, unknown>).username;
    const id = (raw as Record<string, unknown>).id;
    if (typeof username !== 'string' || !username.trim() || !Number.isInteger(id) || Number(id) <= 0) throw new Error(`Environment ${target} workflow_assignee must define a username and positive numeric ID.`);
    workflowAssignee = { username: username.trim(), id: String(id) };
  }
  return { target: legacyDevv ? 'devv' : target, tier, name: selected.name.trim(), baseUrl, credentialsProfile, workflowAssignee };
}

export function resolveEffectiveCredentials(selected = resolveDrupalTarget(), environment: Readonly<Record<string, string | undefined>> = process.env): EffectiveCredentials {
  const names = selected.credentialsProfile === 'cms' ? ['CMS_DRUPAL_USERNAME', 'CMS_DRUPAL_PASSWORD', 'CMS_BASIC_AUTH_USERNAME', 'CMS_BASIC_AUTH_PASSWORD'] as const : ['DRUPAL_USERNAME', 'DRUPAL_PASSWORD', 'BASIC_AUTH_USERNAME', 'BASIC_AUTH_PASSWORD'] as const;
  const values = names.map((name) => environment[name]?.trim());
  const missingIndex = values.findIndex((value) => !value);
  if (missingIndex >= 0) throw new Error(`Missing required ${selected.credentialsProfile} credential variable: ${names[missingIndex]}`);
  return { drupalUsername: values[0]!, drupalPassword: values[1]!, basicAuthUsername: values[2]!, basicAuthPassword: values[3]! };
}

export function getEffectiveCredentials(): EffectiveCredentials { return resolveEffectiveCredentials(applySelectedDrupalTarget()); }

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
    return { DRUPAL_USERNAME: credentials.drupalUsername, DRUPAL_PASSWORD: credentials.drupalPassword, BASIC_AUTH_USERNAME: credentials.basicAuthUsername, BASIC_AUTH_PASSWORD: credentials.basicAuthPassword }[name];
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
  return { name: configuredName as DrupalEnvironmentName, baseUrl: selected.baseUrl, target: selected.target, tier: selected.tier };
}
