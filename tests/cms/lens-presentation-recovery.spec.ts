import { expect, test, type Page } from '@playwright/test';
import { loginToDrupal } from '../../src/auth/drupal-login';
import { getRequiredEnvironmentVariable } from '../../src/config/environments';
import { assertExplicitNonProductionEnvironment } from '../../src/config/write-safety';
import { CMS_IMAGE_FIXTURE } from './fixtures';

const CMS_ORIGIN = 'https://dev-cms.leidos.com';
const PRESENTATION = { id: '4741', uuid: '6bb28480-4a91-4f8d-8cb3-e495b2eb21ea', title: 'QA-AUTOMATED-CMS-LENS-Presentation-20260902065152-776a' } as const;
const SLIDE = { id: '4736', uuid: '3f66c303-e9ce-477b-a9ea-9c0b572046c1', title: 'QA-AUTOMATED-CMS-Slide-20260902065152-776a' } as const;
const CARD = { id: '3976', uuid: '3712463c-5b1e-4ecf-acd4-cc1b40835756', heading: 'QA-AUTOMATED-CMS-Card-20260902065152-776a' } as const;

function assertCmsSafety(page: Page): void {
  expect(assertExplicitNonProductionEnvironment()).toBe('develop');
  expect(new URL(page.url()).origin).toBe(CMS_ORIGIN);
}

test('complete exact CMS LENS hierarchy verification and title update only', async ({ page }) => {
  test.setTimeout(180_000);
  await loginToDrupal(page, { username: getRequiredEnvironmentVariable('DRUPAL_USERNAME'), password: getRequiredEnvironmentVariable('DRUPAL_PASSWORD') });

  const presentationResponse = await page.request.get(`/jsonapi/node/lens_presentation/${PRESENTATION.uuid}`);
  expect(presentationResponse.status()).toBe(200);
  const presentation = (await presentationResponse.json() as { data: { id: string; attributes: Record<string, unknown>; relationships: Record<string, { data: Array<{ id: string }> }> } }).data;
  expect(presentation.id).toBe(PRESENTATION.uuid);
  expect(String(presentation.attributes.drupal_internal__nid)).toBe(PRESENTATION.id);
  expect(presentation.attributes.title).toBe(PRESENTATION.title);
  expect(presentation.attributes.status).toBe(false);
  expect(presentation.relationships.field_lens_presentation_slides.data).toEqual([{ type: 'node--lens_slide', id: SLIDE.uuid, meta: expect.any(Object) }]);

  const slideResponse = await page.request.get(`/jsonapi/node/lens_slide/${SLIDE.uuid}`);
  expect(slideResponse.status()).toBe(200);
  const slide = (await slideResponse.json() as { data: { attributes: Record<string, unknown>; relationships: Record<string, { data: Array<{ id: string }> }> } }).data;
  expect(String(slide.attributes.drupal_internal__nid)).toBe(SLIDE.id);
  expect(slide.attributes.title).toBe(SLIDE.title);
  expect(slide.attributes.status).toBe(false);
  expect(slide.relationships.field_lens_slide_cards_ref.data[0].id).toBe(CARD.uuid);

  const cardResponse = await page.request.get(`/jsonapi/paragraph/card/${CARD.uuid}`);
  expect(cardResponse.status()).toBe(200);
  const card = (await cardResponse.json() as { data: { attributes: Record<string, unknown>; relationships: Record<string, { data: { id: string } }> } }).data;
  expect(String(card.attributes.drupal_internal__id)).toBe(CARD.id);
  expect((card.attributes.field_card_heading as { value: string }).value).toContain(CARD.heading);
  expect(card.relationships.field_card_media_ref.data.id).toBe(CMS_IMAGE_FIXTURE.uuid);

  const slideEdit = await page.goto(`/node/${SLIDE.id}/edit`, { waitUntil: 'domcontentloaded' });
  expect(slideEdit?.status()).toBe(200);
  expect(await page.locator('input[name="title[0][value]"]').inputValue()).toBe(SLIDE.title);
  const cards = page.locator('details#edit-field-lens-slide-cards-ref');
  if (!(await cards.getAttribute('open'))) await cards.locator('summary').click();
  const edit = cards.locator('input[value="Edit"], button:has-text("Edit")').filter({ visible: true });
  expect(await edit.count()).toBe(1);
  await edit.click();
  const heading = page.locator('textarea[name*="field_lens_slide_cards_ref"][name*="field_card_heading"]');
  await heading.waitFor({ state: 'visible' });
  expect(await heading.inputValue()).toContain(CARD.heading);
  const mediaTarget = page.locator('input[name*="field_card_media_ref"][name$="[target_id]"]');
  await mediaTarget.first().waitFor({ state: 'attached' });
  expect(await mediaTarget.count()).toBe(1);
  expect((await mediaTarget.inputValue()).match(/\d+/)?.[0]).toBe(CMS_IMAGE_FIXTURE.id);

  const presentationEdit = await page.goto(`/node/${PRESENTATION.id}/edit`, { waitUntil: 'domcontentloaded' });
  expect(presentationEdit?.status()).toBe(200);
  expect(await page.locator('input[name="title[0][value]"]').inputValue()).toBe(PRESENTATION.title);
  await expect(page.getByText(SLIDE.title, { exact: true })).toBeVisible();
  assertCmsSafety(page);
  const updatedTitle = `${PRESENTATION.title}-UPDATED`;
  await page.locator('input[name="title[0][value]"]').fill(updatedTitle);
  await page.locator('input[name="op"][value="Save"], button[name="op"][value="Save"]').first().click();
  await page.waitForLoadState('domcontentloaded');

  const updatedResponse = await page.request.get(`/jsonapi/node/lens_presentation/${PRESENTATION.uuid}`);
  expect(updatedResponse.status()).toBe(200);
  const updated = (await updatedResponse.json() as { data: { attributes: Record<string, unknown>; relationships: Record<string, { data: Array<{ id: string }> }> } }).data;
  expect(updated.attributes.title).toBe(updatedTitle);
  expect(updated.attributes.status).toBe(false);
  expect(updated.relationships.field_lens_presentation_slides.data[0].id).toBe(SLIDE.uuid);

  console.log(`CMS_LENS_RECOVERY ${JSON.stringify({ presentation: { ...PRESENTATION, title: updatedTitle, status: false }, slide: { ...SLIDE, status: false }, card: CARD, media: CMS_IMAGE_FIXTURE, uiPersistence: true, apiHierarchy: true, updateVisible: true })}`);
});
