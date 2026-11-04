# STAGE content regression automation

Reuse the existing ContentTypeRunner, field handlers, exact media/entity checks, Paragraph handlers, and editorial moderation workflow. Production writes remain prohibited. Leidos and Benefits STAGE use exact target/tier/origin mappings; a similar hostname is not authorization.

## Offline validation

    npm run typecheck
    npx playwright test --config=playwright.stage-unit.config.ts

The stage-unit configuration does not log in or write Drupal content. Browser cases use mocked responses.

## Benefits Insight execution

Use only after explicit authoring/publication approval. Supply credentials securely through the approved environment file or process environment. Do not copy them into source or command arguments. Dotenv preserves existing process values: resolve stale shell credentials before execution. DOTENV_CONFIG_PATH selects an existing approved file without copying it.

    $env:DRUPAL_TARGET = 'benefits'
    $env:DRUPAL_TIER = 'stage'
    $env:DRUPAL_ENVIRONMENT = 'develop'
    $env:DRUPAL_ALLOW_PUBLISH = 'true'
    $env:BENEFITS_STAGE_INSIGHTS_RUN = 'approved-unique-run-id'
    npx playwright test --config=playwright.benefits-stage-insights.config.ts

Runs only Insight and Insight external, sequentially. Never reuse or change the run ID merely to retry a failed create. Inspect the per-type JSON under artifacts/benefits-stage-insights/<run-id> first. Existing evidence blocks automatic execution. Ambiguous successful saves are recovered by exact unique title, content type and edit-form identity, without another create.

References are Benefits-specific: QA Author 621 and QA Image 5921. Existing handlers check exact references before use. Reference entities are read-only. The standard Add Image fallback supports files[field_media_image_0], required Alternative text, normal Save and exact picker resolution; it does not bypass validation. Existing fixture setup searches for exact-name matches before uploading.

The workflow saves Draft, verifies fields, updates the same new node, verifies persistence, then follows available editorial transitions. An Insight external standalone 404 is recorded separately from its verified Published state. Authenticated traces, videos, screenshots and session state are disabled in the dedicated configuration. Frontend evidence is captured separately in anonymous contexts with origin-scoped Basic Authentication.

## Paragraph workflows

- tests/basic-page-component-poc.spec.ts and src/content/component-functional-runner.ts contain reusable content/Paragraph assertions.
- tests/remaining-components-write.spec.ts contains existing population handlers, including guarded Leidos STAGE fixture targeting.
- tests/benefits-basic-page-component-regression.spec.ts and tests/benefits-multi-item-regression.spec.ts retain their exact Benefits DEV fixture guards. Do not run them unchanged against STAGE.
- Hidden optional controls fail closed unless their native UI can be opened normally. No forced clicks, DOM unhiding or synthetic editor writes are supported.

A handler does not test every field or component. Preserve cumulative content. Keep screenshots, reports, session data and environment files out of commits. No deletion or cleanup is part of this execution.
