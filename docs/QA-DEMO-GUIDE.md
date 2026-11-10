# QA Demo Guide — 10 to 15 Minutes

## Unified visual PM report

Build and start the consolidated local dashboard with:

```powershell
npm run demo:dashboard
```

Then open <http://localhost:9323>. It presents authentication, console/network,
UI interaction, content creation, publishing, screenshots, and detailed-report
links in one place. It reads existing artifacts only and does not execute tests
or change Drupal. Each section keeps its own target, execution timestamp,
freshness, and FAST/FULL scope so historical evidence is not represented as one
simultaneous run.

After new artifacts exist, stop the server with Ctrl+C and restart it, or run:

```powershell
npm run demo:dashboard:build
```

The dashboard server owns port 9323. Do not run another Playwright report server
on that port at the same time. Individual reports remain available through the
dashboard links.

## Drupal Content Creation & Publishing Demo

Use this optional write-enabled demonstration only with an approved Leidos STAGE
account that can create Basic Pages, edit Paragraphs, and publish moderated content:

```powershell
npm run demo:create-basic-page:leidos:stage
```

The command visibly opens headed Chromium and is locked to
`https://stage.leidos.com`. It authenticates, creates one uniquely named
`QA-AUTOMATED-QA Automated Demo - Basic Page - ...` Draft, adds Formatted text,
Blockquote, and List components, saves, publishes, and verifies the frontend.
Exact-origin write safety, explicit publishing permission, QA ownership, and the
configured workflow assignee are checked before publishing. Existing editorial
content is never selected or overwritten, and the created QA page is retained.

Open the dedicated report afterward with:

```powershell
npm run demo:report:leidos:stage
```

Evidence is under `artifacts/basic-page-demo/leidos-stage/`, including successful
step screenshots, `latest/summary.json`, and `latest/run-state.json`. Run this
command once only. If a failure occurs after a node ID is recorded, do not run it
again; use that ID and the report to inspect the partial QA page and avoid a
duplicate. Never substitute a Production URL or remove the write/publish guards.

This section is separate from the read-only smoke, console, and UI demonstrations.

Audience: Project Manager and Manual QA Engineer. No programming experience is
required. The live portion uses a read-only smoke test and does not change
Drupal content.

## Recommended copy/paste sequence

Use one site per 10–15 minute meeting. Leidos STAGE is shown below; replace
`leidos` with `benefits` for the Benefits meeting.

```powershell
# 1. Prove authenticated Drupal access (about 10–20 seconds).
npm run smoke:leidos:stage

# 2. Show real console/network coverage on four menu pages (about 1–3 minutes).
npm run console:leidos:stage:fast

# 3. Show real frontend interaction in visible Chromium (about 30–60 seconds).
npm run ui:leidos:stage:headed
```

Open the generated HTML directly from:

```text
artifacts/smoke/leidos-stage/index.html
artifacts/smoke/leidos-stage/summary.json
artifacts/console-scan/stage/fast/report.html
artifacts/ui-interaction-demo/stage/report.html
```

For Benefits STAGE use:

```powershell
npm run smoke:benefits:stage
npm run console:benefits:stage:fast
npm run ui:benefits:stage:headed
```

All six commands are read-only. The smoke submits only the authorized login
form and records separate HTTP authentication, Drupal login, and protected
`/admin/content` assertions in `summary.json`; the frontend commands block POST,
PUT, PATCH, and DELETE requests.

## Before the meeting

1. Open `C:\QA Project Automation\Drupal\drupal-content-regression` in Visual
   Studio Code.
2. Confirm `.env` exists, but do not open it while sharing your screen.
3. In the VS Code terminal run:

   ```powershell
   npm install
   npx playwright install chromium
   npm run qa:check
   ```

4. Confirm the intended environment is reachable with the matching `smoke:*`
   command before the meeting.
5. Close terminals or files that contain sensitive information.

## 0:00–1:00 — Explain the project

Say:

> This Playwright project repeats important Drupal checks in a real browser. It
> can perform safe read-only checks and separately controlled QA content tests.
> Today we will run only the read-only smoke test.

Show the capability list near the top of `README.md`.

## 1:00–2:30 — Show the project in VS Code

Show these folders without opening implementation details:

- `tests/` — readable test scenarios.
- `src/auth/` — shared Drupal login behavior.
- `src/config/` — environment and safety rules.
- `config/environments.yml` — non-secret website mappings.
- `playwright-report/` — generated browser report.

Explain that `.env` stores local secrets and must not be shown. Do not open it.

## 2:30–4:00 — Show Quick Start

Open `README.md` and point to:

