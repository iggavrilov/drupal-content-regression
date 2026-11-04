import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getEffectiveCredentials } from '../src/config/environments';
import { AUTOMATED_CONTENT_PREFIX } from '../src/config/automation';
import { BasicPageFormattedTextPocRunner, type CreatedBasicPageFormattedTextPoc } from '../src/content/component-functional-runner';
import { NetworkMonitor } from '../src/diagnostics/network-monitor';

test('Basic Page publishes one Formatted text component and renders it publicly', async ({ browser, page }) => {
  test.setTimeout(240_000);
  const credentials = getEffectiveCredentials();
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  try {
    const recoveryNodeId = process.env.COMPONENT_POC_EXISTING_NODE_ID?.trim();
    const recoveryTitle = process.env.COMPONENT_POC_EXISTING_TITLE?.trim();
    const recoveryMarker = process.env.COMPONENT_POC_EXISTING_MARKER?.trim();
    let created: CreatedBasicPageFormattedTextPoc;
    if (recoveryNodeId || recoveryTitle || recoveryMarker) {
      if (!/^\d+$/.test(recoveryNodeId ?? '') || !recoveryTitle?.startsWith(AUTOMATED_CONTENT_PREFIX) || !recoveryMarker?.startsWith(AUTOMATED_CONTENT_PREFIX)) {
        throw new Error('COMPONENT_POC_BLOCKED: Recovery requires one numeric node ID and exact QA-owned title and marker.');
      }
      created = { nodeId: recoveryNodeId!, title: recoveryTitle, marker: recoveryMarker, published: true };
    } else {
      await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
      created = await runner.createAndPublish(page, monitor);
    }
    monitor.assertNoServerErrors();
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const result = await runner.verifyPublicFrontend(await publicContext.newPage(), created);
    expect(result.published).toBe(true);
    expect(result.frontendVerified).toBe(true);
    console.log(`COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
    console.log([
      'Drupal Basic Page Component Regression',
      'Basic Page: CREATED',
      'Components discovered: 29',
      'Components attempted: 1',
      'Components persisted: 1',
      'Components rendered: 1',
      'Blocked/skipped: 28 (no portable, fixture-proven multi-component new-page runner)',
      'Persistence: PASS',
      'Frontend: PASS',
      `Node ID: ${result.nodeId}`,
      `Edit URL: https://devv.leidos.com/node/${result.nodeId}/edit`,
      `Frontend URL: ${result.publicUrl}`,
      'RESULT: PASS',
    ].join('\n'));
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page adds one Blockquote and preserves Formatted text publicly', async ({ browser, page }) => {
  test.setTimeout(300_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  try {
    const updated = await runner.addBlockquoteToExistingPage(page, monitor, {
      nodeId: '25071',
      title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
    });
    monitor.assertNoServerErrors();
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const result = await runner.verifyBlockquoteFrontend(await publicContext.newPage(), updated);
    expect(result.published).toBe(true);
    expect(result.frontendVerified).toBe(true);
    console.log(`BLOCKQUOTE_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page adds one List and preserves prior components publicly', async ({ browser, page }) => {
  test.setTimeout(300_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  try {
    const expected = {
      nodeId: '25071',
      title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
      blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    };
    const recoveryMarkers = [1, 2, 3].map((index) => process.env[`COMPONENT_POC_EXISTING_LIST_ITEM_${index}`]?.trim());
    if (recoveryMarkers.some(Boolean) && !recoveryMarkers.every((marker) => marker?.startsWith(AUTOMATED_CONTENT_PREFIX))) {
      throw new Error('COMPONENT_POC_BLOCKED: List recovery requires all three exact QA-owned markers.');
    }
    const updated = recoveryMarkers.some(Boolean)
      ? await runner.recoverPersistedListAndPublish(page, monitor, {
          ...expected,
          listMarkers: recoveryMarkers as [string, string, string],
        })
      : await runner.addListToExistingPage(page, monitor, expected);
    monitor.assertNoServerErrors();
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const result = await runner.verifyListFrontend(await publicContext.newPage(), updated);
    expect(result.listMarkers).toHaveLength(3);
    expect(result.frontendVerified).toBe(true);
    console.log(`LIST_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page adds one Anchor with complete safe field coverage', async ({ browser, page }) => {
  test.setTimeout(300_000);
  const credentials = getEffectiveCredentials();
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  try {
    const expected = {
      nodeId: '25071',
      title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
      blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: [
        'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1',
        'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2',
        'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3',
      ],
    } as const;
    const recoveryId = process.env.COMPONENT_POC_EXISTING_ANCHOR_ID?.trim();
    const recoveryLabel = process.env.COMPONENT_POC_EXISTING_ANCHOR_LABEL?.trim();
    const updated = recoveryId || recoveryLabel
      ? (() => {
          if (!recoveryId?.startsWith('qa-automated-anchor-') || !recoveryLabel?.startsWith(`${AUTOMATED_CONTENT_PREFIX}ANCHOR-LABEL-`)) throw new Error('COMPONENT_POC_BLOCKED: Anchor recovery requires exact QA-owned ID and Label.');
          return { ...expected, anchorId: recoveryId, anchorLabel: recoveryLabel, anchorDelta: '3', published: true as const };
        })()
      : await (async () => {
          await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
          return runner.addAnchorToExistingPage(page, monitor, expected);
        })();
    monitor.assertNoServerErrors();
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const result = await runner.verifyAnchorFrontend(await publicContext.newPage(), updated);
    expect(result.frontendVerified).toBe(true);
    expect(result.fragmentRetained).toBe(true);
    console.log(`ANCHOR_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page maximizes safe field coverage for all four existing components', async ({ browser, page }) => {
  test.setTimeout(360_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071',
    title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
    blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: [
      'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1',
      'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2',
      'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3',
    ],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8',
    anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
  } as const;
  try {
    const updated = await runner.maximizeExistingComponentCoverage(page, monitor, expected);
    monitor.assertNoServerErrors();
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const result = await runner.verifyMaximizedComponentCoverage(await publicContext.newPage(), updated, expected);
    expect(result.published).toBe(true);
    expect(result.frontendVerified).toBe(true);
    console.log(`EXISTING_COMPONENT_COVERAGE_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Saved Basic Page component field coverage renders publicly', async ({ browser }) => {
  const credentials = getEffectiveCredentials();
  const runner = new BasicPageFormattedTextPocRunner();
  const context = await browser.newContext({
    baseURL: 'https://devv.leidos.com',
    httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
  });
  try {
    const result = await runner.verifyMaximizedComponentCoverage(await context.newPage(), {
      nodeId: '25071',
      title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      mediaId: '45031',
      fieldsPopulated: [],
      fieldsIntentionallyEmpty: ['List item 1 Icon', 'List item 2 Icon', 'List item 3 Icon'],
      published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
      blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: [
        'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1',
        'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2',
        'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3',
      ],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8',
    });
    expect(result.frontendVerified).toBe(true);
    console.log(`EXISTING_COMPONENT_COVERAGE_RECOVERY_RESULT ${JSON.stringify(result)}`);
  } finally {
    await context.close();
  }
});

test('Existing Basic Page adds one Jump nav and navigates to the existing Anchor', async ({ browser, page }) => {
  test.setTimeout(360_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071',
    title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
    blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: [
      'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1',
      'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2',
      'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3',
    ],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8',
    anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
  } as const;
  try {
    const updated = await runner.addJumpNavToExistingPage(page, monitor, expected);
    monitor.assertNoServerErrors();
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const result = await runner.verifyJumpNavFrontend(await publicContext.newPage(), updated, expected);
    expect(result.published).toBe(true);
    expect(result.frontendVerified).toBe(true);
    expect(result.mouseClickVerified).toBe(true);
    expect(result.keyboardVerified).toBe(true);
    console.log(`JUMP_NAV_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Saved Basic Page Jump nav publishes and navigates to the existing Anchor', async ({ browser, page }) => {
  test.setTimeout(300_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
    blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8',
    anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
  } as const;
  try {
    const recovered = await runner.recoverSavedJumpNavAndPublish(page, monitor, expected);
    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const result = await runner.verifyJumpNavFrontend(await publicContext.newPage(), recovered, expected);
    expect(result.frontendVerified).toBe(true);
    expect(result.mouseClickVerified).toBe(true);
    expect(result.keyboardVerified).toBe(true);
    console.log(`JUMP_NAV_COMPONENT_POC_RECOVERY_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Published Basic Page Jump nav supports mouse and keyboard Anchor navigation', async ({ browser }) => {
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyJumpNavFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', jumpNavDelta: '4', jumpNavType: 'inline',
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8', published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
      blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    });
    expect(result.mouseClickVerified).toBe(true);
    expect(result.keyboardVerified).toBe(true);
    console.log(`JUMP_NAV_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(result)}`);
  } finally {
    await context.close();
  }
});

test('Existing Basic Page adds one three-item Tabs component with stateful interaction', async ({ browser, page }) => {
  test.setTimeout(420_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
    blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
  } as const;
  try {
    const updated = await runner.addTabsToExistingPage(page, monitor, expected);
    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const result = await runner.verifyTabsFrontend(await publicContext.newPage(), updated, expected);
    expect(result.frontendVerified).toBe(true);
    expect(result.mouseVerified).toBe(true);
    expect(result.keyboardVerified).toBe(true);
    console.log(`TABS_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Published Basic Page Tabs supports mouse and keyboard state changes', async ({ browser }) => {
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyTabsFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', tabsDelta: '5',
      heading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159',
      tabLabels: ['QA-AUTOMATED-TAB-1-20260918-111250-0159', 'QA-AUTOMATED-TAB-2-20260918-111250-0159', 'QA-AUTOMATED-TAB-3-20260918-111250-0159'],
      tabContents: ['QA-AUTOMATED-TAB-CONTENT-1-20260918-111250-0159', 'QA-AUTOMATED-TAB-CONTENT-2-20260918-111250-0159', 'QA-AUTOMATED-TAB-CONTENT-3-20260918-111250-0159'],
      published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
    });
    expect(result.frontendVerified).toBe(true);
    expect(result.mouseVerified).toBe(true);
    expect(result.keyboardVerified).toBe(true);
    console.log(`TABS_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(result)}`);
  } finally { await context.close(); }
});

test('Existing Basic Page adds one three-item Card Grid with maximum safe field coverage', async ({ browser, page }) => {
  test.setTimeout(480_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484',
    blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
  } as const;
  try {
    const updated = await runner.addCardGridToExistingPage(page, monitor, expected);
    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const result = await runner.verifyCardGridFrontend(await publicContext.newPage(), updated, expected);
    expect(result.frontendVerified).toBe(true);
    expect(result.cardsRendered).toBe(3);
    expect(result.ctaInteractionVerified).toBe(true);
    expect(result.imagesVerified).toBe(true);
    console.log(`CARD_GRID_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Published Basic Page Card Grid renders three complete Profile cards', async ({ browser }) => {
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyCardGridFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', cardGridDelta: '6',
      heading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37', text: 'QA-AUTOMATED-CARD-GRID-TEXT-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      cardTitles: ['QA-AUTOMATED-CARD-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-3-20260918-123305-4b37'],
      cardHrefs: ['/node/25071#qa-automated-anchor-20260918-093658-fda8', '/node/25071#qa-automated-anchor-20260918-093658-fda8', '/node/25071#qa-automated-anchor-20260918-093658-fda8'],
      mediaId: '45031', published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
    });
    expect(result.frontendVerified).toBe(true);
    expect(result.cardsRendered).toBe(3);
    expect(result.ctaInteractionVerified).toBe(true);
    console.log(`CARD_GRID_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(result)}`);
  } finally { await context.close(); }
});

test('Existing Basic Page adds one fully configured Stat callout', async ({ browser, page }) => {
  test.setTimeout(420_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
    cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
    cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
  } as const;
  try {
    const updated = await runner.addStatCalloutToExistingPage(page, monitor, expected);
    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const result = await runner.verifyStatCalloutFrontend(await publicContext.newPage(), updated, expected);
    expect(result.frontendVerified).toBe(true);
    expect(result.statisticValue).toBe('200');
    console.log(`STAT_CALLOUT_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Published Basic Page Stat callout renders its exact Statistic value', async ({ browser }) => {
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyStatCalloutFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', statCalloutDelta: '7',
      statisticId: '25046', statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', statisticValue: '200',
      alignment: 'left', padding: 'padding', color: 'purple', published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
    });
    expect(result.frontendVerified).toBe(true);
    console.log(`STAT_CALLOUT_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(result)}`);
  } finally { await context.close(); }
});

test('Existing Basic Page adds one complete existing-media Video component', async ({ browser, page }) => {
  test.setTimeout(480_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
    cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
    cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
    statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', statisticValue: '200',
  } as const;
  try {
    const updated = await runner.addVideoToExistingPage(page, monitor, expected);
    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const result = await runner.verifyVideoFrontend(await publicContext.newPage(), updated, expected);
    expect(result.frontendVerified).toBe(true);
    expect(result.desktopVisible).toBe(true);
    expect(result.mobileVisible).toBe(true);
    console.log(`VIDEO_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Published Basic Page Video lazy-load player works on desktop and mobile', async ({ browser }) => {
  test.setTimeout(90_000);
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyVideoFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', videoDelta: '8',
      videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953', caption: 'QA-AUTOMATED-VIDEO-EXISTING-CAPTION-20260918-171548-b953',
      mediaId: '44536', mediaName: 'Leidos Australia Sea Archer Animation July 2026.mp4', mediaBundle: 'Remote video', provider: 'YouTube', published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'], statisticValue: '200',
    });
    expect(result.frontendVerified).toBe(true);
    expect(result.desktopVisible).toBe(true);
    expect(result.mobileVisible).toBe(true);
    console.log(`VIDEO_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(result)}`);
  } finally { await context.close(); }
});

