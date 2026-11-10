const fs = require('node:fs');
const path = require('node:path');

const CHECKS = new Map([
  ['HTTP Basic Authentication layer is accessible', 'httpBasicAuthentication'],
  ['Drupal user can authenticate', 'drupalLogin'],
  ['authenticated user can access Drupal content administration', 'adminContentAccessibility'],
]);

function sanitize(message) {
  return String(message || '')
    .replace(/(authorization|cookie|set-cookie|password|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[REDACTED]@');
}

function resultStatus(result) {
  if (result.status === 'passed') return 'PASS';
  if (result.status === 'skipped' || result.status === 'interrupted') return 'BLOCKED';
  return 'FAIL';
}

class SmokeJsonReporter {
  constructor() {
    this.startedAt = new Date();
    this.results = new Map();
  }

  onTestEnd(test, result) {
    const key = CHECKS.get(test.title);
    if (!key) return;
    const messages = (result.errors || []).map((error) => sanitize(error.message || error.value)).filter(Boolean);
    this.results.set(key, { status: resultStatus(result), errors: messages, durationMs: result.duration });
  }

  onEnd(runResult) {
    const output = process.env.SMOKE_JSON_OUTPUT_PATH;
    if (!output) return;
    const missing = { status: 'NOT VERIFIED', errors: ['The check did not execute.'], durationMs: 0 };
    const checks = {
      httpBasicAuthentication: this.results.get('httpBasicAuthentication') || missing,
      drupalLogin: this.results.get('drupalLogin') || missing,
      adminContentAccessibility: this.results.get('adminContentAccessibility') || missing,
    };
    const statuses = Object.values(checks).map((check) => check.status);
    const overallResult = statuses.includes('FAIL') ? 'FAIL'
      : statuses.includes('BLOCKED') ? 'BLOCKED'
        : statuses.includes('NOT VERIFIED') ? 'NOT VERIFIED'
          : runResult.status === 'passed' ? 'PASS' : 'FAIL';
    const summary = {
      schemaVersion: 1,
      environment: process.env.SMOKE_ENVIRONMENT_NAME || 'Unknown',
      targetUrl: process.env.SMOKE_TARGET_ORIGIN || '',
      executedAt: this.startedAt.toISOString(),
      overallResult,
      checks,
      errors: Object.values(checks).flatMap((check) => check.errors),
      durationMs: Date.now() - this.startedAt.getTime(),
      htmlReportPath: process.env.SMOKE_HTML_REPORT_PATH || '',
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
}

module.exports = SmokeJsonReporter;
module.exports.sanitize = sanitize;
