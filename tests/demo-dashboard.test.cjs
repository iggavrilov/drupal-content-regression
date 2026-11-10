const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  escapeHtml, safeHttpUrl, safeArtifactPath, resolveServedPath, freshness,
  buildModel, renderDashboard, normalizeSmoke,
} = require('../src/demo-dashboard/report.cjs');
const { sanitize } = require('../src/reporting/smoke-json-reporter.cjs');

function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'demo-dashboard-')); }
function writeJson(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
}

test('HTML escaping prevents artifact data from injecting markup', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('URL and artifact path safety reject unsafe schemes and traversal', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('https://stage.leidos.com/node/1'), 'https://stage.leidos.com/node/1');
  assert.equal(safeArtifactPath('../.env'), '');
  assert.equal(safeArtifactPath('artifacts/demo/report.html'), '/artifacts/demo/report.html');
  const root = tempRoot();
  const dashboard = path.join(root, 'artifacts/demo-dashboard/index.html');
  assert.equal(resolveServedPath(root, dashboard, '/../../.env'), null);
  assert.equal(resolveServedPath(root, dashboard, '/.env'), null);
  assert.equal(resolveServedPath(root, dashboard, '/'), dashboard);
});

test('missing artifacts render DATA UNAVAILABLE and NOT VERIFIED without invented passes', () => {
  const model = buildModel(tempRoot(), new Date('2026-11-10T12:00:00Z'));
  const html = renderDashboard(model);
  assert.equal(model.totals.passedChecks, 0);
  assert.match(html, /DATA UNAVAILABLE/);
  assert.match(html, /NOT VERIFIED/);
});

test('freshness identifies stale historical evidence', () => {
  assert.equal(freshness('2026-10-01T00:00:00Z', new Date('2026-11-10T00:00:00Z')), 'STALE');
  assert.equal(freshness('2026-11-10T00:00:00Z', new Date('2026-11-10T12:00:00Z')), 'FRESH');
});

test('failed UI interaction remains visible and contributes a failed check', () => {
  const root = tempRoot();
  writeJson(root, 'artifacts/ui-interaction-demo/stage/results.json', {
    generatedAt: '2026-11-10T10:00:00Z', summary: {}, pageRecords: [{ result: 'FINDINGS' }], findings: [],
    interactions: [{ status: 'failed', category: 'video', action: '<Video click>', reason: 'Overlay intercepted <button>', pageUrl: 'https://stage.leidos.com/' }], screenshots: [],
  });
  const model = buildModel(root, new Date('2026-11-10T12:00:00Z'));
  const html = renderDashboard(model);
  assert.equal(model.totals.failedChecks, 1);
  assert.match(html, /Overlay intercepted &lt;button&gt;/);
  assert.doesNotMatch(html, /<Video click>/);
  assert.match(html, /FAIL/);
});

test('structured smoke results populate individual authentication checks', () => {
  const root = tempRoot();
  writeJson(root, 'artifacts/smoke/leidos-stage/summary.json', {
    schemaVersion: 1, environment: 'leidos stage', targetUrl: 'https://stage.leidos.com',
    executedAt: '2026-11-10T10:00:00Z', overallResult: 'PASS', durationMs: 1200,
    htmlReportPath: 'artifacts/smoke/leidos-stage/index.html', errors: [],
    checks: {
      httpBasicAuthentication: { status: 'PASS', errors: [], durationMs: 200 },
      drupalLogin: { status: 'PASS', errors: [], durationMs: 500 },
      adminContentAccessibility: { status: 'PASS', errors: [], durationMs: 500 },
    },
  });
  const report = path.join(root, 'artifacts/smoke/leidos-stage/index.html');
  fs.writeFileSync(report, '<html></html>', 'utf8');
  const smoke = normalizeSmoke(root, 'leidos-stage', new Date('2026-11-10T12:00:00Z'));
  assert.equal(smoke.status, 'PASS');
  assert.deepEqual(smoke.checks.map((check) => check.status), ['PASS', 'PASS', 'PASS']);
  assert.equal(smoke.report.available, true);
});

test('wrong-target or incomplete smoke data is never promoted to PASS', () => {
  const root = tempRoot();
  writeJson(root, 'artifacts/smoke/benefits-stage/summary.json', {
    targetUrl: 'https://stage.leidos.com', overallResult: 'PASS', checks: {
      httpBasicAuthentication: { status: 'PASS' }, drupalLogin: { status: 'PASS' },
    },
  });
  const smoke = normalizeSmoke(root, 'benefits-stage', new Date('2026-11-10T12:00:00Z'));
  assert.equal(smoke.status, 'NOT VERIFIED');
  assert.equal(smoke.checks[2].status, 'NOT VERIFIED');
  assert.match(smoke.note, /target does not match/);
});

test('stale successful smoke evidence is historical, not a current overall PASS', () => {
  const root = tempRoot();
  writeJson(root, 'artifacts/smoke/leidos-stage/summary.json', {
    targetUrl: 'https://stage.leidos.com', executedAt: '2026-10-01T00:00:00Z', overallResult: 'PASS',
    checks: {
      httpBasicAuthentication: { status: 'PASS' }, drupalLogin: { status: 'PASS' },
      adminContentAccessibility: { status: 'PASS' },
    },
  });
  const smoke = normalizeSmoke(root, 'leidos-stage', new Date('2026-11-10T12:00:00Z'));
  assert.equal(smoke.freshness, 'STALE');
  assert.equal(smoke.status, 'NOT VERIFIED');
  assert.match(smoke.note, /historical/);
});

test('smoke reporter redacts common secret-bearing error text', () => {
  const output = sanitize('Authorization: abc Cookie=session Password=hunter2 https://user:pass@example.test');
  assert.doesNotMatch(output, /abc|session|hunter2|user:pass/);
  assert.match(output, /REDACTED/);
});
