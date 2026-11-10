import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, ConsoleMessage, Page } from '@playwright/test';
import { loginToDrupal, type DrupalCredentials } from '../auth/drupal-login';
import { discoverMainNavigation, type DiscoveredNavigationPage, type NavigationDiscoveryResult } from './discovery';
import type { NavigationMode } from './discovery';
import { inspectSafeInteractions, type InteractionCategory } from './interactions';
import { classifyFindings, isPotentialRegression, type ClassifiedConsoleFinding, type RawConsoleFinding, type ScanEnvironment } from './model';
import type { ConsoleScanTarget } from './profile';
import { isReadOnlyHttpMethod, isSafeProductionPublicRoute } from './production';

export const DEVV_ORIGIN = 'https://devv.leidos.com';
export const PRODUCTION_ORIGIN = 'https://www.leidos.com';
export const DEFAULT_ROUTES = ['/', '/about', '/insights', '/markets'] as const;
export const CONSOLE_SCAN_ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/console-scan');
export function getConsoleScanArtifactDir(target: ConsoleScanTarget): string { return target === 'devv' ? CONSOLE_SCAN_ARTIFACT_DIR : path.join(CONSOLE_SCAN_ARTIFACT_DIR, target); }

export interface InteractionRecord {
  environment: ScanEnvironment; route: string; pageUrl: string; finalUrl: string;
  action: string; actionKey: string; category?: InteractionCategory;
  status: 'performed' | 'skipped' | 'failed'; reason?: string; navigationDestination?: string;
  outcomeVerified?: boolean; beforeState?: string; afterState?: string;
}
export interface PageRecord { environment: ScanEnvironment; route: string; requestedUrl: string; finalUrl: string; loaded: boolean; failure?: string; durationMs?: number; result?: 'PASS' | 'FINDINGS' | 'TIMEOUT' | 'ERROR' }
export interface ScrollRecord { environment: ScanEnvironment; route: string; pageUrl: string; steps: number; startY: number; endY: number; documentHeight: number; returnedToTop: boolean; status: 'performed' | 'failed'; reason?: string }
export interface ScannerReport {
  generatedAt: string; settleMs: number; interactionSettleMs: number;
  developmentOrigin: string; productionOrigin?: string; productionComparisonPerformed: boolean;
  scanMode: 'development' | 'comparison' | 'standalone-production'; siteLabel: string; primaryEnvironment: ScanEnvironment;
  discoveredPages: DiscoveredNavigationPage[]; discoveryActions: string[]; discoverySkipped: string[]; discoveryComplete: boolean; discoveryIncompleteReason?: string; discoveryDiagnostics: NavigationDiscoveryResult['diagnostics'];
  routes: string[]; pageRecords: PageRecord[]; scrolls: ScrollRecord[]; interactions: InteractionRecord[];
  summary: Record<string, number>; findings: ClassifiedConsoleFinding[]; rawFindings: RawConsoleFinding[];
  screenshots: string[]; potentialRegressionCount: number;
}
interface ActionContext { action: string; actionKey: string; phase: 'page_load' | 'interaction' }

export interface ConsoleScanOptions {
  routes?: string[];
  developmentOrigin?: string;
  productionOrigin?: string;
  settleMs: number;
  interactionSettleMs?: number;
  maximumPages?: number;
  maximumInteractions?: number;
  devvHttpCredentials?: { username: string; password: string };
  drupalCredentials?: DrupalCredentials;
  outputDir: string;
  demo?: boolean;
  primaryEnvironment?: ScanEnvironment;
  readOnly?: boolean;
  publicOnly?: boolean;
  siteLabel?: string;
  viewport?: { width: number; height: number };
  navigationMode?: NavigationMode;
  fullPageScroll?: boolean;
  writeReports?: boolean;
  discoveryOnly?: boolean;
  navigationTimeoutMs?: number;
  networkIdleTimeoutMs?: number;
}

