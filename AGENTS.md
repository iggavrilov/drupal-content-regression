# Permanent project instructions

## Project

- TypeScript + Playwright Drupal regression automation.
- Current main workstream: Drupal **component functional regression**.
- Current primary target: **Leidos development** (`DRUPAL_TARGET=leidos`, `DRUPAL_TIER=development`) — `https://devv.leidos.com`
- Current cumulative QA Basic Page:
  - Node ID: `25071`
  - Public URL: `https://devv.leidos.com/content/qa-automated-component-poc-20260918-084653-1484`
- This page is intentionally cumulative. Preserve existing components; append new ones.
- All automation-created content uses the `QA-AUTOMATED-` prefix.
- Prefer reusable field handlers over one-off content-type flows.
- Keep tests deterministic. Never weaken assertions or safety checks just to pass.

## Approved Drupal environments

Known approved origins (exact HTTPS roots only):

- DEVV: `https://devv.leidos.com`
- Benefits DEV: `https://benefits-dev.leidos.com`
- QTCM DEV: `https://dev.qtcm.com`
- CMS DEV: `https://dev-cms.leidos.com`
- Leidos Stage: `https://stage.leidos.com` (`DRUPAL_TARGET=leidos`, `DRUPAL_TIER=stage`)

- Never infer authorization from a similar hostname.
- Never use wildcard/suffix hostname authorization.
- For current component-functional work, use **DEVV only** unless a task explicitly requests another approved environment.

## Write safety

Preserve `src/config/write-safety.ts`. Drupal writes require `DRUPAL_ENVIRONMENT=develop` and an exact approved HTTPS origin.

Reject: production, unsupported target/tier combinations, arbitrary/lookalike hosts, alternate ports, embedded credentials, unexpected root path/query/fragment, and target/base-URL conflicts. Stage writes are allowed only for the explicit Leidos Stage mapping and the same exact-origin guard.

- Never run Drupal write tests on production.
- Never run destructive Drupal operations unless explicitly requested.
- Never modify unrelated editorial content.
- Only mutate exact `QA-AUTOMATED-`-owned entities whose identity has been proven.
- Fail closed on ambiguous identity. A numeric ID match alone is not enough.
- Before writing to an existing entity, verify: exact target, entity/content type, QA ownership where applicable, expected state.
- Never blindly rerun creation after a save may have succeeded; recover the exact owned node.
- Never automatically rerun a write suite after failure.
- Sanitize diagnostic URLs (no query strings or fragments) in logs/reports.

Publishing:

- Require `DRUPAL_ALLOW_PUBLISH=true`. Publishing remains prohibited on production regardless of opt-in.
- Only publish exact `QA-AUTOMATED-` nodes from a known regression run.
- Never publish arbitrary existing nodes.
- Never weaken moderation/ownership checks or bypass workflow permissions.
- Discover exact available transitions. Do not assume Published immediately follows In review.
- Do not convert blocked workflow states into false passing publication results.

## Credentials and secrets

Never expose: passwords, Basic Auth values, tokens, cookies, session IDs, Authorization headers, signed sensitive URLs, or `.env` contents.

- Never commit `.env` or secrets. `.env` stays ignored/untracked.
- Do not modify `.env` unless explicitly requested.
- Do not place secrets in source, logs, reports, screenshots, or this file.

## DEVV workflow

Expected DEVV workflow assignee (use the existing guard; exact match required):

- username: `igor.gavrilov`
- entity ID: `17636`

- Never choose the first/random autocomplete result.
- Never assume search text equals the resolved entity label.
- Require the digits-only workflow-assignee entity ID to match Drupal’s post-selection value.
- Never log workflow-assignee labels/IDs from local environment configuration.
- Never bypass workflow safety to publish. Never introduce a more privileged account without explicit authorization.

## Current component regression page (node 25071)

Components in order:

1. Formatted text
2. Blockquote
3. List
4. Anchor
5. Jump nav
6. Tabs
7. Card: Grid
8. Stat callout
9. Video
10. Card: Collection
11. Banner
12. Card: Carousel

Preserve these unless explicitly instructed otherwise. New work should normally **append exactly one** component. Do not create another Basic Page unless explicitly requested.

## Reusable QA media (read-only)

- Image: ID `45031`, type Image. Reuse when compatible after exact identity/type/state verification. Do not modify or delete.
- Remote video: ID `44536`, type Remote video, provider YouTube.

Treat existing media as read-only unless explicitly instructed otherwise. Never guess media/entity IDs. Never select the first/arbitrary media, taxonomy, or reference.

Prove persisted media via stable `[selection][0][target_id]`, never transient `media_library_selection`. After media AJAX, rediscover the exact row, delta, and owned controls.

## Component testing strategy

For a new component:

- Use node `25071` unless instructed otherwise.
- Add exactly one component unless instructed otherwise.
- Maximum **safe** field coverage: mandatory fields; safely meaningful optionals; expand collapsed groups when needed.
- Unique `QA-AUTOMATED-` markers. Never guess machine values or entity IDs.
- Never populate semantically unjustified values only to increase coverage.
- Record intentionally empty fields and reason when relevant.
- Save/update safely; publish through the guarded workflow; verify persistence, frontend rendering, and meaningful functionality.
- Focused keyboard/accessibility checks; desktop + 390×844 mobile smoke when relevant.
- Preserve previous component baseline. Retain created QA content.

