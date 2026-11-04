import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginToDrupal } from '../src/auth/drupal-login';
import { getEffectiveCredentials, getEnvironmentConfig } from '../src/config/environments';
import { assertPublishingAllowed } from '../src/config/write-safety';

const stage = process.env.DRUPAL_TARGET === 'leidos' && process.env.DRUPAL_TIER === 'stage';
const host = stage
  ? { nodeId: '25351', title: 'QA-AUTOMATED-STAGE-Basic-Page-20261103-142545-194d-UPDATED', publicPath: '/node/25351' }
  : { nodeId: '616', title: 'QA-AUTOMATED-Basic-Page-20261003-071529-9f8e-UPDATED', publicPath: '/content/qa-automated-basic-page-20261003-071529-9f8e-updated' };

const artifactDirectory = path.resolve('artifacts', 'component-functional', stage ? 'stage-node-25351' : 'benefits-node-616');

test('Benefits live Color scheme audit for every Basic Page component type', async ({ page }) => {
  test.setTimeout(1_800_000);
  page.setDefaultTimeout(30_000);
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe(stage ? 'leidos' : 'benefits');
  expect(environment.baseUrl).toBe(stage ? 'https://stage.leidos.com' : 'https://benefits-dev.leidos.com');
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  const addControls = await page.locator('input[name^="field_page_paragraphs_"][name$="_add_more"]').evaluateAll((controls) => controls.map((control) => ({
    machineName: control.getAttribute('name')?.replace(/^field_page_paragraphs_/, '').replace(/_add_more$/, '') ?? '',
    component: (control.getAttribute('value') ?? '').replace(/^Add\s+/, ''),
  })));
  expect(addControls).toHaveLength(29);
  const audit: Array<Record<string, unknown>> = [];

  for (const entry of addControls) {
    await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    const wrapper = page.locator('.field--name-field-page-paragraphs.field--widget-paragraphs');
    let row = wrapper.locator(`tr.paragraph-type--${entry.machineName.replaceAll('_', '-')}`).first();
    let source = 'existing';
    if ((await row.count()) === 0) {
      source = 'unsaved-add-form';
      const control = wrapper.locator(`input[name="field_page_paragraphs_${entry.machineName}_add_more"]`);
      if (!await control.isVisible()) await wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button').click();
      const before = await wrapper.locator('tr.draggable').count();
      await control.click();
      await expect.poll(() => wrapper.locator('tr.draggable').count(), { timeout: 30_000 }).toBeGreaterThan(before);
      row = wrapper.locator(`tr.paragraph-type--${entry.machineName.replaceAll('_', '-')}`).last();
    }
    const edit = row.getByRole('button', { name: 'Edit', exact: true });
    if (await edit.isVisible()) {
      await edit.click();
      await expect(row.getByRole('button', { name: 'Collapse', exact: true })).toBeVisible({ timeout: 30_000 });
    }
    const select = row.locator('select[name$="[field_color_scheme]"]');
    const count = await select.count();
    const options = count === 1 ? await select.locator('option').evaluateAll((items) => items.map((option) => ({
      label: option.textContent?.trim() ?? '', value: (option as HTMLOptionElement).value,
    }))) : [];
    const configurableFields = await row.locator('select:visible, input[type="radio"]:visible, input[type="checkbox"]:visible').evaluateAll((elements) => {
      const labelFor = (element: Element) => {
        const id = element.getAttribute('id');
        const direct = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        return (direct?.textContent ?? element.closest('.form-item, .form-wrapper')?.querySelector('label, legend')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      };
      const seen = new Set<string>();
      return elements.flatMap((element) => {
        const input = element as HTMLInputElement | HTMLSelectElement;
        const name = input.name;
        const key = `${input.type}:${name}`;
        if (seen.has(key)) return [];
        seen.add(key);
        if (input instanceof HTMLSelectElement) return [{
          name, label: labelFor(input), widget: input.multiple ? 'multi-select' : 'select', required: input.required || input.getAttribute('aria-required') === 'true',
          options: Array.from(input.options).map((option) => ({ label: option.text.trim(), value: option.value })), selected: Array.from(input.selectedOptions).map((option) => option.value),
        }];
        const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`)).filter((candidate) => candidate.offsetParent !== null);
        return [{
          name, label: input.type === 'radio' ? (input.closest('fieldset')?.querySelector('legend')?.textContent ?? labelFor(input)).replace(/\s+/g, ' ').trim() : labelFor(input),
          widget: input.type, required: group.some((candidate) => candidate.required || candidate.getAttribute('aria-required') === 'true'),
          options: group.map((candidate) => ({ label: labelFor(candidate), value: candidate.value })), selected: group.filter((candidate) => candidate.checked).map((candidate) => candidate.value),
        }];
      });
    });
    audit.push({ component: entry.component, machineName: entry.machineName, source, colorScheme: count === 1, required: count === 1 && await select.getAttribute('required') !== null, options, configurableFields });
  }
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(path.join(artifactDirectory, 'color-scheme-audit.json'), `${JSON.stringify({ target: environment.baseUrl, nodeId: host.nodeId, audit }, null, 2)}\n`, 'utf8');
  console.log(`BENEFITS_COLOR_SCHEME_AUDIT ${JSON.stringify(audit)}`);
});

test('Benefits Basic Page live component inventory and write preconditions', async ({ page }) => {
  test.setTimeout(300_000);
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe(stage ? 'leidos' : 'benefits');
  expect(environment.baseUrl).toBe(stage ? 'https://stage.leidos.com' : 'https://benefits-dev.leidos.com');
  assertPublishingAllowed();
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const response = await page.request.get(`/node/${host.nodeId}/edit`);
  expect(response.status()).toBeLessThan(400);
  const html = await response.text();
  expect(html).toContain(host.title);
  const controls = [...html.matchAll(/<input\b[^>]*\bname="field_page_paragraphs_([^"]+)_add_more"[^>]*>/g)];
  const componentTypes = controls.map((match) => {
    const tag = match[0];
    const rawValue = /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? match[1];
    return { label: rawValue.replace(/^Add\s+/, '').replaceAll('&amp;', '&'), machineName: match[1] };
  });
  const physicalTypes = (html.match(/paragraph-type--[a-z0-9-]+/g) ?? []).map((value) => value.replace('paragraph-type--', ''));
  const inventory = { componentTypes, existingRows: physicalTypes.length, physicalTypes };
  const published = /<strong[^>]*>\s*Published\s*<\/strong>|>\s*Published\s*</i.test(html);
  expect(published).toBe(true);
  const publicResponse = await page.request.get(host.publicPath);
  expect(publicResponse.status()).toBe(200);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(path.join(artifactDirectory, 'live-component-inventory.json'), `${JSON.stringify({ target: environment.baseUrl, nodeId: host.nodeId, title: host.title, published, publicStatus: publicResponse.status(), ...inventory }, null, 2)}\n`, 'utf8');
  console.log(`BENEFITS_COMPONENT_INVENTORY ${JSON.stringify({ published, publicStatus: publicResponse.status(), ...inventory })}`);
});

test('Benefits read-only component dependency inspection', async ({ page }) => {
  test.setTimeout(300_000);
  const environment = getEnvironmentConfig();
  expect(environment.target).toBe(stage ? 'leidos' : 'benefits');
  expect(environment.baseUrl).toBe(stage ? 'https://stage.leidos.com' : 'https://benefits-dev.leidos.com');
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const inspect = async (machineName: string) => {
    await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    const wrapper = page.locator('.field--name-field-page-paragraphs.field--widget-paragraphs');
    const add = wrapper.locator(`input[name="field_page_paragraphs_${machineName}_add_more"]`);
    if (!(await add.isVisible())) { await wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button').click(); await add.waitFor({ state: 'visible' }); }
    const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click();
    expect((await ajax).status()).toBeLessThan(500);
    return wrapper;
  };

  const videoWrapper = await inspect('video');
  const videoTrigger = videoWrapper.locator('[name^="field_video_media-media-library-open-button-field_page_paragraphs-"]').filter({ visible: true }).last();
  await videoTrigger.click();
  const dialog = page.locator('[role="dialog"], .ui-dialog').filter({ visible: true }).last();
  await dialog.waitFor({ state: 'visible' });
  const videoChoices = await dialog.locator('input[type="checkbox"][name^="media_library_select_form["]').evaluateAll((elements) => elements.map((element) => {
    const input = element as HTMLInputElement;
    const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent?.replace(/\s+/g, ' ').trim() : '';
    return { name: input.name, label };
  }));

  const personalizationWrapper = await inspect('personalization');
  const personalizationInput = personalizationWrapper.locator('input[data-autocomplete-path]').filter({ visible: true }).last();
  const personalizationChoices: string[] = [];
  if ((await personalizationInput.count()) === 1) {
    await personalizationInput.fill('QA');
    const menu = page.locator('.ui-autocomplete:visible').last();
    if (await menu.isVisible({ timeout: 5_000 }).catch(() => false)) personalizationChoices.push(...await menu.locator('[role="option"], .ui-menu-item').allInnerTexts());
  }
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(path.join(artifactDirectory, 'dependency-inspection.json'), `${JSON.stringify({ persistentWrites: 0, videoChoices, personalizationChoices }, null, 2)}\n`, 'utf8');
  console.log(`BENEFITS_COMPONENT_DEPENDENCIES ${JSON.stringify({ videoChoices, personalizationChoices })}`);
});

test('Benefits read-only external form option inspection', async ({ page }) => {
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  const inspect = async (machineName: string) => {
    await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    const wrapper = page.locator('.field--name-field-page-paragraphs.field--widget-paragraphs');
    const add = wrapper.locator(`input[name="field_page_paragraphs_${machineName}_add_more"]`);
    if (!(await add.isVisible())) { await wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button').click(); await add.waitFor({ state: 'visible' }); }
    await add.click();
    const row = wrapper.locator(`tr.paragraph-type--${machineName.replaceAll('_', '-')}`).last();
    await row.waitFor({ state: 'visible' });
    return row.locator('select, input, textarea').evaluateAll((elements) => elements.map((element) => ({
      tag: element.tagName, name: element.getAttribute('name'), type: element.getAttribute('type'), required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
      options: element instanceof HTMLSelectElement ? Array.from(element.options).map((option, index) => ({ index, label: option.text, value: option.value })) : undefined,
    })));
  };
  const marketo = await inspect('marketo');
  const modal = await inspect('marketo_modal');
  const hubspot = await inspect('hubspot_form');
  console.log(`BENEFITS_EXTERNAL_FORM_OPTIONS ${JSON.stringify({ marketo, modal, hubspot })}`);
});

test('Benefits read-only frontend component evidence', async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const response = await page.goto(host.publicPath, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  const evidence = await page.locator('[class*="paragraph--type--"]').evaluateAll((elements) => elements.map((element) => ({
    classes: element.className,
    id: element.id,
    text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
    links: Array.from(element.querySelectorAll('a')).map((link) => ({ text: (link.textContent ?? '').trim(), href: link.getAttribute('href') })),
    images: element.querySelectorAll('img').length,
    buttons: Array.from(element.querySelectorAll('button')).map((button) => (button.textContent ?? '').trim()),
  })));
  const ceros = stage ? { container: 0, iframe: 0, iframeSrc: null, script: 0 } : {
    container: await page.locator('#experience-5ef0b29321fa4').count(),
    iframe: await page.locator('iframe.ceros-experience').count(),
    iframeSrc: await page.locator('iframe.ceros-experience').first().getAttribute('src').catch(() => null),
    script: await page.locator('script[src*="view.ceros.com/scroll-proxy.min.js"]').count(),
  };
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const overflowElements = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *')).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.right <= document.documentElement.clientWidth + 1 && element.scrollWidth <= element.clientWidth + 1) return [];
    const component = element.closest<HTMLElement>('[class*="paragraph--type--"]');
    return [{ tag: element.tagName.toLowerCase(), classes: element.className, width: Math.round(rect.width), right: Math.round(rect.right), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, componentClasses: component?.className ?? '', text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) }];
  }).slice(0, 30));
  console.log(`BENEFITS_FRONTEND_EVIDENCE ${JSON.stringify({ evidence, ceros, pageErrors, consoleErrors, mobileOverflow, overflowElements })}`);
});

test('Benefits read-only functional retest evidence', async ({ page }) => {
  await page.goto(host.publicPath, { waitUntil: 'networkidle' });
  const anchorTarget = page.locator('#qa-automated-anchor-20261003-remaining');
  const jumpLink = page.locator('a[href="#qa-automated-anchor-20261003-remaining"]');
  const tabs = page.locator('.paragraph--type--tabs').first();
  const secondTab = tabs.getByRole('button', { name: 'QA-AUTOMATED-TAB-2-20261003-remaining', exact: true });
  await secondTab.click();
  const carousel = page.locator('.paragraph--type--subsidiaries').first();
  const result = {
    anchorTarget: await anchorTarget.count(), jumpLink: await jumpLink.count(),
    anchorVisibleAfterActivation: false,
    secondTabContentVisible: await tabs.getByText('QA-AUTOMATED-TAB-CONTENT-2-20261003-remaining', { exact: true }).isVisible(),
    carouselCards: await carousel.locator('.paragraph--type--subsidiaries-item').count(),
    owlLoaded: await carousel.locator('.owl-loaded').count(), stage: await carousel.locator('.owl-stage').count(),
    previous: await carousel.getByRole('button', { name: /previous/i }).count(), next: await carousel.getByRole('button', { name: /next/i }).count(),
  };
  await jumpLink.click();
  result.anchorVisibleAfterActivation = await anchorTarget.isVisible().catch(() => false);
  console.log(`BENEFITS_FUNCTIONAL_EVIDENCE ${JSON.stringify(result)}`);
});

test('Benefits automated Video persistence and frontend verification', async ({ page }) => {
  const marker = 'QA-AUTOMATED-VIDEO-20261004-062740';
  const caption = 'QA automated Benefits video caption.';
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  const row = page.locator('tr.paragraph-type--video').filter({ hasText: marker });
  await expect(row).toHaveCount(1);
  const edit = row.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible()) await edit.click();
  await expect(row.locator('input[name$="[field_video_title][0][value]"]')).toHaveValue(marker);
  await expect(row.locator('textarea[name$="[field_video_caption][0][value]"]')).toHaveValue(caption);
  await expect(row.locator('input[type="hidden"][name$="[field_video_media][selection][0][target_id]"]')).toHaveValue('3736');
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(host.publicPath, { waitUntil: 'networkidle' });
  const component = page.locator('.paragraph--type--video').filter({ hasText: marker });
  await expect(component).toHaveCount(1);
  await expect(component.getByText(marker, { exact: true })).toBeVisible();
  await expect(component.getByText(caption, { exact: true })).toBeVisible();
  const play = component.getByRole('button', { name: /play/i });
  await expect(play).toBeVisible();
  await play.click();
  await expect(page.locator('iframe[src*="youtube"], iframe[src*="youtu.be"]').filter({ visible: true })).toHaveCount(1, { timeout: 20_000 });
  console.log(`BENEFITS_VIDEO_RESULT ${JSON.stringify({ marker, mediaId: '3736', pageErrors, consoleErrors })}`);
});

test('Benefits automated Carousel persistence and frontend verification', async ({ page }) => {
  const runId = '20261004-063700';
  const marker = `QA-AUTOMATED-CARD-CAROUSEL-${runId}`;
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  const row = page.locator('tr.paragraph-type--subsidiaries').filter({ hasText: marker });
  await expect(row).toHaveCount(1);
  const saved = (await row.innerText()).replace(/\s+/g, ' ');
  for (let index = 1; index <= 5; index += 1) {
    expect(saved).toContain(`QA-AUTOMATED-CAROUSEL-CARD-${index}-${runId}`);
  }
  expect(saved).toContain('QA Carousel Link');
  expect(saved).toMatch(/padding/i);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(host.publicPath, { waitUntil: 'networkidle' });
  const carousel = page.locator('.paragraph--type--subsidiaries').filter({ hasText: marker });
  await expect(carousel).toHaveCount(1);
  const cards = carousel.locator('.paragraph--type--subsidiaries-item');
  await expect(cards).toHaveCount(5);
  for (let index = 1; index <= 5; index += 1) {
    await expect(cards.nth(index - 1)).toContainText(`QA-AUTOMATED-CAROUSEL-CARD-${index}-${runId}`);
    await expect(cards.nth(index - 1)).toContainText(`QA-AUTOMATED-CAROUSEL-TEXT-${index}-${runId}`);
  }
  const cta = carousel.getByRole('link', { name: 'QA Carousel Link', exact: true });
  await expect(cta).toHaveCount(1);
  expect(new URL(await cta.getAttribute('href') ?? '', page.url()).pathname).toBe('/medical');

  const previous = carousel.getByRole('button', { name: 'Previous slide', exact: true });
  const next = carousel.getByRole('button', { name: 'Next slide', exact: true });
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();

  const pagination = carousel.locator('.swiper-pagination');
  await expect(pagination).toBeVisible();
  const bullets = pagination.locator('.swiper-pagination-bullet');
  const bulletCount = await bullets.count();
  if (bulletCount > 0) await expect(pagination.locator('.swiper-pagination-bullet-active, [aria-current="true"]')).toHaveCount(1);

  const readState = () => carousel.evaluate((element) => {
    const slides = Array.from(element.querySelectorAll<HTMLElement>('[role="group"][aria-label$=" / 5"]'));
    const viewport = slides[0]?.parentElement?.parentElement;
    const viewportRect = viewport?.getBoundingClientRect();
    const visibleSlides = viewportRect
      ? slides.filter((slide) => {
          const rect = slide.getBoundingClientRect();
          return rect.width > 0 && rect.right > viewportRect.left + 1 && rect.left < viewportRect.right - 1;
        })
      : [];
    const pagination = Array.from(element.querySelectorAll<HTMLElement>('.swiper-pagination-bullet'));
    const activeBullet = pagination.findIndex((bullet) => bullet.classList.contains('swiper-pagination-bullet-active') || bullet.getAttribute('aria-current') === 'true');
    return {
      visibleSlides: visibleSlides.map((slide) => slide.getAttribute('aria-label')),
      activeBullet,
    };
  });

  const initial = await readState();
  expect(initial.visibleSlides).toHaveLength(3);
  if (bulletCount > 0) expect(initial.activeBullet).toBeGreaterThanOrEqual(0);

  await next.click();
  await expect.poll(async () => JSON.stringify(await readState())).not.toBe(JSON.stringify(initial));
  await page.waitForTimeout(750);
  const afterNext = await readState();
  expect(afterNext.visibleSlides).not.toEqual(initial.visibleSlides);
  if (bulletCount > 0) expect(afterNext.activeBullet).not.toBe(initial.activeBullet);

  await previous.click();
  await page.waitForTimeout(750);
  await expect.poll(async () => (await readState()).visibleSlides).toEqual(initial.visibleSlides);
  if (bulletCount > 0) await expect.poll(async () => (await readState()).activeBullet).toBe(initial.activeBullet);

  await next.focus();
  await expect(next).toBeFocused();
  await next.press('Enter');
  await page.waitForTimeout(750);
  let afterKeyboardNext = await readState();
  let keyboardKey = 'Enter';
  if (JSON.stringify(afterKeyboardNext.visibleSlides) === JSON.stringify(initial.visibleSlides)) {
    await next.press('Space');
    await page.waitForTimeout(750);
    afterKeyboardNext = await readState();
    keyboardKey = 'Space';
  }
  if (JSON.stringify(afterKeyboardNext.visibleSlides) === JSON.stringify(initial.visibleSlides)) {
    await next.press('ArrowRight');
    await page.waitForTimeout(750);
    afterKeyboardNext = await readState();
    keyboardKey = 'ArrowRight';
  }
  const keyboardActivated = JSON.stringify(afterKeyboardNext.visibleSlides) !== JSON.stringify(initial.visibleSlides);
  if (keyboardActivated) {
    await previous.focus();
    await expect(previous).toBeFocused();
    await previous.press(keyboardKey === 'ArrowRight' ? 'ArrowLeft' : keyboardKey);
    await page.waitForTimeout(750);
    await expect.poll(async () => (await readState()).visibleSlides).not.toEqual(afterKeyboardNext.visibleSlides);
  }

  console.log(`BENEFITS_CAROUSEL_RESULT ${JSON.stringify({ marker, bulletCount, keyboardActivated, keyboardKey, initial, afterNext, afterKeyboardNext, pageErrors: [...new Set(pageErrors)], consoleErrorCount: consoleErrors.length })}`);
});

test('Benefits external form saved variants verification', async ({ page }) => {
  test.setTimeout(900_000);
  const run = '20261004-065346';
  const credentials = getEffectiveCredentials();
  await loginToDrupal(page, { username: credentials.drupalUsername, password: credentials.drupalPassword });
  await page.goto(`/node/${host.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
  const verifyRow = async (type: string, header: string, expected: Record<string, string>, rowFilter?: RegExp) => {
    let row = page.locator(`tr.paragraph-type--${type}`).filter({ hasText: header });
    if (rowFilter) row = row.filter({ hasText: rowFilter });
    await expect(row).toHaveCount(1);
    const edit = row.getByRole('button', { name: 'Edit', exact: true });
    if (await edit.isVisible()) await edit.click();
    for (const [suffix, value] of Object.entries(expected)) await expect(row.locator(`[name$="${suffix}"]`)).toHaveValue(value);
  };
  const liveOptions = async (type: string, header: string, rowFilter?: RegExp) => {
    let row = page.locator(`tr.paragraph-type--${type}`).filter({ hasText: header });
    if (rowFilter) row = row.filter({ hasText: rowFilter });
    const edit = row.getByRole('button', { name: 'Edit', exact: true });
    if (await edit.isVisible()) await edit.click();
    const select = row.locator('select[name$="[field_color_scheme]"]');
    await expect(select).toBeVisible();
    return select.locator('option').evaluateAll((options) => options.map((option, index) => ({
      index, label: option.textContent?.trim() ?? '', value: (option as HTMLOptionElement).value,
      slug: (option as HTMLOptionElement).value === '_none' ? 'none' : (option as HTMLOptionElement).value,
    })));
  };
  const schemes = await liveOptions('marketo', `QA-AUTOMATED-MARKETO-none-${run}`);
  const hubspotSchemes = await liveOptions('hubspot-form', `QA-AUTOMATED-HUBSPOT-none-${run}`, /inline,/);
  expect(hubspotSchemes).toEqual(schemes);
  expect(new Set(schemes.map((scheme) => scheme.value)).size).toBe(schemes.length);
  for (let index = 0; index < schemes.length; index += 1) {
    const scheme = schemes[index];
    await verifyRow('marketo', `QA-AUTOMATED-MARKETO-${scheme.slug}-${run}`, {
      '[field_marketo_form][0][form_id]': String(9100000001 + index), '[field_paragraph_border]': 'padding', '[field_color_scheme]': scheme.value,
    });
  }
  await verifyRow('marketo-modal', `QA-AUTOMATED-MARKETO-MODAL-${run}`, {
    '[field_marketo_anchorid][0][value]': `qa-marketo-modal-${run}`, '[field_marketo_form][0][form_id]': '9200000001',
  });
  for (let index = 0; index < schemes.length; index += 1) {
    const scheme = schemes[index];
    await verifyRow('hubspot-form', `QA-AUTOMATED-HUBSPOT-${scheme.slug}-${run}`, {
      '[field_form_display]': 'inline', '[field_form_id][0][form_id]': String(9300000001 + index), '[field_color_scheme]': scheme.value, '[field_paragraph_border]': 'padding',
    }, index === 0 ? /inline,/ : undefined);
  }
  await verifyRow('hubspot-form', `QA-AUTOMATED-HUBSPOT-none-${run}`, {
    '[field_form_display]': 'modal', '[field_form_id][0][form_id]': '9300000099', '[field_color_scheme]': '_none', '[field_paragraph_border]': 'padding',
  }, /modal,/);
  await page.goto(host.publicPath, { waitUntil: 'networkidle' });
  const frontend: Array<Record<string, unknown>> = [];
  const expectedThemeClass: Record<string, string | null> = {
    _none: null, teal: 'bg-teal-25', white: 'bg-white', gray: 'bg-gray-25', 'dark-gray': 'bg-mid-gray',
    purple: 'bg-mid-ultraviolet', 'dark-purple': 'bg-mid-purple', green: 'bg-mid-teal',
  };
  for (const scheme of schemes) {
    for (const [type, header] of [['marketo', `QA-AUTOMATED-MARKETO-${scheme.slug}-${run}`], ['hubspot-form', `QA-AUTOMATED-HUBSPOT-${scheme.slug}-${run}`]] as const) {
      const component = page.locator(`.paragraph--type--${type}`).filter({ hasText: header }).first();
      await expect(component).toBeVisible();
      const theme = await component.evaluate((element) => {
        const slot = element.closest('.paragraph-slot') as HTMLElement | null;
        const computed = getComputedStyle(slot ?? element);
        return {
          classes: slot?.className ?? '', backgroundColor: computed.backgroundColor, color: computed.color,
          overflow: element.scrollWidth > element.clientWidth + 1,
        };
      });
      expect(theme.overflow).toBe(false);
      expect(theme.color).not.toBe('rgba(0, 0, 0, 0)');
      if (expectedThemeClass[scheme.value]) expect(theme.classes).toContain(expectedThemeClass[scheme.value]);
      else expect(theme.classes).not.toMatch(/\bbg-/);
      frontend.push({ type, ...scheme, header, ...theme, rendered: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scheme of schemes) for (const [type, header] of [['marketo', `QA-AUTOMATED-MARKETO-${scheme.slug}-${run}`], ['hubspot-form', `QA-AUTOMATED-HUBSPOT-${scheme.slug}-${run}`]] as const) {
    const component = page.locator(`.paragraph--type--${type}`).filter({ hasText: header }).first();
    expect(await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  }
  const modal = page.locator('.paragraph--type--marketo-modal').filter({ hasText: `QA-AUTOMATED-MARKETO-MODAL-${run}` });
  const modalRendered = await modal.count() === 1;
  const marketoAnchor = `qa-marketo-modal-${run}`;
  const hubspotAnchor = `qa-hubspot-none-99-${run}`;
  const modalEvidence = {
    marketo: { rendered: modalRendered, id: await page.locator(`#${marketoAnchor}`).count(), trigger: await page.locator(`[href="#${marketoAnchor}"]`).count(), domMentions: await page.locator(`text=${marketoAnchor}`).count() },
    hubspot: { id: await page.locator(`#${hubspotAnchor}`).count(), trigger: await page.locator(`[href="#${hubspotAnchor}"]`).count(), domMentions: await page.locator(`text=${hubspotAnchor}`).count(), modalWrappers: await page.locator('.paragraph--type--hubspot-form').filter({ hasText: `QA-AUTOMATED-HUBSPOT-none-${run}` }).count() },
  };
  console.log(`BENEFITS_EXTERNAL_FORM_VERIFICATION ${JSON.stringify({ run, schemes, frontend, modalEvidence })}`);
});

test('Benefits external form ancestor theme evidence', async ({ page }) => {
  const run = '20261004-065346';
  const schemes = ['none', 'teal', 'white', 'gray', 'dark-gray', 'purple', 'dark-purple', 'green'];
  await page.goto(host.publicPath, { waitUntil: 'networkidle' });
  const evidence: Array<Record<string, unknown>> = [];
  for (const type of ['marketo', 'hubspot-form']) for (const scheme of schemes) {
    const component = page.locator(`.paragraph--type--${type}`).filter({ hasText: `QA-AUTOMATED-${type === 'marketo' ? 'MARKETO' : 'HUBSPOT'}-${scheme}-${run}` }).first();
    evidence.push({ type, scheme, ancestors: await component.evaluate((element) => {
      const nodes = [element, element.parentElement, element.parentElement?.parentElement].filter(Boolean) as Element[];
      return nodes.map((node) => { const style = getComputedStyle(node); return { tag: node.tagName, classes: node.className, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, color: style.color }; });
    }) });
  }
  console.log(`BENEFITS_EXTERNAL_THEME_ANCESTORS ${JSON.stringify(evidence)}`);
});
