import 'dotenv/config';

const ALLOWED_WRITE_ENVIRONMENTS = new Set(['develop', 'staging']);

export function assertExplicitNonProductionEnvironment(): string {
  const configured = process.env.DRUPAL_ENVIRONMENT?.trim().toLowerCase();
  if (!configured || !ALLOWED_WRITE_ENVIRONMENTS.has(configured)) {
    throw new Error(
      'Content regression requires DRUPAL_ENVIRONMENT to be explicitly set to develop or staging. Browser execution was stopped.',
    );
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
