export type ScanEnvironment = 'DEVV' | 'PRODUCTION';
export type FindingType = 'console_error' | 'page_error' | 'request_failed' | 'http_error';
export type FindingClassification = 'DEVV_ONLY' | 'DEVV_AND_PROD' | 'PROD_ONLY' | 'THIRD_PARTY' | 'NEEDS_REVIEW';
export type FindingReviewStatus = 'COMPARISON_CONFIRMED' | 'SINGLE_RUN_NEEDS_CONFIRMATION' | 'THIRD_PARTY_OR_BROWSER_NOISE';
export type FindingOwnership = 'FIRST_PARTY' | 'THIRD_PARTY' | 'NEEDS_REVIEW';

export interface RawConsoleFinding {
  environment: ScanEnvironment;
  route: string;
  pageUrl: string;
  finalUrl: string;
  action: string;
  actionKey: string;
  phase: 'page_load' | 'interaction';
  type: FindingType;
  message: string;
  sourceUrl?: string;
  scriptUrl?: string;
  line?: number;
  column?: number;
  httpStatus?: number;
  requestUrl?: string;
  failureReason?: string;
}

export interface ClassifiedConsoleFinding {
  route: string;
  action: string;
  actionKey: string;
  phase: 'page_load' | 'interaction';
  classification: FindingClassification;
  reviewStatus: FindingReviewStatus;
  ownership: FindingOwnership;
  normalizedKey: string;
  message: string;
  type: FindingType;
  sourceUrl?: string;
  requestUrl?: string;
  httpStatus?: number;
  devvOccurrences: number;
  productionOccurrences: number;
  environments: ScanEnvironment[];
  devvUrl?: string;
  devvFinalUrl?: string;
  productionUrl?: string;
  productionFinalUrl?: string;
  raw: RawConsoleFinding[];
}

const TRACKING_KEYS = /^(?:utm_.+|gclid|fbclid|dclid|_ga|_gl|cache(?:buster)?|cb|timestamp|ts|ver|v)$/i;
const THIRD_PARTY_HOSTS = [
  /(?:^|\.)siteimprove(?:analytics)?\.(?:com|io)$/i,
  /(?:^|\.)googletagmanager\.com$/i,
  /(?:^|\.)google-analytics\.com$/i,
  /^analytics\.google\.com$/i,
  /(?:^|\.)doubleclick\.net$/i,
];

function safeUrl(value?: string): URL | undefined {
  if (!value) return undefined;
  try { return new URL(value); } catch { return undefined; }
}

export function normalizeUrl(value?: string): string | undefined {
  const parsed = safeUrl(value);
  if (!parsed) return value?.trim() || undefined;
  const hostname = parsed.hostname.toLowerCase();
  const host = ['devv.leidos.com', 'www.leidos.com'].includes(hostname) ? '{LEIDOS_ORIGIN}' : hostname === 'dev.qtcm.com' ? '{QTCM_ORIGIN}' : hostname;
  const retained = [...parsed.searchParams.entries()].filter(([key]) => !TRACKING_KEYS.test(key)).sort(([a], [b]) => a.localeCompare(b));
  const query = retained.length ? `?${new URLSearchParams(retained).toString()}` : '';
  return `${parsed.protocol}//${host}${parsed.pathname}${query}`;
}

