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
  return environment;
}

export function isPublishPermissionExpected(): boolean {
  return (
    process.env.DRUPAL_EXPECT_PUBLISH_PERMISSION?.trim().toLowerCase() === 'true'
  );
}
