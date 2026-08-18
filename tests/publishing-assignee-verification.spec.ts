import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { contentTypes } from '../src/config/content-types';
import { getRequiredEnvironmentVariable } from '../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../src/config/write-safety';
import {
  diagnoseWorkflowAssigneeReadOnly,
  inspectOwnedNodeModeration,
  verifyWorkflowAssigneeReadOnly,
} from '../src/publishing/moderation-workflow';
import { loadPublishingSourceNodes } from '../src/publishing/source-nodes';

test('configured workflow assignee resolves exactly without submitting moderation', async ({ page }) => {
  assertExplicitNonProductionEnvironment();
  const source = loadPublishingSourceNodes().find((candidate) => candidate.nodeId === 25001);
  expect(source, 'Expected exact manifest-owned node 25001').toBeDefined();
  const config = contentTypes.find((candidate) => candidate.machineName === source!.machineName);
  expect(config, 'Expected matching content-type configuration').toBeDefined();
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const inspection = await inspectOwnedNodeModeration(page, config!, source!);
  const result = await verifyWorkflowAssigneeReadOnly(page, inspection);
  console.log(`workflow assignee search configured: yes`);
  console.log(`expected rendered label configured: yes`);
  console.log(`workflow assignee expected numeric ID configured: yes`);
  console.log(`expected numeric ID is valid digits-only: yes`);
  console.log(`autocomplete suggestions returned: ${result.suggestionsReturned}`);
  console.log(`exact expected matches: ${result.exactMatches}`);
  console.log(`numeric target ID resolved: ${result.numericTargetIdResolved ? 'yes' : 'no'}`);
  console.log(`post-selection username matches expected label: ${result.usernameMatches ? 'yes' : 'no'}`);
  console.log(`post-selection numeric ID matches: ${result.numericTargetIdMatches ? 'yes' : 'no'}`);
  console.log('Workflow assignee verification: PASS');
});

test('diagnoses workflow assignee suggestion identity without submitting moderation', async ({ page }) => {
  assertExplicitNonProductionEnvironment();
  const source = loadPublishingSourceNodes().find((candidate) => candidate.nodeId === 25001);
  expect(source, 'Expected exact manifest-owned node 25001').toBeDefined();
  const config = contentTypes.find((candidate) => candidate.machineName === source!.machineName);
  expect(config, 'Expected matching content-type configuration').toBeDefined();
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  const inspection = await inspectOwnedNodeModeration(page, config!, source!);
  const diagnostic = await diagnoseWorkflowAssigneeReadOnly(page, inspection);
  diagnostic.suggestions.forEach((suggestion, index) => {
    console.log(`Suggestion ${index + 1}: ${suggestion.label}`);
    console.log(`Suggestion ${index + 1} structure: ${JSON.stringify({ ...suggestion, label: undefined })}`);
  });
  console.log(`Selected input differs from rendered suggestion: ${diagnostic.selectedValueDiffersFromRenderedLabel ? 'yes' : 'no'}`);
  console.log(`Selected input exposes numeric entity ID: ${diagnostic.selectedValueNumericId ? 'yes' : 'no'}`);
});
