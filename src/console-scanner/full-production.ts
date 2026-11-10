import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from '@playwright/test';
import { classifyFindingOwnership, findingKey, type FindingOwnership, type RawConsoleFinding } from './model';
import { runConsoleScan, type ScannerReport } from './scanner';
import type { ProductionConsoleSite } from './production';

export interface FullProductionFinding {
  rootCauseKey: string;
  ownership: FindingOwnership;
  type: RawConsoleFinding['type'];
  message: string;
  sourceUrl?: string;
  requestUrl?: string;
  occurrences: number;
  affectedUrls: string[];
  interactionContexts: Array<{ viewport: 'desktop' | 'mobile'; route: string; action: string; phase: string }>;
  reproductionSteps: string[];
}

export interface FullProductionReport {
  generatedAt: string;
  target: ProductionConsoleSite['target'];
  siteLabel: string;
  origin: string;
  readOnly: true;
  status: 'COMPLETE' | 'INCOMPLETE';
  desktop: ScannerReport;
  mobile: ScannerReport;
  uniqueMenuDestinations: Array<{ route: string; labels: string[] }>;
  coverageGaps: string[];
  findings: FullProductionFinding[];
  summary: Record<string, number>;
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export function groupFullProductionFindings(desktop: RawConsoleFinding[], mobile: RawConsoleFinding[]): FullProductionFinding[] {
  const tagged = [...desktop.map((finding) => ({ finding, viewport: 'desktop' as const })), ...mobile.map((finding) => ({ finding, viewport: 'mobile' as const }))];
  const groups = new Map<string, typeof tagged>();
  for (const item of tagged) {
    const key = findingKey(item.finding);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([rootCauseKey, items]) => {
    const first = items[0].finding;
    const ownerships = new Set(items.map((item) => classifyFindingOwnership(item.finding)));
    const ownership: FindingOwnership = ownerships.size === 1 ? [...ownerships][0] : 'NEEDS_REVIEW';
    const affectedUrls = [...new Set(items.map((item) => item.finding.finalUrl || item.finding.pageUrl))];
    const contexts = items.map((item) => ({ viewport: item.viewport, route: item.finding.route, action: item.finding.action, phase: item.finding.phase }));
    const reproductionSteps = [...new Set(contexts.map((context) => `Open ${context.route} in the ${context.viewport} viewport; ${context.action}; observe ${first.type}: ${first.message}`))];
    return { rootCauseKey, ownership, type: first.type, message: first.message, sourceUrl: first.sourceUrl ?? first.scriptUrl, requestUrl: first.requestUrl, occurrences: items.length, affectedUrls, interactionContexts: contexts, reproductionSteps };
  }).sort((a, b) => a.ownership.localeCompare(b.ownership) || a.type.localeCompare(b.type) || a.message.localeCompare(b.message));
}

function renderFullProductionHtml(report: FullProductionReport): string {
  const viewportRows = (name: 'Desktop' | 'Mobile', scan: ScannerReport) => `<tr><td>${name}</td><td>${scan.summary.totalUniqueMenuPages}</td><td>${scan.summary.pagesTested}</td><td>${scan.summary.pagesLoaded}</td><td>${scan.summary.navigationFailures}</td><td>${scan.summary.scrollsPerformed}</td><td>${scan.summary.interactionsPerformed}</td><td>${scan.summary.interactionsSkipped}</td><td>${scan.summary.interactionsFailed}</td></tr>`;
  const findings = report.findings.map((finding) => `<tr><td>${escapeHtml(finding.ownership)}</td><td>${escapeHtml(finding.type)}</td><td>${escapeHtml(finding.message)}</td><td>${escapeHtml(finding.sourceUrl ?? finding.requestUrl ?? '')}</td><td>${finding.occurrences}</td><td>${finding.affectedUrls.map(escapeHtml).join('<br>')}</td><td>${finding.interactionContexts.map((item) => escapeHtml(`${item.viewport}: ${item.route} — ${item.action}`)).join('<br>')}</td><td>${finding.reproductionSteps.map(escapeHtml).join('<br>')}</td></tr>`).join('');
  const interactions = ([...report.desktop.interactions.map((item) => ({ ...item, viewport: 'desktop' })), ...report.mobile.interactions.map((item) => ({ ...item, viewport: 'mobile' }))]).map((item) => `<tr><td>${item.viewport}</td><td>${escapeHtml(item.route)}</td><td>${escapeHtml(item.category ?? '')}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.status)}</td><td>${item.outcomeVerified === undefined ? '' : item.outcomeVerified ? 'yes' : 'no'}</td><td>${escapeHtml(item.reason ?? '')}</td></tr>`).join('');
  const scrolls = ([...report.desktop.scrolls.map((item) => ({ ...item, viewport: 'desktop' })), ...report.mobile.scrolls.map((item) => ({ ...item, viewport: 'mobile' }))]).map((item) => `<tr><td>${item.viewport}</td><td>${escapeHtml(item.route)}</td><td>${escapeHtml(item.status)}</td><td>${item.steps}</td><td>${item.documentHeight}</td><td>${item.returnedToTop ? 'yes' : 'no'}</td><td>${escapeHtml(item.reason ?? '')}</td></tr>`).join('');
  const failures = [...report.desktop.pageRecords.map((item) => ({ ...item, viewport: 'desktop' })), ...report.mobile.pageRecords.map((item) => ({ ...item, viewport: 'mobile' }))].filter((item) => !item.loaded).map((item) => `<li>${item.viewport}: ${escapeHtml(item.route)} — ${escapeHtml(item.failure ?? 'Navigation failed')}</li>`).join('') || '<li>None</li>';
  const destinations = report.uniqueMenuDestinations.map((item) => `<li><code>${escapeHtml(item.route)}</code> — ${item.labels.map(escapeHtml).join(' / ')}</li>`).join('');
  const diagnostics = (viewport: string, scan: ScannerReport) => `<tr><td>${viewport}</td><td>${scan.discoveryComplete ? 'COMPLETE' : 'INCOMPLETE'}</td><td>${scan.discoveryDiagnostics.navigationContainersFound}</td><td>${scan.discoveryDiagnostics.candidateLinksDetected}</td><td>${scan.discoveryDiagnostics.internalLinksAccepted}</td><td>${scan.discoveryDiagnostics.linksRejected}</td><td>${escapeHtml(JSON.stringify(scan.discoveryDiagnostics.rejectionReasons))}</td><td>${escapeHtml(scan.discoveryDiagnostics.discoveryErrors.join(' | '))}</td></tr>`;
  const gaps = report.coverageGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('') || '<li>None</li>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.siteLabel)} Full Production Console Regression</title><style>body{font:14px Arial;margin:24px;color:#222}h1,h2{color:#4b176d}.summary{display:flex;gap:10px;flex-wrap:wrap}.summary span{padding:9px;background:#eee;border-radius:4px}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{border:1px solid #ccc;padding:7px;vertical-align:top;text-align:left}.FIRST_PARTY{background:#ffd6d6}.THIRD_PARTY{background:#eee}.NEEDS_REVIEW{background:#fff1b8}</style></head><body><h1>${escapeHtml(report.siteLabel)} — Full Production Console Regression</h1><p>Status: <strong>${report.status}</strong>. Read-only main-menu, scrolling, responsive, and safe interaction evidence. Findings are QA candidates, not automatically confirmed defects.</p><div class="summary">${Object.entries(report.summary).map(([key, value]) => `<span><strong>${escapeHtml(key)}</strong>: ${value}</span>`).join('')}</div><h2>Coverage</h2><table><thead><tr><th>Viewport</th><th>Discovered</th><th>Tested</th><th>Loaded</th><th>Navigation failures</th><th>Scrolled</th><th>Interactions performed</th><th>Skipped</th><th>Failed</th></tr></thead><tbody>${viewportRows('Desktop', report.desktop)}${viewportRows('Mobile', report.mobile)}</tbody></table><h2>Discovery diagnostics</h2><table><thead><tr><th>Viewport</th><th>Status</th><th>Containers</th><th>Candidates</th><th>Accepted</th><th>Rejected</th><th>Rejection reasons</th><th>Errors</th></tr></thead><tbody>${diagnostics('Desktop', report.desktop)}${diagnostics('Mobile', report.mobile)}</tbody></table><h2>Main-menu destinations</h2><ul>${destinations}</ul><h2>Navigation failures</h2><ul>${failures}</ul><h2>Coverage gaps and skipped items</h2><ul>${gaps}</ul><h2>Full-page scrolling</h2><table><thead><tr><th>Viewport</th><th>Route</th><th>Status</th><th>Steps</th><th>Document height</th><th>Returned to top</th><th>Reason</th></tr></thead><tbody>${scrolls || '<tr><td colspan="7">No scroll records</td></tr>'}</tbody></table><h2>Interaction evidence</h2><table><thead><tr><th>Viewport</th><th>Route</th><th>Category</th><th>Action</th><th>Status</th><th>Outcome changed</th><th>Reason</th></tr></thead><tbody>${interactions || '<tr><td colspan="7">No interactions</td></tr>'}</tbody></table><h2>Deduplicated findings</h2><table><thead><tr><th>Classification</th><th>Type</th><th>Error/request</th><th>Source</th><th>Occurrences</th><th>Affected URLs</th><th>Contexts</th><th>Reproduction steps</th></tr></thead><tbody>${findings || '<tr><td colspan="8">No findings</td></tr>'}</tbody></table></body></html>`;
}

export async function runFullProductionConsoleScan(browser: Browser, site: ProductionConsoleSite, options: { maximumPages: number; maximumInteractions: number; outputDir: string; discoveryOnly?: boolean }): Promise<FullProductionReport> {
  const common = { developmentOrigin: site.origin, productionOrigin: '', settleMs: 2_000, interactionSettleMs: 750, maximumPages: options.maximumPages, maximumInteractions: options.discoveryOnly ? 0 : options.maximumInteractions, primaryEnvironment: 'PRODUCTION' as const, readOnly: true, publicOnly: true, fullPageScroll: !options.discoveryOnly, discoveryOnly: options.discoveryOnly, siteLabel: site.label, writeReports: false };
  const desktop = await runConsoleScan(browser, { ...common, viewport: { width: 1440, height: 900 }, navigationMode: 'desktop', outputDir: path.join(options.outputDir, 'desktop-evidence') });
  const mobile = await runConsoleScan(browser, { ...common, viewport: { width: 375, height: 812 }, navigationMode: 'mobile', outputDir: path.join(options.outputDir, 'mobile-evidence') });
  const routeLabels = new Map<string, Set<string>>();
  for (const page of [...desktop.discoveredPages, ...mobile.discoveredPages]) routeLabels.set(page.route, new Set([...(routeLabels.get(page.route) ?? []), page.label]));
  const findings = groupFullProductionFindings(desktop.rawFindings, mobile.rawFindings);
  const coverageGaps = [...desktop.discoverySkipped.map((item) => `Desktop: ${item}`), ...mobile.discoverySkipped.map((item) => `Mobile: ${item}`)];
  const status: FullProductionReport['status'] = desktop.discoveryComplete && mobile.discoveryComplete ? 'COMPLETE' : 'INCOMPLETE';
  const report: FullProductionReport = {
    generatedAt: new Date().toISOString(), target: site.target, siteLabel: site.label, origin: site.origin, readOnly: true, status, desktop, mobile,
    uniqueMenuDestinations: [...routeLabels.entries()].map(([route, labels]) => ({ route, labels: [...labels] })), coverageGaps, findings,
    summary: {
      uniqueMenuDestinations: routeLabels.size,
      discoveryCompleteDesktop: desktop.discoveryComplete ? 1 : 0,
      discoveryCompleteMobile: mobile.discoveryComplete ? 1 : 0,
      homepageCoveredDesktop: desktop.routes.includes('/') ? 1 : 0,
      homepageCoveredMobile: mobile.routes.includes('/') ? 1 : 0,
      desktopPagesTested: desktop.summary.pagesTested,
      mobilePagesTested: mobile.summary.pagesTested,
      pagesLoaded: desktop.summary.pagesLoaded + mobile.summary.pagesLoaded,
      navigationFailures: desktop.summary.navigationFailures + mobile.summary.navigationFailures,
      scrollsPerformed: desktop.summary.scrollsPerformed + mobile.summary.scrollsPerformed,
      interactionsPerformed: desktop.summary.interactionsPerformed + mobile.summary.interactionsPerformed,
      interactionsSkipped: desktop.summary.interactionsSkipped + mobile.summary.interactionsSkipped,
      interactionsFailed: desktop.summary.interactionsFailed + mobile.summary.interactionsFailed,
      FIRST_PARTY: findings.filter((finding) => finding.ownership === 'FIRST_PARTY').length,
      THIRD_PARTY: findings.filter((finding) => finding.ownership === 'THIRD_PARTY').length,
      NEEDS_REVIEW: findings.filter((finding) => finding.ownership === 'NEEDS_REVIEW').length,
      uniquePotentialApplicationDefects: findings.filter((finding) => finding.ownership === 'FIRST_PARTY').length,
      coverageGaps: coverageGaps.length,
    },
  };
  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(path.join(options.outputDir, 'results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(options.outputDir, 'report.html'), renderFullProductionHtml(report), 'utf8');
  return report;
}
