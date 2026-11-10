const fs = require('node:fs');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

function safeArtifactPath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized.startsWith('artifacts/') || normalized.split('/').includes('..') || normalized.includes('\0')) return '';
  return `/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

function resolveServedPath(root, dashboardPath, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(String(urlPath).split('?')[0]); } catch { return null; }
  if (decoded === '/' || decoded === '/index.html') return dashboardPath;
  if (!decoded.startsWith('/artifacts/') || decoded.includes('\0') || decoded.split('/').includes('..')) return null;
  const artifactRoot = path.join(root, 'artifacts');
  const candidate = path.resolve(root, decoded.slice(1));
  return candidate.startsWith(`${artifactRoot}${path.sep}`) ? candidate : null;
}

function readArtifact(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(absolutePath)) return { available: false, relativePath };
  const stat = fs.statSync(absolutePath);
  try {
    return { available: true, relativePath, absolutePath, modifiedAt: stat.mtime.toISOString(), data: JSON.parse(fs.readFileSync(absolutePath, 'utf8')) };
  } catch (error) {
    return { available: false, relativePath, modifiedAt: stat.mtime.toISOString(), error: `Invalid JSON: ${error.message}` };
  }
}

function fileArtifact(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(absolutePath)) return { available: false, relativePath };
  const stat = fs.statSync(absolutePath);
  return { available: true, relativePath, absolutePath, modifiedAt: stat.mtime.toISOString(), size: stat.size };
}

function freshness(timestamp, now = new Date()) {
  if (!timestamp) return 'UNKNOWN';
  const age = now.getTime() - new Date(timestamp).getTime();
  if (!Number.isFinite(age)) return 'UNKNOWN';
  if (age < 0 || age <= DAY_MS) return 'FRESH';
  if (age <= 7 * DAY_MS) return 'RECENT';
  return 'STALE';
}

function normalizeScan(artifact, label, scope) {
  if (!artifact.available) return { label, scope, status: 'DATA UNAVAILABLE', artifact, data: null, summary: {}, records: [], interactions: [], findings: [] };
  const data = artifact.data;
  const records = Array.isArray(data.pageRecords) ? data.pageRecords : [];
  const interactions = Array.isArray(data.interactions) ? data.interactions : [];
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const summary = data.summary ?? {};
  const generatedAt = data.generatedAt || artifact.modifiedAt;
  return {
    label, scope, artifact, data, summary, records, interactions, findings, generatedAt,
    freshness: freshness(generatedAt),
    status: records.some((record) => record.result === 'ERROR' || record.result === 'TIMEOUT') ? 'FAIL'
      : findings.length > 0 || records.some((record) => record.result === 'FINDINGS') ? 'FINDINGS' : 'PASS',
    passedRoutes: records.filter((record) => record.result === 'PASS').length,
    findingRoutes: records.filter((record) => record.result === 'FINDINGS').length,
    timeouts: records.filter((record) => record.result === 'TIMEOUT').length,
    errors: records.filter((record) => record.result === 'ERROR').length,
  };
}

const SMOKE_CHECKS = [
  ['httpBasicAuthentication', 'HTTP Basic Authentication'],
  ['drupalLogin', 'Drupal login'],
  ['adminContentAccessibility', '/admin/content accessibility'],
];
const SMOKE_STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED', 'NOT VERIFIED']);

function normalizeSmoke(root, target, now) {
  const summary = readArtifact(root, `artifacts/smoke/${target}/summary.json`);
  const fallbackReport = fileArtifact(root, `artifacts/smoke/${target}/index.html`);
  const expectedUrl = target === 'leidos-stage' ? 'https://stage.leidos.com' : 'https://benefits-stage.leidos.com';
  if (!summary.available) return {
    target, environment: expectedUrl, report: fallbackReport,
    generatedAt: fallbackReport.modifiedAt, freshness: freshness(fallbackReport.modifiedAt, now),
    checks: SMOKE_CHECKS.map(([, name]) => ({ name, status: 'NOT VERIFIED', errors: [] })),
    status: fallbackReport.available ? 'NOT VERIFIED' : 'DATA UNAVAILABLE',
    note: fallbackReport.available ? 'The HTML report exists, but its structured smoke summary is missing or invalid.' : 'Smoke report is missing.',
    durationMs: 0, errors: summary.error ? [summary.error] : [],
  };
  const data = summary.data ?? {};
  const checks = SMOKE_CHECKS.map(([key, name]) => {
    const raw = data.checks?.[key];
    return {
      name,
      status: SMOKE_STATUSES.has(raw?.status) ? raw.status : 'NOT VERIFIED',
      errors: Array.isArray(raw?.errors) ? raw.errors.map(String) : [],
      durationMs: Number(raw?.durationMs ?? 0),
    };
  });
  const reportPath = typeof data.htmlReportPath === 'string' && safeArtifactPath(data.htmlReportPath)
    ? data.htmlReportPath : `artifacts/smoke/${target}/index.html`;
  const report = fileArtifact(root, reportPath);
  const targetMatches = data.targetUrl === expectedUrl;
  const recordedStatus = SMOKE_STATUSES.has(data.overallResult) ? data.overallResult : 'NOT VERIFIED';
  const generatedAt = typeof data.executedAt === 'string' ? data.executedAt : summary.modifiedAt;
  const artifactFreshness = freshness(generatedAt, now);
  const status = targetMatches && artifactFreshness !== 'STALE' ? recordedStatus : 'NOT VERIFIED';
  const errors = Array.isArray(data.errors) ? data.errors.map(String) : [];
  if (!targetMatches) errors.unshift('The structured result target does not match the expected environment.');
  if (artifactFreshness === 'STALE') errors.unshift('The structured result is historical and is not treated as a current PASS.');
  if (!report.available) errors.unshift('The linked Playwright HTML report is missing.');
  return {
    target, environment: expectedUrl, report, generatedAt, freshness: artifactFreshness,
    checks, status, durationMs: Number(data.durationMs ?? 0), errors,
    note: errors.length ? errors.join(' ') : `Structured smoke evidence recorded for ${data.environment || target}.`,
  };
}

function buildModel(root, now = new Date()) {
  const smoke = ['leidos-stage', 'benefits-stage'].map((target) => normalizeSmoke(root, target, now));

  const scans = [
    normalizeScan(readArtifact(root, 'artifacts/console-scan/stage/fast/results.json'), 'Leidos STAGE', 'FAST'),
    normalizeScan(readArtifact(root, 'artifacts/console-scan/stage/results.json'), 'Leidos STAGE', 'FULL'),
    normalizeScan(readArtifact(root, 'artifacts/console-scan/benefits-stage/fast/results.json'), 'Benefits STAGE', 'FAST'),
    normalizeScan(readArtifact(root, 'artifacts/console-scan/benefits-stage/results.json'), 'Benefits STAGE', 'FULL'),
  ];
  const ui = [
    normalizeScan(readArtifact(root, 'artifacts/ui-interaction-demo/stage/results.json'), 'Leidos STAGE', 'DESKTOP UI'),
    normalizeScan(readArtifact(root, 'artifacts/ui-interaction-demo/benefits-stage/results.json'), 'Benefits STAGE', 'DESKTOP UI'),
  ];
  const contentArtifact = readArtifact(root, 'artifacts/basic-page-demo/leidos-stage/latest/summary.json');
  const stateArtifact = readArtifact(root, 'artifacts/basic-page-demo/leidos-stage/latest/run-state.json');
  const content = contentArtifact.available ? {
    status: contentArtifact.data.status || 'NOT VERIFIED', data: contentArtifact.data, artifact: contentArtifact,
    state: stateArtifact.available ? stateArtifact.data : null,
    generatedAt: contentArtifact.modifiedAt, freshness: freshness(contentArtifact.modifiedAt, now),
  } : { status: 'DATA UNAVAILABLE', artifact: contentArtifact };

  const latestScans = scans.filter((scan) => scan.artifact.available && scan.scope === 'FAST');
  const uiPerformed = ui.reduce((sum, scan) => sum + scan.interactions.filter((item) => item.status === 'performed' && item.outcomeVerified).length, 0);
  const uiFailed = ui.reduce((sum, scan) => sum + scan.interactions.filter((item) => item.status === 'failed').length, 0);
  const uiSkipped = ui.reduce((sum, scan) => sum + scan.interactions.filter((item) => item.status === 'skipped').length, 0);
  const routePasses = latestScans.reduce((sum, scan) => sum + scan.passedRoutes, 0);
  const findings = latestScans.reduce((sum, scan) => sum + Number(scan.summary.NEEDS_REVIEW ?? scan.findings.length), 0) + uiFailed;
  const smokePasses = smoke.reduce((sum, item) => sum + item.checks.filter((check) => check.status === 'PASS').length, 0);
  const smokeFailures = smoke.reduce((sum, item) => sum + item.checks.filter((check) => check.status === 'FAIL').length, 0);
  const unavailable = smoke.reduce((sum, item) => sum + item.checks.filter((check) => check.status === 'NOT VERIFIED' || check.status === 'BLOCKED').length, 0);
  const contentPasses = content.status === 'PASS' ? 2 : 0;
  const completedStages = [smoke.every((item) => item.status !== 'DATA UNAVAILABLE' && item.status !== 'NOT VERIFIED'), latestScans.length > 0, ui.some((item) => item.artifact.available), contentArtifact.available, contentArtifact.available && content.data.publishing].filter(Boolean).length;
  const failedChecks = latestScans.reduce((sum, scan) => sum + scan.errors + scan.timeouts, 0) + uiFailed + smokeFailures + (content.status === 'FAIL' ? 1 : 0);
  const knownDurationMs = [...latestScans, ...ui.filter((item) => item.artifact.available)].reduce((sum, item) => sum + Number(item.summary.totalDurationMs ?? 0), 0) + smoke.reduce((sum, item) => sum + item.durationMs, 0);
  const overall = failedChecks > 0 ? 'FINDINGS' : unavailable > 0 ? 'NOT VERIFIED' : findings > 0 ? 'FINDINGS' : 'PASS';
  return {
    generatedAt: now.toISOString(), project: 'Drupal QA Automation — Leidos & Benefits',
    environments: ['Leidos STAGE', 'Benefits STAGE'], smoke, scans, ui, content,
    historicalContentReference: {
      nodeId: '25381',
      title: 'QA-AUTOMATED-QA Automated Demo - Basic Page - 20261110-115635-89e2',
      editUrl: 'https://stage.leidos.com/node/25381/edit',
      publicUrl: 'https://stage.leidos.com/content/qa-automated-qa-automated-demo-basic-page-20261110-115635-89e2',
      reportedHttpStatus: 200,
      status: 'NOT VERIFIED',
      note: 'Requested historical reference. Its original machine-readable artifact has been superseded by a newer latest run, so it is not counted as a current PASS.',
    },
    totals: { overall, completedStages, totalStages: 5, passedChecks: routePasses + uiPerformed + contentPasses + smokePasses, failedChecks, findings, skippedUnavailable: uiSkipped + unavailable, knownDurationMs },
  };
}

function badge(status) {
  const key = String(status ?? 'UNKNOWN').toLowerCase().replaceAll(' ', '-');
  return `<span class="badge ${escapeHtml(key)}">${escapeHtml(status)}</span>`;
}

function artifactLink(relativePath, label = 'Detailed report') {
  const href = safeArtifactPath(relativePath);
  return href ? `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : 'Unavailable';
}

