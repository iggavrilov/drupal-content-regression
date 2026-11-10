import { expect, test } from '@playwright/test';
import { deduplicateAdminFindings, normalizeAdminRoute, sanitizeAdminText, sanitizeAdminUrl, summarizeSafetySkips, suppressDocumentConsoleConsequences, type RawAdminFinding } from '../src/admin-explorer/model';
import { hasVisibleNavigationProvenance, routePriority } from '../src/admin-explorer/explorer';

test('accepts safe canonical admin GET routes', () => {
  expect(normalizeAdminRoute('/admin/config/system', 'https://devv.leidos.com').route).toBe('/admin/config/system');
  expect(normalizeAdminRoute('/admin/content?page=2#main', 'https://devv.leidos.com').route).toBe('/admin/content?page=2');
});

test('rejects external, public, mutating, and unbounded query routes', () => {
  expect(normalizeAdminRoute('https://example.com/admin', 'https://devv.leidos.com').reason).toContain('External');
  expect(normalizeAdminRoute('/node/1', 'https://devv.leidos.com').reason).toContain('Outside');
  expect(normalizeAdminRoute('/admin/content/add', 'https://devv.leidos.com').reason).toContain('mutating');
  expect(normalizeAdminRoute('/admin/content?title=a', 'https://devv.leidos.com').reason).toContain('Query');
  expect(normalizeAdminRoute('/admin/content?page=99', 'https://devv.leidos.com').reason).toContain('Pagination');
});

test('rejects links whose accessible name indicates mutation', () => {
  expect(normalizeAdminRoute('/admin/modules', 'https://devv.leidos.com', 'Install new module').reason).toContain('mutating');
});

test('sanitizes sensitive query values', () => {
  expect(sanitizeAdminUrl('/admin/report?token=secret&destination=/admin', 'https://devv.leidos.com')).toBe('https://devv.leidos.com/admin/report?token=%5BREDACTED%5D&destination=%5BREDACTED%5D');
});

test('sanitizes OAuth parameters embedded in console text', () => {
  const safe = sanitizeAdminText("Fetch to 'https://identity.example.test/authorize?nonce=abc&state=def&client_id=public' failed", 'https://devv.leidos.com');
  expect(safe).not.toContain('abc');
  expect(safe).not.toContain('def');
  expect(safe).toContain('client_id=public');
});

test('deduplicates root findings and aggregates affected pages', () => {
  const base: RawAdminFinding = { type: 'page_error', classification: 'JAVASCRIPT ERROR', page: '/admin', message: 'TypeError: failed', visibleToUser: false, evidence: 'stack' };
  const findings = deduplicateAdminFindings([base, { ...base, page: '/admin/content' }], 'https://devv.leidos.com');
  expect(findings).toHaveLength(1);
  expect(findings[0].occurrenceCount).toBe(2);
  expect(findings[0].affectedPages).toEqual(['/admin', '/admin/content']);
});

test('deduplicates volatile third-party OAuth failures by root cause', () => {
  const first: RawAdminFinding = { type: 'console_error', classification: 'THIRD-PARTY/EXTERNAL', page: '/admin', message: 'Fetch https://identity.example.test/authorize?nonce=one&state=alpha failed', visibleToUser: false, evidence: 'external', requestUrl: 'https://devv.leidos.com/admin' };
  const findings = deduplicateAdminFindings([first, { ...first, page: '/admin/content', message: 'Fetch https://identity.example.test/authorize?nonce=two&state=beta failed', requestUrl: 'https://devv.leidos.com/admin/content' }], 'https://devv.leidos.com');
  expect(findings).toHaveLength(1);
  expect(findings[0].affectedPages).toEqual(['/admin', '/admin/content']);
});

test('preserves exact href and never reconstructs entity reference routes from text', () => {
  expect(normalizeAdminRoute('/admin/help/entity_reference_revisions', 'https://devv.leidos.com', 'Entity Reference Revisions').route).toBe('/admin/help/entity_reference_revisions');
  expect(normalizeAdminRoute('/admin/help/entity_reference_revisions', 'https://devv.leidos.com', 'Entity Reference').route).not.toBe('/admin/help/entity_reference');
});

test('requires visible anchor provenance for user-facing navigation', () => {
  const base = { route: '/admin/help/example', sourcePage: '/admin/help', actualHref: '/admin/help/example', linkText: 'Example', discoveryMechanism: 'main-content-anchor' };
  expect(hasVisibleNavigationProvenance([{ ...base, visible: true, navigationElement: true }])).toBe(true);
  expect(hasVisibleNavigationProvenance([{ ...base, visible: false, navigationElement: true }])).toBe(false);
});

test('reports unique safety skips separately from occurrences', () => {
  expect(summarizeSafetySkips([{ url: '/admin/x', reason: 'unsafe', occurrences: 3 }, { url: '/admin/y', reason: 'unsafe', occurrences: 2 }])).toEqual({ uniqueRoutesSkippedForSafety: 2, safetySkipOccurrences: 5 });
});

test('suppresses browser console consequence of an already-recorded document failure', () => {
  const document: RawAdminFinding = { type: 'document_http', classification: 'HTTP 5XX', page: '/admin/broken', message: 'Main document returned HTTP 500', visibleToUser: true, status: 500, evidence: '500' };
  const consoleError: RawAdminFinding = { type: 'console_error', classification: 'JAVASCRIPT ERROR', page: '/admin/broken', message: 'Failed to load resource: the server responded with a status of 500 ()', visibleToUser: false, evidence: '500' };
  expect(suppressDocumentConsoleConsequences([document, consoleError])).toEqual([document]);
});

test('prioritizes reports and configuration before repetitive entity routes', () => {
  expect(routePriority('/admin/reports/status')).toBeLessThan(routePriority('/admin/config/system/site-information'));
  expect(routePriority('/admin/config/system/site-information')).toBeLessThan(routePriority('/admin/structure/types/manage/page'));
});
