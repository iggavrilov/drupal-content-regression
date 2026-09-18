import path from 'node:path';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { loginToDrupal } from '../../src/auth/drupal-login';
import { AUTOMATED_IMAGE_FIXTURE, AUTOMATED_IMAGE_MEDIA_NAME } from '../../src/config/automation';
import { getRequiredEnvironmentVariable } from '../../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../../src/config/write-safety';
import { assertNoDrupalFatalPage, NetworkMonitor } from '../../src/diagnostics/network-monitor';
import { CMS_IMAGE_FIXTURE } from './fixtures';

const CMS_ORIGIN = 'https://dev-cms.leidos.com';
const CMS_PREFIX = 'QA-AUTOMATED-CMS-';

interface JsonApiResource {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships: Record<string, { data: null | { type: string; id: string } | Array<{ type: string; id: string }> }>;
}

function assertCmsSafety(page: Page): void {
  expect(assertExplicitNonProductionEnvironment()).toBe('develop');
  expect(new URL(page.url()).origin).toBe(CMS_ORIGIN);
}

async function jsonResource(response: APIResponse): Promise<JsonApiResource> {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/vnd.api+json');
  const payload = await response.json() as { data: JsonApiResource };
  expect(payload.data).toBeTruthy();
  return payload.data;
}

async function exactMedia(page: Page): Promise<JsonApiResource[]> {
  const response = await page.request.get(`/jsonapi/media/image?filter[name]=${encodeURIComponent(AUTOMATED_IMAGE_MEDIA_NAME)}`);
  expect(response.status()).toBe(200);
  const payload = await response.json() as { data: JsonApiResource[] };
  return payload.data.filter((item) => item.attributes.name === AUTOMATED_IMAGE_MEDIA_NAME);
}

async function configuredCmsMedia(page: Page): Promise<JsonApiResource | undefined> {
  const response = await page.request.get(`/jsonapi/media/image/${CMS_IMAGE_FIXTURE.uuid}`);
  if (response.status() === 404) return undefined;
  const resource = await jsonResource(response);
  expect(String(resource.attributes.drupal_internal__mid)).toBe(CMS_IMAGE_FIXTURE.id);
  expect(resource.attributes.name).toBe(CMS_IMAGE_FIXTURE.name);
  return resource;
}

