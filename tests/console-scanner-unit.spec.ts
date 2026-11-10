import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { classifyFindings, deduplicateFindings, normalizeMessage, normalizeUrl, type RawConsoleFinding } from '../src/console-scanner/model';
import { normalizeNavigationUrl } from '../src/console-scanner/discovery';
import { classifyInteractionCandidate } from '../src/console-scanner/interactions';
import { CONSOLE_SCAN_ARTIFACT_DIR, getConsoleScanArtifactDir } from '../src/console-scanner/scanner';
import { getConsoleScanProfile } from '../src/console-scanner/profile';

const finding = (environment: 'DEVV' | 'PRODUCTION', overrides: Partial<RawConsoleFinding> = {}): RawConsoleFinding => ({ environment, route: '/insights', pageUrl: environment === 'DEVV' ? 'https://devv.leidos.com/insights' : 'https://www.leidos.com/insights', finalUrl: environment === 'DEVV' ? 'https://devv.leidos.com/insights' : 'https://www.leidos.com/insights', action: 'Page load', actionKey: 'page-load', phase: 'page_load', type: 'page_error', message: 'TypeError: example', sourceUrl: environment === 'DEVV' ? 'https://devv.leidos.com/app.js?v=1' : 'https://www.leidos.com/app.js?v=2', ...overrides });

test('normalizes environment origins and non-semantic query values conservatively', () => {
  expect(normalizeUrl('https://devv.leidos.com/app.js?v=1&feature=on')).toBe('https://{LEIDOS_ORIGIN}/app.js?feature=on');
  expect(normalizeUrl('https://www.leidos.com/app.js?v=2&feature=off')).toBe('https://{LEIDOS_ORIGIN}/app.js?feature=off');
  expect(normalizeMessage('Failure at https://devv.leidos.com/a?utm_source=x')).toContain('https://{LEIDOS_ORIGIN}/a');
});

test('deduplicates identical repeated findings on the same environment and route', () => {
  const item = finding('DEVV');
  expect(deduplicateFindings([item, { ...item }])).toHaveLength(1);
});

test('matches equivalent DEVV and Production findings', () => {
  const result = classifyFindings([finding('DEVV'), finding('PRODUCTION')])[0];
  expect(result.classification).toBe('DEVV_AND_PROD');
  expect(result.reviewStatus).toBe('COMPARISON_CONFIRMED');
});

test('classifies first-party DEVV-only and Production-only findings', () => {
  const developmentOnly = classifyFindings([finding('DEVV')])[0];
  expect(developmentOnly.classification).toBe('DEVV_ONLY');
  expect(developmentOnly.reviewStatus).toBe('SINGLE_RUN_NEEDS_CONFIRMATION');
  expect(classifyFindings([finding('PRODUCTION')])[0].classification).toBe('PROD_ONLY');
  expect(classifyFindings([finding('DEVV', { sourceUrl: 'https://dev.qtcm.com/core/app.js' })])[0].classification).toBe('DEVV_ONLY');
});

test('uses a low-pressure Stage-only profile without slowing DEVV', () => {
  expect(getConsoleScanProfile('stage')).toEqual({ settleMs: 5_000, interactionSettleMs: 1_500, maximumInteractions: 8, compareProduction: false });
  expect(getConsoleScanProfile('benefits-stage')).toEqual({ settleMs: 5_000, interactionSettleMs: 1_500, maximumInteractions: 8, compareProduction: false });
  expect(getConsoleScanProfile('devv')).toEqual({ settleMs: 1_000, interactionSettleMs: 750, maximumInteractions: 8, compareProduction: true });
});

test('retains known third-party findings separately', () => {
  for (const sourceUrl of [
    'https://www.googletagmanager.com/gtm.js',
    'https://analytics.google.com/g/collect',
    'https://siteimproveanalytics.io/script.js',
    'https://ad.doubleclick.net/collect',
  ]) {
    const result = classifyFindings([finding('DEVV', { sourceUrl, message: 'Third-party error' })]);
    expect(result[0].classification).toBe('THIRD_PARTY');
    expect(result[0].raw).toHaveLength(1);
  }
});