- the four read-only environment commands;
- the statement that smoke tests do not change Drupal;
- the report command;
- the separate warning for content-writing tests.

## 4:00–7:00 — Run one safe DEV smoke

Recommended live command:

```powershell
npm run smoke:leidos:dev
```

It selects Leidos DEV, uses the existing approved authentication mechanism,
checks Drupal login, and opens `/admin/content` read-only. It runs serially in
Chromium and does not save a Drupal form.

If the meeting is specifically about Benefits DEV, use:

```powershell
npm run smoke:benefits:dev
```

Do not switch to a write suite if the smoke fails. Explain the failing layer and
use the report.

## 7:00–9:00 — Explain PASS, FAIL, and BLOCKED

- `2 passed` means authentication and Content administration access succeeded.
- `failed` means a test assertion or browser action failed.
- `blocked` means setup, permission, credentials, or safety prerequisites were
  not satisfied; it is correct for the framework to stop.
- `skipped` means a required explicit opt-in or fixture was intentionally absent.

## Optional frontend interaction demo

When the meeting is specifically about frontend behavior, choose one STAGE
site and run one visible-browser command:

```powershell
npm run ui:leidos:stage:headed
# or
npm run ui:benefits:stage:headed
```

This is not an authenticated smoke and not content creation. It loads the
public homepage, activates only controls recognized by the conservative
read-only classifier (for example menus, tabs, accordions, or carousel
controls), and asserts that at least one control creates an observable state
change. It runs with one worker and blocks state-changing HTTP methods.

For a short console/network demonstration, use
`npm run console:leidos:stage:fast` or
`npm run console:benefits:stage:fast`. These scan four real main-menu pages
with the same engine as the full commands. Use
`npm run console:leidos:stage:headed` or
`npm run console:benefits:stage:headed` only when the longer full scan is
appropriate. The scanner records page URLs,
console errors, uncaught exceptions, failed requests, HTTP 4xx/5xx responses,
interaction evidence, and first-/third-party ownership. A complete scan can
take several minutes because it follows discovered main-menu destinations.
Use `-- --mobile` to demonstrate the mobile menu context.

Reports remain under `artifacts/console-scan/` or
`artifacts/ui-interaction-demo/`; a later Playwright run does not clear them.
If Basic Auth is rejected, stop rather than retrying. If no safe interactive
control is found, the focused UI demo fails honestly instead of treating a
click as functional proof.

While a scanner runs, the terminal prints the exact environment/origin,
current route number, URL, duration, and PASS/FINDINGS/TIMEOUT/ERROR result.
Press Ctrl+C once to stop. Completed-page evidence remains in `progress.json`.
Authenticated smoke reports are separate under `artifacts/smoke/`.

## 9:00–11:00 — Open the HTML report

Run:

```powershell
npm run report
```

Show the test names, duration, browser, and result. If a failure exists, show the
error and available screenshot/trace without exposing sensitive information.

## 11:00–12:00 — Explain STAGE

Do not run another live test unless time and access were approved. Show the
commands in the README:

```powershell
npm run smoke:leidos:stage
npm run smoke:benefits:stage
```

Explain that each command selects an exact approved HTTPS origin. It cannot
silently substitute DEV or Production.

## 12:00–14:00 — Explain content automation using saved evidence

Do not create content during the standard demo. Explain:

- Content Type regression creates and updates only `QA-AUTOMATED-` Draft nodes.
- Paragraph/component regression works on approved QA-owned Basic Pages and
  fixtures.
- Publishing is separate and needs explicit opt-in plus current-run ownership.
- Reports and summaries are stored under `test-results/`, `artifacts/`, and
  `.regression-runs/`.

Open a previously generated report only after checking its target and timestamp.

## 14:00–15:00 — Common questions

**Will this change production?**
No. The demo smoke is read-only, and writes require an exact approved
non-production target plus safety checks.

**Where are passwords?**
Only in local `.env`, which is ignored by Git and never shown in the demo.

**Can Manual QA run it?**
Yes. Open the folder, open Terminal, copy one `npm run smoke:*` command, then
open the report.

**Does a passing smoke mean the whole site is perfect?**
No. It proves only the selected login and administration checks at that time.

**What happens after a failure?**
Review the report, identify whether it is authentication, permission, network,
selector, or application behavior, and avoid weakening assertions.

## Demo safety checklist

- Screen sharing does not show `.env` or terminal history containing secrets.
- One exact DEV or STAGE smoke command is selected.
- No content, Paragraph, publishing, cache, or full scanner suite is run live.
- No form is submitted except the existing authorized Drupal login form.
- No commit or push is required for the demonstration.
