import 'dotenv/config';

export type DrupalEnvironmentName = 'develop' | 'staging' | 'production';

export interface EnvironmentConfig {
  name: DrupalEnvironmentName;
  baseUrl: string;
}

export function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const supportedEnvironments: DrupalEnvironmentName[] = [
  'develop',
  'staging',
  'production',
];

export function getEnvironmentConfig(): EnvironmentConfig {
  const configuredName = process.env.DRUPAL_ENVIRONMENT ?? 'develop';

  if (!supportedEnvironments.includes(configuredName as DrupalEnvironmentName)) {
    throw new Error(`Unsupported DRUPAL_ENVIRONMENT: ${configuredName}`);
  }

  const configuredBaseUrl = getRequiredEnvironmentVariable('DRUPAL_BASE_URL');
  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error('DRUPAL_BASE_URL must be a valid absolute URL.');
  }

  return {
    name: configuredName as DrupalEnvironmentName,
    baseUrl: baseUrl.href.replace(/\/$/, ''),
  };
}