test('uses NEEDS_REVIEW for unattributed unmatched errors', () => {
  expect(classifyFindings([finding('DEVV', { sourceUrl: undefined, scriptUrl: undefined })])[0].classification).toBe('NEEDS_REVIEW');
});

test('classifies the same unattributed Ceros message on both environments as pre-existing', () => {
  const common = { sourceUrl: undefined, scriptUrl: undefined, message: 'Ceros Embed Tag is missing attribute/s.' };
  expect(classifyFindings([finding('DEVV', common), finding('PRODUCTION', common)])[0].classification).toBe('DEVV_AND_PROD');
});

test('normalizes only internal main-navigation page links', () => {
  expect(normalizeNavigationUrl('https://www.leidos.com/markets/?utm_source=nav#top', 'https://devv.leidos.com')).toBe('https://devv.leidos.com/markets');
  expect(normalizeNavigationUrl('#section', 'https://devv.leidos.com', 'https://devv.leidos.com/')).toBeUndefined();
  expect(normalizeNavigationUrl('mailto:test@example.com', 'https://devv.leidos.com')).toBeUndefined();
  expect(normalizeNavigationUrl('https://example.com/about', 'https://devv.leidos.com')).toBeUndefined();
  expect(normalizeNavigationUrl('/file/report.pdf', 'https://devv.leidos.com')).toBeUndefined();
  expect(normalizeNavigationUrl('/resources', 'https://dev.qtcm.com', 'https://dev.qtcm.com/', ['dev.qtcm.com'])).toBe('https://dev.qtcm.com/resources');
  expect(normalizeNavigationUrl('https://www.qtcm.com/', 'https://dev.qtcm.com', 'https://dev.qtcm.com/', ['dev.qtcm.com'])).toBeUndefined();
});

test('allowlists semantic UI interactions and rejects risky controls', () => {
  expect(classifyInteractionCandidate({ tag: 'button', label: 'Capabilities', ariaExpanded: 'false' }).safe).toBe(true);
  expect(classifyInteractionCandidate({ tag: 'button', role: 'tab', label: 'Latest Insights' }).category).toBe('tab');
  expect(classifyInteractionCandidate({ tag: 'button', label: 'Submit request', type: 'submit', inForm: true }).safe).toBe(false);
  expect(classifyInteractionCandidate({ tag: 'a', label: 'Download report', href: '/report.pdf' }).safe).toBe(false);
  expect(classifyInteractionCandidate({ tag: 'button', label: 'Unclear action' }).safe).toBe(false);
});

test('Playwright cleanup is isolated from persistent console scanner reports', async ({}, testInfo) => {
  const playwrightOutput = path.resolve(testInfo.project.outputDir);
  expect(CONSOLE_SCAN_ARTIFACT_DIR).toBe(path.resolve(process.cwd(), 'artifacts/console-scan'));
  expect(getConsoleScanArtifactDir('qtcm')).toBe(path.resolve(process.cwd(), 'artifacts/console-scan/qtcm'));
  expect(getConsoleScanArtifactDir('benefits')).toBe(path.resolve(process.cwd(), 'artifacts/console-scan/benefits'));
  expect(getConsoleScanArtifactDir('cms')).toBe(path.resolve(process.cwd(), 'artifacts/console-scan/cms'));
  expect(getConsoleScanArtifactDir('stage')).toBe(path.resolve(process.cwd(), 'artifacts/console-scan/stage'));
  expect(CONSOLE_SCAN_ARTIFACT_DIR === playwrightOutput || CONSOLE_SCAN_ARTIFACT_DIR.startsWith(`${playwrightOutput}${path.sep}`)).toBe(false);
  const preservationSentinel = process.env.CONSOLE_SCAN_PRESERVATION_SENTINEL;
  if (preservationSentinel) expect(fs.existsSync(preservationSentinel)).toBe(true);
});
