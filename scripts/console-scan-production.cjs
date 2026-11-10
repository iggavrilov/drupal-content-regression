const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const definitions = [
  { target: 'leidos', variable: 'DRUPAL_PROD_LEIDOS_URL', hostname: 'www.leidos.com' },
  { target: 'qtcm', variable: 'DRUPAL_PROD_QTCM_URL', hostname: 'www.qtcm.com' },
  { target: 'benefits', variable: 'DRUPAL_PROD_BENEFITS_URL', hostname: 'benefits.leidos.com' },
];

function validateOrigin({ variable, hostname }) {
  const value = process.env[variable]?.trim();
  if (!value) throw new Error(`${variable} is required for the Production console scan.`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${variable} must be a valid absolute URL.`); }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== hostname || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${variable} must be the exact approved HTTPS root for ${hostname}, without credentials, port, path, query, or fragment.`);
  }
  return parsed.origin;
}

const args = process.argv.slice(2);
let maximumPages = '25';
let maximumInteractions = '4';
let validateOnly = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--validate-only') { validateOnly = true; continue; }
  if (args[index] === '--max-pages' && args[index + 1]) { maximumPages = args[++index]; continue; }
  if (args[index] === '--max-interactions' && args[index + 1]) { maximumInteractions = args[++index]; continue; }
  console.error(`Unknown or incomplete production console-scan option: ${args[index]}`);
  process.exit(1);
}
if (!/^\d+$/.test(maximumPages) || Number(maximumPages) < 1 || Number(maximumPages) > 50) { console.error('--max-pages must be an integer between 1 and 50.'); process.exit(1); }
if (!/^\d+$/.test(maximumInteractions) || Number(maximumInteractions) < 0 || Number(maximumInteractions) > 8) { console.error('--max-interactions must be an integer between 0 and 8.'); process.exit(1); }

try { for (const definition of definitions) validateOrigin(definition); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
if (validateOnly) { console.log('Production console origins: VALID'); process.exit(0); }

const cli = path.resolve(__dirname, '../node_modules/playwright/cli.js');
const root = path.resolve(__dirname, '..');
const summaries = [];
let technicalFailure = false;
let possibleFindings = false;
let incompleteDiscovery = false;

for (const definition of definitions) {
  const run = spawnSync(process.execPath, [cli, 'test', '--config=playwright.console-scan-production.config.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PRODUCTION_CONSOLE_TARGET: definition.target,
      CONSOLE_SCAN_MAX_PAGES: maximumPages,
      CONSOLE_SCAN_MAX_INTERACTIONS: maximumInteractions,
    },
    stdio: 'inherit',
  });
  const reportPath = path.join(root, 'artifacts', 'console-scan', 'production', definition.target, 'results.json');
  if (run.status !== 0 || !fs.existsSync(reportPath)) {
    technicalFailure = true;
    summaries.push({ target: definition.target, status: 'FAILED', pages: 0, findings: 0 });
    continue;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  incompleteDiscovery ||= report.discoveryComplete === false;
  possibleFindings ||= report.potentialRegressionCount > 0;
  summaries.push({ target: definition.target, status: report.discoveryComplete === false ? 'INCOMPLETE' : 'COMPLETE', discovered: report.summary.totalUniqueMenuPages, pages: report.summary.pagesTested, loaded: report.summary.pagesLoaded, navigationContainersFound: report.summary.navigationContainersFound, candidateLinksDetected: report.summary.candidateLinksDetected, internalLinksAccepted: report.summary.internalLinksAccepted, linksRejected: report.summary.linksRejected, discoveryErrors: report.summary.discoveryErrors, findings: report.summary.totalFindings, possibleApplicationDefects: report.potentialRegressionCount });
}

console.log('PRODUCTION_CONSOLE_SCAN_SUMMARY');
for (const summary of summaries) console.log(JSON.stringify(summary));
process.exit(technicalFailure ? 1 : incompleteDiscovery ? 3 : possibleFindings ? 2 : 0);
