import path from 'node:path';
import { test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getEffectiveCredentials } from '../src/config/environments';
import { runBenefitsStageInsight } from '../src/content/benefits-stage-insight-workflow';

test.describe.configure({ mode: 'default', retries: 0 });
test.skip(!process.env.BENEFITS_STAGE_INSIGHTS_RUN, 'Explicit stable run ID required; never rerun an ambiguous create.');
for (const machine of ['insight', 'insight_external'] as const) {
  test('Benefits STAGE ' + machine + ' Draft, update and publication', async ({ page }) => {
    test.setTimeout(900_000);
    const run = process.env.BENEFITS_STAGE_INSIGHTS_RUN!;
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(run)) throw new Error('Invalid run ID.');
    const credentials = getEffectiveCredentials();
    await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword }, { verifyAuthoringAccess: true });
    await runBenefitsStageInsight(page, machine, path.resolve('artifacts/benefits-stage-insights', run, machine + '.json'));
  });
}
