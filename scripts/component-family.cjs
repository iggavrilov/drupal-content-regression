const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const familyIndex = args.indexOf('--family');
const family = familyIndex >= 0 ? args[familyIndex + 1]?.trim() : '';
if (!family || !/^[a-z0-9_]+$/.test(family)) {
  console.error('Usage: npm run test:component-family -- --family <machine_name>');
  process.exit(1);
}

const cli = path.resolve(__dirname, '../node_modules/playwright/cli.js');
const run = spawnSync(process.execPath, [cli, 'test', 'tests/remaining-components-write.spec.ts', '--project=chromium', '--grep', '^add, publish, and verify the remaining supported components on exact QA node$'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, COMPONENT_ONLY: family },
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
