# Drupal Content Regression

A reusable Playwright and TypeScript framework for regression testing Drupal content types across projects and environments.

Drupal username/password authentication is implemented for the standard `/user/login` form. The framework creates recognizable automation-owned content, verifies saves and server responses, updates exact owned nodes, and captures useful failure diagnostics.

## Project structure

- `tests/` contains Playwright specifications.
- `src/auth/` contains Drupal authentication support.
- `src/content/` contains create/update workflows and their orchestrator.
- `src/config/` contains environment and content-type configuration types.
- `src/data/` generates deterministic QA test data.
- `src/diagnostics/` monitors network and server failures.
- `src/publishing/` contains exact-node moderation workflow safeguards.
- `src/reporting/` generates sanitized machine- and human-readable summaries.

## Configuration-driven CRUD architecture

Proven writable content types are represented in `src/config/content-types.ts`. Each configuration declares its machine name, node form, owned title field, supported fields, moderation behavior, required defaults, untouched optional controls, and generated test-data profile.

`ContentTypeRunner` performs the shared create/update sequence. Field handlers currently cover exact text inputs, wrapper-owned CKEditor 5 fields, and the proven Basic page Paragraph CKEditor. The runner enforces the `QA-AUTOMATED-` prefix, verifies the exact original title before editing, preserves Draft/non-published moderation, monitors HTTP 500–505 and Drupal fatal pages, and supports alias redirects through one unique visible `/node/{id}/edit` link after title ownership is confirmed.

For example, a future simple text-only type can be configured without a bespoke Playwright flow:

```ts
const exampleConfig: ContentTypeConfig = {
  machineName: 'example',
  label: 'Example',
  formSelector: 'form.node-example-form, form.node-form',
  titleField: {
    key: 'title',
    label: 'Title',
    type: 'text',
    selector: 'input[name="title[0][value]"]',
    verifyPersisted: true,
  },
  fields: [
    {
      key: 'title',
      label: 'Title',
      type: 'text',
      selector: 'input[name="title[0][value]"]',
      verifyPersisted: true,
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Example',
    titleKey: 'title',
    values: {},
  },
};
```

## Installation

```bash
npm install
npx playwright install chromium
```

## Environment setup

Copy `.env.example` to `.env` and populate it locally for the target non-production environment. Never commit `.env` or private values. Authentication requires `DRUPAL_BASE_URL`, `DRUPAL_USERNAME`, and `DRUPAL_PASSWORD`. If the environment is additionally protected by HTTP Basic Auth, set both optional variables `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD`; Playwright supplies them at browser-context level.

Write and publishing suites are prohibited on production. Static validation is available with `npm run typecheck`.

## Commands

- `npm test` runs the Playwright suite.
- `npm run test:headed` runs it with a visible browser.
- `npm run test:debug` opens Playwright debug mode.
- `npm run report` opens the HTML report.
- `npm run typecheck` validates TypeScript without emitting files.
- `npm run test:content-regression` runs only the seven supported CRUD tests.
- `npm run test:content-regression:headed` runs the same safe suite with a visible browser.
- `npm run test:paragraph-regression` runs the dedicated four-component Paragraph lifecycle with one worker and no retries.

## Consolidated content regression

The consolidated suite covers Basic page, Landing page, Statistic, Author,
Insight (external), Insight, and Insight Search Filter Page in that order. It
runs with exactly one Playwright worker so Drupal writes, Media Library use, and
shared-fixture checks never overlap. Playwright continues with independent
content types after a failure; a fixture-dependent test is reported as blocked
when its automation-owned dependency cannot be proven safely.

Every successful run creates one uniquely titled `QA-AUTOMATED-` Draft node per
content type and updates that exact node once. Nodes are intentionally retained
and never deleted by the suite. `DRUPAL_ENVIRONMENT` must be explicitly set to
`develop` or `staging`; missing, unknown, and production-like values stop the
command before browser execution.

Insight and Insight (external) require the exact Image media fixture
`qa-automated-image.png` with media ID `44706`. Normal regression execution only
resolves and selects this fixture; it never uploads media. If it is unavailable,
run the explicit setup command:

```bash
npm run setup:media
```

Regular Insight also requires the persistent automation-owned Author node
`24951`. Its exact title and ownership prefix are verified read-only before the
Insight creation form is opened. The Author created by the suite is independent
and is not substituted for this fixture.

Run the full suite with:

```bash
npm run test:content-regression
```

The headed equivalent is:

```bash
npm run test:content-regression:headed
```

Machine-readable and QA-readable summaries are written to:

- `test-results/content-regression-summary.json`
- `test-results/content-regression-summary.md`

Generated reports are local test artifacts and should not be committed. Failed
tests retain their Playwright trace and video, and capture a screenshot. The
historical `insight-update-recovery.spec.ts`, authentication checks, inventories,
fixture setup, and other non-CRUD tests are excluded from this command.

Each CRUD spec remains independently executable, for example:

```bash
npx playwright test tests/basic-page-crud.spec.ts --project=chromium
npx playwright test tests/landing-page-crud.spec.ts --project=chromium
npx playwright test tests/statistic-crud.spec.ts --project=chromium
npx playwright test tests/author-crud.spec.ts --project=chromium
npx playwright test tests/insight-external-crud.spec.ts --project=chromium
npx playwright test tests/insight-crud.spec.ts --project=chromium
npx playwright test tests/insight-search-crud.spec.ts --project=chromium
```

## Paragraph regression

The first supported Paragraph milestone covers exactly these components on an
automation-owned Insight Search Filter Page Draft host:

- Insights overview (the single fieldless default instance)
- Anchor
- Jump nav
- Formatted text

The dedicated suite creates one unique `QA-AUTOMATED-` host, performs an initial
Save, verifies all four persisted Paragraphs, updates the three editable saved
Paragraphs, performs a second Save, and verifies the final persisted state. It
uses one worker, zero retries, exact inventory checks, HTTP 500–505 monitoring,
Drupal fatal-page detection, and Draft-only ownership safeguards.

Saved Paragraph rows are rediscovered after Drupal AJAX rerenders. Their exact
semantic Edit controls use normal Playwright pointer activation when unobstructed
and verified focus plus keyboard Enter when the Drupal control is structurally
overlapped. The production path does not use force-click, DOM click, synthetic
events, JavaScript submission, or direct Drupal AJAX calls.

Run only this lifecycle with:

```bash
npm run test:paragraph-regression
```

Secondary footer, nested Blocks, media- or reference-dependent Paragraphs, and
other complex Paragraph types remain deferred and are not supported by the
normal Paragraph regression suite.

## Publishing workflow regression

Publishing is deliberately separate from CRUD. The content regression suite
continues to create and update Draft nodes only. After one complete successful
CRUD run, its reporter records the exact seven created node IDs, final owned
titles, and Draft states in the generated, git-ignored source manifest:

```text
.regression-runs/content-regression-created-nodes.json
```

The publishing suite never scans historical content. It accepts only a complete
manifest for the current environment, then re-verifies each numeric node ID,
exact `QA-AUTOMATED-` title, content-type form, and expected moderation state
before every transition.

Read-only and manual discovery in the current project/environment established a
four-state workflow. The runner opens the exact node view, reads the available
transition labels and machine values, and follows the configured proven path.
It never selects an option by position. Required log and assignment controls
are discovered within the node-view moderation form and satisfied before the
form is applied exactly once.

The currently observed project workflow is:

```text
Draft
  ↓
In review
  ↓
Reviewed and approved
  ↓
Published
```

The first controlled publishing run successfully demonstrated this capability
across all seven supported content types. Nodes transitioned by publishing tests
are intentionally left in their actual final state and are never automatically
published, reverted, archived, edited, or deleted by reporting/configuration work.

Publishing requires both an explicitly supported non-production environment and
an additional local opt-in:

```env
DRUPAL_ENVIRONMENT=develop
DRUPAL_ALLOW_PUBLISH=true
DRUPAL_EXPECT_PUBLISH_PERMISSION=false
DRUPAL_WORKFLOW_ASSIGNEE_SEARCH=qa.publisher
DRUPAL_WORKFLOW_ASSIGNEE_EXPECTED=qa.publisher
DRUPAL_WORKFLOW_ASSIGNEE_ID=12345
```

The default in `.env.example` is false. `prod`, `production`, missing, and
unknown environments remain prohibited regardless of opt-in. The publishing
suite uses one worker and no retries, changes only moderation, and never runs
nodes concurrently.

`DRUPAL_ALLOW_PUBLISH` authorizes the automation to attempt the workflow.
`DRUPAL_WORKFLOW_ASSIGNEE_SEARCH` is the text Playwright types into required
reviewer, publisher, and publication-notification autocomplete widgets.
`DRUPAL_WORKFLOW_ASSIGNEE_EXPECTED` is the exact username-only label Drupal
renders in its suggestion list. `DRUPAL_WORKFLOW_ASSIGNEE_ID` is the digits-only
entity ID that Drupal must append after the exact suggestion is selected. Search
text is never assumed to equal the rendered label. The automation requires one
exact label match, then independently verifies both the username and numeric ID
in Drupal's transformed input value. Local values are never written to reports
or source control. The former single `DRUPAL_WORKFLOW_ASSIGNEE` variable is no
longer supported, and publishing refuses to start without all three values.