function externalLink(url, label) {
  const href = safeHttpUrl(url);
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label ?? href)}</a>` : 'Unavailable';
}

function renderDashboard(model) {
  const scanRows = model.scans.map((scan) => scan.artifact.available ? `<tr><td>${escapeHtml(scan.label)}</td><td>${badge(scan.scope)}</td><td>${escapeHtml(scan.generatedAt)}</td><td>${badge(scan.freshness)}</td><td>${scan.summary.totalUniqueMenuPages ?? scan.summary.pagesDiscovered ?? 0}</td><td>${scan.summary.pagesTested ?? scan.records.length}</td><td>${scan.passedRoutes}</td><td>${scan.findingRoutes}</td><td>${scan.timeouts}</td><td>${scan.errors}</td><td>${Math.round(Number(scan.summary.totalDurationMs ?? 0) / 1000)}s</td><td>${badge(scan.status)}</td><td>${artifactLink(scan.artifact.relativePath.replace('results.json', 'report.html'))}</td></tr>` : `<tr><td>${escapeHtml(scan.label)}</td><td>${badge(scan.scope)}</td><td colspan="10">DATA UNAVAILABLE</td><td>Unavailable</td></tr>`).join('');
  const currentFindings = model.scans.filter((scan) => scan.scope === 'FAST' && scan.artifact.available).flatMap((scan) => scan.findings.map((finding) => ({ ...finding, site: scan.label })));
  const findingRows = currentFindings.map((finding) => {
    const raw = finding.raw ?? {};
    const pageUrl = finding.devvUrl || raw.pageUrl || raw.finalUrl || finding.route || '';
    const requestUrl = finding.requestUrl || finding.sourceUrl || raw.requestUrl || raw.sourceUrl || '';
    const status = raw.status ?? raw.httpStatus ?? '';
    return `<tr><td>${escapeHtml(finding.site)}</td><td>${externalLink(pageUrl, pageUrl)}</td><td>${escapeHtml(finding.type)}</td><td>${escapeHtml(status)}</td><td class="wrap">${externalLink(requestUrl, requestUrl)}</td><td>${badge(finding.classification || finding.ownership || 'NEEDS_REVIEW')}</td><td class="wrap">${escapeHtml(finding.message)}</td></tr>`;
  }).join('');
  const routeLists = model.scans.filter((scan) => scan.scope === 'FAST' && scan.artifact.available).map((scan) => `<details><summary>${escapeHtml(scan.label)} ${escapeHtml(scan.scope)} — ${scan.records.length} visited URLs</summary><ul>${scan.records.map((record) => `<li>${badge(record.result)} ${externalLink(record.finalUrl || record.requestedUrl, record.finalUrl || record.requestedUrl)}</li>`).join('')}</ul></details>`).join('');
  const redirects = model.scans.filter((scan) => scan.artifact.available).flatMap((scan) => scan.records.filter((record) => record.requestedUrl && record.finalUrl && record.requestedUrl !== record.finalUrl).map((record) => ({ site: scan.label, scope: scan.scope, ...record })));
  const redirectRows = redirects.map((record) => `<tr><td>${escapeHtml(record.site)}</td><td>${badge(record.scope)}</td><td>${externalLink(record.requestedUrl, record.requestedUrl)}</td><td>${externalLink(record.finalUrl, record.finalUrl)}</td><td>${badge(record.result)}</td></tr>`).join('');
  const uiRows = model.ui.flatMap((scan) => scan.interactions.filter((item) => item.status !== 'skipped').map((item) => {
    const component = item.category || String(item.actionKey || '').split('|')[0] || 'Unknown';
    return `<tr><td>${escapeHtml(scan.label)}</td><td>Desktop</td><td>${externalLink(item.pageUrl, item.pageUrl)}</td><td>${escapeHtml(component)}</td><td>${escapeHtml(item.action)}</td><td>Observable UI state change</td><td>${escapeHtml(item.outcomeVerified ? 'State changed' : item.reason || 'No verified change')}</td><td>${badge(item.status === 'performed' && item.outcomeVerified ? 'PASS' : 'FAIL')}</td><td class="wrap">${escapeHtml(item.reason || '')}</td></tr>`;
  })).join('');
  const uiScreens = model.ui.flatMap((scan) => (scan.data?.screenshots ?? []).map((shot) => {
    const base = scan.artifact.relativePath.replace('/results.json', '');
    const rel = `${base}/${shot}`;
    return `<a class="thumb" href="${safeArtifactPath(rel)}" target="_blank" rel="noopener"><img src="${safeArtifactPath(rel)}" alt="${escapeHtml(scan.label)} interaction evidence"><span>${escapeHtml(scan.label)} — ${escapeHtml(path.basename(shot))}</span></a>`;
  })).join('');
  const content = model.content;
  const d = content.data ?? {};
  const historical = model.historicalContentReference;
  const evidence = ['created.png', 'components-saved.png', 'published.png', 'frontend-verified.png'].map((name) => {
    const rel = `artifacts/basic-page-demo/leidos-stage/latest/${name}`;
    return `<a class="thumb" href="${safeArtifactPath(rel)}" target="_blank" rel="noopener"><img src="${safeArtifactPath(rel)}" alt="${escapeHtml(name)}"><span>${escapeHtml(name)}</span></a>`;
  }).join('');
  const smokeCards = model.smoke.map((item) => `<article class="card"><h3>${escapeHtml(item.target)}</h3><p>${externalLink(item.environment, item.environment)}</p><p>Result: ${badge(item.status)} · ${badge(item.freshness)}</p><p>Executed: ${escapeHtml(item.generatedAt || 'Unavailable')} · ${Math.round(item.durationMs / 1000)}s</p><ul>${item.checks.map((check) => `<li>${badge(check.status)} ${escapeHtml(check.name)}${check.errors.length ? `<div class="note">${escapeHtml(check.errors.join(' '))}</div>` : ''}</li>`).join('')}</ul><p class="note">${escapeHtml(item.note)}</p>${item.report.available ? artifactLink(item.report.relativePath, 'Open Playwright smoke report') : 'Detailed report unavailable'}</article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drupal QA Automation — PM Demo Report</title><style>
  :root{--ink:#18212f;--muted:#667085;--purple:#572c82;--bg:#f5f7fb;--card:#fff;--line:#d9deea;--pass:#147a42;--fail:#b42318;--find:#a15c00}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,Segoe UI,Arial,sans-serif}header{background:linear-gradient(120deg,#35145f,#7d3094);color:#fff;padding:34px max(24px,calc((100% - 1400px)/2))}header h1{margin:0 0 8px;font-size:32px}header p{margin:4px 0;color:#eee}.shell{max-width:1400px;margin:auto;padding:24px}.metrics,.cards,.gallery{display:grid;gap:14px}.metrics{grid-template-columns:repeat(7,minmax(120px,1fr))}.metric,.card,section{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 3px 12px #14213d0d}.metric{padding:16px}.metric strong{display:block;font-size:26px}.metric span{color:var(--muted)}section{margin:20px 0;padding:22px}h2{color:var(--purple);margin-top:0}.cards{grid-template-columns:repeat(auto-fit,minmax(290px,1fr))}.card{padding:16px}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e8ebf2;font-size:12px;font-weight:700}.pass,.fresh,.performed{background:#dcfae6;color:var(--pass)}.fail,.data-unavailable{background:#fee4e2;color:var(--fail)}.findings,.needs_review,.not-verified,.recent,.stale{background:#fff1c2;color:var(--find)}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:9px;text-align:left;vertical-align:top}th{background:#f0edf6;position:sticky;top:0}.table-wrap{overflow:auto;max-height:620px}.wrap{min-width:260px;overflow-wrap:anywhere}.gallery{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.thumb{display:block;color:var(--ink);text-decoration:none;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}.thumb img{display:block;width:100%;height:150px;object-fit:cover}.thumb span{display:block;padding:8px}.note{color:var(--muted)}a{color:#5c2d91}details{margin:8px 0}footer{color:var(--muted);padding:12px 0 40px}@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}}
  </style></head><body><header><h1>Drupal QA Automation — PM Demo Report</h1><p>${escapeHtml(model.project)}</p><p>Generated ${escapeHtml(model.generatedAt)} · Each section retains its own execution timestamp and scope.</p></header><main class="shell">
  <div class="metrics"><div class="metric"><strong>${badge(model.totals.overall)}</strong><span>Overall</span></div><div class="metric"><strong>${model.totals.completedStages}/${model.totals.totalStages}</strong><span>Completed stages</span></div><div class="metric"><strong>${model.totals.passedChecks}</strong><span>Passed checks</span></div><div class="metric"><strong>${model.totals.failedChecks}</strong><span>Failed checks</span></div><div class="metric"><strong>${model.totals.findings}</strong><span>Review findings</span></div><div class="metric"><strong>${model.totals.skippedUnavailable}</strong><span>Skipped/unavailable</span></div><div class="metric"><strong>${Math.round(model.totals.knownDurationMs / 1000)}s</strong><span>Known artifact duration</span></div></div>
  <section id="authentication"><h2>1. Authentication Smoke</h2><div class="cards">${smokeCards}</div></section>
  <section id="console"><h2>2. Console &amp; Network Scan</h2><p class="note">FAST and FULL artifacts are displayed independently. Counts are never merged into fictional coverage.</p><div class="table-wrap"><table><thead><tr><th>Environment</th><th>Scope</th><th>Executed</th><th>Freshness</th><th>Discovered</th><th>Scanned</th><th>Passed</th><th>With findings</th><th>Timeouts</th><th>Errors</th><th>Duration</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${scanRows}</tbody></table></div><h3>Latest FAST findings</h3>${findingRows ? `<div class="table-wrap"><table><thead><tr><th>Site</th><th>Page URL</th><th>Error type</th><th>HTTP</th><th>Request URL</th><th>Classification</th><th>Message</th></tr></thead><tbody>${findingRows}</tbody></table></div>` : '<p>No JavaScript or network errors detected in the scanned pages.</p>'}<h3>Observed redirects across FAST and FULL artifacts</h3>${redirectRows ? `<div class="table-wrap"><table><thead><tr><th>Site</th><th>Scope</th><th>Requested</th><th>Final</th><th>Result</th></tr></thead><tbody>${redirectRows}</tbody></table></div>` : '<p>No redirects recorded.</p>'}<h3>Visited URLs</h3>${routeLists}</section>
  <section id="ui"><h2>3. UI Automation</h2><div class="table-wrap"><table><thead><tr><th>Target</th><th>Viewport</th><th>Page</th><th>Component</th><th>Action</th><th>Expected</th><th>Observed</th><th>Result</th><th>Failure reason</th></tr></thead><tbody>${uiRows || '<tr><td colspan="9">DATA UNAVAILABLE</td></tr>'}</tbody></table></div><h3>Interaction evidence</h3><div class="gallery">${uiScreens || '<p>No interaction screenshots available.</p>'}</div></section>
  <section id="content"><h2>4. Drupal Content Creation</h2>${content.artifact.available ? `<div class="cards"><article class="card"><h3>Latest machine-readable artifact</h3><p>${badge(content.status)} ${badge(content.freshness)}</p><dl><dt>Environment</dt><dd>${externalLink(d.environment, d.environment)}</dd><dt>Content type</dt><dd>Basic Page</dd><dt>Node ID</dt><dd>${escapeHtml(d.nodeId)}</dd><dt>Title</dt><dd>${escapeHtml(d.title)}</dd><dt>Artifact timestamp</dt><dd>${escapeHtml(content.generatedAt)}</dd><dt>Paragraphs</dt><dd>${escapeHtml((d.components ?? []).join(', '))}</dd><dt>Creation</dt><dd>${escapeHtml(d.status)}</dd><dt>Persistence</dt><dd>${d.frontendVerification === 'PASS' ? 'PASS' : 'NOT VERIFIED'}</dd><dt>Admin</dt><dd>${externalLink(d.editUrl, d.editUrl)}</dd></dl></article><article class="card"><h3>Historical reference requested for the PM demo</h3><p>${badge(historical.status)}</p><dl><dt>Node ID</dt><dd>${escapeHtml(historical.nodeId)}</dd><dt>Title</dt><dd>${escapeHtml(historical.title)}</dd><dt>Admin</dt><dd>${externalLink(historical.editUrl, historical.editUrl)}</dd></dl><p class="note">${escapeHtml(historical.note)}</p></article></div><h3>Latest-run screenshot evidence</h3><div class="gallery">${evidence}</div>` : '<p>DATA UNAVAILABLE</p>'}</section>
  <section id="publishing"><h2>5. Publishing &amp; Anonymous Frontend Verification</h2>${content.artifact.available ? `<div class="cards"><article class="card"><h3>Latest machine-readable artifact</h3><p>${badge(d.publishing === 'Published' ? 'PASS' : 'FAIL')}</p><dl><dt>Workflow</dt><dd>Draft → In review → Reviewed and approved → Published</dd><dt>Final status</dt><dd>${escapeHtml(d.publishing)}</dd><dt>Published page</dt><dd>${externalLink(d.publicUrl, d.publicUrl)}</dd><dt>HTTP status</dt><dd>${d.publicHttpStatus ?? 'NOT RECORDED'}</dd><dt>Anonymous frontend</dt><dd>${escapeHtml(d.frontendVerification)}</dd><dt>Title verification</dt><dd>${d.frontendVerification === 'PASS' ? 'PASS' : 'NOT VERIFIED'}</dd><dt>Component verification</dt><dd>${d.frontendVerification === 'PASS' ? 'PASS' : 'NOT VERIFIED'}</dd><dt>JavaScript errors</dt><dd>${Array.isArray(d.publicPageErrors) ? d.publicPageErrors.length : 'NOT VERIFIED'}</dd><dt>Failed first-party requests</dt><dd>${Array.isArray(d.failedPublicFirstPartyRequests) ? d.failedPublicFirstPartyRequests.length : 'NOT VERIFIED'}</dd></dl>${artifactLink('artifacts/basic-page-demo/leidos-stage/report/index.html', 'Open detailed Playwright report')}</article><article class="card"><h3>Historical reference requested for the PM demo</h3><p>${badge(historical.status)}</p><dl><dt>Published page</dt><dd>${externalLink(historical.publicUrl, historical.publicUrl)}</dd><dt>Reported HTTP status</dt><dd>${escapeHtml(historical.reportedHttpStatus)} (task reference)</dd></dl><p class="note">${escapeHtml(historical.note)}</p></article></div><h3>Latest-run screenshot evidence</h3><div class="gallery">${evidence}</div>` : '<p>DATA UNAVAILABLE</p>'}</section>
  <footer>Dashboard data is read from existing local artifacts. Historical and latest evidence retain separate timestamps; report generation does not execute Drupal tests.</footer></main></body></html>`;
}

function buildDashboard(root, outputPath, now = new Date()) {
  const model = buildModel(root, now);
  const html = renderDashboard(model);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  return { model, html, outputPath };
}

module.exports = { escapeHtml, safeHttpUrl, safeArtifactPath, resolveServedPath, freshness, readArtifact, normalizeSmoke, buildModel, renderDashboard, buildDashboard };
