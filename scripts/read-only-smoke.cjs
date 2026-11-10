const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const supported = new Map([
  ['leidos:development', 'https://devv.leidos.com'],
  ['leidos:stage', 'https://stage.leidos.com'],
  ['benefits:development', 'https://benefits-dev.leidos.com'],
  ['benefits:stage', 'https://benefits-stage.leidos.com'],
]);

const [target, tier] = process.argv.slice(2);
const key = `${target ?? ''}:${tier ?? ''}`;
const origin = supported.get(key);

if (!origin) {
  console.error('Unsupported read-only smoke target. Use one of the documented smoke:* npm commands.');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const environment = tier === 'stage' ? 'staging' : 'develop';
const reportDir = path.join(root, 'artifacts', 'smoke', `${target}-${tier}`);
const reportIndex = path.join(reportDir, 'index.html');
const summaryPath = path.join(reportDir, 'summary.json');
if (fs.existsSync(reportIndex)) {
  const archiveDir = path.join(reportDir, 'history', new Date(fs.statSync(reportIndex).mtimeMs).toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(archiveDir, { recursive: true });
  for (const entry of fs.readdirSync(reportDir, { withFileTypes: true })) {
    if (entry.name === 'history') continue;
    fs.cpSync(path.join(reportDir, entry.name), path.join(archiveDir, entry.name), { recursive: true });
  }
}

console.log(`Read-only Drupal smoke: ${target} ${tier} (${origin})`);
const run = spawnSync(
  process.execPath,
  [
    cli,
    'test',
    'tests/basic-auth-smoke.spec.ts',
    'tests/authentication.spec.ts',
    'tests/admin-content-smoke.spec.ts',
    '--project=chromium',
    '--workers=1',
    '--retries=0',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      DRUPAL_TARGET: target,
      DRUPAL_TIER: tier,
      DRUPAL_ENVIRONMENT: environment,
      DRUPAL_ALLOW_PUBLISH: 'false',
      PLAYWRIGHT_HTML_OUTPUT_DIR: reportDir,
      PLAYWRIGHT_HTML_OPEN: 'never',
      SMOKE_JSON_OUTPUT_PATH: summaryPath,
      SMOKE_HTML_REPORT_PATH: path.relative(root, reportIndex).replaceAll('\\', '/'),
      SMOKE_TARGET_ORIGIN: origin,
      SMOKE_ENVIRONMENT_NAME: `${target} ${tier}`,
    },
    stdio: 'inherit',
  },
);

if (run.error) {
  console.error(`Could not start Playwright: ${run.error.message}`);
  process.exit(1);
}

if (!fs.existsSync(summaryPath)) {
  const fallback = {
    schemaVersion: 1, environment: `${target} ${tier}`, targetUrl: origin,
    executedAt: new Date().toISOString(), overallResult: 'BLOCKED',
    checks: {
      httpBasicAuthentication: { status: 'NOT VERIFIED', errors: ['Smoke execution did not produce a check result.'], durationMs: 0 },
      drupalLogin: { status: 'NOT VERIFIED', errors: ['Smoke execution did not produce a check result.'], durationMs: 0 },
      adminContentAccessibility: { status: 'NOT VERIFIED', errors: ['Smoke execution did not produce a check result.'], durationMs: 0 },
    },
    errors: ['Playwright did not generate the structured smoke summary.'], durationMs: 0,
    htmlReportPath: path.relative(root, reportIndex).replaceAll('\\', '/'),
  };
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
}

if (run.status === 0 && !fs.existsSync(reportIndex)) {
  console.error(`Smoke passed but its HTML report was not generated at ${reportIndex}`);
  process.exit(1);
}
if (run.status === 0) {
  console.log(`Smoke HTML report: ${reportIndex}`);
  console.log(`Smoke JSON summary: ${summaryPath}`);
}

process.exit(run.status ?? 1);
