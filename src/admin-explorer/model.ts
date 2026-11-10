import { normalizeMessage, normalizeUrl } from '../console-scanner/model';

export type AdminFindingClassification =
  | 'VERIFIED USER-VISIBLE ERROR'
  | 'HTTP 5XX'
  | 'HTTP 4XX'
  | 'DRUPAL APPLICATION ERROR'
  | 'JAVASCRIPT ERROR'
  | 'FAILED FIRST-PARTY REQUEST'
  | 'AUTH/SESSION ISSUE'
  | 'EXPECTED ACCESS RESTRICTION'
  | 'THIRD-PARTY/EXTERNAL'
  | 'DIAGNOSTIC / NOT USER-REACHABLE'
  | 'NEEDS MANUAL REVIEW';

export interface RawAdminFinding {
  type: 'document_http' | 'visible_error' | 'page_error' | 'console_error' | 'request_failed' | 'resource_http' | 'auth_issue';
  classification: AdminFindingClassification;
  page: string;
  message: string;
  visibleToUser: boolean;
  status?: number;
  requestMethod?: string;
  requestUrl?: string;
  resourceType?: string;
  evidence: string;
}

export interface AdminFinding extends Omit<RawAdminFinding, 'page'> {
  normalizedKey: string;
  firstAffectedPage: string;
  affectedPages: string[];
  occurrenceCount: number;
}

const MUTATING_PATH = /(?:^|\/)(?:add|create|edit|delete|remove|clone|duplicate|publish|unpublish|archive|restore|revert|update|install|uninstall|enable|disable|import|export|synchronize|cron|cache|rebuild|flush|reset|execute|send|resend|approve|reject|moderation|batch)(?:\/|$)/i;
const MUTATING_TEXT = /\b(?:save|apply|submit|delete|remove|add|create|clone|duplicate|publish|unpublish|archive|restore|revert|update|install|uninstall|enable|disable|import|synchronize|run cron|clear cache|rebuild cache|flush|reset|execute|send|resend|approve|reject)\b/i;

export function normalizeAdminRoute(href: string, baseOrigin: string, linkText = ''): { route?: string; reason?: string } {
  if (!href.trim() || /^(?:mailto:|tel:|javascript:|data:)/i.test(href)) return { reason: 'Unsupported or non-navigation URL scheme' };
  let url: URL;
  try { url = new URL(href, baseOrigin); } catch { return { reason: 'Invalid URL' }; }
  if (url.origin !== baseOrigin) return { reason: 'External or non-canonical origin' };
  if (!url.pathname.startsWith('/admin')) return { reason: 'Outside Drupal administration scope' };
  if (MUTATING_PATH.test(url.pathname) || MUTATING_TEXT.test(linkText)) return { reason: 'Potentially mutating administration action' };
  if (url.hash && `${url.pathname}${url.search}` === new URL(baseOrigin).pathname) return { reason: 'Fragment-only navigation' };
  url.hash = '';
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== 'page')) return { reason: 'Query-string permutation or filter/action parameter' };
  if (url.searchParams.has('page')) {
    const page = Number(url.searchParams.get('page'));
    if (!Number.isInteger(page) || page < 0 || page > 2) return { reason: 'Pagination exceeds representative page limit' };
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/admin';
  return { route: `${url.pathname}${url.search}` };
}

export function sanitizeAdminUrl(value: string | undefined, baseOrigin: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseOrigin);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|signature|session|destination|nonce|state|code/i.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.href;
  } catch { return normalizeUrl(value); }
}

export function sanitizeAdminText(value: string, baseOrigin: string): string {
  return value.replace(/https?:\/\/[^\s'"<>]+/gi, (candidate) => {
    const trailing = candidate.match(/[),.;:]+$/)?.[0] ?? '';
    const url = trailing ? candidate.slice(0, -trailing.length) : candidate;
    return `${sanitizeAdminUrl(url, baseOrigin) ?? '[URL REDACTED]'}${trailing}`;
  });
}

export function deduplicateAdminFindings(raw: RawAdminFinding[], baseOrigin: string): AdminFinding[] {
  const groups = new Map<string, RawAdminFinding[]>();
  for (const item of raw) {
    const safeMessage = sanitizeAdminText(item.message, baseOrigin);
    const rootMessage = item.classification === 'THIRD-PARTY/EXTERNAL'
      ? safeMessage.replace(/https?:\/\/[^\s'"<>]+/gi, (value) => {
          try { const url = new URL(value.replace(/[),.;:]+$/, '')); return `${url.origin}${url.pathname}`; } catch { return '[EXTERNAL URL]'; }
        })
      : safeMessage;
    const requestUrl = item.classification === 'THIRD-PARTY/EXTERNAL' && item.type === 'console_error'
      ? undefined
      : sanitizeAdminUrl(item.requestUrl, baseOrigin);
    const key = JSON.stringify({ type: item.type, classification: item.classification, message: normalizeMessage(rootMessage), status: item.status, method: item.requestMethod, url: requestUrl });
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([normalizedKey, items]) => {
    const first = items[0];
    return {
      ...first,
      message: sanitizeAdminText(first.message, baseOrigin),
      evidence: sanitizeAdminText(first.evidence, baseOrigin),
      requestUrl: sanitizeAdminUrl(first.requestUrl, baseOrigin),
      normalizedKey,
      firstAffectedPage: first.page,
      affectedPages: [...new Set(items.map((item) => item.page))],
      occurrenceCount: items.length,
    };
  });
}

export function suppressDocumentConsoleConsequences(raw: RawAdminFinding[]): RawAdminFinding[] {
  const failedDocuments = new Set(raw.filter((item) => item.type === 'document_http' && (item.status ?? 0) >= 400).map((item) => item.page));
  return raw.filter((item) => !(failedDocuments.has(item.page) && item.type === 'console_error' && /failed to load resource: the server responded with a status of [45]\d\d/i.test(item.message)));
}

export function summarizeSafetySkips(items: Array<{ url: string; reason: string; occurrences?: number }>): { uniqueRoutesSkippedForSafety: number; safetySkipOccurrences: number } {
  return { uniqueRoutesSkippedForSafety: new Set(items.map((item) => `${item.url}|${item.reason}`)).size, safetySkipOccurrences: items.reduce((sum, item) => sum + (item.occurrences ?? 1), 0) };
}

export function isFirstPartyUrl(value: string | undefined, baseOrigin: string): boolean {
  if (!value) return false;
  try { return new URL(value, baseOrigin).origin === baseOrigin; } catch { return false; }
}

export function isVerifiedFinding(finding: RawAdminFinding): boolean {
  return finding.visibleToUser || ['HTTP 5XX', 'DRUPAL APPLICATION ERROR', 'JAVASCRIPT ERROR', 'FAILED FIRST-PARTY REQUEST', 'AUTH/SESSION ISSUE'].includes(finding.classification);
}
