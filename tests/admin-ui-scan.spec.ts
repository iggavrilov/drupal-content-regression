import path from 'node:path';
import { expect, test } from '@playwright/test';
import { resolveDrupalTarget, resolveEffectiveCredentials } from '../src/config/environments';
import { runAdminExplorer } from '../src/admin-explorer/explorer';

test('explore accessible DEVV Drupal administration UI read-only', async ({ browser }) => {
  test.setTimeout(7_200_000);
  const target = resolveDrupalTarget(process.env.DRUPAL_TARGET);
  const credentials = resolveEffectiveCredentials(target);
  const report = await runAdminExplorer(browser, {
    environment: target.target.toUpperCase(),
    baseUrl: target.baseUrl,
    basicAuth: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    drupalCredentials: { username: credentials.drupalUsername, password: credentials.drupalPassword },
    outputDir: path.resolve(process.cwd(), `artifacts/admin-ui-scan/${target.tier === 'stage' ? 'stage' : target.target}`),
    maximumPages: Number(process.env.ADMIN_UI_SCAN_MAX_PAGES ?? '500'),
    settleMs: Number(process.env.ADMIN_UI_SCAN_SETTLE_MS ?? '300'),
    resume: process.env.ADMIN_UI_SCAN_RESUME !== 'false',
  });
  console.log(`ADMIN_UI_SCAN_SUMMARY ${JSON.stringify({ sections: report.discoveredAdminSections, totalUniqueRoutesDiscovered: report.totalUniqueRoutesDiscovered, safeFunctionalRoutesDiscovered: report.safeFunctionalRoutesDiscovered, pagesVisited: report.pagesVisited, pagesLoadedSuccessfully: report.pagesLoadedSuccessfully, pagesFailed: report.pagesFailed, uniqueRoutesSkippedForSafety: report.uniqueRoutesSkippedForSafety, safetySkipOccurrences: report.safetySkipOccurrences, routesExcludedAsRepetitive: report.routesExcludedAsRepetitive, remainingActionableSafeRoutes: report.remainingActionableSafeRoutes, uniqueUserVisibleErrors: report.uniqueUserVisibleErrors, uniqueHttp4xx: report.uniqueHttp4xx, uniqueHttp5xx: report.uniqueHttp5xx, uniquePageErrors: report.uniquePageErrors, uniqueConsoleErrors: report.uniqueConsoleErrors, uniqueFailedFirstPartyRequests: report.uniqueFailedFirstPartyRequests, thirdPartyFailures: report.thirdPartyFailures, diagnosticFindings: report.diagnosticFindings, crawlLimitReached: report.crawlLimitReached })}`);
  expect(report.authenticationStatus).toBe('PASS');
  expect(report.pagesVisited).toBeGreaterThan(0);
});
