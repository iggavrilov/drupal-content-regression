import 'dotenv/config';
import { applySelectedDrupalTarget, getWorkflowAssigneeConfiguration } from './environments';

const ALLOWED_WRITE_ENVIRONMENT = 'develop';
const ALLOWED_WRITE_ORIGINS = new Set([
  'https://devv.leidos.com',
  'https://benefits-dev.leidos.com',
  'https://dev.qtcm.com',
  'https://dev-cms.leidos.com',
]);

export function assertExplicitNonProductionEnvironment(environmentOverride?: string, baseUrlOverride?: string): string {
  if (environmentOverride === undefined && baseUrlOverride === undefined) applySelectedDrupalTarget();
  const configured = (environmentOverride ?? process.env.DRUPAL_ENVIRONMENT)?.trim().toLowerCase();
  if (configured !== ALLOWED_WRITE_ENVIRONMENT) {
    throw new Error(
      'Content regression requires DRUPAL_ENVIRONMENT=develop. Browser execution was stopped.',
    );
  }
  const configuredBaseUrl = (baseUrlOverride ?? process.env.DRUPAL_BASE_URL)?.trim();
  let target: URL;
  try {
    target = new URL(configuredBaseUrl ?? '');
  } catch {
    throw new Error('Content regression requires a valid absolute DRUPAL_BASE_URL. Browser execution was stopped.');
  }
  const allowedOrigin = [...ALLOWED_WRITE_ORIGINS].find((origin) =>
    configuredBaseUrl === origin || configuredBaseUrl === `${origin}/`);
  const isCanonicalConfiguredTarget = Boolean(allowedOrigin);
  const isExactRootTarget = isCanonicalConfiguredTarget
    && target.origin === allowedOrigin
    && target.protocol === 'https:'
    && !target.username
    && !target.password
    && (target.pathname === '/' || target.pathname === '')
    && !target.search
    && !target.hash;
  if (!isExactRootTarget) {
    throw new Error(`Content regression writes are allowed only for explicitly approved development origins. Browser execution was stopped.`);
  }
  return configured;
}

export function assertPublishingAllowed(): string {
  const environment = assertExplicitNonProductionEnvironment();
  if (process.env.DRUPAL_ALLOW_PUBLISH?.trim().toLowerCase() !== 'true') {
    throw new Error(
      'PUBLISHING_BLOCKED: DRUPAL_ALLOW_PUBLISH=true is required before publishing browser execution.',
    );
  }
  const workflowAssignee = getWorkflowAssigneeConfiguration();
  if (!workflowAssignee) {
    throw new Error('PUBLISHING_BLOCKED: The selected target must configure a workflow assignee before publishing browser execution.');
  }
  if (!/^\d+$/.test(workflowAssignee.id)) {
    throw new Error('PUBLISHING_BLOCKED: Workflow assignee ID must contain digits only.');
  }
  return environment;
}

export function isPublishPermissionExpected(): boolean {
  return (
    process.env.DRUPAL_EXPECT_PUBLISH_PERMISSION?.trim().toLowerCase() === 'true'
  );
}
