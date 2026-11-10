const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const help = `Console/network scanner (read-only)\n\nUsage: node scripts/console-scan.cjs [options]\n\nOptions:\n  --target <devv|stage|qtcm|benefits|benefits-stage|cms>\n  --fast                     Scan at most 4 discovered menu pages\n  --ui-demo                  Focus the homepage and require observable UI state change\n  --headed                   Show Chromium\n  --mobile                   Use the mobile browser/menu context\n  --route <path>             Scan one safe route\n  --max-pages <1-100>\n  --max-interactions <0-20>\n  --settle-ms <0-30000>\n  --interaction-settle-ms <0-10000>\n  --navigation-timeout-ms <5000-60000>\n  --network-idle-timeout-ms <0-10000>\n  --help                     Show this help\n`;
if (args.includes('--help') || args.includes('-h')) { console.log(help); process.exit(0); }
let scanTarget = 'devv';
let demo = false;
let uiDemo = false;
let headed = false;
let mobile = false;
let fast = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--target') {
    if (!['devv', 'stage', 'qtcm', 'benefits', 'benefits-stage', 'cms'].includes(args[index + 1])) { console.error('--target requires devv, stage, qtcm, benefits, benefits-stage, or cms'); process.exit(1); }
    scanTarget = args[index + 1]; index += 1;
  } else if (args[index] === '--route') {
    if (!args[index + 1]) { console.error('--route requires one of /, /about, /insights, /markets'); process.exit(1); }
    process.env.CONSOLE_SCAN_ROUTE = args[index + 1]; index += 1;
  } else if (args[index] === '--settle-ms') {
    if (!args[index + 1]) { console.error('--settle-ms requires a value'); process.exit(1); }
    process.env.CONSOLE_SCAN_SETTLE_MS = args[index + 1]; index += 1;
  } else if (args[index] === '--interaction-settle-ms') {
    if (!args[index + 1]) { console.error('--interaction-settle-ms requires a value'); process.exit(1); }
    process.env.CONSOLE_SCAN_INTERACTION_SETTLE_MS = args[index + 1]; index += 1;
  } else if (args[index] === '--max-pages') {
    if (!args[index + 1]) { console.error('--max-pages requires a value'); process.exit(1); }
    process.env.CONSOLE_SCAN_MAX_PAGES = args[index + 1]; index += 1;
  } else if (args[index] === '--max-interactions') {
    if (!args[index + 1]) { console.error('--max-interactions requires a value'); process.exit(1); }
    process.env.CONSOLE_SCAN_MAX_INTERACTIONS = args[index + 1]; index += 1;
  } else if (args[index] === '--navigation-timeout-ms') {
    if (!args[index + 1]) { console.error('--navigation-timeout-ms requires a value'); process.exit(1); }
    process.env.CONSOLE_SCAN_NAVIGATION_TIMEOUT_MS = args[index + 1]; index += 1;
  } else if (args[index] === '--network-idle-timeout-ms') {
    if (!args[index + 1]) { console.error('--network-idle-timeout-ms requires a value'); process.exit(1); }
    process.env.CONSOLE_SCAN_NETWORK_IDLE_TIMEOUT_MS = args[index + 1]; index += 1;
  } else if (args[index] === '--demo') {
    demo = true;
  } else if (args[index] === '--ui-demo') {
    uiDemo = true;
  } else if (args[index] === '--headed') {
    headed = true;
  } else if (args[index] === '--mobile') {
    mobile = true;
  } else if (args[index] === '--fast') {
    fast = true;
  } else { console.error(`Unknown console-scan option: ${args[index]}`); process.exit(1); }
}
if (demo && scanTarget !== 'devv') { console.error('--demo is available only for the Leidos DEVV PM profile.'); process.exit(1); }
const cli = path.resolve(__dirname, '../node_modules/playwright/cli.js');
const selection = scanTarget === 'stage'
  ? { DRUPAL_TARGET: 'leidos', DRUPAL_TIER: 'stage' }
  : scanTarget === 'benefits-stage'
    ? { DRUPAL_TARGET: 'benefits', DRUPAL_TIER: 'stage' }
  : scanTarget === 'devv'
    ? { DRUPAL_TARGET: 'leidos', DRUPAL_TIER: 'development' }
    : { DRUPAL_TARGET: scanTarget, DRUPAL_TIER: 'development' };