function makeFinding(page: Page, environment: ScanEnvironment, route: string, target: string, action: ActionContext, details: Omit<RawConsoleFinding, 'environment' | 'route' | 'pageUrl' | 'finalUrl' | 'action' | 'actionKey' | 'phase'>): RawConsoleFinding {
  return { environment, route, pageUrl: target, finalUrl: page.url() || target, action: action.action, actionKey: action.actionKey, phase: action.phase, ...details };
}
function consoleDetails(message: ConsoleMessage): Pick<RawConsoleFinding, 'type' | 'message' | 'sourceUrl' | 'scriptUrl' | 'line' | 'column'> {
  const location = message.location();
  return { type: 'console_error', message: message.text(), sourceUrl: location.url || undefined, scriptUrl: location.url || undefined, line: location.lineNumber, column: location.columnNumber };
}
function safeFilePart(value: string): string { return value.replace(/^\/+/, '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'home'; }
function sanitizeEvidenceUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.href.replace(/\/$/, parsed.pathname === '/' ? '/' : '');
  } catch { return value.replace(/[?#][^\s"'<>]*/g, ''); }
}
function sanitizeEvidenceText(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizeEvidenceUrl(url) ?? '[sanitized-url]');
}
function sanitizeRawFinding(finding: RawConsoleFinding): RawConsoleFinding {
  return {
    ...finding,
    message: sanitizeEvidenceText(finding.message),
    pageUrl: sanitizeEvidenceUrl(finding.pageUrl) ?? '',
    finalUrl: sanitizeEvidenceUrl(finding.finalUrl) ?? '',
    sourceUrl: sanitizeEvidenceUrl(finding.sourceUrl),
    scriptUrl: sanitizeEvidenceUrl(finding.scriptUrl),
    requestUrl: sanitizeEvidenceUrl(finding.requestUrl),
  };
}
function isObviousThirdPartyFinding(finding: RawConsoleFinding): boolean {
  const value = finding.sourceUrl ?? finding.scriptUrl ?? finding.requestUrl;
  if (!value) return false;
  try { return /(?:siteimprove|googletagmanager|google-analytics|analytics\.google|doubleclick)/i.test(new URL(value).hostname); } catch { return false; }
}

async function scanPage(page: Page, environment: ScanEnvironment, origin: string, route: string, settleMs: number, interactionSettleMs: number, maximumInteractions: number, screenshotDir: string, readOnly = false, fullPageScroll = false, navigationTimeoutMs = 25_000, networkIdleTimeoutMs = 3_000): Promise<{ findings: RawConsoleFinding[]; interactions: InteractionRecord[]; scroll?: ScrollRecord; pageRecord: PageRecord; screenshots: string[] }> {
  const startedAt = Date.now();
  const findings: RawConsoleFinding[] = [];
  const interactions: InteractionRecord[] = [];
  const screenshots: string[] = [];
  const target = new URL(route, origin).href;
  let currentAction: ActionContext = { action: 'Page load', actionKey: 'page-load', phase: 'page_load' };
  const capture = (details: Omit<RawConsoleFinding, 'environment' | 'route' | 'pageUrl' | 'finalUrl' | 'action' | 'actionKey' | 'phase'>) => findings.push(makeFinding(page, environment, route, target, currentAction, details));
  page.on('console', (message) => { if (message.type() === 'error') capture(consoleDetails(message)); });
  page.on('pageerror', (error) => capture({ type: 'page_error', message: error.message, scriptUrl: error.stack?.match(/https?:\/\/[^\s)]+/)?.[0] }));
  page.on('requestfailed', (request) => capture({ type: 'request_failed', message: `Request failed: ${request.method()} ${request.url()}`, requestUrl: request.url(), failureReason: request.failure()?.errorText }));
  page.on('response', (response) => { if (response.status() >= 400) capture({ type: 'http_error', message: `HTTP ${response.status()} ${response.request().method()} ${response.url()}`, requestUrl: response.url(), httpStatus: response.status() }); });
  let loaded = false;
  let failure: string | undefined;
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
    loaded = true;
    await page.waitForLoadState('networkidle', { timeout: networkIdleTimeoutMs }).catch(() => undefined);
    await page.waitForTimeout(settleMs);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown navigation failure';
    capture({ type: 'page_error', message: `Navigation failed: ${failure}`, sourceUrl: target });
  }
  const loadFinalUrl = page.url() || target;
  if (readOnly) {
    try {
      if (new URL(loadFinalUrl).origin !== new URL(origin).origin) {
        loaded = false;
        failure = `Navigation left the approved origin and interaction scanning was stopped: ${new URL(loadFinalUrl).origin}`;
        capture({ type: 'page_error', message: failure, sourceUrl: loadFinalUrl });
      }
    } catch {
      loaded = false;
      failure = 'Navigation produced an invalid final URL; interaction scanning was stopped.';
      capture({ type: 'page_error', message: failure, sourceUrl: target });
    }
  }
  for (const finding of findings) finding.finalUrl = loadFinalUrl;
  let scroll: ScrollRecord | undefined;
  if (loaded && fullPageScroll) {
    try {
      const dimensions = await page.evaluate(() => ({ startY: window.scrollY, height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), viewport: window.innerHeight }));
      const steps = Math.max(1, Math.min(24, Math.ceil(dimensions.height / Math.max(dimensions.viewport * 0.75, 1))));
      for (let index = 1; index <= steps; index += 1) {
        currentAction = { action: `Scrolled page step ${index} of ${steps}`, actionKey: `scroll-${index}`, phase: 'interaction' };
        await page.evaluate((position) => window.scrollTo({ top: position, behavior: 'instant' }), Math.round((dimensions.height - dimensions.viewport) * index / steps));
        await page.waitForTimeout(Math.min(interactionSettleMs, 500));
      }
      const endY = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(100);
      scroll = { environment, route, pageUrl: target, steps, startY: dimensions.startY, endY, documentHeight: dimensions.height, returnedToTop: await page.evaluate(() => window.scrollY === 0), status: 'performed' };
    } catch (error) {
      scroll = { environment, route, pageUrl: target, steps: 0, startY: 0, endY: 0, documentHeight: 0, returnedToTop: false, status: 'failed', reason: error instanceof Error ? error.message : 'Full-page scroll failed' };
    }
  }
  if (loaded) {
    const candidates = await inspectSafeInteractions(page, maximumInteractions).catch(() => ({ perform: [], skipped: [] }));
    for (const skipped of candidates.skipped) interactions.push({ environment, route, pageUrl: target, finalUrl: page.url() || target, action: skipped.action, actionKey: skipped.actionKey, category: skipped.category, status: 'skipped', reason: skipped.reason });
    for (let candidateIndex = 0; candidateIndex < candidates.perform.length; candidateIndex += 1) {
      const candidate = candidates.perform[candidateIndex];
      currentAction = { action: candidate.action, actionKey: candidate.actionKey, phase: 'interaction' };
      const beforeUrl = page.url();
      const findingStart = findings.length;
      let status: InteractionRecord['status'] = 'performed';
      let reason: string | undefined;
      try {
        const control = page.locator(`[data-console-scan-id="${candidate.id}"]`).first();
        if (!await control.isVisible({ timeout: 1_000 }).catch(() => false)) throw new Error('Control was no longer visible after an earlier interaction');
        const state = () => control.evaluate((node) => {
          const element = node as HTMLElement;
          const container = element.closest<HTMLElement>('[role="tablist"], [class*="carousel"], [class*="slider"], [class*="swiper"], [class*="accordion"], [class*="modal"]') ?? element.parentElement ?? element;
          return JSON.stringify({
            expanded: element.getAttribute('aria-expanded'), selected: element.getAttribute('aria-selected'), current: element.getAttribute('aria-current'),
            activeElement: document.activeElement === element, containerScrollLeft: container.scrollLeft,
            activeTokens: Array.from(container.querySelectorAll('[aria-selected="true"], [aria-current="true"], .active, .is-active, .swiper-slide-active')).slice(0, 10).map((item) => `${item.tagName}:${item.getAttribute('aria-label') ?? item.textContent?.trim().slice(0, 50) ?? ''}`),
            visibleDialogs: Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog, [class*="modal"]')).filter((item) => { const rect = item.getBoundingClientRect(); const style = getComputedStyle(item); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; }).length,
          });
        });
        const beforeState = await state();
        await control.click({ timeout: 3_000 });
        await page.waitForTimeout(interactionSettleMs);
        const afterState = await state().catch(() => beforeState);
        candidate.beforeState = beforeState;
        candidate.afterState = afterState;
        candidate.outcomeVerified = beforeState !== afterState;
      } catch (error) { status = 'failed'; reason = error instanceof Error ? error.message : 'Interaction failed'; }
      const afterUrl = page.url() || beforeUrl;
      const navigated = afterUrl !== beforeUrl ? afterUrl : undefined;
      const newFindings = findings.slice(findingStart);
      for (const finding of newFindings) finding.finalUrl = afterUrl;
      interactions.push({ environment, route, pageUrl: target, finalUrl: afterUrl, action: candidate.action, actionKey: candidate.actionKey, category: candidate.category, status, reason, navigationDestination: navigated, outcomeVerified: candidate.outcomeVerified, beforeState: candidate.beforeState, afterState: candidate.afterState });
      if (environment === 'DEVV' && (status === 'failed' || newFindings.some((finding) => ['console_error', 'page_error'].includes(finding.type) || !isObviousThirdPartyFinding(finding)))) {
        const file = path.join(screenshotDir, `${safeFilePart(route)}-${safeFilePart(candidate.actionKey)}-devv.png`);
        await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
        if (fs.existsSync(file)) screenshots.push(file);
      }
      await page.keyboard.press('Escape').catch(() => undefined);
      if (navigated) {
        for (const remaining of candidates.perform.slice(candidateIndex + 1)) interactions.push({ environment, route, pageUrl: target, finalUrl: afterUrl, action: `Skipped after navigation: ${remaining.action}`, actionKey: remaining.actionKey, category: remaining.category, status: 'skipped', reason: `Earlier interaction navigated to ${afterUrl}; recursive interaction scanning is disabled` });
        break;
      }
    }
  }
  const durationMs = Date.now() - startedAt;
  const result: PageRecord['result'] = !loaded ? (/timeout/i.test(failure ?? '') ? 'TIMEOUT' : 'ERROR') : findings.length ? 'FINDINGS' : 'PASS';
  return { findings, interactions, scroll, pageRecord: { environment, route, requestedUrl: target, finalUrl: page.url() || target, loaded, failure, durationMs, result }, screenshots };
}

