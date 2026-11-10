import { expect, test } from '@playwright/test';
import { resolveDrupalTarget, resolveEffectiveCredentials } from '../src/config/environments';
import { DEFAULT_ROUTES, getConsoleScanArtifactDir, PRODUCTION_ORIGIN, runConsoleScan } from '../src/console-scanner/scanner';
import { getConsoleScanProfile, type ConsoleScanTarget } from '../src/console-scanner/profile';

test('scan configured public routes and safe interactions', async ({ browser }) => {
  test.setTimeout(1_800_000);
  const scanTarget = (process.env.CONSOLE_SCAN_TARGET?.trim() || 'devv') as ConsoleScanTarget;
  if (!['devv', 'stage', 'qtcm', 'benefits', 'benefits-stage', 'cms'].includes(scanTarget)) throw new Error(`Unsupported console scan target: ${scanTarget}`);
  const selected = scanTarget === 'stage' ? resolveDrupalTarget('leidos', undefined, 'stage') : scanTarget === 'benefits-stage' ? resolveDrupalTarget('benefits', undefined, 'stage') : resolveDrupalTarget(scanTarget);
  const expectedOrigin = scanTarget === 'devv' ? 'https://devv.leidos.com' : scanTarget === 'stage' ? 'https://stage.leidos.com' : scanTarget === 'qtcm' ? 'https://dev.qtcm.com' : scanTarget === 'benefits' ? 'https://benefits-dev.leidos.com' : scanTarget === 'benefits-stage' ? 'https://benefits-stage.leidos.com' : 'https://dev-cms.leidos.com';
  if (selected.baseUrl !== expectedOrigin) throw new Error(`Console scanner ${scanTarget} target mapping is not exact.`);
  const credentials = resolveEffectiveCredentials(selected);
  const requested = process.env.CONSOLE_SCAN_ROUTE?.trim();
  const routes = requested ? [requested.startsWith('/') ? requested : `/${requested}`] : undefined;
  if (routes?.some((route) => !/^\/[A-Za-z0-9/_-]*$/.test(route))) throw new Error(`Unsupported focused scan route: ${requested}`);
  const profile = getConsoleScanProfile(scanTarget);
  const settleMs = Number(process.env.CONSOLE_SCAN_SETTLE_MS ?? profile.settleMs);
  if (!Number.isFinite(settleMs) || settleMs < 0 || settleMs > 30_000) throw new Error('CONSOLE_SCAN_SETTLE_MS must be between 0 and 30000.');
  const interactionSettleMs = Number(process.env.CONSOLE_SCAN_INTERACTION_SETTLE_MS ?? profile.interactionSettleMs);
  const maximumPages = Number(process.env.CONSOLE_SCAN_MAX_PAGES ?? '40');
  const maximumInteractions = Number(process.env.CONSOLE_SCAN_MAX_INTERACTIONS ?? profile.maximumInteractions);
  const compareProduction = process.env.CONSOLE_SCAN_COMPARE_PRODUCTION === undefined
    ? profile.compareProduction
    : process.env.CONSOLE_SCAN_COMPARE_PRODUCTION === 'true';
  const demo = process.env.CONSOLE_SCAN_DEMO === 'true';
  const uiDemo = process.env.CONSOLE_SCAN_UI_DEMO === 'true';
  const navigationMode = process.env.CONSOLE_SCAN_NAVIGATION_MODE === 'mobile' ? 'mobile' : 'desktop';
  const navigationTimeoutMs = Number(process.env.CONSOLE_SCAN_NAVIGATION_TIMEOUT_MS ?? '25000');
  const networkIdleTimeoutMs = Number(process.env.CONSOLE_SCAN_NETWORK_IDLE_TIMEOUT_MS ?? '3000');
  if (!Number.isFinite(interactionSettleMs) || interactionSettleMs < 0 || interactionSettleMs > 10_000) throw new Error('CONSOLE_SCAN_INTERACTION_SETTLE_MS must be between 0 and 10000.');
  if (!Number.isInteger(maximumPages) || maximumPages < 1 || maximumPages > 100) throw new Error('CONSOLE_SCAN_MAX_PAGES must be an integer between 1 and 100.');
  if (!Number.isInteger(maximumInteractions) || maximumInteractions < 0 || maximumInteractions > 20) throw new Error('CONSOLE_SCAN_MAX_INTERACTIONS must be an integer between 0 and 20.');
  if (!Number.isFinite(navigationTimeoutMs) || navigationTimeoutMs < 5000 || navigationTimeoutMs > 60000) throw new Error('CONSOLE_SCAN_NAVIGATION_TIMEOUT_MS must be between 5000 and 60000.');
  if (!Number.isFinite(networkIdleTimeoutMs) || networkIdleTimeoutMs < 0 || networkIdleTimeoutMs > 10000) throw new Error('CONSOLE_SCAN_NETWORK_IDLE_TIMEOUT_MS must be between 0 and 10000.');
  console.log(`SCAN_TARGET ${selected.name} ${selected.tier} ${selected.baseUrl} ${navigationMode}`);
  const outputDir = process.env.CONSOLE_SCAN_OUTPUT_DIR?.trim() || (uiDemo ? `artifacts/ui-interaction-demo/${scanTarget}` : demo ? `${getConsoleScanArtifactDir(scanTarget)}/demo` : getConsoleScanArtifactDir(scanTarget));
  const report = await runConsoleScan(browser, { routes, developmentOrigin: selected.baseUrl, productionOrigin: scanTarget === 'devv' && compareProduction ? PRODUCTION_ORIGIN : '', settleMs, interactionSettleMs, maximumPages, maximumInteractions, devvHttpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword }, drupalCredentials: scanTarget === 'cms' ? { username: credentials.drupalUsername, password: credentials.drupalPassword } : undefined, outputDir, demo, readOnly: scanTarget !== 'cms', navigationMode, navigationTimeoutMs, networkIdleTimeoutMs });
  if (!demo) {
    console.log(`CONSOLE_SCAN_SUMMARY ${JSON.stringify(report.summary)}`);
    console.log(`CONSOLE_SCAN_DEVV_ONLY ${JSON.stringify(report.findings.filter((finding) => finding.classification === 'DEVV_ONLY').map((finding) => ({ route: finding.route, type: finding.type, message: finding.message, source: finding.sourceUrl ?? finding.requestUrl })))}`);
    console.log(`CONSOLE_SCAN_INTERACTION_FINDINGS ${report.findings.filter((finding) => finding.phase === 'interaction').length} (full evidence in results.json and report.html)`);
  }
  if (routes) expect(report.routes).toEqual(routes);
  else expect(report.routes.length).toBeGreaterThan(0);
  if (uiDemo) {
    expect(report.summary.pagesLoaded, 'The public demo page must load').toBe(1);
    expect(report.summary.interactionsPerformed, 'At least one recognized read-only UI control must be exercised').toBeGreaterThan(0);
    expect(report.summary.interactionsOutcomeVerified, 'At least one interaction must produce an observable UI state change').toBeGreaterThan(0);
  }
});