const demoSettings = demo ? {
  CONSOLE_SCAN_DEMO: 'true',
  CONSOLE_SCAN_MAX_PAGES: process.env.CONSOLE_SCAN_MAX_PAGES ?? '7',
  CONSOLE_SCAN_MAX_INTERACTIONS: process.env.CONSOLE_SCAN_MAX_INTERACTIONS ?? '3',
  CONSOLE_SCAN_COMPARE_PRODUCTION: process.env.CONSOLE_SCAN_COMPARE_PRODUCTION ?? 'false',
} : {};
const uiSettings = uiDemo ? {
  CONSOLE_SCAN_UI_DEMO: 'true', CONSOLE_SCAN_ROUTE: '/', CONSOLE_SCAN_MAX_PAGES: '1',
  CONSOLE_SCAN_MAX_INTERACTIONS: process.env.CONSOLE_SCAN_MAX_INTERACTIONS ?? '8', CONSOLE_SCAN_COMPARE_PRODUCTION: 'false',
} : {};
const fastSettings = fast ? {
  CONSOLE_SCAN_MAX_PAGES: process.env.CONSOLE_SCAN_MAX_PAGES ?? '4',
  CONSOLE_SCAN_MAX_INTERACTIONS: process.env.CONSOLE_SCAN_MAX_INTERACTIONS ?? '3',
  CONSOLE_SCAN_SETTLE_MS: process.env.CONSOLE_SCAN_SETTLE_MS ?? '1500',
  CONSOLE_SCAN_INTERACTION_SETTLE_MS: process.env.CONSOLE_SCAN_INTERACTION_SETTLE_MS ?? '750',
} : {};
const reportDir = path.resolve(__dirname, uiDemo ? `../artifacts/ui-interaction-demo/${scanTarget}` : demo ? '../artifacts/console-scan/demo' : fast ? `../artifacts/console-scan/${scanTarget}/fast` : scanTarget === 'devv' ? '../artifacts/console-scan' : `../artifacts/console-scan/${scanTarget}`);
const currentResults = path.join(reportDir, 'results.json');
if (fs.existsSync(currentResults)) {
  const generatedAt = JSON.parse(fs.readFileSync(currentResults, 'utf8')).generatedAt;
  const archiveName = String(generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const archiveDir = path.join(reportDir, 'history', archiveName);
  fs.mkdirSync(archiveDir, { recursive: true });
  for (const name of ['results.json', 'report.html', 'progress.json', 'screenshots']) {
    const source = path.join(reportDir, name);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(archiveDir, name), { recursive: true });
  }
}
const playwrightArgs = [cli, 'test', '--config=playwright.console-scan.config.ts'];
if (headed) playwrightArgs.push('--headed');
const startedAt = Date.now();
const run = spawnSync(process.execPath, playwrightArgs, { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...selection, ...demoSettings, ...uiSettings, ...fastSettings, CONSOLE_SCAN_TARGET: scanTarget, CONSOLE_SCAN_NAVIGATION_MODE: mobile ? 'mobile' : 'desktop', CONSOLE_SCAN_OUTPUT_DIR: reportDir }, stdio: 'inherit' });
if (run.status !== 0) process.exit(1);
const reportPath = path.join(reportDir, 'results.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
console.log(`SCAN_COMPLETE ${report.potentialRegressionCount > 0 ? 'FINDINGS' : 'PASS'} ${Date.now() - startedAt}ms ${report.developmentOrigin}`);
if (demo) {
  const summary = report.summary;
  console.log('Console Scanner — Leidos DEV');
  console.log(`Pages selected: ${summary.pagesDiscovered}`);
  console.log(`Pages tested: ${summary.pagesTested}`);
  console.log(`Pages loaded: ${summary.pagesLoaded}`);
  console.log(`Interactions performed: ${summary.interactionsPerformed}`);
  console.log(`Interaction failures: ${summary.interactionsFailed}`);
  console.log(`Raw findings: ${summary.totalFindings}`);
  console.log(`First-party candidates: ${(summary.DEVV_ONLY ?? 0) + (summary.NEEDS_REVIEW ?? 0)}`);
  console.log(`Third-party/noise: ${summary.THIRD_PARTY ?? 0}`);
  console.log('RESULT: COMPLETE');
}
process.exit(0);