async function ensureMedia(page: Page): Promise<{ resource: JsonApiResource; created: boolean }> {
  let matches = await exactMedia(page);
  expect(matches.length, 'Refusing ambiguous CMS automation media fixtures').toBeLessThanOrEqual(1);
  if (matches.length === 1) return { resource: matches[0], created: false };
  const configured = await configuredCmsMedia(page);
  if (configured) return { resource: configured, created: false };

  const response = await page.goto('/media/add/image', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  assertCmsSafety(page);
  await page.locator('input[name="files[field_media_image_0]"]').setInputFiles(path.resolve(process.cwd(), AUTOMATED_IMAGE_FIXTURE));
  await page.locator('input[name="field_media_image[0][fids]"]').waitFor({ state: 'attached' });
  await expect.poll(async () => page.locator('input[name="field_media_image[0][fids]"]').inputValue(), { timeout: 30_000 }).not.toBe('');

  const name = page.locator('input[name="name[0][value]"]');
  if ((await name.count()) === 1) await name.fill(AUTOMATED_IMAGE_MEDIA_NAME);
  const alt = page.locator('input[name="field_media_image[0][alt]"]');
  if ((await alt.count()) === 1) await alt.fill('QA automated CMS regression image');
  assertCmsSafety(page);
  await page.locator('input[name="op"][value="Save"], button[name="op"][value="Save"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await assertNoDrupalFatalPage(page);

  matches = await exactMedia(page);
  expect(matches).toHaveLength(1);
  return { resource: matches[0], created: true };
}

async function selectCmsMedia(page: Page, trigger: ReturnType<Page['locator']>, media: JsonApiResource): Promise<void> {
  expect(String(media.attributes.drupal_internal__mid)).toBe(CMS_IMAGE_FIXTURE.id);
  expect(media.id).toBe(CMS_IMAGE_FIXTURE.uuid);
  expect(media.attributes.name).toBe(CMS_IMAGE_FIXTURE.name);
  await trigger.click();
  const dialog = page.locator('[role="dialog"], .ui-dialog').filter({ visible: true }).last();
  await dialog.waitFor({ state: 'visible' });
  const source = dialog.locator('select:has(option[value="core"])').first();
  if ((await source.count()) === 1 && await source.inputValue() !== 'core') await source.selectOption('core');
  const filter = dialog.locator('input[name="name"]').or(dialog.getByRole('textbox', { name: /^(?:Name|Search)$/ })).filter({ visible: true });
  expect(await filter.count()).toBe(1);
  await filter.fill(CMS_IMAGE_FIXTURE.name);
  const apply = dialog.getByRole('button', { name: /^(?:Apply filters|Apply)$/ }).or(dialog.locator('input[type="submit"][value="Apply filters"], input[type="submit"][value="Apply"]')).filter({ visible: true });
  await apply.click();
  const checkbox = dialog.locator(`input[name="media_library_select_form[${CMS_IMAGE_FIXTURE.id}]"]`);
  await checkbox.waitFor({ state: 'visible' });
  expect(await checkbox.count()).toBe(1);
  await checkbox.check();
  await dialog.getByRole('button', { name: 'Insert selected', exact: true }).filter({ visible: true }).click();
  await expect(page.locator('[role="dialog"], .ui-dialog').filter({ visible: true })).toHaveCount(0, { timeout: 15_000 });
}

test('CMS LENS Presentation resolves through Slide and Card to exact Media', async ({ page }) => {
  test.setTimeout(300_000);
  await loginToDrupal(page, {
    username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'),
    password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD'),
  });
  assertCmsSafety(page);
  const monitor = new NetworkMonitor();
  monitor.start(page);
  let presentationId: number | undefined;
  let presentationUuid: string | undefined;
  const runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(16).slice(2, 6)}`;
  const presentationTitle = `${CMS_PREFIX}LENS-Presentation-${runId}`;
  const updatedPresentationTitle = `${presentationTitle}-UPDATED`;
  const slideTitle = `${CMS_PREFIX}Slide-${runId}`;
  const cardHeading = `${CMS_PREFIX}Card-${runId}`;

  try {
    const media = await ensureMedia(page);
    const mediaId = String(media.resource.attributes.drupal_internal__mid);

    const addResponse = await page.goto('/node/add/lens_presentation', { waitUntil: 'domcontentloaded' });
    expect(addResponse?.status()).toBe(200);
    assertCmsSafety(page);
    await page.locator('input[name="title[0][value]"]').fill(presentationTitle);
    await page.locator('textarea[name="field_lens_presentation_desc[0][value]"]').fill(`${CMS_PREFIX}Presentation description ${runId}`);
    const parentStatus = page.locator('input[name="status[value]"]');
    if ((await parentStatus.count()) === 1 && await parentStatus.isChecked()) await parentStatus.uncheck();

    assertCmsSafety(page);
    await page.locator('input[name="ief-field_lens_presentation_slides-form-add"]').click();
    const slideTitleInput = page.locator('input[name="field_lens_presentation_slides[form][0][title][0][value]"]');
    await slideTitleInput.waitFor({ state: 'visible' });
    await slideTitleInput.fill(slideTitle);
    await page.locator('textarea[name="field_lens_presentation_slides[form][0][field_lens_slide_heading][0][value]"]').fill(`${CMS_PREFIX}Slide heading ${runId}`);
    const slideStatus = page.locator('input[name="field_lens_presentation_slides[form][0][status][value]"]');
    if ((await slideStatus.count()) === 1 && await slideStatus.isChecked()) await slideStatus.uncheck();

    assertCmsSafety(page);
    const addCard = page.locator('input[name="ief-field_lens_presentation_slides-form-0-field_lens_slide_cards_ref-form-add"]');
    await addCard.click();
    const cardHeadingInput = page.locator('textarea[name="field_lens_presentation_slides[form][0][field_lens_slide_cards_ref][form][0][field_card_heading][0][value]"]');
    await cardHeadingInput.waitFor({ state: 'visible' });
    await cardHeadingInput.fill(cardHeading);

    const mediaTrigger = page.locator('input[name="field_card_media_ref-media-library-open-button-field_lens_presentation_slides-form-0-field_lens_slide_cards_ref-form-0"]');
    await selectCmsMedia(page, mediaTrigger, media.resource);
    await page.locator('input[name^="ief-add-submit-"][name*="field_lens_slide_cards_ref"]').click();
    await cardHeadingInput.waitFor({ state: 'detached' });
    const createSlide = page.locator('input[name="ief-add-submit-field_lens_presentation_slides-form"]').filter({ visible: true });
    expect(await createSlide.count()).toBe(1);
    await createSlide.click();
    await slideTitleInput.waitFor({ state: 'detached' });

    assertCmsSafety(page);
    await page.locator('input[name="op"][value="Save"], button[name="op"][value="Save"]').first().click();
    await page.waitForLoadState('domcontentloaded');
    await assertNoDrupalFatalPage(page);

    const presentationQuery = await page.request.get(`/jsonapi/node/lens_presentation?filter[title]=${encodeURIComponent(presentationTitle)}`);
    expect(presentationQuery.status()).toBe(200);
    const presentationPayload = await presentationQuery.json() as { data: JsonApiResource[] };
    expect(presentationPayload.data).toHaveLength(1);
    const presentation = presentationPayload.data[0];
    presentationUuid = presentation.id;
    presentationId = Number(presentation.attributes.drupal_internal__nid);
    expect(presentation.attributes.status).toBe(false);
    const slideRelationship = presentation.relationships.field_lens_presentation_slides.data;
    expect(Array.isArray(slideRelationship)).toBe(true);
    expect(slideRelationship).toHaveLength(1);
    const slideUuid = (slideRelationship as Array<{ id: string }>)[0].id;

    const slide = await jsonResource(await page.request.get(`/jsonapi/node/lens_slide/${slideUuid}`));
    const slideId = Number(slide.attributes.drupal_internal__nid);
    expect(slide.attributes.title).toBe(slideTitle);
    expect(slide.attributes.status).toBe(false);
    const cardRelationship = slide.relationships.field_lens_slide_cards_ref.data;
    expect(Array.isArray(cardRelationship)).toBe(true);
    expect(cardRelationship).toHaveLength(1);
    const cardUuid = (cardRelationship as Array<{ id: string }>)[0].id;

    const card = await jsonResource(await page.request.get(`/jsonapi/paragraph/card/${cardUuid}`));
    expect((card.attributes.field_card_heading as { value?: string }).value).toContain(cardHeading);
    const mediaRelationship = card.relationships.field_card_media_ref.data;
    expect(mediaRelationship && !Array.isArray(mediaRelationship) ? mediaRelationship.id : undefined).toBe(media.resource.id);

    const editResponse = await page.goto(`/node/${presentationId}/edit`, { waitUntil: 'domcontentloaded' });
    expect(editResponse?.status()).toBe(200);
    expect(await page.locator('input[name="title[0][value]"]').inputValue()).toBe(presentationTitle);
    await expect(page.getByText(slideTitle, { exact: true })).toBeVisible();

    const slideEditResponse = await page.goto(`/node/${slideId}/edit`, { waitUntil: 'domcontentloaded' });
    expect(slideEditResponse?.status()).toBe(200);
    expect(await page.locator('input[name="title[0][value]"]').inputValue()).toBe(slideTitle);
    const cardsDetails = page.locator('details#edit-field-lens-slide-cards-ref');
    if (!(await cardsDetails.getAttribute('open'))) await cardsDetails.locator('summary').click();
    const editCard = cardsDetails.locator('input[value="Edit"], button:has-text("Edit")').filter({ visible: true });
    expect(await editCard.count()).toBe(1);
    await editCard.click();
    const savedCardHeading = page.locator('textarea[name*="field_lens_slide_cards_ref"][name*="field_card_heading"]');
    await savedCardHeading.waitFor({ state: 'visible' });
    expect(await savedCardHeading.inputValue()).toContain(cardHeading);

    await page.goto(`/node/${presentationId}/edit`, { waitUntil: 'domcontentloaded' });
    expect(await page.locator('input[name="title[0][value]"]').inputValue()).toBe(presentationTitle);
    assertCmsSafety(page);
    await page.locator('input[name="title[0][value]"]').fill(updatedPresentationTitle);
    await page.locator('input[name="op"][value="Save"], button[name="op"][value="Save"]').first().click();
    await page.waitForLoadState('domcontentloaded');

    const updated = await jsonResource(await page.request.get(`/jsonapi/node/lens_presentation/${presentationUuid}`));
    expect(updated.attributes.title).toBe(updatedPresentationTitle);
    expect(updated.attributes.status).toBe(false);
    expect(updated.relationships.field_lens_presentation_slides.data).toEqual(slideRelationship);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    console.log(`CMS_LENS_REGRESSION ${JSON.stringify({
      media: { id: mediaId, uuid: media.resource.id, name: AUTOMATED_IMAGE_MEDIA_NAME, created: media.created, status: media.resource.attributes.status },
      card: { uuid: cardUuid, heading: cardHeading, mediaRelationshipPersisted: true },
      slide: { id: slideId, uuid: slideUuid, title: slideTitle, cardRelationshipPersisted: true, status: slide.attributes.status },
      presentation: { id: presentationId, uuid: presentationUuid, title: updatedPresentationTitle, editUrl: `${CMS_ORIGIN}/node/${presentationId}/edit`, slideRelationshipPersisted: true, status: updated.attributes.status },
      api: { mechanism: 'JSON:API', presentationStatus: 200, slideStatus: 200, cardStatus: 200, hierarchyVerified: true, updateVisible: true },
      serverErrors: monitor.getServerErrors().length,
    })}`);
  } catch (error) {
    console.log(`CMS_LENS_FAILURE ${JSON.stringify({ stage: 'controlled hierarchy', presentationId, presentationUuid, currentUrl: page.url().replace(/[?#].*$/, ''), message: error instanceof Error ? error.message : 'Unknown error' })}`);
    throw error;
  } finally {
    monitor.stop();
  }
});
