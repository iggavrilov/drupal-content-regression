import { expect, test, type Page } from '@playwright/test';
import { loginToDrupal } from '../../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../../src/config/environments';

async function authenticate(page: Page): Promise<void> {
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
}

test('discover CMS LENS entity model and API read-only', async ({ page }) => {
  test.setTimeout(180_000);
  await authenticate(page);

  const typesResponse = await page.goto('/admin/structure/types', { waitUntil: 'domcontentloaded' });
  expect(typesResponse?.status()).toBeLessThan(400);
  const links = await page.locator('a[href]').evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    href: (element as HTMLAnchorElement).getAttribute('href') ?? '',
  })).filter((link) => /lens|slide|card/i.test(`${link.text} ${link.href}`)));
  console.log(`CMS_TYPE_LINKS ${JSON.stringify(links)}`);

  const bundles = [...new Set(links.map((link) => link.href.match(/\/node\/add\/([^/?#]+)/)?.[1]).filter((value): value is string => Boolean(value)))];
  for (const bundle of bundles) {
    const response = await page.goto(`/node/add/${bundle}`, { waitUntil: 'domcontentloaded' });
    const controls = await page.locator('form.node-form input[name], form.node-form textarea[name], form.node-form select[name], form.node-form button[name]').evaluateAll((elements) => elements.map((element) => {
      const control = element as HTMLInputElement;
      const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent : undefined;
      return {
        name: control.name,
        type: control instanceof HTMLSelectElement ? 'select' : control instanceof HTMLTextAreaElement ? 'textarea' : control.type || control.tagName.toLowerCase(),
        label: label?.replace(/\s+/g, ' ').trim() ?? null,
        required: control.required || control.getAttribute('aria-required') === 'true',
        value: control instanceof HTMLSelectElement ? control.value : undefined,
      };
    }).filter((control) => control.required || /title|name|media|card|slide|lens|moderation|status|entity|reference|presentation/i.test(`${control.name} ${control.label ?? ''}`)));
    console.log(`CMS_BUNDLE_FORM ${JSON.stringify({ bundle, status: response?.status() ?? null, route: page.url().replace(/[?#].*$/, ''), controls })}`);
  }

  const mediaResponse = await page.goto('/admin/structure/media', { waitUntil: 'domcontentloaded' });
  const mediaLinks = await page.locator('a[href]').evaluateAll((elements) => elements.map((element) => ({
    text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    href: (element as HTMLAnchorElement).getAttribute('href') ?? '',
  })).filter((link) => /media|image/i.test(`${link.text} ${link.href}`)));
  console.log(`CMS_MEDIA_STRUCTURE ${JSON.stringify({ status: mediaResponse?.status() ?? null, links: mediaLinks.slice(0, 30) })}`);

  const apiResponse = await page.request.get('/jsonapi');
  const apiContentType = apiResponse.headers()['content-type']?.split(';')[0] ?? null;
  let apiResources: Array<{ key: string; href: string }> = [];
  if (apiResponse.ok() && apiContentType?.includes('json')) {
    const json = await apiResponse.json() as { links?: Record<string, { href?: string } | string> };
    apiResources = Object.entries(json.links ?? {}).map(([key, value]) => ({ key, href: typeof value === 'string' ? value : value.href ?? '' })).filter((item) => /lens|slide|card|media/i.test(`${item.key} ${item.href}`));
  }
  console.log(`CMS_API_ENTRY ${JSON.stringify({ status: apiResponse.status(), contentType: apiContentType, matchingResources: apiResources })}`);
});

test('discover CMS field relationships and Draft API visibility read-only', async ({ page }) => {
  test.setTimeout(180_000);
  await authenticate(page);
  const definitions = [
    { entity: 'node', bundle: 'lens_presentation', route: '/admin/structure/types/manage/lens_presentation/fields' },
    { entity: 'node', bundle: 'lens_slide', route: '/admin/structure/types/manage/lens_slide/fields' },
    { entity: 'paragraph', bundle: 'card', route: '/admin/structure/paragraphs_type/card/fields' },
    { entity: 'media', bundle: 'image', route: '/admin/structure/media/manage/image/fields' },
  ];
  for (const definition of definitions) {
    const response = await page.goto(definition.route, { waitUntil: 'domcontentloaded' });
    const rows = await page.locator('table tbody tr').evaluateAll((elements) => elements.map((element) => {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const hrefs = [...element.querySelectorAll('a[href]')].map((link) => link.getAttribute('href') ?? '');
      const machineName = hrefs.map((href) => href.match(/\/fields\/([^/?#]+)/)?.[1]).find(Boolean) ?? null;
      return { text, machineName };
    }).filter((row) => row.machineName || /reference|media|slide|card|title|name|image|file/i.test(row.text)));
    console.log(`CMS_FIELD_DEFINITIONS ${JSON.stringify({ ...definition, status: response?.status() ?? null, rows })}`);
  }

  for (const route of ['/node/add/lens_presentation', '/node/add/lens_slide']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const actions = await page.locator('input[type="submit"], button').evaluateAll((elements) => elements.map((element) => ({
      text: (element.textContent || (element as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim(),
      name: (element as HTMLInputElement).name || null,
      type: (element as HTMLInputElement).type || element.tagName.toLowerCase(),
    })).filter((item) => /add|create|existing|slide|card|save/i.test(`${item.text} ${item.name ?? ''}`)));
    console.log(`CMS_INLINE_ACTIONS ${JSON.stringify({ route, actions })}`);
  }

  for (const resource of ['node/lens_presentation', 'node/lens_slide', 'paragraph/card', 'media/image']) {
    for (const state of ['any', 'draft'] as const) {
      const suffix = state === 'draft' ? '?filter[status]=0&page[limit]=1' : '?page[limit]=1';
      const response = await page.request.get(`/jsonapi/${resource}${suffix}`);
      const contentType = response.headers()['content-type']?.split(';')[0] ?? null;
      let summary: Record<string, unknown> = {};
      if (response.ok() && contentType?.includes('json')) {
        const json = await response.json() as { data?: Array<{ type?: string; id?: string; attributes?: Record<string, unknown>; relationships?: Record<string, unknown> }> };
        const first = json.data?.[0];
        summary = {
          count: json.data?.length ?? 0,
          firstType: first?.type ?? null,
          attributeKeys: Object.keys(first?.attributes ?? {}),
          relationshipKeys: Object.keys(first?.relationships ?? {}),
        };
      }
      console.log(`CMS_API_RESOURCE ${JSON.stringify({ resource, state, status: response.status(), contentType, ...summary })}`);
    }
  }
});

test('discover CMS inline hierarchy and Image media form read-only', async ({ page }) => {
  test.setTimeout(180_000);
  await authenticate(page);

  const mediaApi = await page.request.get('/jsonapi/media/image?filter[name]=qa-automated-image.png');
  const mediaJson = mediaApi.ok() ? await mediaApi.json() as { data?: Array<{ id: string; attributes?: { drupal_internal__mid?: number; name?: string; status?: boolean }; relationships?: Record<string, unknown> }> } : {};
  console.log(`CMS_MEDIA_API_FIXTURE ${JSON.stringify({ status: mediaApi.status(), exactMatches: mediaJson.data?.filter((item) => item.attributes?.name === 'qa-automated-image.png').map((item) => ({ uuid: item.id, mid: item.attributes?.drupal_internal__mid, status: item.attributes?.status })) ?? [] })}`);

  const mediaFormResponse = await page.goto('/media/add/image', { waitUntil: 'domcontentloaded' });
  const mediaControls = await page.locator('form.media-form input[name], form.media-form textarea[name], form.media-form select[name]').evaluateAll((elements) => elements.map((element) => {
    const control = element as HTMLInputElement;
    const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent : undefined;
    return { name: control.name, type: control.type || control.tagName.toLowerCase(), label: label?.replace(/\s+/g, ' ').trim() ?? null, required: control.required || control.getAttribute('aria-required') === 'true' };
  }).filter((control) => control.required || /name|file|image|status/i.test(`${control.name} ${control.label ?? ''}`)));
  console.log(`CMS_MEDIA_ADD_FORM ${JSON.stringify({ status: mediaFormResponse?.status() ?? null, controls: mediaControls })}`);

  for (const target of [
    { route: '/node/add/lens_slide', name: 'ief-field_lens_slide_cards_ref-form-add' },
    { route: '/node/add/lens_presentation', name: 'ief-field_lens_presentation_slides-form-add' },
  ]) {
    await page.goto(target.route, { waitUntil: 'domcontentloaded' });
    const locator = page.locator(`input[name="${target.name}"]`);
    const ancestry = await locator.evaluate((element) => {
      const result: Array<Record<string, unknown>> = [];
      let current: Element | null = element;
      for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
        const style = getComputedStyle(current);
        result.push({ tag: current.tagName.toLowerCase(), id: current.id || null, className: current.className || null, hidden: current.hasAttribute('hidden'), display: style.display, visibility: style.visibility, ariaExpanded: current.getAttribute('aria-expanded'), text: current.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) || null });
      }
      return result;
    });
    const visibleRelated = await page.getByText(/slide|card/i).filter({ visible: true }).allTextContents();
    console.log(`CMS_INLINE_VISIBILITY ${JSON.stringify({ ...target, ancestry, visibleRelated: visibleRelated.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30) })}`);
  }

  await page.goto('/node/add/lens_slide', { waitUntil: 'domcontentloaded' });
  await page.locator('details#edit-field-lens-slide-cards-ref summary').click();
  await page.locator('input[name="ief-field_lens_slide_cards_ref-form-add"]').click();
  await page.waitForTimeout(750);
  const standaloneCardControls = await page.locator('form.node-form input[name], form.node-form textarea[name], form.node-form select[name], form.node-form button[name]').evaluateAll((elements) => elements.map((element) => ({ name: (element as HTMLInputElement).name, type: (element as HTMLInputElement).type || element.tagName.toLowerCase(), visible: Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight) })).filter((control) => /field_card|cards_ref|ief/i.test(control.name)));
  console.log(`CMS_STANDALONE_SLIDE_CARD_CONTROLS ${JSON.stringify(standaloneCardControls)}`);

  await page.goto('/node/add/lens_presentation', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="ief-field_lens_presentation_slides-form-add"]').click();
  await page.locator('input[name*="field_lens_presentation_slides"][name*="[title]"]').waitFor({ state: 'attached', timeout: 20_000 });
  const nestedSlideControls = await page.locator('form.node-form input[name], form.node-form textarea[name], form.node-form select[name], form.node-form button[name], form.node-form details').evaluateAll((elements) => elements.map((element) => ({ name: (element as HTMLInputElement).name || null, id: element.id || null, tag: element.tagName.toLowerCase(), type: (element as HTMLInputElement).type || element.tagName.toLowerCase(), visible: Boolean((element as HTMLElement).offsetWidth || (element as HTMLElement).offsetHeight), text: element.tagName === 'DETAILS' ? element.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null : null })).filter((control) => /slide|card|media|ief/i.test(`${control.name ?? ''} ${control.id ?? ''} ${control.text ?? ''}`)));
  console.log(`CMS_PRESENTATION_NESTED_SLIDE_CONTROLS ${JSON.stringify(nestedSlideControls)}`);
});

test('recover recently created CMS QA Image media read-only', async ({ page }) => {
  await authenticate(page);
  const response = await page.request.get('/jsonapi/media/image?sort=-created&page[limit]=20');
  expect(response.status()).toBe(200);
  const payload = await response.json() as { data: Array<{ id: string; attributes: { drupal_internal__mid?: number; name?: string; status?: boolean; created?: string } }> };
  const qaMedia = payload.data.filter((item) => /^qa-automated/i.test(item.attributes.name ?? '')).map((item) => ({ uuid: item.id, mid: item.attributes.drupal_internal__mid, name: item.attributes.name, status: item.attributes.status, created: item.attributes.created }));
  console.log(`CMS_QA_MEDIA_RECOVERY ${JSON.stringify({ matches: qaMedia })}`);
});

test('recover recent CMS QA hierarchy entities read-only', async ({ page }) => {
  await authenticate(page);
  const summaries: Record<string, unknown[]> = {};
  for (const resource of ['node/lens_presentation', 'node/lens_slide', 'paragraph/card']) {
    const response = await page.request.get(`/jsonapi/${resource}?sort=-created&page[limit]=20`);
    expect(response.status()).toBe(200);
    const payload = await response.json() as { data: Array<{ id: string; attributes: Record<string, unknown> }> };
    summaries[resource] = payload.data.map((item) => ({ id: item.id, internalId: item.attributes.drupal_internal__nid ?? item.attributes.drupal_internal__id, identity: item.attributes.title ?? (item.attributes.field_card_heading as { value?: string } | undefined)?.value })).filter((item) => String(item.identity ?? '').startsWith('QA-AUTOMATED-CMS-'));
  }
  console.log(`CMS_QA_HIERARCHY_RECOVERY ${JSON.stringify(summaries)}`);
});