Field classification when useful: `FRONTEND VERIFIED` / `BEHAVIOR VERIFIED` / `CMS-ONLY` / `NOT FRONTEND-RENDERED`.

## Reuse existing automation

Prefer existing helpers. Avoid broad refactors during component tasks.

Important files:

- `src/content/component-functional-runner.ts`
- `src/content/media/media-library.ts`
- `tests/basic-page-component-poc.spec.ts`

Reuse: target validation, ownership guards, component discovery, publishing lifecycle, media selection, CTA verification, frontend recovery, responsive checks, fatal-error handling.

## Paragraph / CMS interaction

- Rediscover saved Paragraph rows, deltas, and controls after Drupal AJAX. Never retain stale locators.
- Never force-click, synthesize DOM events, invoke Drupal AJAX directly, or bypass semantic saved-Paragraph activation.
- Keyboard fallback requires one exact, visible, enabled semantic `input`/`button` submit control and verified focus ownership.
- Do not automate a required select/color without a valid safe default or approved semantic rule.

## Existing special component knowledge

**Video:** DEVV uses Remote Video media. Frontend uses a lazy-load launcher that opens a page-level Drupal oEmbed/YouTube modal. Do not expect the iframe inside the Video paragraph DOM.

**Card: Collection:** parent type `partners`; nested type `partners_logo`.

**Banner:** machine type `featured_person`. Do not assume the admin label equals the Drupal machine type.

**Card: Carousel:** parent type `subsidiaries`; nested type `subsidiaries_item`.

Known DEVV functional block: frontend provides recognizable Owl markup and Drupal attempts init, but Owl fails with `TypeError: a.camelCase is not a function` (page jQuery 4.0.0; Owl depends on `jQuery.camelCase`). Result: `owl-loaded`, `.owl-stage`, Previous/Next absent. Treat as a known frontend finding. Do not re-investigate during unrelated tasks. Do not weaken `CAROUSEL_FUNCTIONAL_BLOCKED`.

**Marketo form:** machine type `marketo` (distinct from `marketo_modal`). Required `field_marketo_form[0][form_id]` is a free-text Marketo Form ID with no QA-owned selectable/prefilled value on the cumulative page. Fail closed; do not guess Form IDs, Munchkin/account IDs, or submit Marketo forms. Optional CMS fields: Header (`field_marketo_head`), Text (`field_marketo_text`), Style/padding (`field_paragraph_border`), Color scheme (`field_color_scheme`).

## Known fragment navigation findings

Do not re-investigate unless explicitly requested:

- Jump nav: href correct; activation reaches/scrolls/focuses the Anchor but `location.hash` is not retained.
- Card: Grid CTA: href correct; activation drops the fragment and does not scroll to the Anchor.
- Card: Collection CTA / Banner CTA: reach the correct QA page but drop the configured fragment.

If another CTA reproduces this: record it; do not automatically investigate; do not invalidate unrelated field/rendering coverage.

## Validation scope

Default for normal component tasks:

- focused create/update/publish test
- focused frontend functional test
- TypeScript check
- directly affected helper tests if needed
- `git diff --check`
- lightweight secret/artifact check

Do **not** automatically run: full Playwright/CRUD regression, M1/M2/M3, Benefits/QTCM/CMS regression, cache lifecycle, complete write-safety suite.

Run broader validation only when the task requires it, shared architecture or safety code changed, or evidence shows broader risk.

## Baseline preservation

Do not replay deep functional tests for every previously added component after each new one. Use lightweight baseline checks that prior components remain present and recognizable. Investigate a previous component only when the current change provides evidence it regressed.

## Agent / token efficiency

- Do not rediscover information already in this file. Do not scan the whole repository for narrow tasks.
- Inspect only directly relevant files. Prefer targeted search.
- At most one targeted Drupal UI discovery when a new component’s field model is unknown.
- After Save/Submit timeout: inspect whether Drupal persisted the change before any retry. Do not blindly repeat writes.
- Avoid large logs and HTML dumps. Run affected tests only.

## Git safety

The working tree may contain intentional uncommitted work from another agent. Never treat a dirty tree as disposable.

- Before editing: `git status`; distinguish pre-existing changes from this task.
- Do not automatically run `git reset`, `git clean`, `git restore`, `git checkout` on modified files, or `git stash`.
- Do not commit or push unless explicitly requested. Do not overwrite another agent’s work.

## Temporary investigation files

- Temporary investigation and debug scripts belong under `.tmp/`, not the repository root.

## Drupal data retention

Do not delete node `25071`, its cumulative components, or QA media used by tests unless explicitly instructed. Default: created QA components remain on the cumulative page. Never delete existing Drupal content without explicit instruction.

## Diagnostic tasks

If a task is explicitly READ-ONLY: no Drupal writes; no source edits unless permitted; no workaround to make a failing frontend behavior appear successful; collect evidence; preserve existing assertions and starting git state.

## Final reports

Keep reports concise. For component tasks include: target/environment; node; component/delta; field coverage; media reused/created; persistence; publishing; frontend; functional; accessibility/responsive where applicable; known findings; baseline preservation; validation performed; files changed; Drupal entities created/updated/deleted; unrelated content modified; commit/push status. No large logs unless needed to explain a failure.
