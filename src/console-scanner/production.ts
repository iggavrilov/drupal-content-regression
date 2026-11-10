import path from 'node:path';

export type ProductionConsoleTarget = 'leidos' | 'qtcm' | 'benefits';

export interface ProductionConsoleSite {
  target: ProductionConsoleTarget;
  label: string;
  environmentVariable: 'DRUPAL_PROD_LEIDOS_URL' | 'DRUPAL_PROD_QTCM_URL' | 'DRUPAL_PROD_BENEFITS_URL';
  expectedHostname: string;
  origin: string;
}

const DEFINITIONS: ReadonlyArray<Omit<ProductionConsoleSite, 'origin'>> = [
  { target: 'leidos', label: 'Leidos Production', environmentVariable: 'DRUPAL_PROD_LEIDOS_URL', expectedHostname: 'www.leidos.com' },
  { target: 'qtcm', label: 'QTCM Production', environmentVariable: 'DRUPAL_PROD_QTCM_URL', expectedHostname: 'www.qtcm.com' },
  { target: 'benefits', label: 'Benefits Production', environmentVariable: 'DRUPAL_PROD_BENEFITS_URL', expectedHostname: 'benefits.leidos.com' },
] as const;

export function validateProductionOrigin(variableName: string, value: string | undefined, expectedHostname: string): string {
  if (!value?.trim()) throw new Error(`${variableName} is required for the Production console scan.`);
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new Error(`${variableName} must be a valid absolute URL.`); }
  if (parsed.protocol !== 'https:') throw new Error(`${variableName} must use HTTPS.`);
  if (parsed.hostname.toLowerCase() !== expectedHostname) throw new Error(`${variableName} must use the exact approved hostname ${expectedHostname}.`);
  if (parsed.username || parsed.password) throw new Error(`${variableName} must not contain embedded credentials.`);
  if (parsed.port) throw new Error(`${variableName} must not contain a custom port.`);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error(`${variableName} must be an exact root origin without a path, query, or fragment.`);
  return parsed.origin;
}

export function resolveProductionConsoleSites(environment: NodeJS.ProcessEnv = process.env): ProductionConsoleSite[] {
  return DEFINITIONS.map((definition) => ({
    ...definition,
    origin: validateProductionOrigin(definition.environmentVariable, environment[definition.environmentVariable], definition.expectedHostname),
  }));
}

export function getProductionConsoleArtifactDir(target: ProductionConsoleTarget): string {
  return path.resolve(process.cwd(), 'artifacts', 'console-scan', 'production', target);
}

export function isSafeProductionPublicRoute(route: string): boolean {
  let parsed: URL;
  try { parsed = new URL(route, 'https://production.invalid'); } catch { return false; }
  if (parsed.origin !== 'https://production.invalid') return false;
  const pathname = parsed.pathname.replace(/\/{2,}/g, '/').toLowerCase();
  if (/^\/(?:admin(?:\/|$)|user(?:\/|$)|node\/(?:add(?:\/|$)|\d+\/(?:edit|delete|revisions)(?:\/|$))|media\/(?:add(?:\/|$)|\d+\/(?:edit|delete)(?:\/|$)))/.test(pathname)) return false;
  if (/\/(?:login|logout|register|password|checkout|cart|payment|purchase)(?:\/|$)/.test(pathname)) return false;
  return true;
}

export function isReadOnlyHttpMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