function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!)); }
function htmlReport(report: ScannerReport): string {
  const findings = report.findings.map((finding) => `<tr class="${finding.classification}"><td>${escapeHtml(finding.route)}</td><td>${escapeHtml(finding.action)}</td><td>${escapeHtml(finding.phase)}</td><td>${escapeHtml(finding.classification)}</td><td>${escapeHtml(finding.reviewStatus)}</td><td>${escapeHtml(finding.type)}</td><td>${escapeHtml(finding.httpStatus ?? '')}</td><td>${escapeHtml(finding.message)}</td><td>${escapeHtml(finding.sourceUrl ?? finding.requestUrl ?? '')}</td><td>${escapeHtml(finding.devvFinalUrl ?? '')}</td><td>${escapeHtml(finding.productionFinalUrl ?? '')}</td><td>${finding.devvOccurrences}</td><td>${finding.productionOccurrences}</td></tr>`).join('\n');
  const interactions = report.interactions.map((item) => `<tr><td>${escapeHtml(item.environment)}</td><td>${escapeHtml(item.route)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.status)}</td><td>${item.outcomeVerified === undefined ? '' : item.outcomeVerified ? 'yes' : 'no'}</td><td>${escapeHtml(item.reason ?? '')}</td><td>${escapeHtml(item.navigationDestination ?? '')}</td></tr>`).join('\n');
  const pages = report.discoveredPages.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a> <code>${escapeHtml(item.route)}</code></li>`).join('');
  const pageRows = report.pageRecords.map((item) => `<tr><td>${escapeHtml(item.environment)}</td><td>${escapeHtml(item.route)}</td><td>${escapeHtml(item.requestedUrl)}</td><td>${escapeHtml(item.finalUrl)}</td><td>${escapeHtml(item.result ?? (item.loaded ? 'PASS' : 'ERROR'))}</td><td>${escapeHtml(item.durationMs ?? '')}</td><td>${escapeHtml(item.failure ?? '')}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Leidos Console Error Scan</title><style>body{font:14px Arial;margin:24px;color:#222}h1,h2{color:#4b176d}.summary{display:flex;gap:12px;flex-wrap:wrap}.summary span{padding:10px;background:#eee;border-radius:4px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #ccc;padding:8px;vertical-align:top;text-align:left}.DEVV_ONLY{background:#ffd6d6}.NEEDS_REVIEW{background:#fff1b8}.THIRD_PARTY{background:#e8e8e8}</style></head><body><h1>Leidos Navigation Interaction Console Scan</h1><p>Generated ${escapeHtml(report.generatedAt)} for ${escapeHtml(report.developmentOrigin)}.</p><div class="summary">${Object.entries(report.summary).map(([key, value]) => `<span><strong>${escapeHtml(key)}</strong>: ${value}</span>`).join('')}</div><p>Review status separates cross-environment confirmation, single-run findings requiring reproduction, and known third-party/browser noise. Navigation failures remain explicit in page records.</p><h2>Main-navigation pages selected</h2><ul>${pages}</ul><h2>Page execution</h2><table><thead><tr><th>Environment</th><th>Route</th><th>Requested URL</th><th>Final URL</th><th>Result</th><th>Duration ms</th><th>Failure</th></tr></thead><tbody>${pageRows || '<tr><td colspan="7">No pages executed</td></tr>'}</tbody></table><h2>Interactions performed and skipped</h2><table><thead><tr><th>Environment</th><th>Route</th><th>Action</th><th>Status</th><th>Outcome changed</th><th>Reason</th><th>Navigation destination</th></tr></thead><tbody>${interactions || '<tr><td colspan="7">No interactions</td></tr>'}</tbody></table><h2>Findings</h2><table><thead><tr><th>Route</th><th>Action</th><th>Phase</th><th>Classification</th><th>Review status</th><th>Type</th><th>HTTP status</th><th>Message</th><th>Source/request</th><th>DEVV final URL</th><th>Production final URL</th><th>DEVV</th><th>Production</th></tr></thead><tbody>${findings || '<tr><td colspan="13">No findings</td></tr>'}</tbody></table></body></html>`;
}

async function installReadOnlyNetworkGuard(context: BrowserContext, approvedOrigin: string): Promise<void> {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const crossOriginNavigation = request.isNavigationRequest() && new URL(request.url()).origin !== approvedOrigin;
    if (isReadOnlyHttpMethod(request.method()) && !crossOriginNavigation) await route.continue();
    else await route.abort('blockedbyclient');
  });
}

