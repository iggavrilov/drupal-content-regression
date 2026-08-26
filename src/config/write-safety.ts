import 'dotenv/config';

const ALLOWED_WRITE_ENVIRONMENT = 'develop';
const ALLOWED_WRITE_ORIGIN = 'https://devv.leidos.com';

export function assertExplicitNonProductionEnvironment(): string {
  const configured = process.env.DRUPAL_ENVIRONMENT?.trim().toLowerCase();
  if (configured !== ALLOWED_WRITE_ENVIRONMENT) {
    throw new Error(
      'Content regression requires DRUPAL_ENVIRONMENT=develop. Browser execution was stopped.',
    );
  }
  const configuredBaseUrl = process.env.DRUPAL_BASE_URL?.trim();
  let target: URL;
  try {
    target = new URL(configuredBaseUrl ?? '');
  } catch {
    throw new Error('Content regression requires a valid absolute DRUPAL_BASE_URL. Browser execution was stopped.');
  }
  const isCanonicalConfiguredTarget = configuredBaseUrl === ALLOWED_WRITE_ORIGIN
    || configuredBaseUrl === `${ALLOWED_WRITE_ORIGIN}/`;
  const isExactRootTarget = isCanonicalConfiguredTarget
    && target.origin === ALLOWED_WRITE_ORIGIN
    && target.protocol === 'https:'
    && !target.username
    && !target.password
    && (target.pathname === '/' || target.pathname === '')
    && !target.search
    && !target.hash;
  if (!isExactRootTarget) {
    throw new Error(`Content regression writes are allowed only for ${ALLOWED_WRITE_ORIGIN}. Browser execution was stopped.`);
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
  if (!process.env.DRUPAL_WORKFLOW_ASSIGNEE_SEARCH?.trim() || !process.env.DRUPAL_WORKFLOW_ASSIGNEE_EXPECTED?.trim() || !process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID?.trim()) {
    throw new Error('PUBLISHING_BLOCKED: Workflow assignee search, expected label, and expected numeric ID are required before publishing browser execution.');
  }
  if (!/^\d+$/.test(process.env.DRUPAL_WORKFLOW_ASSIGNEE_ID.trim())) {
    throw new Error('PUBLISHING_BLOCKED: Workflow assignee ID must contain digits only.');
  }
  return environment;
}

export function isPublishPermissionExpected(): boolean {
  return (
    process.env.DRUPAL_EXPECT_PUBLISH_PERMISSION?.trim().toLowerCase() === 'true'
  );
}