export function normalizeMessage(message: string): string {
  return message
    .replace(/https:\/\/(?:devv|www)\.leidos\.com/gi, 'https://{LEIDOS_ORIGIN}')
    .replace(/https:\/\/dev\.qtcm\.com/gi, 'https://{QTCM_ORIGIN}')
    .replace(/([?&])(?:utm_[^=&]+|gclid|fbclid|dclid|_ga|_gl|cache(?:buster)?|cb|timestamp|ts|ver|v)=[^\s&#]*/gi, '$1')
    .replace(/[?&]+(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findingKey(finding: RawConsoleFinding): string {
  return JSON.stringify({
    type: finding.type,
    message: normalizeMessage(finding.message),
    source: normalizeUrl(finding.sourceUrl ?? finding.scriptUrl ?? finding.requestUrl),
    status: finding.httpStatus,
    failure: finding.failureReason?.trim(),
  });
}

export function deduplicateFindings(findings: RawConsoleFinding[]): RawConsoleFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.environment}|${finding.route}|${finding.actionKey}|${findingKey(finding)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function attribution(finding: RawConsoleFinding): 'first_party' | 'third_party' | 'unknown' {
  const url = safeUrl(finding.sourceUrl ?? finding.scriptUrl ?? finding.requestUrl);
  if (!url) return 'unknown';
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'leidos.com' || hostname.endsWith('.leidos.com') || hostname === 'qtcm.com' || hostname.endsWith('.qtcm.com')) return 'first_party';
  if (THIRD_PARTY_HOSTS.some((pattern) => pattern.test(hostname))) return 'third_party';
  return 'unknown';
}

export function classifyFindingOwnership(finding: RawConsoleFinding): FindingOwnership {
  const owner = attribution(finding);
  return owner === 'first_party' ? 'FIRST_PARTY' : owner === 'third_party' ? 'THIRD_PARTY' : 'NEEDS_REVIEW';
}

export function classifyFindings(input: RawConsoleFinding[]): ClassifiedConsoleFinding[] {
  const findings = deduplicateFindings(input);
  const groups = new Map<string, RawConsoleFinding[]>();
  for (const finding of findings) {
    const key = `${finding.route}|${finding.actionKey}|${findingKey(finding)}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.entries()].map(([normalizedKey, raw]) => {
    const devv = raw.filter((item) => item.environment === 'DEVV');
    const production = raw.filter((item) => item.environment === 'PRODUCTION');
    const ownership = new Set(raw.map(attribution));
    let classification: FindingClassification;
    if (ownership.has('third_party')) classification = 'THIRD_PARTY';
    else if (devv.length && production.length) classification = 'DEVV_AND_PROD';
    else if (ownership.size !== 1 || ownership.has('unknown')) classification = 'NEEDS_REVIEW';
    else classification = devv.length ? 'DEVV_ONLY' : 'PROD_ONLY';
    const representative = devv[0] ?? production[0];
    const reviewStatus: FindingReviewStatus = classification === 'THIRD_PARTY'
      ? 'THIRD_PARTY_OR_BROWSER_NOISE'
      : classification === 'DEVV_AND_PROD'
        ? 'COMPARISON_CONFIRMED'
        : 'SINGLE_RUN_NEEDS_CONFIRMATION';
    const findingOwnership: FindingOwnership = ownership.has('third_party') ? 'THIRD_PARTY' : ownership.size === 1 && ownership.has('first_party') ? 'FIRST_PARTY' : 'NEEDS_REVIEW';
    return {
      route: representative.route,
      action: representative.action,
      actionKey: representative.actionKey,
      phase: representative.phase,
      classification,
      reviewStatus,
      ownership: findingOwnership,
      normalizedKey,
      message: representative.message,
      type: representative.type,
      sourceUrl: representative.sourceUrl ?? representative.scriptUrl,
      requestUrl: representative.requestUrl,
      httpStatus: representative.httpStatus,
      devvOccurrences: devv.length,
      productionOccurrences: production.length,
      environments: [...new Set(raw.map((item) => item.environment))],
      devvUrl: devv[0]?.pageUrl,
      devvFinalUrl: devv[0]?.finalUrl,
      productionUrl: production[0]?.pageUrl,
      productionFinalUrl: production[0]?.finalUrl,
      raw,
    };
  }).sort((a, b) => a.route.localeCompare(b.route) || a.classification.localeCompare(b.classification));
}

export function isPotentialRegression(finding: ClassifiedConsoleFinding): boolean {
  return finding.classification === 'DEVV_ONLY' && ['console_error', 'page_error', 'request_failed', 'http_error'].includes(finding.type);
}
