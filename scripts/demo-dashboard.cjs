const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { buildDashboard, resolveServedPath } = require('../src/demo-dashboard/report.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/demo-dashboard/index.html');
const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const host = 'localhost';
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : 9323;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Dashboard port must be an integer between 1024 and 65535.');

const built = buildDashboard(root, output);
console.log(`Dashboard generated: ${output}`);
console.log(`Status: ${built.model.totals.overall}; completed stages: ${built.model.totals.completedStages}/${built.model.totals.totalStages}`);
if (buildOnly) process.exit(0);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.css', 'text/css; charset=utf-8'],
]);

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method Not Allowed'); return;
  }
  const file = resolveServedPath(root, output, request.url || '/');
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); response.end('Not Found'); return;
  }
  const isDashboard = file === output;
  const isArtifactHtml = !isDashboard && path.extname(file).toLowerCase() === '.html';
  const contentSecurityPolicy = isArtifactHtml
    ? "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' data: blob:; worker-src 'self' blob:; connect-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    : "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': file === output ? 'no-store' : 'private, max-age=60',
    'Content-Security-Policy': contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).pipe(response);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${port} is already in use. Stop the existing report server before starting this dashboard.`);
  else console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`Drupal QA PM dashboard: http://localhost:${port}`);
  console.log('Press Ctrl+C to stop. Refresh rebuilds only when npm run demo:dashboard:build is run.');
});