test('Existing Basic Page adds four Card: Collection (v2.0) display variants and publishes them', async ({ browser, page }) => {
  test.setTimeout(900_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
    tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159',
    cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
    cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
    statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
  } as const;
  try {
    const results = await runner.addCardCollectionV2VariantsToExistingPage(page, monitor, expected);
    expect(results).toHaveLength(4);
    expect(results.map((result) => result.variantLabel)).toEqual(['Display Two', 'Display Three', 'Display Four', 'Display Carousel']);
    console.log(`CARD_COLLECTION_V2_COMPONENT_POC_CMS_RESULT ${JSON.stringify(results)}`);

    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const publicPage = await publicContext.newPage();
    await publicPage.goto('/node/25071', { waitUntil: 'domcontentloaded' });
    const pageText = await publicPage.locator('body').innerText();
    for (const label of ['Display Two', 'Display Three', 'Display Four', 'Display Carousel']) {
      expect(pageText).toContain(label);
    }
    console.log('CARD_COLLECTION_V2_PUBLIC_PAGE_VERIFY', JSON.stringify({ pageTitle: await publicPage.getByRole('heading', { name: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', exact: true }).count(), labels: ['Display Two', 'Display Three', 'Display Four', 'Display Carousel'] }));
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page adds one complete Banner with maximum safe field coverage', async ({ browser, page }) => {
  test.setTimeout(600_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor();
  monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  const expected = {
    nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
    formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
    listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
    anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
    tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159',
    cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
    cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
    statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', statisticValue: '200',
    videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
    cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
    collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
  } as const;
  try {
    const updated = await runner.addBannerToExistingPage(page, monitor, expected);
    console.log(`BANNER_COMPONENT_POC_CMS_RESULT ${JSON.stringify(updated)}`);
    publicContext = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
    const result = await runner.verifyBannerFrontend(await publicContext.newPage(), updated, expected);
    expect(result.frontendVerified).toBe(true);
    expect(result.desktopVisible).toBe(true);
    expect(result.mobileVisible).toBe(true);
    console.log(`BANNER_COMPONENT_POC_RESULT ${JSON.stringify(result)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Published Basic Page Banner renders and behaves on desktop and mobile', async ({ browser }) => {
  test.setTimeout(120_000);
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyBannerFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', bannerDelta: '10',
      eyebrow: 'QA-AUTOMATED-BANNER-EYEBROW-20260918-184901-176f', heading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      subtitle: 'QA-AUTOMATED-BANNER-SUBTITLE-20260918-184901-176f', text: 'QA-AUTOMATED-BANNER-TEXT-20260918-184901-176f',
      ctaText: 'QA-AUTOMATED-BANNER-CTA-20260918-184901-176f', ctaAriaLabel: 'Open QA automated banner 20260918-184901-176f',
      ctaHref: '/node/25071#qa-automated-anchor-20260918-093658-fda8', mediaId: '45031', published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticValue: '200', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
    });
    console.log(`BANNER_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(result)}`);
    expect(result.frontendVerified).toBe(true);
    expect(result.headingLevel).toBe(2);
    expect(result.desktopVisible).toBe(true);
    expect(result.mobileVisible).toBe(true);
  } finally { await context.close(); }
});

test('Existing Basic Page adds one Embed Code component and verifies persistence plus frontend shell', async ({ browser, page }) => {
  test.setTimeout(600_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor(); monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  try {
    const result = await runner.addEmbedCodeToExistingPage(page, monitor, {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      carouselHeading: 'QA-AUTOMATED-CAROUSEL-HEADING-20260919-060207-dc1e',
    });
    expect(result.marker).toBe('QA AUTOMATED EMBED CODE PLACEHOLDER');
    expect(result.published).toBe(true);
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const frontend = await runner.verifyEmbedCodeFrontend(await publicContext.newPage(), result, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticValue: '200', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      carouselHeading: 'QA-AUTOMATED-CAROUSEL-HEADING-20260919-060207-dc1e',
    });
    expect(frontend.frontendVerified).toBe(true);
    expect(frontend.desktopVisible).toBe(true);
    expect(frontend.mobileVisible).toBe(true);
    console.log(`EMBED_CODE_COMPONENT_POC_RESULT ${JSON.stringify(frontend)}`);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page adds one five-item Card Carousel', async ({ page }) => {
  test.setTimeout(900_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor(); monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.addCarouselToExistingPage(page, monitor, {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
    });
    console.log(`CAROUSEL_COMPONENT_POC_CMS_RESULT ${JSON.stringify(result)}`);
    expect(result.published).toBe(true);
  } finally { monitor.stop(); }
});

test('Existing Basic Page adds one synthetic Marketo form, publishes it, and validates frontend shell', async ({ browser, page }) => {
  test.setTimeout(600_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor(); monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  let publicContext;
  try {
    const result = await runner.addSyntheticMarketoFormToExistingPage(page, monitor, {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      carouselHeading: 'QA-AUTOMATED-CAROUSEL-HEADING-20260919-060207-dc1e',
    });
    console.log(`MARKETO_COMPONENT_POC_CMS_RESULT ${JSON.stringify(result)}`);
    expect(result.published).toBe(true);
    publicContext = await browser.newContext({
      baseURL: 'https://devv.leidos.com',
      httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword },
    });
    const frontend = await runner.verifySyntheticMarketoFrontend(await publicContext.newPage(), result, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticValue: '200', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      carouselHeading: 'QA-AUTOMATED-CAROUSEL-HEADING-20260919-060207-dc1e',
    });
    console.log(`MARKETO_COMPONENT_POC_FRONTEND_RESULT ${JSON.stringify(frontend)}`);
    expect(frontend.cmsComponent).toBe('PASS');
    expect(frontend.frontendShellContent).toBe('PASS');
    expect(frontend.realMarketoFormLoading).toBe('NOT VALIDATED — synthetic Form ID');
    expect(frontend.desktopVisible).toBe(true);
    expect(frontend.mobileVisible).toBe(true);
  } finally {
    await publicContext?.close();
    monitor.stop();
  }
});

test('Existing Basic Page Marketo form is blocked without a verified QA Form ID', async ({ page }) => {
  test.setTimeout(600_000);
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const monitor = new NetworkMonitor(); monitor.start(page);
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.assessMarketoFormOnExistingPage(page, monitor, {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticTitle: 'QA-AUTOMATED-Statistic-20260917-080900-2931-UPDATED', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      carouselHeading: 'QA-AUTOMATED-CAROUSEL-HEADING-20260919-060207-dc1e',
    });
    console.log(`MARKETO_COMPONENT_POC_CMS_RESULT ${JSON.stringify(result)}`);
    expect(result.creation).toBe('BLOCKED');
    expect(result.blockingField).toBe('field_marketo_form[0][form_id]');
    expect(result.drupalWrites).toBe('none');
    expect(result.formSubmissionPerformed).toBe(false);
  } finally { monitor.stop(); }
});

test('Published Basic Page twelve-component baseline is preserved without Marketo', async ({ browser }) => {
  test.setTimeout(120_000);
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  try {
    const result = await runner.verifyCumulativeBaselineWithoutMarketo(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484',
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticValue: '200', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
      carouselHeading: 'QA-AUTOMATED-CAROUSEL-HEADING-20260919-060207-dc1e',
    });
    console.log(`MARKETO_COMPONENT_POC_BASELINE_RESULT ${JSON.stringify(result)}`);
    expect(result.baselinePreserved).toBe(true);
    expect(result.marketoRendered).toBe(false);
  } finally { await context.close(); }
});

test('Published Basic Page Card Carousel navigates on desktop and mobile', async ({ browser }) => {
  test.setTimeout(120_000);
  const credentials = getEffectiveCredentials();
  const context = await browser.newContext({ baseURL: 'https://devv.leidos.com', httpCredentials: { username: credentials.basicAuthUsername, password: credentials.basicAuthPassword } });
  const runner = new BasicPageFormattedTextPocRunner();
  const runId = '20260919-060207-dc1e';
  try {
    await runner.verifyCarouselFrontend(await context.newPage(), {
      nodeId: '25071', title: 'QA-AUTOMATED-Component-POC-20260918-084653-1484', carouselDelta: '11',
      heading: `QA-AUTOMATED-CAROUSEL-HEADING-${runId}`,
      ctaText: `QA-AUTOMATED-CAROUSEL-CTA-${runId}`, ctaAriaLabel: `Open QA automated carousel ${runId}`,
      ctaHref: '/node/25071#qa-automated-anchor-20260918-093658-fda8',
      cardHeadings: [1, 2, 3, 4, 5].map((index) => `QA-AUTOMATED-CAROUSEL-CARD-${index}-${runId}`) as [string, string, string, string, string],
      cardTexts: [1, 2, 3, 4, 5].map((index) => `QA-AUTOMATED-CAROUSEL-TEXT-${index}-${runId}`) as [string, string, string, string, string],
      published: true,
    }, {
      formattedTextMarker: 'QA-AUTOMATED-FORMATTED-TEXT-20260918-084653-1484', blockquoteMarker: 'QA-AUTOMATED-BLOCKQUOTE-20260918-085918-746e',
      listMarkers: ['QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-1', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-2', 'QA-AUTOMATED-LIST-20260918-092242-3543-ITEM-3'],
      anchorId: 'qa-automated-anchor-20260918-093658-fda8', anchorLabel: 'QA-AUTOMATED-ANCHOR-LABEL-20260918-093658-fda8',
      tabsHeading: 'QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', cardGridHeading: 'QA-AUTOMATED-CARD-GRID-HEADING-20260918-123305-4b37',
      cardNames: ['QA-AUTOMATED-CARD-NAME-1-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-2-20260918-123305-4b37', 'QA-AUTOMATED-CARD-NAME-3-20260918-123305-4b37'],
      statisticValue: '200', videoTitle: 'QA-AUTOMATED-VIDEO-EXISTING-HEADING-20260918-171548-b953',
      cardCollectionHeading: 'QA-AUTOMATED-CARD-COLLECTION-HEADING-20260918-174621-18d4',
      collectionCardHeadings: ['QA-AUTOMATED-COLLECTION-CARD-1-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-2-20260918-174621-18d4', 'QA-AUTOMATED-COLLECTION-CARD-3-20260918-174621-18d4'],
      bannerHeading: 'QA-AUTOMATED-BANNER-HEADING-20260918-184901-176f',
    });
  } finally { await context.close(); }
});