`DRUPAL_EXPECT_PUBLISH_PERMISSION` describes the expected capability only at
the `Reviewed and approved → Published` stage. An absent Published option while
the node is merely In review is never interpreted as a permission limitation.
Unavailable required intermediate transitions or unresolved assignment fields
are BLOCKED; server errors, fatal pages, and persistence failures are FAILED.

A possible future architecture may use separate explicitly authorized local
accounts: an editor/creator account submits nodes for review and a publisher
account performs the final verified transition. No second account is currently
implemented. Any future credentials must remain local environment values and
must never be committed.

Commands:

```bash
npm run test:publishing-regression
npm run test:publishing-regression:headed
```

Reports are generated at:

- `test-results/publishing-regression-summary.json`
- `test-results/publishing-regression-summary.md`

Successfully published nodes are intentionally left Published for manual
inspection. The suite never unpublishes, archives, deletes, or automatically
reverts them. It also verifies the internal public node path loads without an
HTTP error or Drupal fatal page after publication.

### Reusable Image media fixture

Drupal content types with required Image media use the permanent automation-owned
fixture at `fixtures/qa-automated-image.png`. This Drupal project derives the
immutable Image media label from the filename, so the expected exact Media Library
label is `qa-automated-image.png` (media ID `44706` in the current environment).
Future fixture filenames should carry the `QA-AUTOMATED-` prefix directly.

Regular Insight automation also uses the permanent Author fixture node `24951`,
whose exact owned title is verified read-only before use. Required entity-reference
autocomplete fields must resolve an exact label and persisted numeric entity ID;
they never fall back to the first or a partial match.

Create or verify it explicitly with:

```bash
npm run setup:media
```

The setup is idempotent: zero exact matches creates one fixture, one exact match
is reused and verified, and multiple exact matches fail safely. Normal tests must
never select arbitrary media or silently create infrastructure. This fixture is
permanent test infrastructure and must not be deleted automatically.

Run only the read-only authentication smoke test with:

```bash
npx playwright test tests/authentication.spec.ts
```

Authenticated read-only access to Drupal's content administration overview and content-type selection page can be checked with:

```bash
npx playwright test tests/content-access.spec.ts --project=chromium
```

This smoke test monitors page responses for HTTP 500–505 errors, checks for common Drupal/system fatal pages, and discovers content-type links shown on `/node/add`. It does not open or submit content forms.

Generate a read-only structural inventory of every discovered content-type creation form with:

```bash
npx playwright test tests/content-type-inventory.spec.ts --project=chromium
```

The inventory is written locally to `test-results/content-type-inventory.json`; it records field/widget structure but no form values or credentials.

Inspect the Basic page creation form without filling or submitting it with:

```bash
npx playwright test tests/basic-page-form.spec.ts --project=chromium
```

The controlled Basic page write test creates exactly one uniquely named `QA-AUTOMATED-` node and updates only that captured node. It is guarded against production execution and unsafe publication defaults:

```bash
npx playwright test tests/basic-page-crud.spec.ts --project=chromium
```

The controlled Landing page test follows the same ownership, Draft moderation, alias-recovery, and server-error safeguards:

```bash
npx playwright test tests/landing-page-crud.spec.ts --project=chromium
```

The controlled Statistic test fills only Administrative title and the required plain-text Statistic field, leaving optional Image media untouched:

```bash
npx playwright test tests/statistic-crud.spec.ts --project=chromium
```

All content created by this automation framework must use the `QA-AUTOMATED-` prefix. Write workflows verify exact title ownership before updating, never select an unrelated node, prefer Draft or another clearly non-published moderation state, and support Drupal path-alias redirects by recovering a unique numeric node ID from the created page's edit link. Created QA records are not deleted automatically at this stage.

## Safety model

- Write tests run only in explicitly allowed non-production environments.
- Every automation-created node uses the `QA-AUTOMATED-` prefix.
- CRUD tests leave created nodes in Draft and never delete them automatically.
- Publishing targets only exact numeric nodes from one known generated manifest.
- Existing media and references are selected only through exact automation-owned fixtures.
- Arbitrary client content, media, taxonomy, and references are never selected.
- Ownership, persisted-state, and moderation assertions are never weakened to force a pass.
- Workflow permissions are never bypassed.
- Diagnostic URLs are sanitized to remove query strings and fragments.
