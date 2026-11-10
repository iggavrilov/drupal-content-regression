# Drupal QA Automation — Leidos & Benefits

This Playwright and TypeScript project supports Drupal content automation,
frontend behavior checks, browser interaction testing, console and network
scanning, and broader regression coverage across approved environments.

## Contents

- [Part 1 — Live Demo Guide](#part-1--live-demo-guide-pm--qa)
  - [Demo commands](#4-demo-commands--benefits-stage)
  - [Content creation demo](#6-drupal-content-creation--publishing-demo)
  - [Quick command reference](#11-quick-command-reference)
- [Part 2 — Full Regression and Technical Documentation](#part-2--full-regression--technical-documentation)
  - [Full console regression](#1-full-console-regression)
  - [Drupal content regression](#3-drupal-content-regression)
  - [Environment and safety](#4-environment-configuration)

# PART 1 — LIVE DEMO GUIDE (PM & QA)

## 1. Demo Overview

This guide is designed for a 10–15-minute presentation to a Project Manager and
Manual QA Engineer. It shows how automation confirms Drupal access, checks
browser errors, exercises visible frontend controls, and—when explicitly
approved—creates and publishes one QA-owned Basic Page.

The examples cover Leidos STAGE and Benefits STAGE. Smoke, console, and UI
commands are read-only. The Basic Page command is deliberately write-enabled.
Fast demo commands cover a small representative scope; full regression commands
discover and process a much broader route set and therefore take longer.

## 2. Prerequisites

1. Open Visual Studio Code and select **File → Open Folder**.
2. Open `C:\QA Project Automation\Drupal\drupal-content-regression`.
3. Select **Terminal → New Terminal**.
4. Confirm dependencies are installed with `npm install` and Chromium is
   available with `npx playwright install chromium`.
5. Confirm local `.env` credentials and `config/environments.yml` mappings are
   configured. Do not open `.env` while sharing the screen.
6. Confirm the required STAGE account can authenticate.
7. Before the write-enabled demo, obtain approval to create and publish QA
   content and confirm the account has Basic Page, Paragraph, moderation, and
   publishing permissions.

## 3. Demo Agenda (10–15 Minutes)

| Time | Stage | Purpose |
| --- | --- | --- |
| 1–2 min | Drupal authentication smoke | Confirm authorized Drupal access and `/admin/content`. |
| 2–3 min | Console and network scan | Show JavaScript, HTTP, and failed-request evidence. |
| 1–2 min | Playwright UI interaction | Watch Chromium activate safe frontend controls. |
| 4–7 min | Basic Page creation and publishing | Create one QA page, add Paragraphs, publish, and verify it. |
| 1–2 min | HTML reports | Review results and screenshots without rerunning tests. |

Execution time varies with network speed, Drupal response time, and page scope.

## 4. Demo Commands — Benefits STAGE

```bash
npm run smoke:benefits:stage
npm run console:benefits:stage:fast
npm run ui:benefits:stage:headed
```

| Command | What it demonstrates | Expected output and report | Safety |
| --- | --- | --- | --- |
| `npm run smoke:benefits:stage` | HTTP authentication, Drupal login, and protected `/admin/content` access. | Playwright report plus `artifacts/smoke/benefits-stage/summary.json`. | Read-only except authorized login. |
| `npm run console:benefits:stage:fast` | Four discovered menu pages checked for console, HTTP, and request findings. | Terminal progress plus `artifacts/console-scan/benefits-stage/fast/report.html`. | Read-only. |
| `npm run ui:benefits:stage:headed` | Visible Chromium activates conservatively selected homepage controls and verifies state changes. | Browser interaction plus `artifacts/ui-interaction-demo/benefits-stage/report.html`. | Read-only; state-changing requests are blocked. |

## 5. Demo Commands — Leidos STAGE

```bash
npm run smoke:leidos:stage
npm run console:leidos:stage:fast
npm run ui:leidos:stage:headed
```

| Command | What it demonstrates | Expected output and report | Safety |
| --- | --- | --- | --- |
| `npm run smoke:leidos:stage` | HTTP authentication, Drupal login, and protected `/admin/content` access. | Playwright report plus `artifacts/smoke/leidos-stage/summary.json`. | Read-only except authorized login. |
| `npm run console:leidos:stage:fast` | Four menu pages checked with the production scanner engine. | Terminal progress plus `artifacts/console-scan/stage/fast/report.html`. | Read-only. |
| `npm run ui:leidos:stage:headed` | Visible safe interactions on the Leidos homepage. | Browser interaction plus `artifacts/ui-interaction-demo/stage/report.html`. | Read-only; state-changing requests are blocked. |

Previously observed Leidos findings must be interpreted separately:

- The video-control interaction was obstructed by overlays. This is a confirmed
  automation interaction failure, but it requires manual review before being
  classified as a user-visible Drupal defect.
- The homepage MP4 request ended with `net::ERR_ABORTED`. It is a recorded
  first-party network finding and requires reproduction/user-impact review.
- The Careers route redirected to the external Careers site. Associated
  Cloudflare and analytics request findings are external or third-party and are
  not automatically Leidos Drupal defects.

## 6. Drupal Content Creation & Publishing Demo

> **WRITE-ENABLED:** every normal execution can create another published QA page.

```bash
npm run demo:create-basic-page:leidos:stage
```

The verified scenario is locked to `https://stage.leidos.com` and runs headed
Chromium with one worker. It authenticates, creates one QA-owned **Basic Page**,
adds **Formatted text**, **Blockquote**, and **List** Paragraphs, and follows:

```text
Draft → In review → Reviewed and approved → Published
```

It then verifies the page anonymously, checks relevant frontend JavaScript and
first-party network failures, and saves an HTML report with screenshots.

Reference execution evidence:

- Node ID: `25381`
- Published HTTP status: `200`
- Result: **PASS**
- Additional pages created during that execution: `0`
- Public evidence: <https://stage.leidos.com/content/qa-automated-qa-automated-demo-basic-page-20261110-115635-89e2>
- Admin evidence: <https://stage.leidos.com/node/25381/edit>

Node 25381 is evidence from the previous successful run. A new normal execution
does **not** reuse that node. It creates a new uniquely titled page beginning
with `QA-AUTOMATED-` and retains it for review.

The command supplies the implementation's explicit Stage write and publishing
opt-ins. The framework still fails closed unless the selected target resolves
exactly to Leidos STAGE, `DRUPAL_ENVIRONMENT=develop`, publishing is enabled,
the workflow assignee matches the configured Stage username/entity ID, and all
content ownership checks pass. Production, HTTP, lookalike hosts, alternate
ports, embedded credentials, and URLs with extra paths/queries/fragments are
rejected. Existing editorial content is never selected for this demo.

## 7. View Existing Content Demo Report

### Unified PM dashboard

Generate and serve one consolidated visual report without running Drupal tests:

```bash
npm run demo:dashboard
```

Open <http://localhost:9323>. The dashboard combines available Authentication
Smoke, Console & Network Scan, UI Automation, Basic Page Creation, and
Publishing/Anonymous Frontend evidence. It links to the original detailed
reports and displays existing screenshots as thumbnails. Stop the local server
with **Ctrl+C**.

To refresh the HTML after another report has been generated, either restart the
server or build it separately:

```bash
npm run demo:dashboard:build
```

The generated file is `artifacts/demo-dashboard/index.html`. The server exposes
only that dashboard and files below `artifacts/`; it does not expose `.env` or
source files. It uses port 9323 itself, so do not run Playwright's independent
`show-report` server on the same port at the same time.

Every dashboard section shows its own artifact timestamp, freshness, target,
and FAST/FULL or desktop/mobile scope. A historical content reference is not
presented as part of the same execution as a newer scanner run. Each smoke run
writes a sanitized `summary.json` beside its HTML report, so the dashboard can
show independently asserted HTTP authentication, Drupal login, and protected
`/admin/content` results. Missing, incomplete, or wrong-target evidence remains
**NOT VERIFIED** or **DATA UNAVAILABLE**. The dashboard reads evidence only and
never authenticates, scans, or writes Drupal content.

### Content-demo Playwright report

Opening the existing report does not create or modify Drupal content:

```bash
npm run demo:report:leidos:stage
```

Verified evidence locations:

- `artifacts/basic-page-demo/leidos-stage/report/index.html`
- `artifacts/basic-page-demo/leidos-stage/latest/created.png`
- `artifacts/basic-page-demo/leidos-stage/latest/components-saved.png`
- `artifacts/basic-page-demo/leidos-stage/latest/published.png`
- `artifacts/basic-page-demo/leidos-stage/latest/frontend-verified.png`

## 8. How to Read the Results

- **PASS**: every required assertion in that selected scope passed.
- **FAIL**: a browser action, response, or assertion failed.
- **FINDINGS**: the scan completed but recorded items requiring review.
- **BLOCKED**: credentials, access, fixtures, or a safety prerequisite stopped execution.
- **TIMEOUT**: an operation exceeded its limit; check progress and network conditions.
- **HTTP 4xx/5xx**: client/server responses that require route and ownership review.
- **JavaScript error**: an uncaught browser error; reproduce and assess user impact.
- **First-party issue**: the request belongs to the selected website origin.
- **Third-party issue**: the request belongs to analytics, media, or another external service.

Not every console or network finding is a confirmed Drupal defect. Review the
source, reproducibility, and visible impact. Reports live under `artifacts/`,
while Playwright failure evidence may also appear under `test-results/`.

## 9. Presenter Notes

- “We start with a quick authentication check to confirm that Drupal is accessible.”
- “Next, Playwright scans selected pages for JavaScript and network errors.”
- “Now we can watch the browser interact with real frontend components.”
- “Findings are evidence for QA review; they are not automatically confirmed defects.”
- “Finally, the automation creates one QA page, adds Paragraph components, publishes it, and verifies the public result.”
- “The HTML report lets the team review evidence without running the test again.”

## 10. Demo Safety and Troubleshooting

- Smoke, console, UI, and report-opening commands are read-only. Only
  `demo:create-basic-page:leidos:stage` creates and publishes content.
- Use the write-enabled command only on exact Leidos STAGE and only once per
  planned demo. If a node ID appears before failure, inspect that node and the
  report before considering any retry.
- Press **Ctrl+C** once to stop a running command. A partial write may already
  exist, so do not immediately rerun a creation test.
- If authentication fails, verify the selected environment and local variable
  names without printing values. Stop for CAPTCHA, SSO, or access denial.
- If Chromium does not launch, run `npx playwright install chromium` and retry
  only a read-only smoke first.
- If a report is unavailable, confirm the command completed and use the exact
  artifact path listed above.
- Full console scans take longer because they process all discovered internal
  menu routes; fast mode limits execution to four representative pages.

## 11. Quick Command Reference

| Purpose | Command | Target | Mode | Typical measured/expected time |
| --- | --- | --- | --- | --- |
| Authentication smoke | `npm run smoke:benefits:stage` | Benefits STAGE | Read-only | About 10–30 sec |
| Fast console scan | `npm run console:benefits:stage:fast` | Benefits STAGE | Read-only | About 1–3 min |
| Visible UI demo | `npm run ui:benefits:stage:headed` | Benefits STAGE | Read-only | About 30–60 sec |
| Authentication smoke | `npm run smoke:leidos:stage` | Leidos STAGE | Read-only | About 10–30 sec |
| Fast console scan | `npm run console:leidos:stage:fast` | Leidos STAGE | Read-only | About 1–3 min |
| Visible UI demo | `npm run ui:leidos:stage:headed` | Leidos STAGE | Read-only | About 30–60 sec |
| Create and publish Basic Page | `npm run demo:create-basic-page:leidos:stage` | Leidos STAGE | **Write-enabled** | Reference run: about 5 min |
| Open existing content report | `npm run demo:report:leidos:stage` | Local artifacts | Read-only | Immediate |

---

# PART 2 — FULL REGRESSION & TECHNICAL DOCUMENTATION

## 1. Full Console Regression

```bash
npm run console:leidos:stage
npm run console:benefits:stage
```

These read-only commands discover the actual main navigation and process the
full accepted internal route set. The latest measured runs discovered 35 Leidos
routes and 17 Benefits routes; these counts can change with site navigation.
The terminal prints per-page progress and timeout information. Current reports
are stored under `artifacts/console-scan/stage/` and
`artifacts/console-scan/benefits-stage/`; previous output is archived in each
target's `history/<timestamp>/` directory.

## 2. Desktop and Mobile UI Regression

```bash
npm run ui:leidos:stage
npm run ui:benefits:stage
npm run ui:leidos:stage -- --mobile
npm run ui:benefits:stage -- --mobile
```

The UI suite exercises selected controls supported by the conservative
interaction classifier. It does not claim to test every component on every
Drupal page. Desktop and mobile discovery are independent.

## 3. Drupal Content Regression

Content Type, Paragraph, component, CRUD, and publishing suites are documented
in detail below. These tests are write-enabled unless their section explicitly
says read-only. They create or update only provably owned `QA-AUTOMATED-`
content and retain created records unless a scenario states otherwise.

## 4. Environment Configuration

Local `.env` stores credentials and secrets; `config/environments.yml` stores
non-secret target, tier, URL, credential-profile, and workflow mappings. Target
selection uses `DRUPAL_TARGET` and `DRUPAL_TIER`. Never commit `.env` or print
its values.

## 5. Safety and Access Control

Writes require an exact approved HTTPS origin, `DRUPAL_ENVIRONMENT=develop`,
QA ownership, and the relevant explicit opt-in. Publishing additionally checks
the configured workflow assignee and entity ID. Authentication and Drupal
permissions are never bypassed.

## 6. Reports and Artifacts

- `artifacts/smoke/` — persistent authentication smoke reports.
- `artifacts/console-scan/` — persistent console/network JSON, HTML, and screenshots.
- `artifacts/ui-interaction-demo/` — focused interaction reports.
- `artifacts/basic-page-demo/` — content demo report and screenshots.
- `artifacts/admin-ui-scan/` — Admin UI exploration evidence.
- `playwright-report/` and `test-results/` — standard Playwright output.
- `.regression-runs/` — guarded write-run manifests.

## 7. Development and Maintenance

The remaining sections preserve installation, environment, TypeScript,
Playwright, content, publishing, unit-test, troubleshooting, and maintenance
reference material. Use `npm run qa:check` for TypeScript and configuration
safety validation; do not use broad `npm test` as a beginner demo command.

## Beginner Setup on Windows

### Prerequisites

1. Install Visual Studio Code from the official Microsoft website.
2. Install Node.js 20 LTS or another supported release below Node.js 25.
3. Restart Visual Studio Code, then verify:

   ```powershell
   node --version
   npm --version
   ```

4. Open the project folder and its integrated terminal.
5. Install dependencies and Chromium:

   ```powershell
   npm install
   npx playwright install chromium
   ```

6. Copy `.env.example` to `.env` and replace placeholders locally. The default
   profile requires `DRUPAL_USERNAME`, `DRUPAL_PASSWORD`,
   `BASIC_AUTH_USERNAME`, and `BASIC_AUTH_PASSWORD`.

`.env` contains credentials and stays local. `config/environments.yml` contains
only non-secret site names, URLs, tiers, and workflow mappings.

Before a demonstration, run the local-only checks:

```powershell
npm run qa:check
```

## Project Overview for QA

The framework covers Drupal authentication, content CRUD, publishing,
Paragraph/components, public console and network failures, and authenticated
Admin UI exploration.

- **Read-only tests** may sign in and open pages but do not save Drupal forms.
- **Content-writing tests** create or update recognizable `QA-AUTOMATED-`
  nodes. They require approval, permissions, and exact safety conditions.
- **PASS** means the selected assertions passed at that moment. It is not a
  complete certification of the website.

Configured targets are Leidos DEV/STAGE, Benefits DEV/STAGE, QTCM DEV, and CMS
DEV. The four beginner smoke commands above are the supported demo entry points.
QTCM and CMS use specialist workflows and are not default beginner demos.

## Run Read-only Regression

### DEV

```powershell
npm run smoke:leidos:dev
npm run smoke:benefits:dev
```

These target `https://devv.leidos.com` and
`https://benefits-dev.leidos.com` respectively.

### STAGE

```powershell
npm run smoke:leidos:stage
npm run smoke:benefits:stage
```

These target `https://stage.leidos.com` and
`https://benefits-stage.leidos.com` respectively. Benefits STAGE performs extra
read-only authoring-access checks with GET requests. If authentication or
permission verification fails, stop; do not bypass access controls.

### Beginner command reference

| Purpose | Command | Changes Drupal? |
| --- | --- | --- |
| TypeScript and safety checks | `npm run qa:check` | No; local only |
| Leidos DEV smoke | `npm run smoke:leidos:dev` | No |
| Leidos STAGE smoke | `npm run smoke:leidos:stage` | No |
| Benefits DEV smoke | `npm run smoke:benefits:dev` | No |
| Benefits STAGE smoke | `npm run smoke:benefits:stage` | No |
| Open latest report | `npm run report` | No |
| Short Leidos console demo | `npm run console-scan:demo` | No |

### STAGE console and UI demonstration commands

These commands exercise public frontend pages only. They use one Chromium
worker, block every non-GET/HEAD/OPTIONS request, enforce the configured exact
STAGE origin, and never submit the Drupal login form. The `ui:*` commands use a
focused homepage run and pass only when at least one recognized control both
activates and produces an observable UI state change. Other control failures
and console/network findings remain visible in the report for QA review.

| Demo | Normal | Visible browser |
| --- | --- | --- |
| Leidos STAGE fast console/network scan | `npm run console:leidos:stage:fast` | `npm run console:leidos:stage:fast -- --headed` |
| Leidos STAGE full console/network scan | `npm run console:leidos:stage` | `npm run console:leidos:stage:headed` |
| Leidos STAGE UI interaction check | `npm run ui:leidos:stage` | `npm run ui:leidos:stage:headed` |
| Benefits STAGE fast console/network scan | `npm run console:benefits:stage:fast` | `npm run console:benefits:stage:fast -- --headed` |
| Benefits STAGE full console/network scan | `npm run console:benefits:stage` | `npm run console:benefits:stage:headed` |
| Benefits STAGE UI interaction check | `npm run ui:benefits:stage` | `npm run ui:benefits:stage:headed` |

Console reports are preserved under `artifacts/console-scan/stage/` and
`artifacts/console-scan/benefits-stage/`. Focused UI evidence is preserved
separately under `artifacts/ui-interaction-demo/<target>/`. JSON contains page
URLs, console/page exceptions, failed requests, HTTP 4xx/5xx responses,
first-/third-party classification, and interaction before/after state. HTML is
the readable report. Screenshots are captured for findings and failed scanner
interactions where supported. Before a new run replaces the target's `latest`
files, the launcher archives the prior JSON, HTML, and screenshots under that
target's `history/<timestamp>/` directory.

The fast commands use the same scanner engine and the first four real
main-menu destinations. They normally finish in roughly one to three minutes;
the full scan may take 5–20 minutes depending on page count and resources. The
terminal prints `SCAN_PAGE_START`, `SCAN_PAGE_END`, page duration and final
`SCAN_COMPLETE PASS` or `FINDINGS`, so a long scan is visibly progressing.
Run `npm run console:leidos:stage -- --help` for timeout and scope options. Use
Ctrl+C once to stop; the latest completed-page checkpoint remains as
`progress.json` if the scan does not reach its final report.

Authenticated smoke HTML reports are stored separately under
`artifacts/smoke/leidos-stage/` and `artifacts/smoke/benefits-stage/`, with
previous reports archived below each target's `history/` directory.

Append `-- --mobile` to any command to use mobile navigation discovery and a
mobile browser context. These public frontend commands are distinct from the
authenticated `smoke:*` commands and from content creation suites.

Do not use `npm test` for a beginner demo. It is broad and includes tests with
different safety contracts.

## Content Creation Regression — Not the Default Demo

### Content types

The configured suite creates, updates, and verifies one owned Draft node for
Basic Page, Landing Page, Statistic, Author, Insight external, Insight, and
Insight Search Filter Page. It retains nodes and does not delete them.

Required permissions: Drupal login, create/edit access for the selected content
types, and—only for publishing—the correct moderation permission.

Example approved Leidos DEV selection:

```powershell
$env:DRUPAL_TARGET = 'leidos'
$env:DRUPAL_TIER = 'development'
$env:DRUPAL_ENVIRONMENT = 'develop'
npm run test:content-regression
```

Visible-browser version:

```powershell
npm run test:content-regression:headed
```

Never rerun a failed create test until the report and current-run manifest have
been checked for a node that may already have saved. New nodes appear under
Drupal **Content** (`/admin/content`) and in summaries under `test-results/`.

Publishing is separate and requires `DRUPAL_ALLOW_PUBLISH=true`, an exact
current-run manifest, QA ownership, and the correct workflow assignee:

```powershell
npm run test:publishing-regression
```

Benefits STAGE supports a dedicated guarded Insights workflow, not the general
beginner suite:

```powershell
$env:DRUPAL_TARGET = 'benefits'
$env:DRUPAL_TIER = 'stage'
$env:DRUPAL_ENVIRONMENT = 'develop'
$env:BENEFITS_STAGE_INSIGHTS_RUN = 'approved-unique-run-id'
npm run test:benefits-stage-insights
```

### Paragraphs and components

These suites update QA-owned Basic Page content and may use approved media
fixtures. Run only the requested milestone:

```powershell
npm run test:paragraph-regression
npm run test:paragraph-m2-regression
npm run test:paragraph-m3-blockquote
npm run test:paragraph-m3-blockquote-image
npm run test:component-family -- --family grid
```

The write guard rejects production, unsupported target/tier combinations,
lookalike domains, HTTP, alternate ports, credentials in URLs, and URLs with
unexpected paths, queries, or fragments.

## Understanding Results

- **PASS**: all checks in the selected test passed.
- **FAIL**: a browser action or assertion failed; inspect the first meaningful
  error in the HTML report.
- **BLOCKED**: a required credential, permission, fixture, or safety condition
  was missing. Do not weaken the guard.
- **Skipped**: an explicit opt-in or safe prerequisite was absent.

Evidence locations:

- `playwright-report/` — latest Playwright HTML report.
- `test-results/` — suite output and failure evidence.
- `artifacts/console-scan/` — persistent console-scanner HTML/JSON reports.
- `artifacts/admin-ui-scan/` — persistent Admin UI reports.
- `.regression-runs/` — guarded current-run manifests.

Screenshots, traces, and videos are usually captured only on failure when the
selected configuration enables them. A console error or failed request is not
automatically an application defect; QA must confirm ownership and user impact.

## Beginner Troubleshooting

- **Node/npm not recognized:** restart VS Code after installing Node.js.
- **Missing dependencies:** confirm the terminal is in the project root, then
  run `npm install`.
- **Browser missing:** run `npx playwright install chromium`.
- **Authentication failed:** verify the exact site/tier and required `.env`
  variables without printing them. Stop for CAPTCHA, SSO, or access denied.
- **Missing variable:** compare names with `.env.example`; keep values in `.env`.
- **Permission denied:** ask a Drupal administrator to verify the approved test
  account; do not bypass permissions.
- **Timeout:** check VPN/network, Basic Auth, Drupal availability, and final URL.
  For a write test, verify whether data saved before any retry.
- **No report:** confirm Playwright started. `npm run report` opens the latest
  Playwright report; scanner reports live under `artifacts/`.

## Simplified Project Structure

```text
drupal-content-regression/
├── config/                     Non-secret target and tier mappings
├── docs/                       Demo and supporting documentation
├── scripts/                    Safe wrappers and scanner launchers
├── src/auth/                   Drupal login and access verification
├── src/config/                 Environment and safety enforcement
├── src/console-scanner/        Public console/error scanning
├── src/content/                Content and Paragraph workflows
├── src/publishing/             Guarded moderation workflows
├── src/reporting/              HTML, JSON, and Markdown summaries
├── tests/                      Playwright test specifications
├── artifacts/                  Generated persistent scanner evidence
├── test-results/               Generated execution/failure evidence
├── .env.example                Safe variable-name template
├── package.json                npm commands and dependencies
└── playwright*.config.ts       Suite-specific Playwright settings
```

Generated folders may not exist until their suite runs. See
[`docs/QA-DEMO-GUIDE.md`](docs/QA-DEMO-GUIDE.md) for a 10–15 minute live demo.

## Advanced Project Reference

This Playwright and TypeScript framework gives QA a repeatable way to validate
Drupal content, components, publishing workflows, public-page behavior, browser
errors, and the authenticated administration UI across supported Drupal sites.
It combines controlled automation-owned writes with read-only scanners and
local safety checks, then preserves evidence that can be reviewed without
rerunning a large suite.

For the current 10–15-minute project-manager demo, use the STAGE commands in
[Part 1](#part-1--live-demo-guide-pm--qa). Leidos DEV remains available for
approved development regression work:

```text
DRUPAL_TARGET=leidos
DRUPAL_TIER=development
https://devv.leidos.com
```

Drupal username/password authentication is implemented for the standard
`/user/login` form. Any test that writes creates or reuses recognizable
`QA-AUTOMATED-` content, proves ownership before an update, and is protected by
exact-origin and non-production safety checks.

## What we test

| Capability | Scope | Safety classification |
| --- | --- | --- |
| Authentication smoke | Drupal login and authenticated session evidence | **READ-ONLY** |
| Content CRUD regression | Create one owned node per supported type, reload, update the exact node, and verify persisted values | **WRITES QA CONTENT** |
| Publishing workflow | Apply proven moderation transitions only to exact nodes recorded by the preceding CRUD run | **WRITES QA CONTENT** |
| Basic Page component regression | Author supported Paragraph components, verify edit-form persistence, public rendering, responsive behavior, and selected interactions | **WRITES QA CONTENT** |
| Public console/error scan | Main-navigation discovery, safe bounded interactions, console/page/request errors, and DEV-to-Production comparison where configured | **READ-ONLY** |
| Drupal Admin UI scan | Authenticated GET-only exploration of visible safe administration routes | **READ-ONLY** |
| CMS/LENS regression | CMS authentication/discovery plus a controlled unpublished Presentation → Slide → Card → Media chain | **READ-ONLY** for discovery; **WRITES QA CONTENT** for the LENS lifecycle |
| Cache lifecycle regression | Controlled cache-behavior checks against an owned QA Basic Page | **WRITES QA CONTENT** |
| Configuration, write-safety, and workflow guards | Target mapping, exact-origin enforcement, and cross-environment assignee protection | **LOCAL ONLY** |
| TypeScript validation | Static validation without browser or Drupal access | **LOCAL ONLY** |

The framework is regression coverage, not a claim of complete product
certification. The current Basic Page work has discovered 29 component types
and has substantial persistence, rendering, layout, responsive, and interaction
coverage. Some component options depend on site-specific fixtures or external
services, and not every possible variant or accessibility behavior has yet been
exercised exhaustively.

## Supported environments

Environment selection is YAML-backed and fails closed for unknown target/tier
combinations. Credentials remain in local `.env` profiles; URLs and other
non-secret mappings live in `config/environments.yml`.

| `DRUPAL_TARGET` | `DRUPAL_TIER` | Exact origin | Credential profile |
| --- | --- | --- | --- |
| `leidos` | `development` | `https://devv.leidos.com` | `default` |
| `leidos` | `stage` | `https://stage.leidos.com` | `default` |
| `benefits` | `development` | `https://benefits-dev.leidos.com` | `default` |
| `benefits` | `stage` | `https://benefits-stage.leidos.com` | `default` |
| `qtcm` | `development` | `https://dev.qtcm.com` | `default` |
| `cms` | `development` | `https://dev-cms.leidos.com` | `cms` |

The legacy `DRUPAL_TARGET=devv` alias is still accepted for development-only
compatibility, but new commands and documentation should use `leidos` plus
`development`.

## How to run — Leidos DEV

The examples below use PowerShell. Populate `.env` locally first; never place
credentials in commands, screenshots, reports, or source control.

```powershell
$env:DRUPAL_TARGET = 'leidos'
$env:DRUPAL_TIER = 'development'
```

Start with local checks that do not access Drupal:

```powershell
npm run typecheck
npm run test:config-safety
```

Run the recommended short live demo test. It logs in and verifies the resulting
authenticated state without changing Drupal content:

```powershell
npx playwright test tests/authentication.spec.ts --project=chromium
```

Use these existing commands only when the meeting explicitly allows controlled
QA writes:

```powershell
# Seven content types: create, persist, update, and verify owned Draft nodes.
npm run test:content-regression

# The same content suite with a visible browser.
npm run test:content-regression:headed

# One guarded Basic Page component family; replace grid with a supported machine name.
npm run test:component-family -- --family grid

# Publish only exact nodes from the current CRUD manifest; requires explicit publish opt-in.
npm run test:publishing-regression

# Controlled cache lifecycle on an owned QA Basic Page; this performs Drupal writes.
npx playwright test tests/cache/page-cache-lifecycle.spec.ts --project=chromium --workers=1 --retries=0
```

Run the public console scanner or authenticated Admin UI explorer independently:

```powershell
npm run console-scan
npm run admin-ui-scan
```

CMS/LENS uses its separate `cms` target and credential profile. These are the
implemented commands; the third command performs controlled CMS writes:

```powershell
$env:DRUPAL_TARGET = 'cms'
$env:DRUPAL_TIER = 'development'
npx playwright test tests/cms/authentication.spec.ts --project=chromium --workers=1 --retries=0
npx playwright test tests/cms/discovery.spec.ts --project=chromium --workers=1 --retries=0
npx playwright test tests/cms/lens-presentation-regression.spec.ts --project=chromium --workers=1 --retries=0
```

There is intentionally no single “run everything” demo command. CRUD,
publishing, components, scanners, cache checks, and CMS/LENS have different
safety contracts and should be selected deliberately.

## Extended 30-minute technical demo — Leidos DEV

This older extended technical sequence is separate from the current 10–15-minute
STAGE presentation in Part 1. It is deliberately limited to
**Leidos DEV** (`https://devv.leidos.com`). Do not show `.env` or enter
credentials in commands. The two environment variables below select the
YAML-backed Leidos development mapping.

### 1. Project and coverage overview — 0–3 min

**Purpose:** introduce the coverage table above. **Safety:** LOCAL ONLY.

Basic Page component regression exists and 29 component types have been
discovered or audited. It is deliberately outside this short live demo because
broader scenarios rely on retained fixtures, media/entity references, and
component-specific setup. The portable five-component demo remains experimental
work, not a PM presentation step.

### 2. Select Leidos DEV — 3–4 min

**Purpose:** establish the exact target and show that environment selection is
explicit. **Safety:** LOCAL ONLY.

```powershell
$env:DRUPAL_TARGET = 'leidos'
$env:DRUPAL_TIER = 'development'
```

Explain that the framework fails closed for an unknown target/tier, unexpected
origin, or a target/base-URL conflict. Credentials remain in local environment
files and are never shown.

### 3. Local framework validation — 4–5 min

**Purpose:** validate TypeScript and the safety contract without opening a
browser or contacting Drupal. **Safety:** LOCAL ONLY.

```powershell
npm run typecheck
npm run test:config-safety
```

**Expected:** TypeScript and the current config-safety suite pass. The safety suite verifies that writing requires
`DRUPAL_ENVIRONMENT=develop`, an exact approved HTTPS root, coherent
target/tier selection, and explicit publication opt-in.

### 4. Authentication smoke — 5 min

**Purpose:** prove authenticated access to real Leidos DEV. **Safety:**
READ-ONLY Drupal access; it does not modify content.

```powershell
npx playwright test tests/authentication.spec.ts --project=chromium
```

**Expected:** one passing test and an authenticated `devv.leidos.com` session;
no content writes. **Point out:** this confirms the selected DEV account before
the controlled write suite begins.

### 5. Seven-content-type headed regression — 5–13 min

**Purpose:** demonstrate a visible end-to-end content lifecycle. **Safety:**
WRITES QA CONTENT on Leidos DEV only.

```powershell
npm run test:content-regression:headed
```

The recommended headed command visibly creates, reloads, updates, and verifies
one owned node for each supported type: Basic Page, Landing Page, Statistic,
Author, Insight external, Insight, and Insight Search Filter Page. It retains
the QA nodes and does not delete content. Each content type is an independent
Playwright test. The latest recorded rehearsal completed **7 passed, 0 failed,
0 flaky** in **7.0 minutes**. This is recorded rehearsal evidence, not a
guarantee for future runs.

### 6. Open Playwright report — 13–16 min

**Purpose:** review execution evidence. **Safety:** LOCAL ONLY.

```powershell
npx playwright show-report
```

**Point out:** **All**, **Passed**, **Failed**, **Flaky**, **Skipped**, duration,
and the independently reported content types. Discuss stack traces only if a
test fails.

The headless equivalent, for scheduled use rather than this live presentation,
is:

```powershell
npm run test:content-regression
```

### 7. Short console/error scan — 16–20 min

**Purpose:** show public route discovery, bounded safe interactions, and evidence
capture. **Safety:** READ-ONLY Drupal access.

```powershell
npm run console-scan:demo
```

The demo profile reuses the full scanner, selects at most seven main-navigation
pages, limits safe interactions to three per page, avoids the production
comparison to fit the meeting, and writes:

- `artifacts/console-scan/demo/report.html` — human-readable report for the PM.
- `artifacts/console-scan/demo/results.json` — complete machine-readable evidence.

The latest recorded PM rehearsal selected, tested, and loaded **7 pages**;
performed **19 safe interactions** with **0 interaction failures**; found **0
raw findings**, **0 first-party candidates**, and **0 third-party/noise**; and
finished with **RESULT: COMPLETE** in about **1.6 minutes**. This is recorded
rehearsal evidence, not a guarantee for future runs.

The terminal reports selected/tested/loaded pages, interactions, raw findings,
first-party candidates, and likely third-party noise without dumping the full
discovery payload. A completed scan can still have findings. Raw findings are
**not** Jira defects: QA must distinguish application failures from third-party,
browser, infrastructure, transient, and scanner-limitations noise.

For the full regression (about 14.1 minutes in the recorded rehearsal):

```powershell
npm run console-scan
Start-Process .\artifacts\console-scan\report.html
```

The full scan historically covered 35 pages and 120 interactions. It retains the
same report paths (`report.html` for people, `results.json` for detailed data).

### 8. Review short console HTML report — 20–23 min

**Purpose:** review the PM-friendly read-only evidence. **Safety:** LOCAL ONLY.

```powershell
Start-Process .\artifacts\console-scan\demo\report.html
```

### 9. Existing Admin UI coverage artifact — 23–26 min

**Purpose:** show authenticated Drupal administration coverage without spending
the meeting on a long crawl. **Safety:** READ-ONLY Drupal access; safe GET-only
exploration avoids mutating controls and routes.

```powershell
Start-Process .\artifacts\admin-ui-scan\devv\report.html
```

The full command, for a separate scheduled run, is:

```powershell
npm run admin-ui-scan
```

It authenticates, discovers visible safe administrative routes, and records
navigation, server, page, and request findings. The saved report is historical
evidence; review its timestamp and target before presenting it as current.

Current retained DEV evidence: **Discovered: 5761; Visited: 764; Loaded: 763;
Verified failures: 1; Remaining: 0.** “Discovered” means candidate routes/links,
not 5761 tested pages. The meaningful execution counts are **Visited** and
**Loaded**.

### Quick report links

```powershell
# Latest Playwright report
npx playwright show-report

# Short PM console scan report
Start-Process .\artifacts\console-scan\demo\report.html

# Full console scan report
Start-Process .\artifacts\console-scan\report.html

# Existing Leidos DEV Admin UI report
Start-Process .\artifacts\admin-ui-scan\devv\report.html
```

The Playwright report is seven content-type execution evidence. The short
console report is the PM-friendly seven-page read-only scan. The full console
report is retained broader evidence and must not be rerun live. The Admin UI
report is retained authenticated read-only admin exploration and must not be
rerun live.

### 10. Coverage and discussion — 26–30 min

Use the capability table above to discuss the next regression target. This
framework provides regression coverage, not complete product certification.
Possible next additions: another content type, retained-fixture component
coverage, a key workflow, or targeted public-page checks. Do not run
`npm test` during the presentation because it is broad and may include suites
whose safety contract is unsuitable for an unattended demo.

Before the meeting, confirm `npm install`, Chromium installation, local `.env`,
and that the saved reports open. Do not access Leidos Stage for this demo.

## How the regression works

The seven-type content regression creates one uniquely titled
`QA-AUTOMATED-` node for each supported content type, confirms the server and
saved form state, updates that exact captured node, verifies the updated data,
and retains the node for evidence. CRUD remains Draft-first and never deletes a
node automatically.

Publishing is a separate, opt-in phase. It reads the generated current-run
manifest, revalidates the numeric node ID, title ownership, content type,
environment, moderation state, and configured assignee, then follows the proven
workflow. It does not search for or publish unrelated historical content.

Basic Page component coverage uses guarded, family-scoped authoring plus focused
read-only verification. It checks persisted field values after reload, public
rendering, responsive layout, and applicable interactions such as tabs,
carousels, CTAs, video controls, and keyboard activation. The repository records
29 component types available in the current Leidos/Benefits-derived inventory;
coverage depth varies by component, and fixture-dependent or external-form
variants may be skipped or blocked safely instead of being fabricated.

## Results and artifacts

Generated evidence is local and Git-ignored. The most useful demo artifacts are:

- `test-results/content-regression-summary.md` and `.json` — per-content-type create/update outcomes.
- `test-results/publishing-regression-summary.md` and `.json` — moderation execution results.
- `test-results/publishing-post-run-verification-summary.md` and `.json` — independent final-state verification.
- `artifacts/component-functional/node-25191/` — retained Leidos DEV Basic Page component evidence.
- `artifacts/console-scan/demo/report.html` and `artifacts/console-scan/demo/results.json` — PM console demo evidence.
- `artifacts/console-scan/results.json` and `report.html` — retained Leidos DEV public console/error evidence.
- `artifacts/admin-ui-scan/devv/results.json` and `report.html` — retained Leidos DEV Admin UI exploration evidence.
- `playwright-report/` and suite-specific `test-results/*-playwright/` directories — Playwright failure diagnostics where generated.

The repository also contains separately scoped historical reports for Stage,
Benefits DEV, and QTCM DEV. Treat all saved results as **historical execution
evidence**, not proof of current environment health; timestamps and target
metadata in the artifact should be reviewed before presenting it. Screenshots,
traces, and videos are failure evidence, while the HTML/Markdown summaries are
the PM-friendly starting point.

## Current limitations and future expansion

- Basic Page component coverage is broad but not exhaustive across every option combination, breakpoint, interaction, and accessibility requirement.
- Some media, entity-reference, marketing-form, and personalization scenarios require exact approved fixtures and fail closed when those fixtures are unavailable.
- Created QA nodes and permanent QA media fixtures are retained; automatic Drupal cleanup is not implemented.
- Publishing requires an exact current-run manifest, explicit local opt-in, and environment-specific assignee validation.
- Public scanner Production comparison is available only where a verified Production origin exists; other targets run development-only and label findings accordingly.
- Accessibility assertions currently cover selected semantics, focus, and keyboard behavior; a dedicated complete accessibility audit is future work.
- Future expansion can deepen variant matrices, cross-browser coverage, accessibility testing, reusable test-data cleanup, and stakeholder-facing trend reporting.

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

Copy `.env.example` to `.env` and populate it locally. Never commit `.env` or private values. Select a site with `DRUPAL_TARGET` (`leidos`, `benefits`, `qtcm`, or `cms`) and a tier with `DRUPAL_TIER` (`development` or `stage`). Supported exact mappings are Leidos development → `https://devv.leidos.com`, Leidos stage → `https://stage.leidos.com`, Benefits development → `https://benefits-dev.leidos.com`, QTCM development → `https://dev.qtcm.com`, and CMS development → `https://dev-cms.leidos.com`. Unknown target/tier combinations fail closed. The legacy `DRUPAL_TARGET=devv` alias remains development-only.

Write and publishing suites are prohibited on production. Before browser execution, the write guard requires `DRUPAL_ENVIRONMENT=develop`, a supported target/tier selection, and one explicitly approved exact HTTPS root. Stage is writable only when `DRUPAL_TARGET=leidos` and `DRUPAL_TIER=stage` resolve exactly to `https://stage.leidos.com`; configuration never implies write permission by itself. Alternate hosts, lookalike subdomains, ports, URL credentials, path prefixes, query strings, fragments, and cross-environment conflicts fail closed. Static validation is available with `npm run typecheck`.

Drupal routes remain relative to the configured base URL, including `/user/login`, `/node/add/{type}`, `/node/{id}/edit`, and `/admin/...`; no DEVV-specific route fork is required. Credentials and optional HTTP Basic Auth values remain local environment variables.

## Commands

- `npm test` runs the Playwright suite.
- `npm run test:headed` runs it with a visible browser.
- `npm run test:debug` opens Playwright debug mode.
- `npm run report` opens the HTML report.
- `npm run typecheck` validates TypeScript without emitting files.
- `npm run test:content-regression` runs only the seven supported CRUD tests.
- `npm run test:content-regression:headed` runs the same safe suite with a visible browser.
- `npm run test:config-safety` runs environment, exact-origin write-safety, and workflow-assignee guard tests without Drupal access.
- `npm run test:component-family -- --family grid` runs one component family through the guarded author/save/reload/frontend flow. Set `DRUPAL_TARGET` and `DRUPAL_TIER` first; family-scoped execution is preferred to the legacy monolithic writer.
- `npm run test:paragraph-regression` runs the dedicated four-component Paragraph lifecycle with one worker and no retries.
- `npm run test:paragraph-m2-regression` runs only the image-background Milestone 2 lifecycle.
- `npm run test:paragraph-m3-discovery` inventories Milestone 3 structures on unsaved forms without persistent Drupal writes.
- `npm run test:paragraph-m3-blockquote` runs only the text-only Blockquote lifecycle.
- `npm run test:paragraph-m3-blockquote-image` runs only the Blockquote optional-image lifecycle.
- `npm run console-scan` discovers public main-navigation pages for the selected target, records browser/runtime errors, and performs bounded safe interactions. Leidos DEV also compares relevant findings with Production.
- `npm run console-scan:production` sequentially scans the public Leidos, QTCM, and Benefits Production sites with strict read-only guards and separate reports.

## Public console error scanner

The console scanner starts at the DEVV homepage, expands main-navigation menus, and tests only the deduplicated internal pages linked from that navigation. It does not recursively crawl page links. For each discovered route it compares DEVV with the equivalent Production route, records browser `console.error` messages, uncaught page errors, failed requests, and HTTP responses with status 400 or greater, and tries a bounded representative set of clearly safe controls such as tabs, accordions, carousels, dialogs, search toggles, and expandable sections. Ambiguous, form-submission, authentication, download, external, and potentially destructive controls are recorded as skipped.

The scanner does not authenticate to Drupal, enter administration pages, submit forms, or modify content. It records the action immediately preceding each observation and stops interaction traversal if a control unexpectedly navigates, preventing recursive crawling.

Discover and test the main navigation:

```bash
npm run console-scan
```

Run one approved route or change the post-load settling interval:

```bash
npm run console-scan -- --route /insights
npm run console-scan -- --settle-ms 5000
npm run console-scan -- --max-pages 40 --max-interactions 8
npm run console-scan -- --target qtcm
npm run console-scan -- --target benefits
npm run console-scan -- --target cms
npm run console-scan -- --target stage
```

Persistent results are written to `artifacts/console-scan/results.json` and `artifacts/console-scan/report.html`, outside Playwright's disposable `test-results` tree. Evidence screenshots use `artifacts/console-scan/screenshots/`. The artifact directory is Git-ignored and is not removed when focused Playwright tests clean their own dedicated output directories. Screenshots are created only for DEVV-only or unattributed findings needing review. Environment origins and common tracking/cache query parameters are normalized before comparison, repeated findings are deduplicated, and the raw observations remain available in the JSON report.

QTCM DEV uses `--target qtcm` and writes separate persistent evidence to `artifacts/console-scan/qtcm/`, leaving the Leidos reports untouched. Because the repository does not define a verified QTCM Production origin, this target runs DEV-only; the existing `DEVV_ONLY` label means QTCM development-only in that report.

Benefits DEV uses `--target benefits` and writes separate persistent evidence to `artifacts/console-scan/benefits/`. No verified Benefits Production origin is defined in the repository, so this target also runs DEV-only and `DEVV_ONLY` means Benefits development-only.

CMS DEV uses `--target cms`, the existing CMS credential profile, and `artifacts/console-scan/cms/`. It runs DEV-only and keeps all navigation discovery and safe interactions read-only.

Leidos Stage uses `--target stage` and writes to `artifacts/console-scan/stage/`. Its environment-aware low-pressure profile uses one worker, sequential navigation, a 5-second page settle, a 1.5-second interaction settle, at most eight safe interactions per page, and no Production comparison. DEVV keeps its faster defaults and Production comparison.

Classifications are `DEVV_ONLY`, `DEVV_AND_PROD`, `PROD_ONLY`, `THIRD_PARTY`, and `NEEDS_REVIEW`. Each finding also carries a review status that distinguishes comparison-confirmed evidence, a single-run finding needing reproduction, and third-party/browser noise; navigation failures remain explicit page-record failures. First-party findings remain visible and are never hard-coded away. Known Siteimprove, Google Tag Manager, Google Analytics, and DoubleClick sources are reported as third-party; unknown sources are conservatively marked for review. Exit code `0` means the scan completed without a DEVV-only first-party regression, `2` means one or more such regressions were found, and `1` means configuration or scanner execution failed.

## Production Console Regression — Read-only

The Production command reuses the public console scanner and runs three sites
sequentially with one Playwright worker: Leidos, QTCM, then Benefits. It
discovers bounded main-navigation routes, visits public pages, records console
errors, uncaught exceptions, failed requests, HTTP 4xx/5xx responses, and a
small representative set of safe UI interactions.

The following local `.env` values are required and must resolve to the exact
approved HTTPS root origins:

```env
DRUPAL_PROD_LEIDOS_URL=https://www.leidos.com
DRUPAL_PROD_QTCM_URL=https://www.qtcm.com
DRUPAL_PROD_BENEFITS_URL=https://benefits.leidos.com
```

All three origins are validated before browser navigation. Missing values,
HTTP, lookalike or arbitrary subdomains, embedded credentials, custom ports,
paths, queries, and fragments fail closed. The Production runner does not load
Drupal or Basic Auth credentials, does not authenticate to Drupal, and does not
import content, component, publishing, or write-safety helpers. Browser contexts
block every request method except `GET`, `HEAD`, and `OPTIONS`; service workers
are disabled. Admin, authentication, entity mutation, checkout, payment, login,
logout, and external routes are excluded. Unexpected cross-origin redirects are
recorded and receive no interaction testing.

Run the complete bounded Production sequence with:

```powershell
npm run console-scan:production
```

The default limit is 25 discovered pages and four safe interactions per page.
Both limits can be adjusted within the guarded Production bounds:

```powershell
npm run console-scan:production -- --max-pages 15 --max-interactions 2
```

Each target keeps separate persistent JSON evidence and an HTML report:

- `artifacts/console-scan/production/leidos/results.json`
- `artifacts/console-scan/production/leidos/report.html`
- `artifacts/console-scan/production/qtcm/results.json`
- `artifacts/console-scan/production/qtcm/report.html`
- `artifacts/console-scan/production/benefits/results.json`
- `artifacts/console-scan/production/benefits/report.html`

Open the HTML reports in PowerShell with:

```powershell
Start-Process .\artifacts\console-scan\production\leidos\report.html
Start-Process .\artifacts\console-scan\production\qtcm\report.html
Start-Process .\artifacts\console-scan\production\benefits\report.html
```

Production findings are evidence for QA review, not automatically confirmed
Jira defects. First-party single-run findings remain possible application
defects requiring reproduction; third-party and unattributed findings remain
separate. The Production command never invokes CRUD, component, publishing,
cache, Admin UI, or CMS/LENS workflows.

### Full main-menu and interaction regression

The separate comprehensive command preserves the bounded Production command
above and adds desktop plus mobile main-navigation and interaction coverage:

```powershell
npm run console-scan:production:full
```

For each site it discovers visible desktop and mobile navigation links,
including nested and mega-menu items exposed by hover, focus, menu opening, and
mobile navigation controls. The homepage is always included. URLs are
deduplicated while menu labels are retained. Coverage limits never fail
silently: the report records the total unique menu destinations, tested routes,
truncation count, skipped destinations, and reasons.

Desktop uses `1440x900`; mobile uses `375x812`. Every selected page is scrolled
incrementally to trigger lazy content and then returned to the top. The shared
conservative allowlist exercises tabs, accordions, expandable controls,
carousels, safe menus, modals, search UI without submission, and read-only
filters. Reports record interaction labels, categories, before/after state,
whether a visible state change was verified, failures, and skipped controls.

The full run defaults to at most 200 menu destinations and eight representative
safe interactions per page. Diagnostic runs can use lower limits; the report
will explicitly identify incomplete coverage:

```powershell
npm run console-scan:production:full -- --max-pages 20 --max-interactions 3
```

Before a full run, perform a limited homepage/menu discovery verification with
no destination visits, scrolling, or component interactions:

```powershell
npm run console-scan:production:full -- --discovery-only --max-pages 40
```

If either desktop or mobile discovers only the homepage, the site report and
combined terminal summary are marked `INCOMPLETE` and the command exits with
code `3`. Discovery diagnostics include containers found, candidate links,
accepted internal links, rejection reasons and samples, and discovery errors.

Combined desktop/mobile evidence and deduplicated root causes are written to:

- `artifacts/console-scan/production-full/leidos/results.json` and `report.html`
- `artifacts/console-scan/production-full/qtcm/results.json` and `report.html`
- `artifacts/console-scan/production-full/benefits/results.json` and `report.html`

Each report separates `FIRST_PARTY`, `THIRD_PARTY`, and `NEEDS_REVIEW`
findings, preserves affected URLs and triggering actions, and supplies concise
manual reproduction steps. The same read-only origin, route, HTTP-method,
credential-isolation, redirect, service-worker, and evidence-sanitization guards
used by the bounded Production scanner remain mandatory.

## Read-only Drupal Admin UI explorer

`npm run admin-ui-scan` authenticates with the selected target's existing credential abstraction, confirms `/admin/content`, and performs a bounded GET-only traversal of administration navigation, listing pages, local tasks, and representative pagination. Potentially mutating routes, public content links, filter permutations, entity edit/add/delete routes, and unsafe actions are skipped and recorded. Leidos DEV evidence is written to `artifacts/admin-ui-scan/devv/`; other implemented targets use their own sibling directory. Playwright traces are disabled so authentication material is not persisted.

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
`develop` with an explicitly approved root origin; staging, missing, unknown, and
production-like values stop the command before browser execution.

Insight and Insight (external) require the exact Image media fixture
`qa-automated-image.png` with media ID `44841`. Normal regression execution only
resolves and selects this fixture; it never uploads media. If it is unavailable,
run the explicit setup command:

```bash
npm run setup:media
```

Regular Insight also requires the persistent automation-owned Author node
`24981`. Its exact title and ownership prefix are verified read-only before the
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

Created QA nodes are intentionally retained for verification. This project does
not currently implement automatic node cleanup, and the DEVV migration does not
change that policy.

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

Milestone 1 covers exactly these components on an
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

Milestone 2 adds a separate focused suite for Formatted text (w/ image
background). It creates one owned Draft host, inserts the exact automation-owned
`qa-automated-image.png` fixture, saves and verifies text/media persistence,
updates only the Paragraph text, preserves the same media, saves again, and
verifies final persistence. The current DEVV fixture is media `44841`, but
the ID is never treated as universal: Media Library must first resolve exactly
one filename match before the expected ID is accepted.

Run the focused Milestone 2 lifecycle with:

```bash
npm run test:paragraph-m2-regression
```

Media Library's `media_library_selection` input is transient insertion state and
is not persistence proof. The image-background suite verifies the stable,
Paragraph-local `field_media_image[selection][0][target_id]` association after
rediscovering the current Paragraph row and delta following Drupal AJAX.

Milestone 3 adds two independent focused Blockquote scenarios. The text-only
scenario creates one owned Draft host, adds one Blockquote, saves and verifies
the initial CKEditor text, updates only that text, saves again, and verifies the
final persisted value. The optional-image scenario creates a separate Draft
host, resolves exactly one `qa-automated-image.png` Media Library match, inserts
it through the Blockquote-local trigger, and proves the stable Paragraph-local
target ID. It then updates only the text, preserves the same media association,
saves, and verifies both text and media again.

Run the focused scenarios independently:

```bash
npm run test:paragraph-m3-blockquote
npm run test:paragraph-m3-blockquote-image
```

Blockquote uses the `limited_text` format default. Author name, Author title,
CTA, Style, and Color scheme are intentionally left untouched unless a future
scenario explicitly authorizes them. Optional editorial fields are not filled
merely to increase coverage counts. Media identity is resolved by exact fixture
filename before the environment-specific ID is accepted, and saved ownership is
verified through `[selection][0][target_id]`, not `media_library_selection`.

The retained read-only Milestone 3 discovery uses a new unsaved Insight Search
Filter Page form to inventory Blockquote and Featured banner structure and
defaults. It never submits the host form and is isolated from all write-suite
commands:

```bash
npm run test:paragraph-m3-discovery
```

Formatted text (w/ color background) remains deferred: its required color field
defaults to invalid `_none`, and automation has no approved semantic rule for
choosing Mid Purple, Mid Ultraviolet, Dark Gradient, or Titanium. Secondary
footer, nested Blocks, and other complex Paragraph types also remain deferred.

Featured banner also remains deferred. Its required
`field_paragraph_border` default is invalid `_none`, and no approved semantic
rule authorizes selecting `padding`; automation must not choose it arbitrarily.

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
label is `qa-automated-image.png` (media ID `44841` in DEVV).
Future fixture filenames should carry the `QA-AUTOMATED-` prefix directly.

Regular Insight automation also uses the permanent Author fixture node `24981`,
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

CMS-only coverage is isolated under `tests/cms`. Its read-only discovery records the
actual LENS node/Paragraph relationships and JSON:API resources. The controlled
regression creates an unpublished `QA-AUTOMATED-CMS-` LENS Presentation with one
inline LENS Slide and one Card Paragraph linked to an exact QA Image media fixture:

```bash
npx playwright test tests/cms/authentication.spec.ts --project=chromium --workers=1 --retries=0
npx playwright test tests/cms/discovery.spec.ts --project=chromium --workers=1 --retries=0
npx playwright test tests/cms/lens-presentation-regression.spec.ts --project=chromium --workers=1 --retries=0
```

CMS write execution remains restricted to the exact `https://dev-cms.leidos.com`
root with `DRUPAL_ENVIRONMENT=develop`. The regression verifies the complete
Presentation → Slide → Card → Media chain through stable JSON:API UUIDs and does
not publish or delete the created entities.

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