export async function runConsoleScan(browser: Browser, options: ConsoleScanOptions): Promise<ScannerReport> {
  const scanStartedAt = Date.now();
  const interactionSettleMs = options.interactionSettleMs ?? 750;
  const maximumPages = options.maximumPages ?? 40;
  const maximumInteractions = options.maximumInteractions ?? 8;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 25_000;
  const networkIdleTimeoutMs = options.networkIdleTimeoutMs ?? 3_000;
  const developmentOrigin = options.developmentOrigin ?? DEVV_ORIGIN;
  const productionOrigin = options.productionOrigin === undefined && developmentOrigin === DEVV_ORIGIN ? PRODUCTION_ORIGIN : options.productionOrigin;
  const primaryEnvironment = options.primaryEnvironment ?? 'DEVV';
  const siteLabel = options.siteLabel ?? (new URL(developmentOrigin).hostname.endsWith('qtcm.com') ? 'QTCM' : 'Leidos');
  const scanMode: ScannerReport['scanMode'] = primaryEnvironment === 'PRODUCTION' ? 'standalone-production' : productionOrigin ? 'comparison' : 'development';
  if (options.readOnly && options.drupalCredentials) throw new Error('Strict read-only scanning must not submit a Drupal login form.');
  const devvContext = await browser.newContext({ baseURL: developmentOrigin, httpCredentials: options.devvHttpCredentials, serviceWorkers: options.readOnly ? 'block' : 'allow', viewport: options.viewport, isMobile: options.navigationMode === 'mobile', hasTouch: options.navigationMode === 'mobile' });
  const productionContext = productionOrigin ? await browser.newContext({ baseURL: productionOrigin }) : undefined;
  if (options.readOnly) {
    await installReadOnlyNetworkGuard(devvContext, new URL(developmentOrigin).origin);
    if (productionContext && productionOrigin) await installReadOnlyNetworkGuard(productionContext, new URL(productionOrigin).origin);
  }
  const rawFindings: RawConsoleFinding[] = [];
  const interactions: InteractionRecord[] = [];
  const scrolls: ScrollRecord[] = [];
  const pageRecords: PageRecord[] = [];
  const screenshotDir = path.join(options.outputDir, 'screenshots');
  fs.rmSync(screenshotDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotFiles = new Set<string>();
  let discovery: NavigationDiscoveryResult = { pages: [], actions: [], skipped: [], totalUniquePages: 0, truncatedCount: 0, complete: false, incompleteReason: 'Discovery has not run.', diagnostics: { mode: options.navigationMode ?? 'desktop', navigationContainersFound: 0, candidateLinksDetected: 0, internalLinksAccepted: 0, internalLinksInitiallyHidden: 0, menuTogglesFound: 0, menuTogglesOpened: 0, linksRejected: 0, rejectionReasons: {}, rejectedSamples: [], discoveryErrors: [] } };
  try {
    if (options.routes) {
      discovery.pages = options.routes.map((route) => ({ route, url: new URL(route, developmentOrigin).href, label: route }));
      discovery.totalUniquePages = discovery.pages.length;
      discovery.complete = discovery.pages.length > 1;
      discovery.incompleteReason = discovery.complete ? undefined : 'Focused route selection contains only one route.';
    }
    else {
      const discoveryPage = await devvContext.newPage();
      if (options.drupalCredentials) await loginToDrupal(discoveryPage, options.drupalCredentials);
      await discoveryPage.goto(developmentOrigin, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await discoveryPage.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      discovery = await discoverMainNavigation(discoveryPage, developmentOrigin, maximumPages, [new URL(developmentOrigin).hostname.toLowerCase()], options.navigationMode ?? 'desktop');
      await discoveryPage.close();
      if (!discovery.pages.length) throw new Error('Main-navigation discovery returned no internal pages; refusing to fall back to a site crawl.');
    }
    if (options.publicOnly) {
      const excluded = discovery.pages.filter((page) => !isSafeProductionPublicRoute(page.route));
      discovery.pages = discovery.pages.filter((page) => isSafeProductionPublicRoute(page.route));
      discovery.skipped.push(...excluded.map((page) => `Skipped non-public or potentially stateful route ${page.route}`));
      if (!discovery.pages.length) throw new Error('Production public-route safety filtering removed every discovered page; refusing to scan.');
      if (discovery.pages.length === 1 && discovery.pages[0].route === '/') {
        discovery.complete = false;
        discovery.incompleteReason ??= 'Main Menu discovery found only the homepage after public-route safety filtering.';
        const gap = `INCOMPLETE COVERAGE: ${discovery.incompleteReason}`;
        if (!discovery.skipped.includes(gap)) discovery.skipped.push(gap);
      }
    }
    if (options.demo) console.log(`Console Scanner — Leidos DEV\nRoutes selected: ${discovery.pages.length}`);
    else console.log(`CONSOLE_SCAN_DISCOVERED ${JSON.stringify(discovery.pages.map(({ route, label }) => ({ route, label })))}`);
    if (!options.discoveryOnly) for (const [pageIndex, discovered] of discovery.pages.entries()) {
      const targets: Array<readonly [ScanEnvironment, string, typeof devvContext]> = [[primaryEnvironment, developmentOrigin, devvContext]];
      if (productionContext && productionOrigin) targets.push(['PRODUCTION', productionOrigin, productionContext]);
      for (const [environment, origin, context] of targets) {
        const progressLabel = `${pageIndex + 1}/${discovery.pages.length}`;
        console.log(`SCAN_PAGE_START ${progressLabel} ${environment} ${new URL(discovered.route, origin).href}`);
        if (options.demo && environment === 'DEVV') console.log(`Scanning ${pageIndex + 1}/${discovery.pages.length}: ${discovered.route}`);
        const page = await context.newPage();
        const result = await scanPage(page, environment, origin, discovered.route, options.settleMs, interactionSettleMs, maximumInteractions, screenshotDir, options.readOnly, options.fullPageScroll, navigationTimeoutMs, networkIdleTimeoutMs);
        rawFindings.push(...result.findings); interactions.push(...result.interactions); pageRecords.push(result.pageRecord);
        if (result.scroll) scrolls.push(result.scroll);
        result.screenshots.forEach((file) => screenshotFiles.add(file));
        if (options.writeReports !== false) {
          fs.mkdirSync(options.outputDir, { recursive: true });
          fs.writeFileSync(path.join(options.outputDir, 'progress.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), complete: false, developmentOrigin, pagesPlanned: discovery.pages.length, pagesProcessed: pageRecords.filter((item) => item.environment === primaryEnvironment).length, pageRecords: pageRecords.map((item) => ({ ...item, requestedUrl: sanitizeEvidenceUrl(item.requestedUrl), finalUrl: sanitizeEvidenceUrl(item.finalUrl) })), findings: rawFindings.map(sanitizeRawFinding) }, null, 2)}\n`, 'utf8');
        }
        console.log(`SCAN_PAGE_END ${progressLabel} ${result.pageRecord.result} ${result.pageRecord.durationMs}ms ${sanitizeEvidenceUrl(result.pageRecord.finalUrl)}`);
        await page.close();
      }
    }
    const reportRawFindings = options.readOnly ? rawFindings.map(sanitizeRawFinding) : rawFindings;
    const findings = classifyFindings(reportRawFindings);
    const screenshotClassifications = primaryEnvironment === 'PRODUCTION' ? ['PROD_ONLY', 'NEEDS_REVIEW'] : ['DEVV_ONLY', 'NEEDS_REVIEW'];
    const screenshotRoutes = new Set(findings.filter((finding) => screenshotClassifications.includes(finding.classification)).map((finding) => finding.route));
    for (const route of screenshotRoutes) {
      if ([...screenshotFiles].some((file) => path.basename(file).startsWith(`${safeFilePart(route)}-`))) continue;
      const page = await devvContext.newPage();
      await page.goto(new URL(route, developmentOrigin).href, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined);
      const file = path.join(screenshotDir, `${safeFilePart(route)}-review-${primaryEnvironment.toLowerCase()}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
      if (fs.existsSync(file)) screenshotFiles.add(file);
      await page.close();
    }
    const count = (classification: string) => findings.filter((finding) => finding.classification === classification).length;
    const devvInteractions = interactions.filter((item) => item.environment === primaryEnvironment);
    const possibleFindingClass = primaryEnvironment === 'PRODUCTION' ? 'PROD_ONLY' : 'DEVV_ONLY';
    const potentialRegressionCount = findings.filter((finding) => finding.classification === possibleFindingClass && ['console_error', 'page_error', 'request_failed', 'http_error'].includes(finding.type)).length;
    const reportPageRecords = options.readOnly ? pageRecords.map((item) => ({ ...item, requestedUrl: sanitizeEvidenceUrl(item.requestedUrl) ?? '', finalUrl: sanitizeEvidenceUrl(item.finalUrl) ?? '' })) : pageRecords;
    const reportInteractions = options.readOnly ? interactions.map((item) => ({ ...item, pageUrl: sanitizeEvidenceUrl(item.pageUrl) ?? '', finalUrl: sanitizeEvidenceUrl(item.finalUrl) ?? '', navigationDestination: sanitizeEvidenceUrl(item.navigationDestination) })) : interactions;
    const reportDiscoveredPages = options.readOnly ? discovery.pages.map((item) => ({ ...item, url: sanitizeEvidenceUrl(item.url) ?? '', route: sanitizeEvidenceUrl(new URL(item.route, developmentOrigin).href)?.replace(developmentOrigin, '') || '/' })) : discovery.pages;
    const report: ScannerReport = {
      generatedAt: new Date().toISOString(), settleMs: options.settleMs, interactionSettleMs, developmentOrigin, productionOrigin, productionComparisonPerformed: Boolean(productionOrigin),
      scanMode, siteLabel, primaryEnvironment,
      discoveredPages: reportDiscoveredPages, discoveryActions: discovery.actions, discoverySkipped: discovery.skipped, discoveryComplete: discovery.complete, discoveryIncompleteReason: discovery.incompleteReason, discoveryDiagnostics: discovery.diagnostics,
      routes: reportDiscoveredPages.map((item) => item.route), pageRecords: reportPageRecords, scrolls, interactions: reportInteractions,
      summary: {
        pagesDiscovered: discovery.pages.length, pagesTested: pageRecords.filter((item) => item.environment === primaryEnvironment).length,
        totalUniqueMenuPages: discovery.totalUniquePages,
        coverageTruncatedPages: discovery.truncatedCount,
        homepageCovered: discovery.pages.some((item) => item.route === '/') ? 1 : 0,
        discoveryComplete: discovery.complete ? 1 : 0,
        navigationContainersFound: discovery.diagnostics.navigationContainersFound,
        candidateLinksDetected: discovery.diagnostics.candidateLinksDetected,
        internalLinksAccepted: discovery.diagnostics.internalLinksAccepted,
        linksRejected: discovery.diagnostics.linksRejected,
        discoveryErrors: discovery.diagnostics.discoveryErrors.length,
        pagesLoaded: pageRecords.filter((item) => item.environment === primaryEnvironment && item.loaded).length,
        navigationFailures: pageRecords.filter((item) => item.environment === primaryEnvironment && !item.loaded).length,
        interactionsPerformed: devvInteractions.filter((item) => item.status === 'performed').length,
        interactionsSkipped: devvInteractions.filter((item) => item.status === 'skipped').length,
        interactionsFailed: devvInteractions.filter((item) => item.status === 'failed').length,
        interactionsOutcomeVerified: devvInteractions.filter((item) => item.outcomeVerified).length,
        scrollsPerformed: scrolls.filter((item) => item.environment === primaryEnvironment && item.status === 'performed').length,
        scrollsFailed: scrolls.filter((item) => item.environment === primaryEnvironment && item.status === 'failed').length,
        consoleErrors: reportRawFindings.filter((finding) => finding.environment === primaryEnvironment && finding.type === 'console_error').length,
        pageExceptions: reportRawFindings.filter((finding) => finding.environment === primaryEnvironment && finding.type === 'page_error').length,
        failedNetworkRequests: reportRawFindings.filter((finding) => finding.environment === primaryEnvironment && finding.type === 'request_failed').length,
        http4xx: reportRawFindings.filter((finding) => finding.environment === primaryEnvironment && finding.type === 'http_error' && (finding.httpStatus ?? 0) >= 400 && (finding.httpStatus ?? 0) < 500).length,
        http5xx: reportRawFindings.filter((finding) => finding.environment === primaryEnvironment && finding.type === 'http_error' && (finding.httpStatus ?? 0) >= 500).length,
        firstPartyFindings: findings.filter((finding) => ['DEVV_ONLY', 'DEVV_AND_PROD', 'PROD_ONLY'].includes(finding.classification)).length,
        thirdPartyFindings: findings.filter((finding) => finding.classification === 'THIRD_PARTY').length,
        possibleApplicationDefects: potentialRegressionCount,
        totalFindings: findings.length, DEVV_ONLY: count('DEVV_ONLY'), DEVV_AND_PROD: count('DEVV_AND_PROD'), PROD_ONLY: count('PROD_ONLY'), THIRD_PARTY: count('THIRD_PARTY'), NEEDS_REVIEW: count('NEEDS_REVIEW'),
        interactionTriggeredErrors: findings.filter((finding) => finding.phase === 'interaction').length,
        totalDurationMs: Date.now() - scanStartedAt,
      },
      findings, rawFindings: reportRawFindings,
      screenshots: [...screenshotFiles].map((file) => path.relative(options.outputDir, file).replace(/\\/g, '/')),
      potentialRegressionCount: primaryEnvironment === 'PRODUCTION' ? potentialRegressionCount : findings.filter(isPotentialRegression).length,
    };
    if (options.writeReports !== false) {
      fs.mkdirSync(options.outputDir, { recursive: true });
      fs.writeFileSync(path.join(options.outputDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      fs.writeFileSync(path.join(options.outputDir, 'report.html'), htmlReport(report).replaceAll('Leidos', siteLabel), 'utf8');
      fs.rmSync(path.join(options.outputDir, 'progress.json'), { force: true });
    }
    return report;
  } finally { await devvContext.close(); await productionContext?.close(); }
}
