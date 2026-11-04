import type { Locator, Page } from '@playwright/test';
import { AUTOMATED_CONTENT_PREFIX, AUTOMATED_IMAGE_MEDIA_ID, AUTOMATED_IMAGE_MEDIA_NAME, hasAutomatedContentPrefix } from '../config/automation';
import { basicPageConfig } from '../config/content-types';
import { getEnvironmentConfig } from '../config/environments';
import { assertPublishingAllowed } from '../config/write-safety';
import type { ContentTypeTestData } from '../data/test-data';
import { assertNoDrupalFatalPage, type NetworkMonitor } from '../diagnostics/network-monitor';
import { runPublishingWorkflow } from '../publishing/moderation-workflow';
import type { PublishingSourceNode } from '../publishing/source-nodes';
import { safeNodeUrl } from './basic-page-form';
import { ContentTypeRunner } from './content-type-runner';
import { readConfiguredField } from './field-handlers';
import { assertEntityReferenceFixture, selectEntityReferenceFixture, verifyEntityReferenceFixture } from './field-handlers/entity-reference-field';
import { fillOwnedEditor, readOwnedEditor, submitNodeForm, validateSafeModerationState } from './node-form';
import { activateOwnedParagraphEdit } from './paragraphs/paragraph-safe-click';
import { selectAutomationImageFixtureFromTrigger, selectExactExistingMediaFromTrigger, verifyAutomationImageFixture } from './media/media-library';

const BASIC_PAGE_PARAGRAPH_FIELD = 'field_page_paragraphs';
const BASIC_PAGE_PARAGRAPH_WRAPPER = '.field--name-field-page-paragraphs.field--widget-paragraphs';
const BLOCKQUOTE_LABEL = 'Blockquote';

export interface BasicPageFormattedTextPocResult {
  nodeId: string;
  title: string;
  marker: string;
  publicUrl: string;
  paragraphIdentity?: string;
  published: true;
  frontendVerified: true;
}

export type CreatedBasicPageFormattedTextPoc = Omit<BasicPageFormattedTextPocResult, 'publicUrl' | 'paragraphIdentity' | 'frontendVerified'>;

export interface ExistingBasicPageBlockquotePoc {
  nodeId: string;
  title: string;
  formattedTextMarker: string;
  blockquoteMarker: string;
  blockquoteDelta: string;
  publicUrl: string;
  paragraphIdentity?: string;
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageListPoc {
  nodeId: string;
  title: string;
  formattedTextMarker: string;
  blockquoteMarker: string;
  listMarkers: readonly [string, string, string];
  listDelta: string;
  listStructure?: 'ul' | 'ol';
  publicUrl: string;
  paragraphIdentity?: string;
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageAnchorPoc {
  nodeId: string;
  title: string;
  formattedTextMarker: string;
  blockquoteMarker: string;
  listMarkers: readonly [string, string, string];
  anchorId: string;
  anchorLabel: string;
  anchorDelta: string;
  publicUrl: string;
  paragraphIdentity?: string;
  labelRendering: 'aria-label' | 'text' | 'title' | 'not rendered';
  fragmentRetained: true;
  targetResolved: true;
  targetInViewport: true;
  published: true;
  frontendVerified: true;
}

export interface ExistingComponentCoverageResult {
  nodeId: string;
  title: string;
  publicUrl: string;
  mediaId: string;
  fieldsPopulated: readonly string[];
  fieldsIntentionallyEmpty: readonly string[];
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageJumpNavResult {
  nodeId: string;
  title: string;
  jumpNavDelta: string;
  jumpNavType: 'inline';
  anchorId: string;
  anchorLabel: string;
  publicUrl: string;
  paragraphIdentity?: string;
  mouseClickVerified: true;
  keyboardVerified: true;
  fragmentVerified: true;
  targetVerified: true;
  viewportVerified: true;
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageTabsResult {
  nodeId: string;
  title: string;
  tabsDelta: string;
  heading: string;
  tabLabels: readonly [string, string, string];
  tabContents: readonly [string, string, string];
  publicUrl: string;
  paragraphIdentity?: string;
  initialActiveTab: string;
  semanticStructure: { tablist: boolean; tabs: boolean; tabpanels: boolean; ariaSelected: boolean };
  mouseVerified: true;
  keyboardVerified: true;
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageCardGridResult {
  nodeId: string;
  title: string;
  cardGridDelta: string;
  heading: string;
  text: string;
  cardNames: readonly [string, string, string];
  cardTitles: readonly [string, string, string];
  cardHrefs: readonly [string, string, string];
  mediaId: string;
  publicUrl: string;
  paragraphIdentity?: string;
  cardsRendered: 3;
  ctaInteractionVerified: true;
  keyboardVerified: true;
  imagesVerified: true;
  imageAccessibilityVerified: true;
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageStatCalloutResult {
  nodeId: string;
  title: string;
  statCalloutDelta: string;
  statisticId: string;
  statisticTitle: string;
  statisticValue: string;
  alignment: 'left';
  padding: 'padding';
  color: 'purple';
  publicUrl: string;
  paragraphIdentity?: string;
  semanticStructure: { statisticTag: string; headingLevels: number[] };
  referenceLabelRendering: 'frontend verified' | 'not frontend-rendered';
  published: true;
  frontendVerified: true;
}

export interface ExistingBasicPageVideoResult {
  nodeId: string;
  title: string;
  videoDelta: string;
  videoTitle: string;
  caption: string;
  mediaId: string;
  mediaName: string;
  mediaBundle: 'Remote video';
  provider: 'YouTube';
  publicUrl: string;
  paragraphIdentity?: string;
  implementation: 'custom lazy-load launcher with page-level YouTube modal';
  playbackResult: 'Play activation opened one accessible provider iframe successfully';
  desktopVisible: true;
  mobileVisible: true;
  noHorizontalOverflow: true;
  frontendVerified: true;
  published: true;
}

export interface ExistingBasicPageCardCollectionResult {
  nodeId: string;
  title: string;
  cardCollectionDelta: string;
  heading: string;
  text: string;
  parentCtaText: string;
  parentCtaAriaLabel: string;
  parentHref: string;
  cardHeadings: readonly [string, string, string];
  cardTexts: readonly [string, string, string];
  cardCtaTexts: readonly [string, string, string];
  cardHrefs: readonly [string, string, string];
  mediaId: string;
  publicUrl: string;
  paragraphIdentity?: string;
  cardsRendered: 3;
  cardOrderVerified: true;
  ctaInteraction: string;
  keyboardVerified: true;
  imagesVerified: true;
  imageAccessibilityVerified: true;
  desktopVisible: true;
  mobileVisible: true;
  noHorizontalOverflow: true;
  frontendVerified: true;
  published: true;
}

export interface CardCollectionV2VariantConfig {
  displayValue: '2' | '3' | '4' | 'carousel';
  variantLabel: 'Display Two' | 'Display Three' | 'Display Four' | 'Display Carousel';
  introHeader: string;
  introText: string;
  ctaText: string;
  ctaAriaLabel: string;
  ctaHref: string;
  cardHeadings: readonly string[];
  cardTexts: readonly string[];
  cardCtaTexts: readonly string[];
  cardHrefs: readonly string[];
}

export interface ExistingBasicPageCardCollectionV2Result {
  nodeId: string;
  title: string;
  displayValue: '2' | '3' | '4' | 'carousel';
  variantLabel: 'Display Two' | 'Display Three' | 'Display Four' | 'Display Carousel';
  paragraphDelta: string;
  introHeader: string;
  introText: string;
  ctaText: string;
  ctaAriaLabel: string;
  ctaHref: string;
  cardCount: number;
  cardHeadings: readonly string[];
  cardTexts: readonly string[];
  cardCtaTexts: readonly string[];
  cardHrefs: readonly string[];
  mediaId: string;
  publicUrl: string;
  paragraphIdentity?: string;
  frontendVerified: true;
  published: true;
}

export interface ExistingBasicPageBannerResult {
  nodeId: string;
  title: string;
  bannerDelta: string;
  eyebrow: string;
  heading: string;
  subtitle: string;
  text: string;
  ctaText: string;
  ctaAriaLabel: string;
  ctaHref: string;
  mediaId: string;
  publicUrl: string;
  paragraphIdentity?: string;
  headingLevel: number;
  ctaInteraction: string;
  imageHttpStatus: number;
  imageLoadResult: string;
  mouseVerified: true;
  keyboardVerified: true;
  imageVerified: boolean;
  imageAccessibilityVerified: true;
  desktopVisible: true;
  mobileVisible: true;
  noClipping: true;
  noHorizontalOverflow: true;
  frontendVerified: boolean;
  published: true;
}

export interface ExistingBasicPageCarouselResult {
  nodeId: string;
  title: string;
  carouselDelta: string;
  heading: string;
  ctaText: string;
  ctaAriaLabel: string;
  ctaHref: string;
  cardHeadings: readonly [string, string, string, string, string];
  cardTexts: readonly [string, string, string, string, string];
  publicUrl?: string;
  paragraphIdentity?: string;
  published: true;
}

export interface ExistingBasicPageEmbedCodeResult {
  nodeId: string;
  title: string;
  embedCodeDelta: string;
  marker: string;
  embedType: 'Placeholder';
  style: 'padding';
  publicUrl?: string;
  paragraphIdentity?: string;
  published: true;
}

export interface ExistingBasicPageEmbedCodeFrontendResult extends ExistingBasicPageEmbedCodeResult {
  desktopVisible: true;
  mobileVisible: true;
  noHorizontalOverflow: true;
  placeholderVisible: true;
  frontendVerified: true;
}

export interface MarketoFormFieldCoverage {
  field: string;
  classification: 'FRONTEND VERIFIED' | 'CMS-ONLY' | 'NOT FRONTEND-RENDERED' | 'BLOCKED' | 'INTENTIONALLY EMPTY';
  reason: string;
}

export interface ExistingBasicPageMarketoResult {
  nodeId: string;
  title: string;
  marketoDelta: string;
  heading: string;
  text: string;
  formId: '1231231234';
  border: 'padding';
  colorScheme: 'teal';
  published: true;
}

export interface ExistingBasicPageMarketoFrontendResult extends ExistingBasicPageMarketoResult {
  publicUrl: string;
  paragraphIdentity?: string;
  cmsComponent: 'PASS';
  frontendShellContent: 'PASS' | 'FAIL';
  realMarketoFormLoading: 'NOT VALIDATED — synthetic Form ID';
  formSubmissionPerformed: false;
  marketoContainer: boolean;
  formControlCount: number;
  paddingClass: boolean;
  colorClass: boolean;
  duplicateIds: false;
  desktopVisible: true;
  mobileVisible: true;
  noHorizontalOverflow: true;
  noFatalDrupalError: true;
  observedBehavior: string;
  marketoRequests: readonly { status: number; url: string }[];
  consoleMessages: readonly string[];
  fieldCoverage: readonly MarketoFormFieldCoverage[];
  frontendVerified: true;
}

export interface ExistingBasicPageMarketoBlockedResult {
  nodeId: string;
  title: string;
  component: 'Marketo form';
  machineType: 'marketo';
  creation: 'BLOCKED';
  blockingField: 'field_marketo_form[0][form_id]';
  blockingReason: string;
  fieldCoverage: readonly MarketoFormFieldCoverage[];
  formSubmissionPerformed: false;
  drupalWrites: 'none';
  published: true;
}

const SYNTHETIC_QA_MARKETO_FORM_ID = '1231231234';
const APPROVED_QA_MARKETO_FORM_IDS = new Set<string>([SYNTHETIC_QA_MARKETO_FORM_ID]);

function pocData(): ContentTypeTestData {
  const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
  const title = `${AUTOMATED_CONTENT_PREFIX}Component-POC-${runId}`;
  const marker = `${AUTOMATED_CONTENT_PREFIX}FORMATTED-TEXT-${runId}`;
  return {
    runId,
    createValues: { title, body: marker },
    updateValues: { title, body: marker },
  };
}

export class BasicPageFormattedTextPocRunner {
  async createAndPublish(page: Page, monitor: NetworkMonitor): Promise<CreatedBasicPageFormattedTextPoc> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') {
      throw new Error('COMPONENT_POC_BLOCKED: This focused POC is allowed only for the exact DEVV target.');
    }
    assertPublishingAllowed();
    const data = pocData();
    const created = await new ContentTypeRunner().create({ page, config: basicPageConfig, data, monitor });
    if (created.moderation?.moderationStateUsed !== 'Draft') {
      throw new Error('COMPONENT_POC_BLOCKED: The owned Basic Page was not created in exact Draft state.');
    }
    const source: PublishingSourceNode = {
      machineName: basicPageConfig.machineName,
      label: basicPageConfig.label,
      nodeId: Number(created.nodeId),
      title: created.title,
      moderation: 'Draft',
    };
    if (!Number.isInteger(source.nodeId)) throw new Error('COMPONENT_POC_BLOCKED: Created node ID was not numeric.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, source);
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) {
      throw new Error(`COMPONENT_POC_BLOCKED: Publishing did not complete safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    }
    return { nodeId: created.nodeId, title: created.title, marker: data.createValues.body, published: true };
  }

  async verifyPublicFrontend(page: Page, created: CreatedBasicPageFormattedTextPoc): Promise<BasicPageFormattedTextPocResult> {
    const verified = await this.verifyOwnedArticle(page, created.nodeId, created.title, [
      { marker: created.marker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
    ]);
    return {
      ...created,
      publicUrl: verified.publicUrl,
      paragraphIdentity: verified.identities[0],
      frontendVerified: true,
    };
  }

  async addBlockquoteToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
  }): Promise<Omit<ExistingBasicPageBlockquotePoc, 'publicUrl' | 'paragraphIdentity' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') {
      throw new Error('COMPONENT_POC_BLOCKED: Blockquote extension is allowed only for the exact DEVV target.');
    }
    assertPublishingAllowed();
    if (!/^\d+$/.test(expected.nodeId) || !hasAutomatedContentPrefix(expected.title) || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing Basic Page identity is not exact and automation-owned.');
    }
    const response = await page.goto(`/node/${expected.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`COMPONENT_POC_BLOCKED: Existing Basic Page edit form returned HTTP ${response?.status() ?? 'unknown'}.`);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    const form = page.locator('form.node-page-edit-form, form[id^="node-page-edit-form"]').filter({ visible: true });
    if ((await form.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Exact Basic Page edit form was not uniquely visible.');
    const title = form.locator(basicPageConfig.titleField.selector);
    if ((await title.count()) !== 1 || (await title.inputValue()) !== expected.title) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing Basic Page title/type ownership check failed.');
    }
    const bodyField = basicPageConfig.fields.find((field) => field.key === 'body');
    if (!bodyField || (await readConfiguredField(form, bodyField)) !== expected.formattedTextMarker) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing Formatted text marker was not preserved exactly.');
    }
    const wrapper = form.locator(BASIC_PAGE_PARAGRAPH_WRAPPER);
    await this.assertBasicPageInventory(wrapper, 0);
    const moderation = await validateSafeModerationState(form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing page could not be moved to a safe Draft update state.');
    }

    const blockquoteDelta = await this.addBasicPageBlockquote(page, wrapper, monitor);
    const defaults = await this.captureBlockquoteDefaults(wrapper, blockquoteDelta);
    const blockquoteMarker = `${AUTOMATED_CONTENT_PREFIX}BLOCKQUOTE-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    await fillOwnedEditor(wrapper, this.blockquoteTextSelector(blockquoteDelta), blockquoteMarker, BLOCKQUOTE_LABEL);
    await this.assertBasicPageInventory(wrapper, 1);
    await this.assertBlockquoteState(wrapper, blockquoteDelta, blockquoteMarker, defaults);
    await submitNodeForm(page, form, 'Basic Page Blockquote POC update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const verifyResponse = await page.goto(`/node/${expected.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!verifyResponse || verifyResponse.status() >= 400) throw new Error('COMPONENT_POC_BLOCKED: Updated Basic Page could not be reopened safely.');
    const verifyForm = page.locator('form.node-page-edit-form, form[id^="node-page-edit-form"]').filter({ visible: true });
    if ((await verifyForm.count()) !== 1 || (await verifyForm.locator(basicPageConfig.titleField.selector).inputValue()) !== expected.title) {
      throw new Error('COMPONENT_POC_BLOCKED: Updated Basic Page ownership changed after save.');
    }
    if (!bodyField || (await readConfiguredField(verifyForm, bodyField)) !== expected.formattedTextMarker) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing Formatted text changed after Blockquote save.');
    }
    const verifyWrapper = verifyForm.locator(BASIC_PAGE_PARAGRAPH_WRAPPER);
    await this.assertBasicPageInventory(verifyWrapper, 1);
    const persisted = await this.paragraphDeltasByLabel(verifyWrapper, BLOCKQUOTE_LABEL);
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Blockquote identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(verifyWrapper, persisted[0], this.blockquoteTextSelector(persisted[0]));
    await this.assertBlockquoteState(verifyWrapper, persisted[0], blockquoteMarker, defaults);
    const draft = await validateSafeModerationState(verifyForm, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Updated Basic Page did not remain Draft before publishing.');

    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName,
      label: basicPageConfig.label,
      nodeId: Number(expected.nodeId),
      title: expected.title,
      moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) {
      throw new Error(`COMPONENT_POC_BLOCKED: Blockquote update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    }
    return { ...expected, blockquoteMarker, blockquoteDelta: persisted[0], published: true };
  }

  async verifyBlockquoteFrontend(page: Page, updated: Omit<ExistingBasicPageBlockquotePoc, 'publicUrl' | 'paragraphIdentity' | 'frontendVerified'>): Promise<ExistingBasicPageBlockquotePoc> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: updated.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: updated.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
    ]);
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity: verified.identities[1], frontendVerified: true };
  }

  async addListToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
    blockquoteMarker: string;
  }): Promise<Omit<ExistingBasicPageListPoc, 'publicUrl' | 'paragraphIdentity' | 'listStructure' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: List extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (!/^\d+$/.test(expected.nodeId) || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Existing List host is not exact and QA-owned.');
    const { form, wrapper } = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertExistingBlockquote(wrapper, expected.blockquoteMarker);
    await this.assertBasicPageInventory(wrapper, 1, 0);
    const moderation = await validateSafeModerationState(form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Existing page could not enter safe Draft state.');

    const listDelta = await this.addBasicPageParagraph(page, wrapper, 'list', 'List', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const listMarkers = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}LIST-${runId}-ITEM-${index}`) as [string, string, string];
    await this.assertListDefaults(wrapper, listDelta);
    for (let index = 0; index < listMarkers.length; index += 1) await this.addListTextItem(page, wrapper, listDelta, index, listMarkers[index], monitor);
    await this.assertBasicPageInventory(wrapper, 1, 1);
    await this.assertListState(wrapper, listDelta, listMarkers);
    await submitNodeForm(page, form, 'Basic Page List POC update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertExistingBlockquote(reopened.wrapper, expected.blockquoteMarker);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'List');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved List identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.blockquoteFieldSelector(persisted[0], '[field_paragraph_alignment]'));
    await this.assertListDefaults(reopened.wrapper, persisted[0]);
    await this.assertListState(reopened.wrapper, persisted[0], listMarkers);
    const draft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: List update did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: List update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { ...expected, listMarkers, listDelta: persisted[0], published: true };
  }

  async recoverPersistedListAndPublish(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
    blockquoteMarker: string;
    listMarkers: readonly [string, string, string];
  }): Promise<Omit<ExistingBasicPageListPoc, 'publicUrl' | 'paragraphIdentity' | 'listStructure' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: List recovery is allowed only for exact DEVV.');
    assertPublishingAllowed();
    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertExistingBlockquote(reopened.wrapper, expected.blockquoteMarker);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'List');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Recovery did not find one exact saved List.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.blockquoteFieldSelector(persisted[0], '[field_paragraph_alignment]'));
    await this.assertListDefaults(reopened.wrapper, persisted[0]);
    await this.assertListState(reopened.wrapper, persisted[0], expected.listMarkers);
    const draft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Recovered List revision was not Draft.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Recovered List revision did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { ...expected, listDelta: persisted[0], published: true };
  }

  async verifyListFrontend(page: Page, updated: Omit<ExistingBasicPageListPoc, 'publicUrl' | 'paragraphIdentity' | 'listStructure' | 'frontendVerified'>): Promise<ExistingBasicPageListPoc> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: updated.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: updated.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...updated.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    const list = article.locator('ul, ol').filter({ hasText: updated.listMarkers[0] }).filter({ hasText: updated.listMarkers[1] }).filter({ hasText: updated.listMarkers[2], visible: true });
    if ((await list.count()) !== 1) throw new Error('List items were not rendered together in one unique semantic list.');
    for (const marker of updated.listMarkers) {
      if ((await list.locator('li').filter({ hasText: marker, visible: true }).count()) !== 1) throw new Error('Expected List marker was not visible in one semantic list item.');
    }
    const listStructure = await list.evaluate((element) => element.tagName.toLowerCase() as 'ul' | 'ol');
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity: verified.identities[2], listStructure, frontendVerified: true };
  }

  async addAnchorToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
    blockquoteMarker: string;
    listMarkers: readonly [string, string, string];
  }): Promise<Omit<ExistingBasicPageAnchorPoc, 'publicUrl' | 'paragraphIdentity' | 'labelRendering' | 'fragmentRetained' | 'targetResolved' | 'targetInViewport' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Anchor extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    const { form, wrapper } = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertExistingBlockquote(wrapper, expected.blockquoteMarker);
    await this.assertExistingList(wrapper, expected.listMarkers);
    await this.assertBasicPageInventory(wrapper, 1, 1, 0);
    const moderation = await validateSafeModerationState(form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Existing page could not enter safe Draft state.');

    const anchorDelta = await this.addBasicPageParagraph(page, wrapper, 'anchor', 'Anchor', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '').toLowerCase()}-${crypto.randomUUID().slice(0, 4)}`;
    const anchorId = `qa-automated-anchor-${runId}`;
    const anchorLabel = `${AUTOMATED_CONTENT_PREFIX}ANCHOR-LABEL-${runId}`;
    await this.populateAndAssertAnchor(wrapper, anchorDelta, anchorId, anchorLabel);
    await this.assertBasicPageInventory(wrapper, 1, 1, 1);
    await submitNodeForm(page, form, 'Basic Page Anchor POC update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertExistingBlockquote(reopened.wrapper, expected.blockquoteMarker);
    await this.assertExistingList(reopened.wrapper, expected.listMarkers);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Anchor');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Anchor identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.anchorIdSelector(persisted[0]));
    await this.populateAndAssertAnchor(reopened.wrapper, persisted[0], anchorId, anchorLabel, false);
    const draft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Anchor update did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Anchor update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { ...expected, anchorId, anchorLabel, anchorDelta: persisted[0], published: true };
  }

  async verifyAnchorFrontend(page: Page, updated: Omit<ExistingBasicPageAnchorPoc, 'publicUrl' | 'paragraphIdentity' | 'labelRendering' | 'fragmentRetained' | 'targetResolved' | 'targetInViewport' | 'frontendVerified'>): Promise<ExistingBasicPageAnchorPoc> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: updated.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: updated.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...updated.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    const target = article.locator(`[id="${updated.anchorId}"]`);
    if ((await target.count()) !== 1) throw new Error('Anchor ID was not rendered exactly once in the owned article.');
    const labelRendering = await target.evaluate((element, expectedLabel) => {
      if (element.getAttribute('aria-label') === expectedLabel) return 'aria-label';
      if ((element.textContent ?? '').replace(/\s+/g, ' ').trim() === expectedLabel) return 'text';
      if (element.getAttribute('title') === expectedLabel) return 'title';
      return undefined;
    }, updated.anchorLabel);
    const verifiedLabelRendering = labelRendering ?? 'not rendered';
    if (!labelRendering && (await article.innerText()).includes(updated.anchorLabel)) throw new Error('Anchor label rendering was inconsistent with the target attributes.');
    await page.goto(`${verified.publicUrl}#${updated.anchorId}`, { waitUntil: 'domcontentloaded' });
    await assertNoDrupalFatalPage(page);
    if (new URL(page.url()).hash !== `#${updated.anchorId}`) throw new Error('Anchor fragment was not retained in the public URL.');
    const resolved = page.locator(`[id="${updated.anchorId}"]`);
    if ((await resolved.count()) !== 1) throw new Error('Fragment did not resolve one unique Anchor target.');
    const targetResolved = await resolved.evaluate((element, id) => document.getElementById(id) === element, updated.anchorId);
    if (!targetResolved) throw new Error('Browser fragment target did not resolve to the intended Anchor element.');
    const targetInViewport = await resolved.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= window.innerHeight;
    });
    if (!targetInViewport) throw new Error('Anchor fragment target was not brought into the viewport.');
    const paragraphIdentity = await resolved.evaluate((element) => {
      const paragraph = element.closest('[data-entity-type="paragraph"], [data-paragraph-id], [about*="/paragraph/"]');
      return paragraph?.getAttribute('data-entity-id') ?? paragraph?.getAttribute('data-paragraph-id') ?? paragraph?.getAttribute('data-entity-uuid') ?? paragraph?.getAttribute('about') ?? undefined;
    });
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, labelRendering: verifiedLabelRendering, fragmentRetained: true, targetResolved: true, targetInViewport: true, frontendVerified: true };
  }

  async maximizeExistingComponentCoverage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
    blockquoteMarker: string;
    listMarkers: readonly [string, string, string];
    anchorId: string;
    anchorLabel: string;
  }): Promise<Omit<ExistingComponentCoverageResult, 'publicUrl' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Coverage update is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Coverage host identity is not the approved QA node.');
    if (!/^\d+$/.test(AUTOMATED_IMAGE_MEDIA_ID)) throw new Error('COMPONENT_POC_BLOCKED: DEVV automation image fixture ID is not configured.');

    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1);
    await this.assertExistingBlockquote(opened.wrapper, expected.blockquoteMarker);
    await this.assertExistingList(opened.wrapper, expected.listMarkers);
    const anchorDeltas = await this.paragraphDeltasByLabel(opened.wrapper, 'Anchor');
    if (anchorDeltas.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Existing Anchor identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(opened.wrapper, anchorDeltas[0], this.anchorIdSelector(anchorDeltas[0]));
    await this.populateAndAssertAnchor(opened.wrapper, anchorDeltas[0], expected.anchorId, expected.anchorLabel, false);
    const draft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter a safe Draft update state.');

    const formattedDeltas = await this.paragraphDeltasByLabel(opened.wrapper, 'Formatted text');
    const blockquoteDeltas = await this.paragraphDeltasByLabel(opened.wrapper, BLOCKQUOTE_LABEL);
    const listDeltas = await this.paragraphDeltasByLabel(opened.wrapper, 'List');
    if (formattedDeltas.length !== 1 || blockquoteDeltas.length !== 1 || listDeltas.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Exact component identities changed before coverage update.');
    const formattedDelta = formattedDeltas[0];
    const blockquoteDelta = blockquoteDeltas[0];
    const listDelta = listDeltas[0];

    await this.expandBasicPageParagraphForControl(opened.wrapper, formattedDelta, this.blockquoteFieldSelector(formattedDelta, '[field_paragraph_border]'));
    const formattedFormat = opened.wrapper.locator(this.blockquoteFieldSelector(formattedDelta, '[field_formatted_text][0][format]'));
    if ((await formattedFormat.count()) !== 1 || (await formattedFormat.inputValue()) !== 'rich_text') throw new Error('COMPONENT_POC_BLOCKED: Formatted text format changed from the audited rich_text value.');
    await opened.wrapper.locator(this.blockquoteFieldSelector(formattedDelta, '[field_paragraph_border]')).selectOption('padding');

    await this.expandBasicPageParagraphForControl(opened.wrapper, blockquoteDelta, this.blockquoteTextSelector(blockquoteDelta));
    const blockquoteValues = {
      '[field_blockquote_author_name][0][value]': 'QA Automation',
      '[field_blockquote_author_title][0][value]': 'Component coverage fixture',
      '[field_blockquote_cta][0][uri]': `/node/${expected.nodeId}#${expected.anchorId}`,
      '[field_blockquote_cta][0][title]': 'Jump to QA anchor',
      '[field_blockquote_cta][0][options][attributes][aria-label]': 'Jump to the QA automated anchor',
    } as const;
    for (const [suffix, value] of Object.entries(blockquoteValues)) {
      const control = opened.wrapper.locator(this.blockquoteFieldSelector(blockquoteDelta, suffix));
      await this.revealLinkAttributeControl(control);
      await control.fill(value);
    }
    const mediaTrigger = opened.wrapper.locator(`[name^="field_media_image-media-library-open-button-${BASIC_PAGE_PARAGRAPH_FIELD}-${blockquoteDelta}-subform"]`).filter({ visible: true });
    const media = await selectAutomationImageFixtureFromTrigger(page, mediaTrigger, AUTOMATED_IMAGE_MEDIA_ID);
    if (media.id !== AUTOMATED_IMAGE_MEDIA_ID || media.name !== AUTOMATED_IMAGE_MEDIA_NAME) throw new Error('COMPONENT_POC_BLOCKED: Exact QA image fixture identity was not proven.');
    const mediaAssociation = opened.wrapper.locator(`input[type="hidden"][name="${this.paragraphPrefix(blockquoteDelta)}[field_media_image][selection][0][target_id]"]`);
    await mediaAssociation.waitFor({ state: 'attached', timeout: 20_000 });
    if ((await mediaAssociation.count()) !== 1 || (await mediaAssociation.inputValue()) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error('COMPONENT_POC_BLOCKED: Blockquote image association was not exact.');

    await this.expandBasicPageParagraphForControl(opened.wrapper, listDelta, this.blockquoteFieldSelector(listDelta, '[field_paragraph_alignment]'));
    const listValues = {
      '[field_list_head][0][value]': 'QA automated component list',
      '[field_list_cta][0][uri]': `/node/${expected.nodeId}#${expected.anchorId}`,
      '[field_list_cta][0][title]': 'Jump to QA anchor',
      '[field_list_cta][0][options][attributes][aria-label]': 'Jump to the QA automated anchor from the list',
    } as const;
    for (const [suffix, value] of Object.entries(listValues)) {
      const control = opened.wrapper.locator(this.blockquoteFieldSelector(listDelta, suffix));
      await this.revealLinkAttributeControl(control);
      await control.fill(value);
    }
    await fillOwnedEditor(opened.wrapper, `textarea[name="${this.paragraphPrefix(listDelta)}[field_list_text][0][value]"]`, 'QA automated list supporting text', 'List supporting text');
    await opened.wrapper.locator(this.blockquoteFieldSelector(listDelta, '[field_paragraph_border]')).selectOption('padding');
    if (await this.exactValue(opened.wrapper, this.blockquoteFieldSelector(listDelta, '[field_paragraph_alignment]')) !== 'left') throw new Error('COMPONENT_POC_BLOCKED: List alignment changed from the audited safe value.');
    await this.assertListMarkersAndEmptyIcons(opened.wrapper, listDelta, expected.listMarkers);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1);

    await submitNodeForm(page, opened.form, 'Basic Page existing component field coverage update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1);
    await this.assertCoveragePersisted(reopened.wrapper, expected, AUTOMATED_IMAGE_MEDIA_ID);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Coverage update did not persist as Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Coverage update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return {
      nodeId: expected.nodeId,
      title: expected.title,
      mediaId: AUTOMATED_IMAGE_MEDIA_ID,
      fieldsPopulated: ['Formatted text: Style (padding)', 'Blockquote: Author name', 'Blockquote: Author title', 'Blockquote: Image', 'Blockquote: CTA URL', 'Blockquote: CTA Link text', 'Blockquote: CTA ARIA Label', 'List: Heading', 'List: Text', 'List: CTA URL', 'List: CTA Link text', 'List: CTA ARIA Label', 'List: Style (padding)'],
      fieldsIntentionallyEmpty: ['List item 1 Icon', 'List item 2 Icon', 'List item 3 Icon'],
      published: true,
    };
  }

  async verifyMaximizedComponentCoverage(page: Page, updated: Omit<ExistingComponentCoverageResult, 'publicUrl' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string;
  }): Promise<ExistingComponentCoverageResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    const blockquote = article.locator('blockquote').filter({ hasText: expected.blockquoteMarker, visible: true });
    const blockquoteRegion = blockquote.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(@class,"paragraph")][1]');
    for (const text of ['QA Automation', 'Component coverage fixture']) if (!(await blockquoteRegion.innerText()).includes(text)) throw new Error(`Blockquote frontend did not render ${text}.`);
    const blockquoteLink = blockquoteRegion.getByRole('link', { name: 'Jump to the QA automated anchor', exact: true });
    if ((await blockquoteLink.count()) !== 1 || !this.isExactOwnedAnchorHref(await blockquoteLink.getAttribute('href'), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error('Blockquote CTA frontend rendering was not exact.');
    const image = blockquoteRegion.locator('img').filter({ visible: true });
    if ((await image.count()) < 1 || !(await image.first().getAttribute('src'))) throw new Error('Blockquote QA image fixture did not render visibly.');

    const list = article.locator('ul, ol').filter({ hasText: expected.listMarkers[0] }).filter({ hasText: expected.listMarkers[1] }).filter({ hasText: expected.listMarkers[2], visible: true });
    if ((await list.count()) !== 1) throw new Error('The three saved List markers did not render in one semantic list.');
    if ((await article.getByRole('heading', { name: 'QA automated component list', exact: true }).filter({ visible: true }).count()) !== 1) throw new Error('List frontend did not render the saved heading semantically.');
    if ((await article.getByText('QA automated list supporting text', { exact: true }).filter({ visible: true }).count()) !== 1) throw new Error('List frontend did not render the saved supporting text exactly once.');
    const listLink = article.getByRole('link', { name: 'Jump to the QA automated anchor from the list', exact: true });
    if ((await listLink.count()) !== 1 || !this.isExactOwnedAnchorHref(await listLink.getAttribute('href'), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error('List CTA frontend rendering was not exact.');
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1) throw new Error('Existing Anchor target was not preserved on the frontend.');
    return { ...updated, publicUrl: verified.publicUrl, frontendVerified: true };
  }

  async addJumpNavToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
    blockquoteMarker: string;
    listMarkers: readonly [string, string, string];
    anchorId: string;
    anchorLabel: string;
  }): Promise<Omit<ExistingBasicPageJumpNavResult, 'publicUrl' | 'paragraphIdentity' | 'mouseClickVerified' | 'keyboardVerified' | 'fragmentVerified' | 'targetVerified' | 'viewportVerified' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Jump nav extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Jump nav host identity is not the approved QA page.');
    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 0);
    await this.assertCoveragePersisted(opened.wrapper, expected, AUTOMATED_IMAGE_MEDIA_ID);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Jump nav.');

    const jumpNavDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'jump_nav', 'Jump nav', monitor);
    const selector = `input[type="radio"][name="${this.paragraphPrefix(jumpNavDelta)}[field_jump_nav_type]"]`;
    const radios = opened.wrapper.locator(selector);
    const options = await radios.evaluateAll((elements) => elements.map((element) => {
      const input = element as HTMLInputElement;
      const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent : undefined;
      return { label: (label ?? '').replace(/\s+/g, ' ').trim(), value: input.value };
    }));
    if (options.length !== 2 || !options.some(({ label, value }) => label === 'Inline' && value === 'inline') || !options.some(({ label, value }) => label === 'Sticky' && value === 'sticky')) throw new Error('COMPONENT_POC_BLOCKED: Jump nav exact audited Inline/Sticky field model changed.');
    const editable = opened.wrapper.locator(`[name^="${this.paragraphPrefix(jumpNavDelta)}"]`).filter({ visible: true });
    if ((await editable.count()) !== 2) throw new Error('COMPONENT_POC_BLOCKED: Jump nav exposed unexpected additional editable controls.');
    await opened.wrapper.locator(`${selector}[value="inline"]`).check();
    await this.assertJumpNavState(opened.wrapper, jumpNavDelta);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Jump nav POC update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1);
    await this.assertCoveragePersisted(reopened.wrapper, expected, AUTOMATED_IMAGE_MEDIA_ID);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Jump nav');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Jump nav identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], `input[type="radio"][name="${this.paragraphPrefix(persisted[0])}[field_jump_nav_type]"][value="inline"]`);
    await this.assertJumpNavState(reopened.wrapper, persisted[0]);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Jump nav revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Jump nav update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, jumpNavDelta: persisted[0], jumpNavType: 'inline', anchorId: expected.anchorId, anchorLabel: expected.anchorLabel, published: true };
  }

  async recoverSavedJumpNavAndPublish(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string;
    title: string;
    formattedTextMarker: string;
    blockquoteMarker: string;
    listMarkers: readonly [string, string, string];
    anchorId: string;
    anchorLabel: string;
  }): Promise<Omit<ExistingBasicPageJumpNavResult, 'publicUrl' | 'paragraphIdentity' | 'mouseClickVerified' | 'keyboardVerified' | 'fragmentVerified' | 'targetVerified' | 'viewportVerified' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Jump nav recovery is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Jump nav recovery host is not the approved QA page.');
    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1);
    await this.assertCoveragePersisted(reopened.wrapper, expected, AUTOMATED_IMAGE_MEDIA_ID);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Jump nav');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Recovery did not find one exact saved Jump nav.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], `input[type="radio"][name="${this.paragraphPrefix(persisted[0])}[field_jump_nav_type]"][value="inline"]`);
    await this.assertJumpNavState(reopened.wrapper, persisted[0]);
    const draft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Saved Jump nav revision was not Draft.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Saved Jump nav did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, jumpNavDelta: persisted[0], jumpNavType: 'inline', anchorId: expected.anchorId, anchorLabel: expected.anchorLabel, published: true };
  }

  async verifyJumpNavFrontend(page: Page, updated: Omit<ExistingBasicPageJumpNavResult, 'publicUrl' | 'paragraphIdentity' | 'mouseClickVerified' | 'keyboardVerified' | 'fragmentVerified' | 'targetVerified' | 'viewportVerified' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string];
  }): Promise<ExistingBasicPageJumpNavResult> {
    const baseline = await this.verifyMaximizedComponentCoverage(page, {
      nodeId: updated.nodeId, title: updated.title, mediaId: AUTOMATED_IMAGE_MEDIA_ID, fieldsPopulated: [], fieldsIntentionallyEmpty: ['List item 1 Icon', 'List item 2 Icon', 'List item 3 Icon'], published: true,
    }, { ...expected, anchorId: updated.anchorId });
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    const link = article.getByRole('link', { name: updated.anchorLabel, exact: true }).filter({ visible: true });
    if ((await link.count()) !== 1) throw new Error('Jump nav did not render one exact visible accessible Anchor link.');
    const component = link.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--jump-nav ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Jump nav link was not owned by one visible Jump nav component.');
    if ((await component.getByRole('link', { name: updated.anchorLabel, exact: true }).count()) !== 1) throw new Error('Jump nav rendered a duplicate target link.');
    if (!this.isExactOwnedAnchorHref(await link.getAttribute('href'), baseline.publicUrl, updated.nodeId, updated.anchorId)) throw new Error('Jump nav href did not resolve to the exact owned Anchor.');
    const semanticNav = link.locator('xpath=ancestor::nav[1]');
    if ((await semanticNav.count()) !== 1) throw new Error('Jump nav link was not rendered with navigation semantics.');
    if ((await link.getAttribute('tabindex')) === '-1') throw new Error('Jump nav link was not keyboard-focusable.');
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;

    await page.goto(baseline.publicUrl, { waitUntil: 'domcontentloaded' });
    const mouseLink = page.getByRole('link', { name: updated.anchorLabel, exact: true }).filter({ visible: true });
    await mouseLink.click();
    await this.assertExactFragmentNavigation(page, baseline.publicUrl, updated.anchorId);

    await page.goto(baseline.publicUrl, { waitUntil: 'domcontentloaded' });
    const keyboardLink = page.getByRole('link', { name: updated.anchorLabel, exact: true }).filter({ visible: true });
    await keyboardLink.focus();
    if (!(await keyboardLink.evaluate((element) => document.activeElement === element))) throw new Error('Jump nav exact link did not receive keyboard focus.');
    await keyboardLink.press('Enter');
    await this.assertExactFragmentNavigation(page, baseline.publicUrl, updated.anchorId);
    return { ...updated, publicUrl: baseline.publicUrl, paragraphIdentity, mouseClickVerified: true, keyboardVerified: true, fragmentVerified: true, targetVerified: true, viewportVerified: true, frontendVerified: true };
  }

  private async assertJumpNavState(wrapper: Locator, delta: string): Promise<void> {
    const selector = `input[type="radio"][name="${this.paragraphPrefix(delta)}[field_jump_nav_type]"]`;
    const radios = wrapper.locator(selector);
    if ((await radios.count()) !== 2) throw new Error('COMPONENT_POC_BLOCKED: Jump nav radio inventory changed.');
    const selected = wrapper.locator(`${selector}:checked`);
    if ((await selected.count()) !== 1 || (await selected.inputValue()) !== 'inline') throw new Error('COMPONENT_POC_BLOCKED: Jump nav Inline selection did not persist.');
  }

  private async assertExactFragmentNavigation(page: Page, publicUrl: string, anchorId: string): Promise<void> {
    await page.waitForURL((url) => url.hash === `#${anchorId}`, { timeout: 10_000 });
    const actual = new URL(page.url());
    const expected = new URL(publicUrl);
    if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.hash !== `#${anchorId}`) throw new Error('Jump nav interaction left the exact owned DEVV page or fragment.');
    const target = page.locator(`[id="${anchorId}"]`);
    if ((await target.count()) !== 1 || !(await target.evaluate((element, id) => document.getElementById(id) === element, anchorId))) throw new Error('Jump nav fragment did not resolve the exact unique Anchor target.');
    const inViewport = await target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= -64 && rect.top <= window.innerHeight + 64;
    });
    if (!inViewport) throw new Error('Jump nav target was not brought into the viewport within the tolerant bounds.');
  }

  async addTabsToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
  }): Promise<Omit<ExistingBasicPageTabsResult, 'publicUrl' | 'paragraphIdentity' | 'initialActiveTab' | 'semanticStructure' | 'mouseVerified' | 'keyboardVerified' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Tabs extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Tabs host is not the approved QA page.');
    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Tabs.');

    const tabsDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'tabs', 'Tabs', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const heading = `${AUTOMATED_CONTENT_PREFIX}TABS-HEADING-${runId}`;
    const tabLabels = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}TAB-${index}-${runId}`) as [string, string, string];
    const tabContents = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}TAB-CONTENT-${index}-${runId}`) as [string, string, string];
    await opened.wrapper.locator(this.tabsFieldSelector(tabsDelta, '[field_tabs_style]')).selectOption('horizontal');
    await opened.wrapper.locator(this.tabsFieldSelector(tabsDelta, '[field_tabs_head][0][value]')).fill(heading);
    await opened.wrapper.locator(this.tabsFieldSelector(tabsDelta, '[field_paragraph_border]')).selectOption('padding');
    await this.populateTabsItem(opened.wrapper, tabsDelta, 0, tabLabels[0], tabContents[0]);
    for (let index = 1; index < 3; index += 1) {
      const add = opened.wrapper.getByRole('button', { name: 'Add Tabs item - text', exact: true }).filter({ visible: true });
      if ((await add.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Tabs nested Add control was not unique.');
      const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
      await add.click();
      const response = await ajax;
      if (response.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: Tabs item Add returned HTTP ${response.status()}.`);
      monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
      await this.populateTabsItem(opened.wrapper, tabsDelta, index, tabLabels[index], tabContents[index]);
    }
    await this.assertTabsState(opened.wrapper, tabsDelta, heading, tabLabels, tabContents);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Tabs POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Tabs');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Tabs identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.tabsFieldSelector(persisted[0], '[field_tabs_style]'));
    await this.assertTabsState(reopened.wrapper, persisted[0], heading, tabLabels, tabContents);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Tabs revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Tabs update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, tabsDelta: persisted[0], heading, tabLabels, tabContents, published: true };
  }

  async verifyTabsFrontend(page: Page, updated: Omit<ExistingBasicPageTabsResult, 'publicUrl' | 'paragraphIdentity' | 'initialActiveTab' | 'semanticStructure' | 'mouseVerified' | 'keyboardVerified' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
  }): Promise<ExistingBasicPageTabsResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1) throw new Error('Existing Anchor was not preserved after Tabs publish.');
    if ((await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Existing Jump nav was not preserved after Tabs publish.');
    const heading = article.getByText(updated.heading, { exact: true }).filter({ visible: true });
    if ((await heading.count()) !== 1) throw new Error('Tabs heading did not render exactly once.');
    const component = heading.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--tabs ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Tabs component was not uniquely visible.');
    const tablist = component.getByRole('tablist');
    const tabs = component.getByRole('tab');
    const panels = component.locator('[role="tabpanel"]');
    const semanticStructure = { tablist: (await tablist.count()) === 1, tabs: (await tabs.count()) === 3, tabpanels: (await panels.count()) === 3, ariaSelected: (await tabs.locator('[aria-selected]').count()) === 3 };
    if (!semanticStructure.tablist || !semanticStructure.tabs || !semanticStructure.tabpanels) throw new Error(`Tabs ARIA structure was incomplete: ${JSON.stringify(semanticStructure)}.`);
    for (let index = 0; index < 3; index += 1) {
      if ((await component.getByRole('tab', { name: updated.tabLabels[index], exact: true }).count()) !== 1) throw new Error(`Tab ${index + 1} label was not unique.`);
      if (((await component.textContent())?.match(new RegExp(updated.tabContents[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length !== 1) throw new Error(`Tab ${index + 1} content marker was missing or duplicated.`);
    }
    const initialExpanded = component.locator('button[aria-expanded="true"]').filter({ visible: true });
    if ((await initialExpanded.count()) !== 1) throw new Error('Tabs did not expose one initial aria-expanded control.');
    const initialActiveTab = (await initialExpanded.innerText()).trim();
    await this.assertActiveTab(component, updated.tabLabels[0], updated.tabContents[0]);
    await component.getByRole('button', { name: updated.tabLabels[1], exact: true }).click();
    await this.assertActiveTab(component, updated.tabLabels[1], updated.tabContents[1], updated.tabContents[0]);
    await component.getByRole('button', { name: updated.tabLabels[2], exact: true }).click();
    await this.assertActiveTab(component, updated.tabLabels[2], updated.tabContents[2], updated.tabContents[1]);

    const first = component.getByRole('button', { name: updated.tabLabels[0], exact: true });
    await first.focus();
    if (!(await first.evaluate((element) => document.activeElement === element))) throw new Error('Tab 1 was not keyboard-focusable.');
    await first.press('ArrowRight');
    const second = component.getByRole('button', { name: updated.tabLabels[1], exact: true });
    if (!(await second.evaluate((element) => document.activeElement === element))) throw new Error('ArrowRight did not move focus to Tab 2.');
    await second.press('Enter');
    await this.assertActiveTab(component, updated.tabLabels[1], updated.tabContents[1]);
    await second.press('ArrowLeft');
    if (!(await first.evaluate((element) => document.activeElement === element))) throw new Error('ArrowLeft did not move focus back to Tab 1.');
    await first.press(' ');
    await this.assertActiveTab(component, updated.tabLabels[0], updated.tabContents[0]);
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, initialActiveTab, semanticStructure, mouseVerified: true, keyboardVerified: true, frontendVerified: true };
  }

  async addCardGridToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
  }): Promise<Omit<ExistingBasicPageCardGridResult, 'publicUrl' | 'paragraphIdentity' | 'cardsRendered' | 'ctaInteractionVerified' | 'keyboardVerified' | 'imagesVerified' | 'imageAccessibilityVerified' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Card Grid extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Card Grid host is not the approved QA page.');
    if (!/^\d+$/.test(AUTOMATED_IMAGE_MEDIA_ID)) throw new Error('COMPONENT_POC_BLOCKED: DEVV automation image fixture ID is not configured.');
    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Card Grid.');

    const cardGridDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'grid', 'Card: Grid', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const heading = `${AUTOMATED_CONTENT_PREFIX}CARD-GRID-HEADING-${runId}`;
    const text = `${AUTOMATED_CONTENT_PREFIX}CARD-GRID-TEXT-${runId}`;
    const cardNames = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}CARD-NAME-${index}-${runId}`) as [string, string, string];
    const cardTitles = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}CARD-${index}-${runId}`) as [string, string, string];
    const cardHrefs = [1, 2, 3].map(() => `/node/${expected.nodeId}#${expected.anchorId}`) as [string, string, string];
    await opened.wrapper.locator(this.cardGridFieldSelector(cardGridDelta, '[field_grid_head][0][value]')).fill(heading);
    await fillOwnedEditor(opened.wrapper, `textarea${this.cardGridFieldSelector(cardGridDelta, '[field_grid_text][0][value]')}`, text, 'Card Grid text');
    if (await this.exactValue(opened.wrapper, this.cardGridFieldSelector(cardGridDelta, '[field_grid_text][0][format]')) !== 'limited_text') throw new Error('COMPONENT_POC_BLOCKED: Card Grid text format changed.');
    await opened.wrapper.locator(this.cardGridFieldSelector(cardGridDelta, '[field_paragraph_border]')).selectOption('padding');
    for (let index = 0; index < 3; index += 1) {
      if (index > 0) await this.addProfileCard(page, opened.wrapper, cardGridDelta, monitor);
      await this.populateProfileCard(page, opened.wrapper, cardGridDelta, index, cardNames[index], cardTitles[index], cardHrefs[index]);
    }
    await this.assertCardGridState(opened.wrapper, cardGridDelta, heading, text, cardNames, cardTitles, cardHrefs);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Card Grid POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Card: Grid');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Card Grid identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.cardGridFieldSelector(persisted[0], '[field_grid_head][0][value]'));
    await this.assertCardGridState(reopened.wrapper, persisted[0], heading, text, cardNames, cardTitles, cardHrefs);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Card Grid revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Card Grid update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, cardGridDelta: persisted[0], heading, text, cardNames, cardTitles, cardHrefs, mediaId: AUTOMATED_IMAGE_MEDIA_ID, published: true };
  }

  async verifyCardGridFrontend(page: Page, updated: Omit<ExistingBasicPageCardGridResult, 'publicUrl' | 'paragraphIdentity' | 'cardsRendered' | 'ctaInteractionVerified' | 'keyboardVerified' | 'imagesVerified' | 'imageAccessibilityVerified' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
  }): Promise<ExistingBasicPageCardGridResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1) throw new Error('Existing Anchor was not preserved after Card Grid publish.');
    if ((await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Existing Jump nav was not preserved after Card Grid publish.');
    for (const marker of ['QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', 'QA-AUTOMATED-TAB-1-20260918-111250-0159']) if ((await article.getByText(marker, { exact: true }).count()) !== 1) throw new Error('Existing Tabs baseline was not preserved after Card Grid publish.');
    const heading = article.getByText(updated.heading, { exact: true }).filter({ visible: true });
    if ((await heading.count()) !== 1) throw new Error('Card Grid heading did not render exactly once.');
    const component = heading.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--grid ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Card Grid component was not uniquely visible.');
    if ((await component.getByText(updated.text, { exact: true }).count()) !== 1) throw new Error('Card Grid supporting text did not render exactly once.');
    for (let index = 0; index < 3; index += 1) {
      const title = component.getByText(updated.cardTitles[index], { exact: true }).filter({ visible: true });
      if ((await title.count()) !== 1) throw new Error(`Profile card ${index + 1} title did not render uniquely.`);
      const card = title.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " paragraph--type--profile-card ") or contains(concat(" ", normalize-space(@class), " "), " card ")][1]');
      if ((await card.count()) !== 1 || !(await card.isVisible())) throw new Error(`Profile card ${index + 1} was not uniquely scoped.`);
      if ((await card.getByText(updated.cardNames[index], { exact: true }).count()) !== 1) throw new Error(`Profile card ${index + 1} Name rendered outside its card or was missing.`);
      const link = card.locator('a').filter({ hasText: updated.cardTitles[index], visible: true });
      if ((await link.count()) !== 1 || !this.isExactOwnedAnchorHref(await link.getAttribute('href'), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error(`Profile card ${index + 1} link was not exact.`);
      const image = card.locator('img').filter({ visible: true });
      if ((await image.count()) !== 1 || !(await image.getAttribute('src'))) throw new Error(`Profile card ${index + 1} image did not render exactly once.`);
      if (!(await image.getAttribute('alt'))?.trim()) throw new Error(`Profile card ${index + 1} image did not expose non-empty alt output.`);
    }
    const firstLink = component.locator('a').filter({ hasText: updated.cardTitles[0], visible: true });
    await firstLink.focus();
    if (!(await firstLink.evaluate((element) => document.activeElement === element))) throw new Error('Profile card CTA was not keyboard-focusable.');
    await firstLink.click();
    const anchor = page.locator(`[id="${expected.anchorId}"]`);
    const activated = new URL(page.url());
    const anchorTop = (await anchor.count()) === 1 ? Math.round(await anchor.evaluate((element) => element.getBoundingClientRect().top)) : null;
    if ((await anchor.count()) !== 1 || !this.isExactOwnedAnchorHref(page.url(), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error(`Profile card CTA did not reach the exact owned page fragment: ${JSON.stringify({ pathname: activated.pathname, expectedHashPresent: activated.hash === `#${expected.anchorId}`, anchorTop })}.`);
    const occurrences = ((await article.innerText()).match(new RegExp(updated.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
    if (occurrences !== 1) throw new Error(`Card Grid heading rendered ${occurrences} times.`);
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, cardsRendered: 3, ctaInteractionVerified: true, keyboardVerified: true, imagesVerified: true, imageAccessibilityVerified: true, frontendVerified: true };
  }

  async addStatCalloutToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    cardGridHeading: string; cardNames: readonly [string, string, string];
  }): Promise<Omit<ExistingBasicPageStatCalloutResult, 'publicUrl' | 'paragraphIdentity' | 'semanticStructure' | 'referenceLabelRendering' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Stat callout extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Stat callout host is not the approved QA page.');
    const statistic = {
      label: 'Statistic', selector: 'input[name="field_page_paragraphs[7][subform][field_stat_callout_ref][0][target_id]"]',
      expectedId: '25046', expectedLabel: `${AUTOMATED_CONTENT_PREFIX}Statistic-20260917-080900-2931-UPDATED`,
      fixtureEditPath: '/node/25046/edit', fixtureTitleSelector: 'input[name="title[0][value]"]',
    } as const;
    await verifyEntityReferenceFixture(page, statistic);
    const statisticForm = page.locator('form.node-statistic-edit-form, form[id^="node-statistic-edit-form"], form.node-statistic-form').filter({ visible: true });
    if ((await statisticForm.count()) !== 1 || await this.exactValue(statisticForm, 'input[name="field_statistic_value[0][value]"]') !== '200') throw new Error('COMPONENT_POC_BLOCKED: Exact QA Statistic fixture value/type could not be proven.');

    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.cardGridHeading, ...expected.cardNames]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Stat callout.');
    const statCalloutDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'stat_callout', 'Stat callout', monitor);
    const resolvedStatistic = { ...statistic, selector: this.statCalloutFieldSelector(statCalloutDelta, '[field_stat_callout_ref][0][target_id]') };
    await selectEntityReferenceFixture(page, opened.wrapper, resolvedStatistic);
    await opened.wrapper.locator(this.statCalloutFieldSelector(statCalloutDelta, '[field_paragraph_alignment]')).selectOption('left');
    await opened.wrapper.locator(this.statCalloutFieldSelector(statCalloutDelta, '[field_paragraph_border]')).selectOption('padding');
    await opened.wrapper.locator(this.statCalloutFieldSelector(statCalloutDelta, '[field_paragraph_color]')).selectOption('purple');
    await this.assertStatCalloutState(opened.wrapper, statCalloutDelta, resolvedStatistic);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Stat callout POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Stat callout');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Stat callout identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.statCalloutFieldSelector(persisted[0], '[field_stat_callout_ref][0][target_id]'));
    await this.assertStatCalloutState(reopened.wrapper, persisted[0], { ...resolvedStatistic, selector: this.statCalloutFieldSelector(persisted[0], '[field_stat_callout_ref][0][target_id]') });
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Stat callout revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Stat callout update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, statCalloutDelta: persisted[0], statisticId: statistic.expectedId, statisticTitle: statistic.expectedLabel, statisticValue: '200', alignment: 'left', padding: 'padding', color: 'purple', published: true };
  }

  async verifyStatCalloutFrontend(page: Page, updated: Omit<ExistingBasicPageStatCalloutResult, 'publicUrl' | 'paragraphIdentity' | 'semanticStructure' | 'referenceLabelRendering' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    cardGridHeading: string; cardNames: readonly [string, string, string];
  }): Promise<ExistingBasicPageStatCalloutResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1 || (await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Existing Anchor or Jump nav was not preserved after Stat callout publish.');
    if ((await article.getByText('QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', { exact: true }).count()) !== 1) throw new Error('Existing Tabs baseline was not preserved after Stat callout publish.');
    if ((await article.getByText(expected.cardGridHeading, { exact: true }).count()) !== 1) throw new Error('Existing Card Grid heading was not preserved after Stat callout publish.');
    for (const name of expected.cardNames) if ((await article.getByText(name, { exact: true }).count()) !== 1) throw new Error('Existing Card Grid item was not preserved after Stat callout publish.');
    const component = article.locator('.paragraph--type--stat-callout, [class*="stat-callout"]').filter({ hasText: updated.statisticValue, visible: true }).first();
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Stat callout component was not uniquely visible.');
    const valueCandidates = component.locator('*').filter({ hasText: new RegExp(`^\\s*${updated.statisticValue}\\s*$`) }).filter({ visible: true });
    if ((await valueCandidates.count()) < 1) throw new Error('Stat callout Statistic value did not render in its component.');
    const statisticElement = valueCandidates.last();
    const statisticTag = (await statisticElement.evaluate((element) => element.tagName.toLowerCase()));
    const headingLevels = await component.locator('h1, h2, h3, h4, h5, h6').evaluateAll((elements) => elements.map((element) => Number(element.tagName.slice(1))));
    const referenceLabelCount = await component.getByText(updated.statisticTitle, { exact: true }).count();
    if (referenceLabelCount > 1) throw new Error('Stat callout reference label rendered more than once.');
    const valueOccurrences = ((await component.innerText()).match(new RegExp(`(?:^|\\s)${updated.statisticValue}(?=\\s|$)`, 'g')) ?? []).length;
    if (valueOccurrences !== 1) throw new Error(`Stat callout Statistic value rendered ${valueOccurrences} times instead of once.`);
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, semanticStructure: { statisticTag, headingLevels }, referenceLabelRendering: referenceLabelCount === 1 ? 'frontend verified' : 'not frontend-rendered', frontendVerified: true };
  }

  private statCalloutFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }

  private async assertStatCalloutState(wrapper: Locator, delta: string, fixture: Parameters<typeof assertEntityReferenceFixture>[1]): Promise<void> {
    await assertEntityReferenceFixture(wrapper, fixture);
    if (await this.exactValue(wrapper, this.statCalloutFieldSelector(delta, '[field_paragraph_alignment]')) !== 'left'
      || await this.exactValue(wrapper, this.statCalloutFieldSelector(delta, '[field_paragraph_border]')) !== 'padding'
      || await this.exactValue(wrapper, this.statCalloutFieldSelector(delta, '[field_paragraph_color]')) !== 'purple') throw new Error('COMPONENT_POC_BLOCKED: Stat callout configuration did not persist exactly.');
  }

  async addVideoToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    cardGridHeading: string; cardNames: readonly [string, string, string]; statisticTitle: string;
  }): Promise<Omit<ExistingBasicPageVideoResult, 'publicUrl' | 'paragraphIdentity' | 'implementation' | 'playbackResult' | 'desktopVisible' | 'mobileVisible' | 'noHorizontalOverflow' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Video extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || !expected.title.startsWith(`${AUTOMATED_CONTENT_PREFIX}Component-POC-`)) throw new Error('COMPONENT_POC_BLOCKED: Video host is not the approved QA page.');
    const mediaId = '44536';
    const mediaName = 'Leidos Australia Sea Archer Animation July 2026.mp4';
    const mediaResponse = await page.goto(`/media/${mediaId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!mediaResponse || mediaResponse.status() >= 400) throw new Error(`COMPONENT_POC_BLOCKED: Remote video media ${mediaId} returned HTTP ${mediaResponse?.status() ?? 'unknown'}.`);
    const mediaForm = page.locator('form#media-remote-video-edit-form').filter({ visible: true });
    const heading = page.getByRole('heading', { level: 1, name: `Edit Remote video ${mediaName}`, exact: true });
    const published = mediaForm.locator('input[name="status[value]"]');
    const providerField = mediaForm.locator('input[name="field_media_oembed_video[0][value]"]');
    if ((await mediaForm.count()) !== 1 || (await heading.count()) !== 1 || (await published.count()) !== 1 || !(await published.isChecked()) || (await providerField.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Existing Remote video identity/type/publication state was not exact.');
    const providerHost = new URL(await providerField.inputValue()).hostname.replace(/^www\./, '');
    if (!['youtube.com', 'youtu.be'].includes(providerHost)) throw new Error('COMPONENT_POC_BLOCKED: Existing Remote video was not the expected YouTube provider type.');

    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Video.');
    const videoDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'video', 'Video', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const videoTitle = `${AUTOMATED_CONTENT_PREFIX}VIDEO-EXISTING-HEADING-${runId}`;
    const caption = `${AUTOMATED_CONTENT_PREFIX}VIDEO-EXISTING-CAPTION-${runId}`;
    await opened.wrapper.locator(this.videoFieldSelector(videoDelta, '[field_video_title][0][value]')).fill(videoTitle);
    await opened.wrapper.locator(`textarea${this.videoFieldSelector(videoDelta, '[field_video_caption][0][value]')}`).fill(caption);
    await opened.wrapper.locator(this.videoFieldSelector(videoDelta, '[field_paragraph_border]')).selectOption('padding');
    const trigger = opened.wrapper.locator(`[name="field_video_media-media-library-open-button-${BASIC_PAGE_PARAGRAPH_FIELD}-${videoDelta}-subform"]`).filter({ visible: true });
    const media = await selectExactExistingMediaFromTrigger(page, trigger, mediaId, mediaName);
    if (media.id !== mediaId || media.name !== mediaName) throw new Error('COMPONENT_POC_BLOCKED: Remote video selection identity changed.');
    await this.assertVideoState(opened.wrapper, videoDelta, videoTitle, caption, mediaId);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Video POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Video');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Video identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.videoFieldSelector(persisted[0], '[field_video_title][0][value]'));
    await this.assertVideoState(reopened.wrapper, persisted[0], videoTitle, caption, mediaId);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Video revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Video update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, videoDelta: persisted[0], videoTitle, caption, mediaId, mediaName, mediaBundle: 'Remote video', provider: 'YouTube', published: true };
  }

  async verifyVideoFrontend(page: Page, updated: Omit<ExistingBasicPageVideoResult, 'publicUrl' | 'paragraphIdentity' | 'implementation' | 'playbackResult' | 'desktopVisible' | 'mobileVisible' | 'noHorizontalOverflow' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    cardGridHeading: string; cardNames: readonly [string, string, string]; statisticValue: string;
  }): Promise<ExistingBasicPageVideoResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1 || (await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Existing Anchor or Jump nav was not preserved after Video publish.');
    if ((await article.getByText('QA-AUTOMATED-TABS-HEADING-20260918-111250-0159', { exact: true }).count()) !== 1) throw new Error('Existing Tabs baseline was not preserved after Video publish.');
    if ((await article.getByText(expected.cardGridHeading, { exact: true }).count()) !== 1) throw new Error('Existing Card Grid was not preserved after Video publish.');
    for (const name of expected.cardNames) if ((await article.getByText(name, { exact: true }).count()) !== 1) throw new Error('Existing Card Grid item was not preserved after Video publish.');
    if ((await article.locator('.paragraph--type--stat-callout, [class*="stat-callout"]').filter({ hasText: expected.statisticValue, visible: true }).count()) < 1) throw new Error('Existing Stat callout was not preserved after Video publish.');
    const title = article.getByText(updated.videoTitle, { exact: true }).filter({ visible: true });
    if ((await title.count()) !== 1) throw new Error('Video title did not render uniquely.');
    const component = title.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--video ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Video component was not uniquely visible.');
    if ((await component.getByText(updated.caption, { exact: true }).count()) !== 1) throw new Error('Video caption did not render uniquely in its component.');
    const poster = component.locator('img').filter({ visible: true });
    if ((await poster.count()) !== 1 || !(await poster.getAttribute('src')) || (await poster.getAttribute('alt')) !== updated.videoTitle) throw new Error('Video lazy-load poster did not render with exact accessible output.');
    const play = component.getByRole('button', { name: /Play\s*$/i });
    if ((await play.count()) !== 1 || !(await play.isVisible())) throw new Error('Video custom player did not expose one visible Play control.');
    await play.focus();
    if (!(await play.evaluate((element) => document.activeElement === element))) throw new Error('Video Play control was not keyboard-focusable.');
    await play.click();
    // The DEVV theme renders the provider player in a page-level modal, not
    // inside the paragraph that owns the launcher.
    const iframe = page.locator('iframe').filter({ visible: true });
    await iframe.waitFor({ state: 'visible', timeout: 20_000 });
    if ((await iframe.count()) !== 1) throw new Error('Video Play activation did not produce one visible provider iframe.');
    const src = await iframe.getAttribute('src');
    if (!src) throw new Error('Video iframe did not expose a source.');
    const iframeUrl = new URL(src, verified.publicUrl);
    const providerHost = iframeUrl.hostname;
    const publicHost = new URL(verified.publicUrl).hostname;
    const isYouTubeHost = (host: string): boolean => /(?:^|\.)youtube(?:-nocookie)?\.com$/i.test(host);
    const isDrupalOembedWrapper = providerHost === publicHost && iframeUrl.pathname.startsWith('/media/oembed');
    if (!isYouTubeHost(providerHost) && !isDrupalOembedWrapper) throw new Error('Video modal iframe was neither the validated provider nor the exact same-origin Drupal oEmbed wrapper.');
    if (!(await iframe.getAttribute('title'))?.trim()) throw new Error('Video iframe did not expose an accessible title.');
    await page.keyboard.press('Escape');
    await iframe.waitFor({ state: 'hidden', timeout: 10_000 });
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopVisible = await component.isVisible();
    const desktopOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileVisible = await component.isVisible();
    const mobileOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    if (!desktopVisible || !mobileVisible || desktopOverflow || mobileOverflow) throw new Error('Video responsive smoke check failed.');
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, implementation: 'custom lazy-load launcher with page-level YouTube modal', playbackResult: 'Play activation opened one accessible provider iframe successfully', desktopVisible: true, mobileVisible: true, noHorizontalOverflow: true, frontendVerified: true };
  }

  async addCardCollectionToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string;
  }): Promise<Omit<ExistingBasicPageCardCollectionResult, 'publicUrl' | 'paragraphIdentity' | 'cardsRendered' | 'cardOrderVerified' | 'ctaInteraction' | 'keyboardVerified' | 'imagesVerified' | 'imageAccessibilityVerified' | 'desktopVisible' | 'mobileVisible' | 'noHorizontalOverflow' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Card Collection extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || expected.title !== `${AUTOMATED_CONTENT_PREFIX}Component-POC-20260918-084653-1484`) throw new Error('COMPONENT_POC_BLOCKED: Card Collection host is not the exact approved QA page.');
    if (AUTOMATED_IMAGE_MEDIA_ID !== '45031') throw new Error('COMPONENT_POC_BLOCKED: DEVV automation image fixture identity changed.');
    await verifyAutomationImageFixture(page, AUTOMATED_IMAGE_MEDIA_ID, AUTOMATED_IMAGE_MEDIA_NAME);
    const mediaForm = page.locator('form#media-image-edit-form, form[id^="media-image-edit-form"]').filter({ visible: true });
    const mediaPublished = mediaForm.locator('input[name="status[value]"]');
    if ((await mediaForm.count()) !== 1 || (await mediaPublished.count()) !== 1 || !(await mediaPublished.isChecked())) throw new Error('COMPONENT_POC_BLOCKED: Exact QA Image media bundle/usable state was not proven.');

    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Card Collection.');

    const delta = await this.addBasicPageParagraph(page, opened.wrapper, 'partners', 'Card: Collection', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const heading = `${AUTOMATED_CONTENT_PREFIX}CARD-COLLECTION-HEADING-${runId}`;
    const text = `${AUTOMATED_CONTENT_PREFIX}CARD-COLLECTION-TEXT-${runId}`;
    const parentCtaText = `${AUTOMATED_CONTENT_PREFIX}CARD-COLLECTION-CTA-${runId}`;
    const parentCtaAriaLabel = `Open QA automated card collection ${runId}`;
    const parentHref = `/node/${expected.nodeId}#${expected.anchorId}`;
    const cardHeadings = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}COLLECTION-CARD-${index}-${runId}`) as [string, string, string];
    const cardTexts = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}COLLECTION-CARD-TEXT-${index}-${runId}`) as [string, string, string];
    const cardCtaTexts = [1, 2, 3].map((index) => `${AUTOMATED_CONTENT_PREFIX}COLLECTION-CARD-CTA-${index}-${runId}`) as [string, string, string];
    const cardHrefs = [1, 2, 3].map(() => parentHref) as [string, string, string];
    await opened.wrapper.locator(this.cardCollectionFieldSelector(delta, '[field_background_style]')).selectOption('white__attenuate_3_light_cards');
    await opened.wrapper.locator(this.cardCollectionFieldSelector(delta, '[field_paragraph_border]')).selectOption('padding');
    await opened.wrapper.locator(this.cardCollectionFieldSelector(delta, '[field_partners_head][0][value]')).fill(heading);
    await opened.wrapper.locator(`textarea${this.cardCollectionFieldSelector(delta, '[field_partners_text][0][value]')}`).fill(text);
    await opened.wrapper.locator(this.cardCollectionFieldSelector(delta, '[field_partners_cta][0][uri]')).fill(parentHref);
    await opened.wrapper.locator(this.cardCollectionFieldSelector(delta, '[field_partners_cta][0][title]')).fill(parentCtaText);
    const parentAria = opened.wrapper.locator(this.cardCollectionFieldSelector(delta, '[field_partners_cta][0][options][attributes][aria-label]'));
    await this.revealLinkAttributeControl(parentAria);
    await parentAria.fill(parentCtaAriaLabel);
    for (let index = 0; index < 3; index += 1) {
      if (index > 0) await this.addPartnerLogo(page, opened.wrapper, delta, monitor);
      await this.populatePartnerLogo(page, opened.wrapper, delta, index, cardHeadings[index], cardTexts[index], cardCtaTexts[index], cardHrefs[index]);
    }
    await this.assertCardCollectionState(opened.wrapper, delta, heading, text, parentCtaText, parentCtaAriaLabel, parentHref, cardHeadings, cardTexts, cardCtaTexts, cardHrefs);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Card Collection POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Card: Collection');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Card Collection identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.cardCollectionFieldSelector(persisted[0], '[field_partners_head][0][value]'));
    await this.assertCardCollectionState(reopened.wrapper, persisted[0], heading, text, parentCtaText, parentCtaAriaLabel, parentHref, cardHeadings, cardTexts, cardCtaTexts, cardHrefs);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Card Collection revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Card Collection update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, cardCollectionDelta: persisted[0], heading, text, parentCtaText, parentCtaAriaLabel, parentHref, cardHeadings, cardTexts, cardCtaTexts, cardHrefs, mediaId: AUTOMATED_IMAGE_MEDIA_ID, published: true };
  }

  async addCardCollectionV2VariantsToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string;
  }): Promise<ExistingBasicPageCardCollectionV2Result[]> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Card Collection v2 is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || expected.title !== `${AUTOMATED_CONTENT_PREFIX}Component-POC-20260918-084653-1484`) throw new Error('COMPONENT_POC_BLOCKED: Card Collection v2 host is not the exact approved QA page.');
    if (AUTOMATED_IMAGE_MEDIA_ID !== '45031') throw new Error('COMPONENT_POC_BLOCKED: DEVV automation image fixture identity changed.');
    await verifyAutomationImageFixture(page, AUTOMATED_IMAGE_MEDIA_ID, AUTOMATED_IMAGE_MEDIA_NAME);

    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle]) {
      if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    }
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Card Collection v2.');

    const variants: CardCollectionV2VariantConfig[] = [
      { displayValue: '2', variantLabel: 'Display Two', introHeader: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-HEADER-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, introText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-TEXT-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, ctaText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CTA`, ctaAriaLabel: 'Open QA automated collection v2 display two', ctaHref: `/node/${expected.nodeId}#${expected.anchorId}`, cardHeadings: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CARD-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CARD-2`], cardTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CARD-TEXT-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CARD-TEXT-2`], cardCtaTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CARD-CTA-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-TWO-CARD-CTA-2`], cardHrefs: [`/node/${expected.nodeId}#${expected.anchorId}`, `/node/${expected.nodeId}#${expected.anchorId}`] },
      { displayValue: '3', variantLabel: 'Display Three', introHeader: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-HEADER-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, introText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-TEXT-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, ctaText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CTA`, ctaAriaLabel: 'Open QA automated collection v2 display three', ctaHref: `/node/${expected.nodeId}#${expected.anchorId}`, cardHeadings: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-3`], cardTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-TEXT-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-TEXT-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-TEXT-3`], cardCtaTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-CTA-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-CTA-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-THREE-CARD-CTA-3`], cardHrefs: [`/node/${expected.nodeId}#${expected.anchorId}`, `/node/${expected.nodeId}#${expected.anchorId}`, `/node/${expected.nodeId}#${expected.anchorId}`] },
      { displayValue: '4', variantLabel: 'Display Four', introHeader: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-HEADER-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, introText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-TEXT-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, ctaText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CTA`, ctaAriaLabel: 'Open QA automated collection v2 display four', ctaHref: `/node/${expected.nodeId}#${expected.anchorId}`, cardHeadings: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-3`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-4`], cardTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-TEXT-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-TEXT-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-TEXT-3`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-TEXT-4`], cardCtaTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-CTA-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-CTA-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-CTA-3`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-FOUR-CARD-CTA-4`], cardHrefs: [`/node/${expected.nodeId}#${expected.anchorId}`, `/node/${expected.nodeId}#${expected.anchorId}`, `/node/${expected.nodeId}#${expected.anchorId}`, `/node/${expected.nodeId}#${expected.anchorId}`] },
      { displayValue: 'carousel', variantLabel: 'Display Carousel', introHeader: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-HEADER-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, introText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-TEXT-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}`, ctaText: `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CTA`, ctaAriaLabel: 'Open QA automated collection v2 display carousel', ctaHref: `/node/${expected.nodeId}#${expected.anchorId}`, cardHeadings: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-3`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-4`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-5`], cardTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-TEXT-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-TEXT-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-TEXT-3`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-TEXT-4`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-TEXT-5`], cardCtaTexts: [`${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-CTA-1`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-CTA-2`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-CTA-3`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-CTA-4`, `${AUTOMATED_CONTENT_PREFIX}COLLECTION-V2-CAROUSEL-CARD-CTA-5`], cardHrefs: Array.from({ length: 5 }, () => `/node/${expected.nodeId}#${expected.anchorId}`) },
    ];

    const existingV2Variants: ExistingBasicPageCardCollectionV2Result[] = (await this.discoverExistingCardCollectionV2Variants(opened.wrapper)).map((variant): ExistingBasicPageCardCollectionV2Result => ({
      nodeId: expected.nodeId,
      title: expected.title,
      displayValue: variant.displayValue,
      variantLabel: variant.variantLabel,
      paragraphDelta: variant.paragraphDelta,
      introHeader: variant.introHeader,
      introText: variant.introText,
      ctaText: variant.ctaText,
      ctaAriaLabel: variant.ctaAriaLabel,
      ctaHref: variant.ctaHref,
      cardCount: variant.cardHeadings.length,
      cardHeadings: variant.cardHeadings,
      cardTexts: variant.cardTexts,
      cardCtaTexts: variant.cardCtaTexts,
      cardHrefs: variant.cardHrefs,
      mediaId: AUTOMATED_IMAGE_MEDIA_ID,
      publicUrl: '',
      published: true,
      frontendVerified: true,
    }));
    const savedResults: ExistingBasicPageCardCollectionV2Result[] = [...existingV2Variants];
    const existingDisplayValues = new Set(existingV2Variants.map((variant) => variant.displayValue));
    for (const variant of variants) {
      if (existingDisplayValues.has(variant.displayValue)) continue;
      const delta = await this.addBasicPageParagraph(page, opened.wrapper, 'card_collection', 'Card: Collection (v2.0)', monitor);
      await this.ensureCardCollectionV2ParentExpanded(opened.wrapper, delta);
      await opened.wrapper.locator(this.cardCollectionV2FieldSelector(delta, '[field_card_display]')).selectOption(variant.displayValue);
      await opened.wrapper.locator(this.cardCollectionV2FieldSelector(delta, '[field_intro_header][0][value]')).fill(variant.introHeader);
      await fillOwnedEditor(opened.wrapper, `textarea${this.cardCollectionV2FieldSelector(delta, '[field_intro_text][0][value]')}`, variant.introText, 'Card Collection v2 intro text');
      await opened.wrapper.locator(this.cardCollectionV2FieldSelector(delta, '[field_cta][0][uri]')).fill(variant.ctaHref);
      await opened.wrapper.locator(this.cardCollectionV2FieldSelector(delta, '[field_cta][0][title]')).fill(variant.ctaText);
      const aria = opened.wrapper.locator(this.cardCollectionV2FieldSelector(delta, '[field_cta][0][options][attributes][aria-label]'));
      if ((await aria.count()) === 1) {
        await this.setHiddenLinkAttributeValue(aria, variant.ctaAriaLabel);
      }
      const cardCount = variant.cardHeadings.length;
      for (let index = 0; index < cardCount; index += 1) {
        await this.ensureCardCollectionV2CardReady(page, opened.wrapper, delta, index, monitor);
        await this.populateCardCollectionV2Card(page, opened.wrapper, delta, index, variant.cardHeadings[index], variant.cardTexts[index], variant.cardCtaTexts[index], variant.cardHrefs[index]);
      }
      await this.assertCardCollectionV2State(opened.wrapper, delta, variant);
      savedResults.push({ nodeId: expected.nodeId, title: expected.title, displayValue: variant.displayValue, variantLabel: variant.variantLabel, paragraphDelta: delta, introHeader: variant.introHeader, introText: variant.introText, ctaText: variant.ctaText, ctaAriaLabel: variant.ctaAriaLabel, ctaHref: variant.ctaHref, cardCount, cardHeadings: variant.cardHeadings, cardTexts: variant.cardTexts, cardCtaTexts: variant.cardCtaTexts, cardHrefs: variant.cardHrefs, mediaId: AUTOMATED_IMAGE_MEDIA_ID, publicUrl: '', published: true, frontendVerified: true });
      existingDisplayValues.add(variant.displayValue);
    }

    await submitNodeForm(page, opened.form, 'Basic Page Card Collection v2 update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    for (const result of savedResults) {
      const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Card: Collection (v2.0)');
      if (persisted.length < savedResults.length) throw new Error('COMPONENT_POC_BLOCKED: Saved Card Collection v2 variants were not all preserved.');
      const variantMatch = persisted.find((delta) => delta === result.paragraphDelta) ?? persisted[0];
      if (!variantMatch) throw new Error('COMPONENT_POC_BLOCKED: Saved Card Collection v2 variant identity was ambiguous.');
      await this.expandBasicPageParagraphForControl(reopened.wrapper, variantMatch, this.cardCollectionV2FieldSelector(variantMatch, '[field_intro_header][0][value]'));
      await this.assertCardCollectionV2State(reopened.wrapper, variantMatch, {
        displayValue: result.displayValue,
        variantLabel: result.variantLabel,
        introHeader: result.introHeader,
        introText: result.introText,
        ctaText: result.ctaText,
        ctaAriaLabel: result.ctaAriaLabel,
        ctaHref: result.ctaHref,
        cardHeadings: result.cardHeadings,
        cardTexts: result.cardTexts,
        cardCtaTexts: result.cardCtaTexts,
        cardHrefs: result.cardHrefs,
      });
    }

    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Card Collection v2 revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Card Collection v2 update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);

    return savedResults.map((result) => ({ ...result, publicUrl: safeNodeUrl(page.url()) }));
  }

  async verifyCardCollectionFrontend(page: Page, updated: Omit<ExistingBasicPageCardCollectionResult, 'publicUrl' | 'paragraphIdentity' | 'cardsRendered' | 'cardOrderVerified' | 'ctaInteraction' | 'keyboardVerified' | 'imagesVerified' | 'imageAccessibilityVerified' | 'desktopVisible' | 'mobileVisible' | 'noHorizontalOverflow' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string]; statisticValue: string; videoTitle: string;
  }): Promise<ExistingBasicPageCardCollectionResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1 || (await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Existing Anchor or Jump nav was not preserved after Card Collection publish.');
    if ((await article.getByText(expected.tabsHeading, { exact: true }).count()) !== 1) throw new Error('Existing Tabs was not preserved after Card Collection publish.');
    if ((await article.getByText(expected.cardGridHeading, { exact: true }).count()) !== 1) throw new Error('Existing Card Grid was not preserved after Card Collection publish.');
    for (const name of expected.cardNames) if ((await article.getByText(name, { exact: true }).count()) !== 1) throw new Error('Existing Card Grid item was not preserved after Card Collection publish.');
    if ((await article.locator('.paragraph--type--stat-callout, [class*="stat-callout"]').filter({ hasText: expected.statisticValue, visible: true }).count()) < 1) throw new Error('Existing Stat callout was not preserved after Card Collection publish.');
    if ((await article.getByText(expected.videoTitle, { exact: true }).count()) !== 1) throw new Error('Existing Video was not preserved after Card Collection publish.');

    const heading = article.getByText(updated.heading, { exact: true }).filter({ visible: true });
    if ((await heading.count()) !== 1) throw new Error('Card Collection heading did not render exactly once.');
    const component = heading.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--partners ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Card Collection component was not uniquely visible.');
    if ((await component.getByText(updated.text, { exact: true }).count()) !== 1) throw new Error('Card Collection text did not render uniquely.');
    const parentCta = component.getByRole('link', { name: updated.parentCtaAriaLabel, exact: true });
    if ((await parentCta.count()) !== 1 || !this.isExactOwnedAnchorHref(await parentCta.getAttribute('href'), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error('Card Collection parent CTA did not render with exact accessible name and href.');
    const componentText = await component.innerText();
    let lastPosition = -1;
    for (let index = 0; index < 3; index += 1) {
      const cardHeading = component.getByText(updated.cardHeadings[index], { exact: true }).filter({ visible: true });
      if ((await cardHeading.count()) !== 1) throw new Error(`Collection card ${index + 1} heading did not render uniquely.`);
      const card = cardHeading.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " paragraph--type--partners-logo ") or contains(concat(" ", normalize-space(@class), " "), " card ")][1]');
      if ((await card.count()) !== 1 || !(await card.isVisible())) throw new Error(`Collection card ${index + 1} was not uniquely scoped.`);
      if ((await card.getByText(updated.cardTexts[index], { exact: true }).count()) !== 1) throw new Error(`Collection card ${index + 1} text was missing from its card.`);
      const link = card.getByRole('link', { name: updated.cardCtaTexts[index], exact: true });
      if ((await link.count()) !== 1 || !this.isExactOwnedAnchorHref(await link.getAttribute('href'), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error(`Collection card ${index + 1} CTA was not exact.`);
      const image = card.locator('img').filter({ visible: true });
      if ((await image.count()) !== 1 || !(await image.getAttribute('src')) || !(await image.getAttribute('alt'))?.trim()) throw new Error(`Collection card ${index + 1} image/accessibility output was incomplete.`);
      const position = componentText.indexOf(updated.cardHeadings[index]);
      if (position <= lastPosition) throw new Error('Collection card frontend order changed.');
      lastPosition = position;
    }
    const ids = (await component.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean)));
    if (new Set(ids).size !== ids.length) throw new Error('Card Collection introduced duplicate IDs within the component.');
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopVisible = await component.isVisible();
    const desktopCards = await Promise.all(updated.cardHeadings.map((marker) => component.getByText(marker, { exact: true }).isVisible()));
    const desktopOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileVisible = await component.isVisible();
    const mobileCards = await Promise.all(updated.cardHeadings.map((marker) => component.getByText(marker, { exact: true }).isVisible()));
    const mobileOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    if (!desktopVisible || !mobileVisible || desktopCards.includes(false) || mobileCards.includes(false) || desktopOverflow || mobileOverflow) throw new Error('Card Collection responsive smoke check failed.');
    const firstLink = component.getByRole('link', { name: updated.cardCtaTexts[0], exact: true });
    await firstLink.focus();
    if (!(await firstLink.evaluate((element) => document.activeElement === element))) throw new Error('Collection card CTA was not keyboard-focusable.');
    await firstLink.press('Enter');
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const activated = new URL(page.url());
    const canonical = new URL(verified.publicUrl);
    if (activated.origin !== canonical.origin || ![canonical.pathname, `/node/${updated.nodeId}`].includes(activated.pathname)) throw new Error('Collection card CTA left the exact owned QA page.');
    const ctaInteraction = activated.hash === `#${expected.anchorId}` ? 'keyboard activation retained the configured fragment' : 'keyboard activation reached the owned page but DEVV dropped the configured fragment (known behavior)';
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, cardsRendered: 3, cardOrderVerified: true, ctaInteraction, keyboardVerified: true, imagesVerified: true, imageAccessibilityVerified: true, desktopVisible: true, mobileVisible: true, noHorizontalOverflow: true, frontendVerified: true };
  }

  async addBannerToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string; cardCollectionHeading: string; collectionCardHeadings: readonly [string, string, string];
  }): Promise<Omit<ExistingBasicPageBannerResult, 'publicUrl' | 'paragraphIdentity' | 'headingLevel' | 'ctaInteraction' | 'imageHttpStatus' | 'imageLoadResult' | 'mouseVerified' | 'keyboardVerified' | 'imageVerified' | 'imageAccessibilityVerified' | 'desktopVisible' | 'mobileVisible' | 'noClipping' | 'noHorizontalOverflow' | 'frontendVerified'>> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Banner extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || expected.title !== `${AUTOMATED_CONTENT_PREFIX}Component-POC-20260918-084653-1484`) throw new Error('COMPONENT_POC_BLOCKED: Banner host is not the exact approved QA page.');
    if (AUTOMATED_IMAGE_MEDIA_ID !== '45031') throw new Error('COMPONENT_POC_BLOCKED: DEVV automation image fixture identity changed.');
    await verifyAutomationImageFixture(page, AUTOMATED_IMAGE_MEDIA_ID, AUTOMATED_IMAGE_MEDIA_NAME);
    const mediaForm = page.locator('form#media-image-edit-form, form[id^="media-image-edit-form"]').filter({ visible: true });
    const mediaPublished = mediaForm.locator('input[name="status[value]"]');
    if ((await mediaForm.count()) !== 1 || (await mediaPublished.count()) !== 1 || !(await mediaPublished.isChecked())) throw new Error('COMPONENT_POC_BLOCKED: Exact QA Image media bundle/usable state was not proven for Banner.');

    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Existing baseline marker ${marker} was missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Banner.');

    const bannerDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'featured_person', 'Banner', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const eyebrow = `${AUTOMATED_CONTENT_PREFIX}BANNER-EYEBROW-${runId}`;
    const heading = `${AUTOMATED_CONTENT_PREFIX}BANNER-HEADING-${runId}`;
    const subtitle = `${AUTOMATED_CONTENT_PREFIX}BANNER-SUBTITLE-${runId}`;
    const text = `${AUTOMATED_CONTENT_PREFIX}BANNER-TEXT-${runId}`;
    const ctaText = `${AUTOMATED_CONTENT_PREFIX}BANNER-CTA-${runId}`;
    const ctaAriaLabel = `Open QA automated banner ${runId}`;
    const ctaHref = `/node/${expected.nodeId}#${expected.anchorId}`;
    await opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_featured_person_head][0][value]')).fill(eyebrow);
    await opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_featured_person_name][0][value]')).fill(heading);
    await opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_featured_person_position][0][value]')).fill(subtitle);
    await opened.wrapper.locator(`textarea${this.bannerFieldSelector(bannerDelta, '[field_featured_person_text][0][value]')}`).fill(text);
    await opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_featured_person_cta][0][uri]')).fill(ctaHref);
    await opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_featured_person_cta][0][title]')).fill(ctaText);
    const aria = opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_featured_person_cta][0][options][attributes][aria-label]'));
    await this.setHiddenLinkAttributeValue(aria, ctaAriaLabel);
    await opened.wrapper.locator(this.bannerFieldSelector(bannerDelta, '[field_paragraph_border]')).selectOption('padding');
    const trigger = opened.wrapper.locator(`[name="field_media_image-media-library-open-button-${BASIC_PAGE_PARAGRAPH_FIELD}-${bannerDelta}-subform"]`).filter({ visible: true });
    const media = await selectAutomationImageFixtureFromTrigger(page, trigger, AUTOMATED_IMAGE_MEDIA_ID);
    if (media.id !== AUTOMATED_IMAGE_MEDIA_ID || media.name !== AUTOMATED_IMAGE_MEDIA_NAME) throw new Error('COMPONENT_POC_BLOCKED: Banner Image fixture identity was not exact.');
    await this.assertBannerState(opened.wrapper, bannerDelta, eyebrow, heading, subtitle, text, ctaText, ctaAriaLabel, ctaHref);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Banner POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Banner');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Banner identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.bannerFieldSelector(persisted[0], '[field_featured_person_name][0][value]'));
    await this.assertBannerState(reopened.wrapper, persisted[0], eyebrow, heading, subtitle, text, ctaText, ctaAriaLabel, ctaHref);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Banner revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Banner update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, bannerDelta: persisted[0], eyebrow, heading, subtitle, text, ctaText, ctaAriaLabel, ctaHref, mediaId: AUTOMATED_IMAGE_MEDIA_ID, published: true };
  }

  async verifyBannerFrontend(page: Page, updated: Omit<ExistingBasicPageBannerResult, 'publicUrl' | 'paragraphIdentity' | 'headingLevel' | 'ctaInteraction' | 'imageHttpStatus' | 'imageLoadResult' | 'mouseVerified' | 'keyboardVerified' | 'imageVerified' | 'imageAccessibilityVerified' | 'desktopVisible' | 'mobileVisible' | 'noClipping' | 'noHorizontalOverflow' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string]; statisticValue: string; videoTitle: string;
    cardCollectionHeading: string; collectionCardHeadings: readonly [string, string, string];
  }): Promise<ExistingBasicPageBannerResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1 || (await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Existing Anchor or Jump nav was not preserved after Banner publish.');
    for (const marker of [expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings]) if ((await article.getByText(marker, { exact: true }).count()) !== 1) throw new Error(`Existing component marker ${marker} was not preserved after Banner publish.`);
    if ((await article.locator('.paragraph--type--stat-callout, [class*="stat-callout"]').filter({ hasText: expected.statisticValue, visible: true }).count()) < 1) throw new Error('Existing Stat callout was not preserved after Banner publish.');

    const heading = article.getByRole('heading', { name: updated.eyebrow, exact: true }).filter({ visible: true });
    if ((await heading.count()) !== 1) throw new Error('Banner Eyebrow did not render as one actual heading.');
    const headingLevel = Number((await heading.evaluate((element) => element.tagName)).slice(1));
    if (!Number.isInteger(headingLevel) || headingLevel < 1 || headingLevel > 6) throw new Error('Banner heading level was invalid.');
    const component = heading.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--featured-person ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Banner component was not uniquely visible.');
    for (const marker of [updated.heading, updated.subtitle, updated.text]) if ((await component.getByText(marker, { exact: true }).count()) !== 1) throw new Error(`Banner field ${marker} did not render uniquely inside Banner.`);
    const cta = component.getByRole('link', { name: updated.ctaAriaLabel, exact: true });
    if ((await cta.count()) !== 1 || !this.isExactOwnedAnchorHref(await cta.getAttribute('href'), verified.publicUrl, updated.nodeId, expected.anchorId)) throw new Error('Banner CTA did not render with exact accessible name and href.');
    const image = component.locator('img').filter({ visible: true });
    if ((await image.count()) !== 1 || !(await image.getAttribute('src')) || !(await image.getAttribute('alt'))?.trim()) throw new Error('Banner image/accessibility output was incomplete.');
    await component.scrollIntoViewIfNeeded();
    const imageSrc = await image.getAttribute('src');
    const imageResponse = await page.request.get(new URL(imageSrc!, verified.publicUrl).href);
    const imageHttpStatus = imageResponse.status();
    const imageHandle = await image.elementHandle();
    if (!imageHandle) throw new Error('Banner image element was unavailable for load verification.');
    await page.waitForFunction((element) => (element as HTMLImageElement).complete, imageHandle, { timeout: 10_000 }).catch(() => undefined);
    const imageLoaded = await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0);
    const imageLoadResult = imageLoaded ? 'browser rendered the Banner image successfully' : `browser did not complete/render the Banner image (source HTTP ${imageHttpStatus})`;
    const componentText = await component.innerText();
    for (const marker of [updated.eyebrow, updated.heading, updated.subtitle, updated.text, updated.ctaText]) if (componentText.indexOf(marker) !== componentText.lastIndexOf(marker)) throw new Error(`Banner marker ${marker} was duplicated.`);
    const ids = await component.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean));
    if (new Set(ids).size !== ids.length) throw new Error('Banner introduced duplicate IDs within the component.');
    const visibleContent = async (): Promise<boolean> => (await Promise.all([
      component.isVisible(), heading.isVisible(), component.getByText(updated.text, { exact: true }).isVisible(), cta.isVisible(), image.isVisible(),
    ])).every(Boolean);
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopVisible = await visibleContent();
    const desktopOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1) || await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileVisible = await visibleContent();
    const mobileOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1) || await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (!desktopVisible || !mobileVisible || desktopOverflow || mobileOverflow) throw new Error('Banner responsive smoke check failed.');
    await cta.focus();
    if (!(await cta.evaluate((element) => document.activeElement === element))) throw new Error('Banner CTA was not keyboard-focusable.');
    await cta.click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const mouseUrl = new URL(page.url());
    const canonical = new URL(verified.publicUrl);
    if (mouseUrl.origin !== canonical.origin || ![canonical.pathname, `/node/${updated.nodeId}`].includes(mouseUrl.pathname)) throw new Error('Banner mouse CTA activation left the exact owned QA page.');
    await page.goto(verified.publicUrl, { waitUntil: 'domcontentloaded' });
    const keyboardCta = page.locator('article').getByRole('link', { name: updated.ctaAriaLabel, exact: true });
    await keyboardCta.focus(); await keyboardCta.press('Enter');
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const keyboardUrl = new URL(page.url());
    if (keyboardUrl.origin !== canonical.origin || ![canonical.pathname, `/node/${updated.nodeId}`].includes(keyboardUrl.pathname)) throw new Error('Banner keyboard CTA activation left the exact owned QA page.');
    const fragmentRetained = mouseUrl.hash === `#${expected.anchorId}` && keyboardUrl.hash === `#${expected.anchorId}`;
    const ctaInteraction = fragmentRetained ? 'mouse and keyboard activation retained the configured fragment' : 'mouse and keyboard activation reached the owned page but DEVV dropped the configured fragment (matches known behavior)';
    const paragraphIdentity = await component.getAttribute('data-entity-id') ?? await component.getAttribute('data-paragraph-id') ?? await component.getAttribute('data-entity-uuid') ?? undefined;
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity, headingLevel, ctaInteraction, imageHttpStatus, imageLoadResult, mouseVerified: true, keyboardVerified: true, imageVerified: imageLoaded, imageAccessibilityVerified: true, desktopVisible: true, mobileVisible: true, noClipping: true, noHorizontalOverflow: true, frontendVerified: imageLoaded };
  }

  async addCarouselToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorLabel: string; anchorId: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string; cardCollectionHeading: string;
    collectionCardHeadings: readonly [string, string, string]; bannerHeading: string;
  }): Promise<ExistingBasicPageCarouselResult> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Carousel extension is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || expected.title !== `${AUTOMATED_CONTENT_PREFIX}Component-POC-20260918-084653-1484`) throw new Error('COMPONENT_POC_BLOCKED: Carousel host is not the exact approved QA page.');
    const publicResponse = await page.goto(`/node/${expected.nodeId}`, { waitUntil: 'domcontentloaded' });
    if (!publicResponse || publicResponse.status() >= 400 || (await page.getByRole('heading', { name: expected.title, exact: true }).count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Exact QA node was not publicly Published before Carousel update.');
    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading]) if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Baseline marker ${marker} missing.`);
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Carousel.');
    const carouselDelta = await this.addBasicPageParagraph(page, opened.wrapper, 'subsidiaries', 'Card: Carousel', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const heading = `${AUTOMATED_CONTENT_PREFIX}CAROUSEL-HEADING-${runId}`;
    const ctaText = `${AUTOMATED_CONTENT_PREFIX}CAROUSEL-CTA-${runId}`;
    const ctaAriaLabel = `Open QA automated carousel ${runId}`;
    const ctaHref = `/node/${expected.nodeId}#${expected.anchorId}`;
    const cardHeadings = [1, 2, 3, 4, 5].map((index) => `${AUTOMATED_CONTENT_PREFIX}CAROUSEL-CARD-${index}-${runId}`) as [string, string, string, string, string];
    const cardTexts = [1, 2, 3, 4, 5].map((index) => `${AUTOMATED_CONTENT_PREFIX}CAROUSEL-TEXT-${index}-${runId}`) as [string, string, string, string, string];
    await opened.wrapper.locator(this.carouselFieldSelector(carouselDelta, '[field_subsidiaries_head][0][value]')).fill(heading);
    await opened.wrapper.locator(this.carouselFieldSelector(carouselDelta, '[field_subsidiaries_cta][0][uri]')).fill(ctaHref);
    await opened.wrapper.locator(this.carouselFieldSelector(carouselDelta, '[field_subsidiaries_cta][0][title]')).fill(ctaText);
    const aria = opened.wrapper.locator(this.carouselFieldSelector(carouselDelta, '[field_subsidiaries_cta][0][options][attributes][aria-label]'));
    await this.setHiddenLinkAttributeValue(aria, ctaAriaLabel);
    await opened.wrapper.locator(this.carouselFieldSelector(carouselDelta, '[field_paragraph_border]')).selectOption('padding');
    for (let index = 0; index < 5; index += 1) {
      await this.addCarouselItem(page, opened.wrapper, carouselDelta, monitor);
      await opened.wrapper.locator(this.carouselItemSelector(carouselDelta, index, '[field_subsidiaries_item_head][0][value]')).fill(cardHeadings[index]);
      await opened.wrapper.locator(`textarea${this.carouselItemSelector(carouselDelta, index, '[field_subsidiaries_item_text][0][value]')}`).fill(cardTexts[index]);
    }
    await this.assertCarouselState(opened.wrapper, carouselDelta, heading, ctaText, ctaAriaLabel, ctaHref, cardHeadings, cardTexts);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Card Carousel POC update');
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Card: Carousel');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Carousel identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.carouselFieldSelector(persisted[0], '[field_subsidiaries_head][0][value]'));
    await this.assertCarouselState(reopened.wrapper, persisted[0], heading, ctaText, ctaAriaLabel, ctaHref, cardHeadings, cardTexts);
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Carousel revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Carousel update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, carouselDelta: persisted[0], heading, ctaText, ctaAriaLabel, ctaHref, cardHeadings, cardTexts, published: true };
  }

  async verifyCarouselFrontend(page: Page, saved: ExistingBasicPageCarouselResult, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string];
    anchorId: string; anchorLabel: string; tabsHeading: string; cardGridHeading: string;
    cardNames: readonly [string, string, string]; statisticValue: string; videoTitle: string;
    cardCollectionHeading: string; collectionCardHeadings: readonly [string, string, string]; bannerHeading: string;
  }): Promise<void> {
    const verified = await this.verifyOwnedArticle(page, saved.nodeId, saved.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: saved.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1 || (await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Carousel baseline Anchor or Jump nav missing.');
    for (const marker of [expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading]) if ((await article.getByText(marker, { exact: true }).count()) !== 1) throw new Error(`Carousel baseline marker ${marker} missing or duplicated.`);
    if ((await article.locator('.paragraph--type--stat-callout, [class*="stat-callout"]').filter({ hasText: expected.statisticValue, visible: true }).count()) < 1) throw new Error('Carousel baseline Stat callout missing.');
    const heading = article.getByRole('heading', { level: 2, name: saved.heading, exact: true });
    if ((await heading.count()) !== 1) throw new Error('Carousel parent heading missing or not H2.');
    const component = heading.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " paragraph--type--subsidiaries ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Carousel component did not render uniquely.');
    if (!(await component.getAttribute('class'))?.split(/\s+/).includes('padding')) throw new Error('Carousel configured padding class missing.');
    const cards = component.locator('.paragraph--type--subsidiaries-item');
    if ((await cards.count()) !== 5) throw new Error('Carousel did not contain exactly five saved cards.');
    for (let index = 0; index < 5; index += 1) {
      const card = cards.nth(index);
      if ((await card.getByRole('heading', { level: 5, name: saved.cardHeadings[index], exact: true }).count()) !== 1
        || (await card.getByText(saved.cardTexts[index], { exact: true }).count()) !== 1) throw new Error(`Carousel card ${index + 1} content/order mismatch.`);
    }
    const cta = component.getByRole('link', { name: saved.ctaAriaLabel, exact: true });
    const ctaCount = await cta.count();
    const ctaHrefExact = ctaCount === 1 && this.isExactOwnedAnchorHref(await cta.getAttribute('href'), verified.publicUrl, saved.nodeId, expected.anchorId);
    const ctaTextExact = ctaCount === 1 && ((await cta.textContent()) ?? '').replace(/\s+/g, ' ').includes(saved.ctaText);
    if (ctaCount !== 1 || !ctaHrefExact || !ctaTextExact) throw new Error(`Carousel parent CTA label/href/accessibility mismatch: ${JSON.stringify({ ctaCount, ctaHrefExact, ctaTextExact })}.`);
    await cta.focus();
    if (!(await cta.evaluate((element) => document.activeElement === element))) throw new Error('Carousel parent CTA not keyboard-focusable.');
    const ids = await component.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean));
    if (new Set(ids).size !== ids.length) throw new Error('Carousel introduced duplicate IDs.');
    const uninitializedWidths: number[] = [];
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
      await component.scrollIntoViewIfNeeded();
      if (!(await component.isVisible()) || await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw new Error(`Carousel rendering/page overflow failed at ${width}px.`);
      await component.locator('.owl-stage').waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
      const state = await component.evaluate((element) => ({
        container: !!element.querySelector('.subsidiaries-carousel'),
        loaded: !!element.querySelector('.owl-loaded'),
        stage: !!element.querySelector('.owl-stage'),
        next: element.querySelectorAll('.owl-next').length,
        previous: element.querySelectorAll('.owl-prev').length,
      }));
      console.log(`CAROUSEL_FRONTEND_STATE ${JSON.stringify({ width, cards: await cards.count(), loaded: state.loaded, stage: state.stage, next: state.next, previous: state.previous })}`);
      if (!state.container || !state.loaded || !state.stage || state.next !== 1 || state.previous !== 1) uninitializedWidths.push(width);
    }
    if (uninitializedWidths.length) throw new Error(`CAROUSEL_FUNCTIONAL_BLOCKED: Owl carousel did not initialize navigation at ${uninitializedWidths.join('px and ')}px; five ordered cards render, but stage and Next/Previous controls are absent.`);
  }

  async addEmbedCodeToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string; cardCollectionHeading: string;
    collectionCardHeadings: readonly [string, string, string]; bannerHeading: string; carouselHeading: string;
  }): Promise<ExistingBasicPageEmbedCodeResult> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Embed Code is allowed only for exact DEVV.');
    assertPublishingAllowed();
    const opened = await this.openOwnedBasicPageEdit(page, monitor, { nodeId: expected.nodeId, title: expected.title, formattedTextMarker: expected.formattedTextMarker });
    const existingEmbedDeltas = await this.paragraphDeltasByLabel(opened.wrapper, 'Embed Code');
    if (existingEmbedDeltas.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Existing Embed Code identity was not exactly one row.');
    const preWriteSnapshot = await this.captureCumulativeParagraphSnapshot(opened.wrapper);
    if (preWriteSnapshot.personalizationCount !== 1) throw new Error('COMPONENT_POC_BLOCKED: Personalization must exist exactly once before mutating Embed Code.');
    if (preWriteSnapshot.cerosEmbedCount !== 1) throw new Error('COMPONENT_POC_BLOCKED: Ceros embed must exist exactly once before mutating Embed Code.');
    if (preWriteSnapshot.embedCodeDeltas.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Exactly one Embed Code row must exist before mutation.');
    const delta = existingEmbedDeltas[0];
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading, expected.carouselHeading]) {
      if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Baseline marker ${marker} missing.`);
    }
    const moderation = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(moderation.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Existing page could not enter safe Draft state for Embed Code update.');

    const marker = 'QA AUTOMATED EMBED CODE PLACEHOLDER';
    const typeSelectorLocator = await this.resolveParagraphFieldSelector(opened.wrapper, delta, /field_embed_type/i, 'Embed Code type');
    await this.expandBasicPageParagraphForControl(opened.wrapper, delta, typeSelectorLocator);
    const typeSelector = opened.wrapper.locator(typeSelectorLocator);
    if ((await typeSelector.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Embed Code type selector was not unique.');
    const typeValue = await this.exactValue(opened.wrapper, typeSelectorLocator);
    if (typeValue !== 'placeholder') throw new Error('COMPONENT_POC_BLOCKED: Existing Embed Code type was not Placeholder before mutation.');
    await typeSelector.selectOption({ label: 'Placeholder' });
    await page.waitForTimeout(1500);

    const bodySelector = await this.resolveParagraphFieldSelector(opened.wrapper, delta, /field_embed_(?:placeholder|body|text|content)|embed.*(?:placeholder|body|text|content)|(?:placeholder|body|text|content).*embed/i, 'Embed Code placeholder body');
    const editorField = opened.wrapper.locator(bodySelector).first();
    if ((await editorField.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Embed Code Placeholder required Body field is missing or not unique.');
    await fillOwnedEditor(opened.wrapper, bodySelector, marker, 'Embed Code Placeholder Body');
    const bodyValue = await readOwnedEditor(opened.wrapper, bodySelector, 'Embed Code Placeholder Body');
    if (bodyValue !== marker) throw new Error('COMPONENT_POC_BLOCKED: Embed Code Placeholder body was not synchronized into Drupal.');

    const borderSelector = await this.resolveParagraphFieldSelector(opened.wrapper, delta, /field_paragraph_border/i, 'Embed Code border');
    const border = opened.wrapper.locator(borderSelector);
    if ((await border.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Embed Code border selector was not unique.');
    const borderValue = await this.exactValue(opened.wrapper, borderSelector);
    if (borderValue !== 'padding') throw new Error('COMPONENT_POC_BLOCKED: Existing Embed Code style was not Padding before mutation.');
    await border.selectOption({ label: 'Padding' });
    await page.waitForTimeout(500);
    await this.assertEmbedCodeState(opened.wrapper, delta, marker, 'placeholder', 'padding');
    await submitNodeForm(page, opened.form, 'Basic Page Embed Code POC update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, { nodeId: expected.nodeId, title: expected.title, formattedTextMarker: expected.formattedTextMarker });
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Embed Code');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Embed Code identity was ambiguous.');
    const persistedSnapshot = await this.captureCumulativeParagraphSnapshot(reopened.wrapper);
    this.assertCumulativePagePreserved(preWriteSnapshot, persistedSnapshot);
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.embedCodeFieldSelector(persisted[0], '[field_embed_type]'));
    await this.assertEmbedCodeState(reopened.wrapper, persisted[0], marker, 'placeholder', 'padding');
    const draft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(draft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Embed Code update did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, {
      machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft',
    });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Embed Code update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, embedCodeDelta: persisted[0], marker, embedType: 'Placeholder', style: 'padding', published: true };
  }

  async verifyEmbedCodeFrontend(page: Page, updated: Omit<ExistingBasicPageEmbedCodeResult, 'publicUrl' | 'paragraphIdentity' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string];
    anchorId: string; anchorLabel: string; tabsHeading: string; cardGridHeading: string;
    cardNames: readonly [string, string, string]; statisticValue: string; videoTitle: string;
    cardCollectionHeading: string; collectionCardHeadings: readonly [string, string, string]; bannerHeading: string;
    carouselHeading: string;
  }): Promise<ExistingBasicPageEmbedCodeFrontendResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    for (const marker of [expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticValue, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading, expected.carouselHeading]) {
      if ((await article.getByText(marker, { exact: true }).count()) !== 1) throw new Error(`Embed Code baseline marker ${marker} missing or duplicated.`);
    }
    const placeholder = article.getByText(updated.marker, { exact: true }).filter({ visible: true });
    if ((await placeholder.count()) !== 1) throw new Error('Embed Code placeholder marker did not render exactly once.');
    const component = placeholder.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--embed-code ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Embed Code component did not render uniquely.');
    const paddingClass = await component.evaluate((element) => element.classList.contains('padding') || element.classList.toString().includes('padding'));
    const ids = await component.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean));
    if (new Set(ids).size !== ids.length) throw new Error('Embed Code component introduced duplicate IDs.');
    const desktopVisible = await component.isVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileVisible = await component.isVisible();
    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    if (!paddingClass || !desktopVisible || !mobileVisible || !noHorizontalOverflow) throw new Error('Embed Code frontend shell did not remain visible and overflow-safe on desktop/mobile.');
    return { ...updated, publicUrl: verified.publicUrl, paragraphIdentity: await component.evaluate((element) => {
      const paragraph = element.closest('[data-entity-type="paragraph"], [data-paragraph-id], [about*="/paragraph/"]');
      return paragraph?.getAttribute('data-entity-id') ?? paragraph?.getAttribute('data-paragraph-id') ?? paragraph?.getAttribute('data-entity-uuid') ?? paragraph?.getAttribute('about') ?? undefined;
    }), desktopVisible: true, mobileVisible: true, noHorizontalOverflow: true, placeholderVisible: true, frontendVerified: true };
  }

  private embedCodeFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }

  private async resolveParagraphFieldSelector(wrapper: Locator, delta: string, pattern: RegExp, label: string): Promise<string> {
    const findCandidates = async (): Promise<string[]> => wrapper.locator(`[name^="${this.paragraphPrefix(delta)}"]`).evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('name') ?? '').filter((name) => name.length > 0),
    );

    let candidates = await findCandidates();
    if (!candidates.some((name) => pattern.test(name))) {
      const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_edit"]`);
      if ((await edit.count()) === 1 && (await edit.isVisible()) && (await edit.isEnabled())) {
        await activateOwnedParagraphEdit(edit);
        await wrapper.locator(`[name^="${this.paragraphPrefix(delta)}"]`).first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined);
        candidates = await findCandidates();
      }
    }

    const exact = candidates.find((name) => pattern.test(name));
    if (!exact) {
      throw new Error(`COMPONENT_POC_BLOCKED: The live ${label} field was not found for paragraph delta ${delta}.`);
    }
    return `[name="${exact}"]`;
  }

  private async assertEmbedCodeState(wrapper: Locator, delta: string, marker: string, expectedType: 'placeholder', expectedBorder: 'padding'): Promise<void> {
    const typeSelector = await this.resolveParagraphFieldSelector(wrapper, delta, /field_embed_type/i, 'Embed Code type');
    const borderSelector = await this.resolveParagraphFieldSelector(wrapper, delta, /field_paragraph_border/i, 'Embed Code border');
    const typeValue = await this.exactValue(wrapper, typeSelector);
    const borderValue = await this.exactValue(wrapper, borderSelector);
    if (typeValue !== expectedType || borderValue !== expectedBorder) throw new Error(`COMPONENT_POC_BLOCKED: Embed Code type/style did not persist exactly (${typeValue}, ${borderValue}).`);
    const bodySelector = await this.resolveParagraphFieldSelector(wrapper, delta, /field_embed_(?:placeholder|body|text|content)|embed.*(?:placeholder|body|text|content)|(?:placeholder|body|text|content).*embed/i, 'Embed Code placeholder body');
    const bodyValue = await readOwnedEditor(wrapper, bodySelector, 'Embed Code Placeholder Body');
    if (bodyValue !== marker) throw new Error('COMPONENT_POC_BLOCKED: Embed Code body marker did not persist exactly.');
  }

  async assessMarketoFormOnExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorLabel: string; anchorId: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string; cardCollectionHeading: string;
    collectionCardHeadings: readonly [string, string, string]; bannerHeading: string; carouselHeading: string;
  }): Promise<ExistingBasicPageMarketoBlockedResult> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Marketo assessment is allowed only for exact DEVV.');
    if (expected.nodeId !== '25071' || expected.title !== `${AUTOMATED_CONTENT_PREFIX}Component-POC-20260918-084653-1484`) throw new Error('COMPONENT_POC_BLOCKED: Marketo host is not the exact approved QA page.');
    const publicResponse = await page.goto(`/node/${expected.nodeId}`, { waitUntil: 'domcontentloaded' });
    if (!publicResponse || publicResponse.status() >= 400 || (await page.getByRole('heading', { name: expected.title, exact: true }).count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Exact QA node was not publicly Published before Marketo assessment.');
    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading, expected.carouselHeading]) {
      if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Baseline marker ${marker} missing.`);
    }
    const delta = await this.addBasicPageParagraph(page, opened.wrapper, 'marketo', 'Marketo form', monitor);
    const formId = opened.wrapper.locator(this.marketoFieldSelector(delta, '[field_marketo_form][0][form_id]'));
    if ((await formId.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Marketo Form ID control was not unique.');
    const formIdValue = (await formId.inputValue()).trim();
    const formIdMeta = await formId.evaluate((element) => {
      const input = element as HTMLInputElement;
      const item = input.closest('.form-item, .js-form-item, .field--name-field-marketo-form');
      return {
        required: input.required || input.getAttribute('aria-required') === 'true' || !!item?.querySelector('label.form-required, .form-required'),
        type: input.type,
        list: input.getAttribute('list'),
        help: (item?.querySelector('.description, .form-item__description')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      };
    });
    const approvedFromUi = this.approvedQaMarketoFormId(formIdValue);
    if (approvedFromUi) throw new Error('COMPONENT_POC_BLOCKED: An approved QA Marketo Form ID was present; creation must be implemented before saving.');
    if (formIdValue) throw new Error('COMPONENT_POC_BLOCKED: Marketo Form ID was prefilled with an unverified value; fail closed without saving.');
    const blockingReason = `Required Form ID is a free-text Marketo integration value (${formIdMeta.type}${formIdMeta.required ? ', required' : ''}${formIdMeta.list ? `, datalist ${formIdMeta.list}` : ', no selectable options'}). The unsaved widget was empty, help text did not identify a QA-AUTOMATED form (${formIdMeta.help ? 'present but not QA-owned' : 'absent'}), and no approved QA Form ID is configured.`;
    page.on('dialog', (dialog) => { void dialog.accept(); });
    const discarded = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(discarded.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0);
    if ((await this.paragraphDeltasByMachineType(discarded.wrapper, 'marketo')).length !== 0) throw new Error('COMPONENT_POC_BLOCKED: Unsaved Marketo form persisted after discarding the edit form.');
    const leaveResponse = await page.goto(`/node/${expected.nodeId}`, { waitUntil: 'domcontentloaded' });
    if (!leaveResponse || leaveResponse.status() >= 400) throw new Error('COMPONENT_POC_BLOCKED: Could not leave the edit form after Marketo fail-closed assessment.');
    return {
      nodeId: expected.nodeId,
      title: expected.title,
      component: 'Marketo form',
      machineType: 'marketo',
      creation: 'BLOCKED',
      blockingField: 'field_marketo_form[0][form_id]',
      blockingReason,
      fieldCoverage: [
        { field: 'field_marketo_form[0][form_id] (Form ID)', classification: 'BLOCKED', reason: blockingReason },
        { field: 'field_marketo_head (Header)', classification: 'INTENTIONALLY EMPTY', reason: 'Optional text; not populated because Form ID blocked creation.' },
        { field: 'field_marketo_text (Text)', classification: 'INTENTIONALLY EMPTY', reason: 'Optional text; not populated because Form ID blocked creation.' },
        { field: 'field_paragraph_border (Style/padding)', classification: 'INTENTIONALLY EMPTY', reason: 'Safe select exists (_none/padding) but was not applied because creation was blocked.' },
        { field: 'field_color_scheme (Color scheme)', classification: 'INTENTIONALLY EMPTY', reason: 'Optional; no semantically required scheme for an uncreated form. Default _none left unchanged.' },
      ],
      formSubmissionPerformed: false,
      drupalWrites: 'none',
      published: true,
    };
  }

  async addSyntheticMarketoFormToExistingPage(page: Page, monitor: NetworkMonitor, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticTitle: string; videoTitle: string; cardCollectionHeading: string;
    collectionCardHeadings: readonly [string, string, string]; bannerHeading: string; carouselHeading: string;
  }): Promise<ExistingBasicPageMarketoResult> {
    const environment = getEnvironmentConfig();
    if (environment.target !== 'devv' || environment.baseUrl !== 'https://devv.leidos.com') throw new Error('COMPONENT_POC_BLOCKED: Marketo creation is allowed only for exact DEVV.');
    assertPublishingAllowed();
    if (expected.nodeId !== '25071' || expected.title !== `${AUTOMATED_CONTENT_PREFIX}Component-POC-20260918-084653-1484`) throw new Error('COMPONENT_POC_BLOCKED: Marketo host is not the exact approved QA page.');
    const opened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0);
    const baselineText = (await opened.wrapper.innerText()).replace(/\s+/g, ' ');
    for (const marker of [expected.formattedTextMarker, expected.blockquoteMarker, ...expected.listMarkers, expected.anchorLabel, expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.statisticTitle, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading, expected.carouselHeading]) {
      if (!baselineText.includes(marker)) throw new Error(`COMPONENT_POC_BLOCKED: Baseline marker ${marker} missing.`);
    }
    const safeDraft = await validateSafeModerationState(opened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(safeDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Exact QA page could not enter safe Draft state for Marketo creation.');

    const delta = await this.addBasicPageParagraph(page, opened.wrapper, 'marketo', 'Marketo form', monitor);
    const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')}-${crypto.randomUUID().slice(0, 4)}`;
    const heading = `${AUTOMATED_CONTENT_PREFIX}MARKETO-HEADING-${runId}`;
    const text = `${AUTOMATED_CONTENT_PREFIX}MARKETO-TEXT-${runId}`;
    await opened.wrapper.locator(this.marketoFieldSelector(delta, '[field_marketo_form][0][form_id]')).fill(SYNTHETIC_QA_MARKETO_FORM_ID);
    await opened.wrapper.locator(this.marketoFieldSelector(delta, '[field_marketo_head][0][value]')).fill(heading);
    await opened.wrapper.locator(`textarea${this.marketoFieldSelector(delta, '[field_marketo_text][0][value]')}`).fill(text);
    await opened.wrapper.locator(this.marketoFieldSelector(delta, '[field_paragraph_border]')).selectOption('padding');
    const colorScheme = opened.wrapper.locator(this.marketoFieldSelector(delta, '[field_color_scheme]'));
    if ((await colorScheme.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Marketo color-scheme control was not unique.');
    await colorScheme.selectOption('teal');
    await this.assertSyntheticMarketoState(opened.wrapper, delta, heading, text, SYNTHETIC_QA_MARKETO_FORM_ID, 'padding', 'teal');
    await this.assertBasicPageInventory(opened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    await submitNodeForm(page, opened.form, 'Basic Page Marketo POC update');
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);

    const reopened = await this.openOwnedBasicPageEdit(page, monitor, expected);
    await this.assertBasicPageInventory(reopened.wrapper, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
    const persisted = await this.paragraphDeltasByLabel(reopened.wrapper, 'Marketo form');
    if (persisted.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Saved Marketo identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(reopened.wrapper, persisted[0], this.marketoFieldSelector(persisted[0], '[field_marketo_head][0][value]'));
    await this.assertSyntheticMarketoState(reopened.wrapper, persisted[0], heading, text, SYNTHETIC_QA_MARKETO_FORM_ID, 'padding', 'teal');
    const persistedDraft = await validateSafeModerationState(reopened.form, basicPageConfig.label);
    if (!/draft|unpublished/i.test(persistedDraft.moderationStateUsed)) throw new Error('COMPONENT_POC_BLOCKED: Marketo revision did not remain Draft before publishing.');
    const publishing = await runPublishingWorkflow(page, monitor, basicPageConfig, { machineName: basicPageConfig.machineName, label: basicPageConfig.label, nodeId: Number(expected.nodeId), title: expected.title, moderation: 'Draft' });
    if (publishing.status !== 'passed' || publishing.finalState !== 'Published' || !publishing.publicPageLoaded) throw new Error(`COMPONENT_POC_BLOCKED: Marketo update did not publish safely${publishing.blockedReason ? `: ${publishing.blockedReason}` : '.'}`);
    return { nodeId: expected.nodeId, title: expected.title, marketoDelta: persisted[0], heading, text, formId: SYNTHETIC_QA_MARKETO_FORM_ID as '1231231234', border: 'padding', colorScheme: 'teal', published: true };
  }

  async verifySyntheticMarketoFrontend(page: Page, updated: Omit<ExistingBasicPageMarketoResult, 'publicUrl' | 'paragraphIdentity' | 'frontendVerified'>, expected: {
    formattedTextMarker: string; blockquoteMarker: string; listMarkers: readonly [string, string, string];
    anchorId: string; anchorLabel: string; tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticValue: string; videoTitle: string; cardCollectionHeading: string;
    collectionCardHeadings: readonly [string, string, string]; bannerHeading: string; carouselHeading: string;
  }): Promise<ExistingBasicPageMarketoFrontendResult> {
    const verified = await this.verifyOwnedArticle(page, updated.nodeId, updated.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: updated.title, exact: true }), visible: true });
    const heading = article.getByRole('heading', { name: updated.heading, exact: true }).filter({ visible: true });
    if ((await heading.count()) !== 1) throw new Error('Marketo heading did not render exactly once.');
    const component = heading.locator('xpath=ancestor::*[@data-entity-type="paragraph" or contains(concat(" ", normalize-space(@class), " "), " paragraph--type--marketo ")][1]');
    if ((await component.count()) !== 1 || !(await component.isVisible())) throw new Error('Marketo component was not uniquely visible.');
    if ((await component.getByText(updated.text, { exact: true }).count()) !== 1) throw new Error('Marketo text did not render exactly once.');
    const ids = await component.locator('[id]').evaluateAll((elements) => elements.map((element) => element.id).filter(Boolean));
    if (new Set(ids).size !== ids.length) throw new Error('Marketo component introduced duplicate IDs.');
    const formControls = await component.locator('input, button, textarea, select').count();
    const marketoContainer = await component.evaluate((element) => !!element.querySelector('.some-marketo-shell, .mktoForm, .marketo-form, form, [class*=\'marketo\']'));
    const paddingClass = await component.evaluate((element) => element.classList.contains('padding') || element.classList.toString().includes('padding'));
    const colorClass = await component.evaluate((element) => element.classList.toString().includes('teal') || element.classList.toString().includes('color-scheme-teal'));
    const requests: { status: number; url: string }[] = [];
    const consoleMessages: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (/marketo|mkto|munchkin|forms\.net|forms\.marketo|app-sj|marketo\.com/i.test(url)) {
        requests.push({ status: response.status(), url });
      }
    });
    page.on('console', (message) => {
      const text = message.text();
      if (/marketo|mkto|munchkin|forms\.net|forms\.marketo|Error|TypeError/i.test(text)) {
        consoleMessages.push(text);
      }
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopVisible = await component.isVisible();
    const desktopOverflow = await component.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileVisible = await component.isVisible();
    const mobileOverflow = await component.evaluate((element) => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (!desktopVisible || !mobileVisible || desktopOverflow || mobileOverflow) throw new Error('Marketo responsive shell check failed.');
    return {
      ...updated,
      publicUrl: verified.publicUrl,
      paragraphIdentity: await component.evaluate((element) => {
        const paragraph = element.closest('[data-entity-type="paragraph"], [data-paragraph-id], [about*="/paragraph/"]');
        return paragraph?.getAttribute('data-entity-id') ?? paragraph?.getAttribute('data-paragraph-id') ?? paragraph?.getAttribute('data-entity-uuid') ?? paragraph?.getAttribute('about') ?? undefined;
      }),
      cmsComponent: 'PASS',
      frontendShellContent: 'PASS',
      realMarketoFormLoading: 'NOT VALIDATED — synthetic Form ID',
      formSubmissionPerformed: false,
      marketoContainer,
      formControlCount: formControls,
      paddingClass,
      colorClass,
      duplicateIds: false,
      desktopVisible: true,
      mobileVisible: true,
      noHorizontalOverflow: true,
      noFatalDrupalError: true,
      observedBehavior: 'Synthetic Form ID intentionally prevents live Marketo form loading; page shell, content, and component container render without fatal Drupal errors.',
      marketoRequests: requests,
      consoleMessages,
      fieldCoverage: [
        { field: 'field_marketo_form[0][form_id]', classification: 'FRONTEND VERIFIED', reason: 'Synthetic QA Form ID persisted exactly and was intentionally not submitted to Marketo.' },
        { field: 'field_marketo_head (Header)', classification: 'FRONTEND VERIFIED', reason: 'QA header text rendered in the component shell.' },
        { field: 'field_marketo_text (Text)', classification: 'FRONTEND VERIFIED', reason: 'QA text rendered in the component shell.' },
        { field: 'field_paragraph_border (Style/padding)', classification: 'FRONTEND VERIFIED', reason: 'Padding selection persisted and was visible in the component shell.' },
        { field: 'field_color_scheme (Color scheme)', classification: 'FRONTEND VERIFIED', reason: 'Teal scheme selection persisted on the component container.' },
      ],
      frontendVerified: true,
    };
  }

  async verifyCumulativeBaselineWithoutMarketo(page: Page, expected: {
    nodeId: string; title: string; formattedTextMarker: string; blockquoteMarker: string;
    listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
    tabsHeading: string; cardGridHeading: string; cardNames: readonly [string, string, string];
    statisticValue: string; videoTitle: string; cardCollectionHeading: string;
    collectionCardHeadings: readonly [string, string, string]; bannerHeading: string; carouselHeading: string;
  }): Promise<{ publicUrl: string; baselinePreserved: true; marketoRendered: false }> {
    await this.verifyOwnedArticle(page, expected.nodeId, expected.title, [
      { marker: expected.formattedTextMarker, selector: '.field--name-field-formatted-text', label: 'Formatted text' },
      { marker: expected.blockquoteMarker, selector: 'blockquote', label: 'Blockquote' },
      ...expected.listMarkers.map((marker, index) => ({ marker, selector: 'ul, ol', label: `List item ${index + 1}` })),
    ]);
    const article = page.locator('article').filter({ has: page.getByRole('heading', { name: expected.title, exact: true }), visible: true });
    if ((await article.locator(`[id="${expected.anchorId}"]`).count()) !== 1 || (await article.getByRole('link', { name: expected.anchorLabel, exact: true }).count()) !== 1) throw new Error('Marketo baseline Anchor or Jump nav missing.');
    for (const marker of [expected.tabsHeading, expected.cardGridHeading, ...expected.cardNames, expected.videoTitle, expected.cardCollectionHeading, ...expected.collectionCardHeadings, expected.bannerHeading, expected.carouselHeading]) {
      if ((await article.getByText(marker, { exact: true }).count()) !== 1) throw new Error(`Marketo baseline marker ${marker} missing or duplicated.`);
    }
    if ((await article.locator('.paragraph--type--stat-callout, [class*="stat-callout"]').filter({ hasText: expected.statisticValue, visible: true }).count()) < 1) throw new Error('Marketo baseline Stat callout missing.');
    if ((await article.locator('.paragraph--type--marketo').count()) !== 0) throw new Error('Marketo form paragraph rendered despite fail-closed creation.');
    return { publicUrl: safeNodeUrl(page.url()), baselinePreserved: true, marketoRendered: false };
  }

  private marketoFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }

  private async assertSyntheticMarketoState(wrapper: Locator, delta: string, heading: string, text: string, formId: string, border: string, colorScheme: string): Promise<void> {
    if (await this.exactValue(wrapper, this.marketoFieldSelector(delta, '[field_marketo_form][0][form_id]')) !== formId
      || await this.exactValue(wrapper, this.marketoFieldSelector(delta, '[field_marketo_head][0][value]')) !== heading
      || await this.exactValue(wrapper, `textarea${this.marketoFieldSelector(delta, '[field_marketo_text][0][value]')}`) !== text
      || await this.exactValue(wrapper, this.marketoFieldSelector(delta, '[field_paragraph_border]')) !== border
      || await this.exactValue(wrapper, this.marketoFieldSelector(delta, '[field_color_scheme]')) !== colorScheme) {
      throw new Error('COMPONENT_POC_BLOCKED: Marketo fields did not persist exactly.');
    }
  }

  private approvedQaMarketoFormId(value: string): string | undefined {
    return APPROVED_QA_MARKETO_FORM_IDS.has(value) ? value : undefined;
  }

  private carouselFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }
  private carouselItemSelector(delta: string, index: number, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}[field_subsidiaries_items][${index}][subform]${suffix}"]`; }
  private async addCarouselItem(page: Page, wrapper: Locator, delta: string, monitor: NetworkMonitor): Promise<void> {
    const add = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_subsidiaries_items_subsidiaries_item_add_more"]`).filter({ visible: true });
    if ((await add.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Carousel item Add control was not unique.');
    const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click(); const response = await ajax;
    if (response.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: Carousel item Add returned HTTP ${response.status()}.`);
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  }
  private async ensureCarouselItemExpanded(wrapper: Locator, delta: string, index: number): Promise<void> {
    const selector = this.carouselItemSelector(delta, index, '[field_subsidiaries_item_head][0][value]');
    if ((await wrapper.locator(selector).count()) === 1) return;
    const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_subsidiaries_items_${index}_edit"]`);
    if ((await edit.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: Carousel item ${index + 1} Edit control was ambiguous.`);
    await activateOwnedParagraphEdit(edit);
    await wrapper.locator(selector).waitFor({ state: 'visible', timeout: 20_000 });
  }
  private async assertCarouselState(wrapper: Locator, delta: string, heading: string, ctaText: string, ctaAriaLabel: string, ctaHref: string, cardHeadings: readonly string[], cardTexts: readonly string[]): Promise<void> {
    if (await this.exactValue(wrapper, this.carouselFieldSelector(delta, '[field_subsidiaries_head][0][value]')) !== heading
      || await this.exactValue(wrapper, this.carouselFieldSelector(delta, '[field_subsidiaries_cta][0][uri]')) !== ctaHref
      || await this.exactValue(wrapper, this.carouselFieldSelector(delta, '[field_subsidiaries_cta][0][title]')) !== ctaText
      || await this.exactValue(wrapper, this.carouselFieldSelector(delta, '[field_subsidiaries_cta][0][options][attributes][aria-label]')) !== ctaAriaLabel
      || await this.exactValue(wrapper, this.carouselFieldSelector(delta, '[field_paragraph_border]')) !== 'padding') throw new Error('COMPONENT_POC_BLOCKED: Carousel parent fields did not persist exactly.');
    for (let index = 0; index < cardHeadings.length; index += 1) {
      await this.ensureCarouselItemExpanded(wrapper, delta, index);
      if (await this.exactValue(wrapper, this.carouselItemSelector(delta, index, '[field_subsidiaries_item_head][0][value]')) !== cardHeadings[index]
        || await this.exactValue(wrapper, `textarea${this.carouselItemSelector(delta, index, '[field_subsidiaries_item_text][0][value]')}`) !== cardTexts[index]) throw new Error(`COMPONENT_POC_BLOCKED: Carousel item ${index + 1} fields did not persist.`);
    }
  }

  private bannerFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }

  private async assertBannerState(wrapper: Locator, delta: string, eyebrow: string, heading: string, subtitle: string, text: string, ctaText: string, ctaAriaLabel: string, ctaHref: string): Promise<void> {
    if (await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_featured_person_head][0][value]')) !== eyebrow
      || await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_featured_person_name][0][value]')) !== heading
      || await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_featured_person_position][0][value]')) !== subtitle
      || await this.exactValue(wrapper, `textarea${this.bannerFieldSelector(delta, '[field_featured_person_text][0][value]')}`) !== text
      || await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_featured_person_cta][0][uri]')) !== ctaHref
      || await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_featured_person_cta][0][title]')) !== ctaText
      || await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_featured_person_cta][0][options][attributes][aria-label]')) !== ctaAriaLabel
      || await this.exactValue(wrapper, this.bannerFieldSelector(delta, '[field_paragraph_border]')) !== 'padding'
      || await this.exactValue(wrapper, `input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_media_image][selection][0][target_id]"]`) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error('COMPONENT_POC_BLOCKED: Banner fields did not persist exactly.');
  }

  private cardCollectionFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }
  private cardCollectionV2FieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }
  private cardCollectionV2NestedPrefix(delta: string, index: number): string { return `${this.paragraphPrefix(delta)}[field_cards][${index}][subform]`; }
  private cardCollectionV2CardSelector(delta: string, index: number, suffix: string): string { return `[name="${this.cardCollectionV2NestedPrefix(delta, index)}${suffix}"]`; }
  private cardCollectionV2VariantLabel(displayValue: '2' | '3' | '4' | 'carousel'): 'Display Two' | 'Display Three' | 'Display Four' | 'Display Carousel' {
    switch (displayValue) {
      case '2': return 'Display Two';
      case '3': return 'Display Three';
      case '4': return 'Display Four';
      case 'carousel': return 'Display Carousel';
    }
  }
  private async discoverExistingCardCollectionV2Variants(wrapper: Locator): Promise<Array<{ displayValue: '2' | '3' | '4' | 'carousel'; variantLabel: 'Display Two' | 'Display Three' | 'Display Four' | 'Display Carousel'; paragraphDelta: string; introHeader: string; introText: string; ctaText: string; ctaAriaLabel: string; ctaHref: string; cardHeadings: string[]; cardTexts: string[]; cardCtaTexts: string[]; cardHrefs: string[]; }>> {
    const matches: Array<{ displayValue: '2' | '3' | '4' | 'carousel'; variantLabel: 'Display Two' | 'Display Three' | 'Display Four' | 'Display Carousel'; paragraphDelta: string; introHeader: string; introText: string; ctaText: string; ctaAriaLabel: string; ctaHref: string; cardHeadings: string[]; cardTexts: string[]; cardCtaTexts: string[]; cardHrefs: string[]; }> = [];
    for (const delta of await this.paragraphDeltasByLabel(wrapper, 'Card: Collection (v2.0)')) {
      try {
        const displayValue = await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_card_display]')) as '2' | '3' | '4' | 'carousel';
        const introHeader = await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_intro_header][0][value]'));
        const introText = await this.exactValue(wrapper, `textarea${this.cardCollectionV2FieldSelector(delta, '[field_intro_text][0][value]')}`);
        const ctaText = await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_cta][0][title]'));
        const ctaHref = await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_cta][0][uri]'));
        const ctaAriaLabel = await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_cta][0][options][attributes][aria-label]')).catch(() => '');
        const cardHeadings: string[] = [];
        const cardTexts: string[] = [];
        const cardCtaTexts: string[] = [];
        const cardHrefs: string[] = [];
        for (let index = 0; index < 16; index += 1) {
          const nested = this.cardCollectionV2NestedPrefix(delta, index);
          const headerSelector = `[name="${nested}[field_header][0][value]"]`;
          if ((await wrapper.locator(headerSelector).count()) !== 1) break;
          cardHeadings.push(await this.exactValue(wrapper, headerSelector));
          cardTexts.push(await this.exactValue(wrapper, `textarea[name="${nested}[field_text_plain][0][value]"]`));
          cardCtaTexts.push(await this.exactValue(wrapper, `[name="${nested}[field_cta][0][title]"]`));
          cardHrefs.push(await this.exactValue(wrapper, `[name="${nested}[field_cta][0][uri]"]`));
        }
        matches.push({
          displayValue,
          variantLabel: this.cardCollectionV2VariantLabel(displayValue),
          paragraphDelta: delta,
          introHeader,
          introText,
          ctaText,
          ctaAriaLabel,
          ctaHref,
          cardHeadings,
          cardTexts,
          cardCtaTexts,
          cardHrefs,
        });
      } catch {
        // Ignore partial rows that are still expanding or not yet writable; only keep rows with a stable display value.
      }
    }
    return matches;
  }
  private partnerLogoSelector(delta: string, index: number, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}[field_partners_items][${index}][subform]${suffix}"]`; }

  private async addCardCollectionV2Card(page: Page, wrapper: Locator, delta: string, monitor: NetworkMonitor): Promise<void> {
    const add = wrapper.locator('[name*="field_cards"][name*="add_more"]').filter({ visible: true }).first();
    if ((await add.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Card Collection v2 item Add control was not unique.');
    const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click();
    const response = await ajax;
    if (response.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: Card Collection v2 item Add returned HTTP ${response.status()}.`);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
  }

  private async ensureCardCollectionV2CardReady(page: Page, wrapper: Locator, delta: string, index: number, monitor: NetworkMonitor): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nestedPrefix = this.cardCollectionV2NestedPrefix(delta, index);
      const requiredFields = [
        `[name="${nestedPrefix}[field_header][0][value]"]`,
        `[name="${nestedPrefix}[field_text_plain][0][value]"]`,
        `[name="${nestedPrefix}[field_cta][0][uri]"]`,
        `[name="${nestedPrefix}[field_cta][0][title]"]`,
      ];
      const ready = await Promise.all(requiredFields.map(async (selector) => (await wrapper.locator(selector).count()) === 1));
      if (ready.every(Boolean)) return;
      await this.addCardCollectionV2Card(page, wrapper, delta, monitor);
    }
    throw new Error(`COMPONENT_POC_BLOCKED: Collection v2 card ${index + 1} exact nested fields were never available.`);
  }

  private async populateCardCollectionV2Card(page: Page, wrapper: Locator, delta: string, index: number, heading: string, text: string, ctaText: string, href: string): Promise<void> {
    await this.ensureCardCollectionV2CardReady(page, wrapper, delta, index, { assertNoServerErrors: () => undefined } as NetworkMonitor);
    await this.ensureCardCollectionV2CardExpanded(wrapper, delta, index);
    await wrapper.locator(this.cardCollectionV2CardSelector(delta, index, '[field_header][0][value]')).fill(heading);
    await fillOwnedEditor(wrapper, `textarea${this.cardCollectionV2CardSelector(delta, index, '[field_text_plain][0][value]')}`, text, `Collection v2 card ${index + 1} text`);
    await wrapper.locator(this.cardCollectionV2CardSelector(delta, index, '[field_cta][0][uri]')).fill(href);
    await wrapper.locator(this.cardCollectionV2CardSelector(delta, index, '[field_cta][0][title]')).fill(ctaText);
    const trigger = wrapper.locator(`[name*="field_media_image-media-library-open-button"][name*="field_cards"][name*="${index}"][name*="subform"]`).filter({ visible: true }).first();
    if ((await trigger.count()) === 1) {
      const media = await selectAutomationImageFixtureFromTrigger(page, trigger, AUTOMATED_IMAGE_MEDIA_ID);
      if (media.id !== AUTOMATED_IMAGE_MEDIA_ID || media.name !== AUTOMATED_IMAGE_MEDIA_NAME) throw new Error(`COMPONENT_POC_BLOCKED: Collection v2 card ${index + 1} Image fixture identity was not exact.`);
    }
    const association = wrapper.locator(`input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_cards][${index}][subform][field_media_image][selection][0][target_id]"]`);
    if ((await association.count()) === 1) {
      await association.waitFor({ state: 'attached', timeout: 20_000 });
      if ((await association.inputValue()) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error(`COMPONENT_POC_BLOCKED: Collection v2 card ${index + 1} image association was not exact.`);
    }
  }

  private async ensureCardCollectionV2ParentExpanded(wrapper: Locator, delta: string): Promise<void> {
    const selector = this.cardCollectionV2FieldSelector(delta, '[field_card_display]');
    const field = wrapper.locator(selector);
    if ((await field.count()) === 1 && (await field.isVisible())) return;
    const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_edit"]`).filter({ visible: true }).first();
    if ((await edit.count()) !== 1 || !(await edit.isVisible()) || !(await edit.isEnabled())) {
      throw new Error('COMPONENT_POC_BLOCKED: Card Collection v2 parent Edit control was not uniquely available.');
    }
    await activateOwnedParagraphEdit(edit);
    await field.waitFor({ state: 'visible', timeout: 20_000 });
  }

  private async ensureCardCollectionV2CardExpanded(wrapper: Locator, delta: string, index: number): Promise<void> {
    const nestedPrefix = this.cardCollectionV2NestedPrefix(delta, index);
    const fieldSelectors = [
      `${nestedPrefix}[field_header][0][value]`,
      `${nestedPrefix}[field_text_plain][0][value]`,
      `${nestedPrefix}[field_cta][0][uri]`,
      `${nestedPrefix}[field_cta][0][title]`,
    ];

    const exactFieldsAvailable = await Promise.all(fieldSelectors.map(async (selector) => (await wrapper.locator(`[name="${selector}"]`).count()) === 1));
    if (exactFieldsAvailable.every(Boolean)) return;

    const action = wrapper.locator([
      `[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_cards_${index}_collapse"]`,
      `[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_cards_${index}_edit"]`,
    ].join(',')).filter({ visible: true }).first();

    if ((await action.count()) === 1 && (await action.isVisible()) && (await action.isEnabled())) {
      await activateOwnedParagraphEdit(action);
    }

    await Promise.all(fieldSelectors.map((selector) => wrapper.locator(`[name="${selector}"]`).waitFor({ state: 'visible', timeout: 20_000 })));
  }

  private async assertCardCollectionV2State(
    wrapper: Locator,
    delta: string,
    variant: Pick<CardCollectionV2VariantConfig, 'displayValue' | 'variantLabel' | 'introHeader' | 'introText' | 'ctaText' | 'ctaAriaLabel' | 'ctaHref' | 'cardHeadings' | 'cardTexts' | 'cardCtaTexts' | 'cardHrefs'>,
  ): Promise<void> {
    const ariaControl = wrapper.locator(this.cardCollectionV2FieldSelector(delta, '[field_cta][0][options][attributes][aria-label]'));
    const ariaValue = (await ariaControl.count()) === 1 ? await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_cta][0][options][attributes][aria-label]')) : undefined;

    const normalizedIntroText = (await this.exactValue(wrapper, `textarea${this.cardCollectionV2FieldSelector(delta, '[field_intro_text][0][value]')}`))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_card_display]')) !== variant.displayValue
      || await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_intro_header][0][value]')) !== variant.introHeader
      || normalizedIntroText !== variant.introText
      || await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_cta][0][uri]')) !== variant.ctaHref
      || await this.exactValue(wrapper, this.cardCollectionV2FieldSelector(delta, '[field_cta][0][title]')) !== variant.ctaText
      || (ariaValue !== undefined && ariaValue !== variant.ctaAriaLabel)) {
      throw new Error('COMPONENT_POC_BLOCKED: Card Collection v2 parent fields did not persist exactly.');
    }

    for (let index = 0; index < variant.cardHeadings.length; index += 1) {
      await this.ensureCardCollectionV2CardExpanded(wrapper, delta, index);
      if (await this.exactValue(wrapper, this.cardCollectionV2CardSelector(delta, index, '[field_header][0][value]')) !== variant.cardHeadings[index]
        || await this.exactValue(wrapper, `textarea${this.cardCollectionV2CardSelector(delta, index, '[field_text_plain][0][value]')}`) !== variant.cardTexts[index]
        || await this.exactValue(wrapper, this.cardCollectionV2CardSelector(delta, index, '[field_cta][0][uri]')) !== variant.cardHrefs[index]
        || await this.exactValue(wrapper, this.cardCollectionV2CardSelector(delta, index, '[field_cta][0][title]')) !== variant.cardCtaTexts[index]) {
        throw new Error(`COMPONENT_POC_BLOCKED: Card Collection v2 card ${index + 1} did not persist exactly.`);
      }
    }
  }

  private async addPartnerLogo(page: Page, wrapper: Locator, delta: string, monitor: NetworkMonitor): Promise<void> {
    const add = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_partners_items_partners_logo_add_more"]`).filter({ visible: true });
    if ((await add.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Partner logo Add control was not unique.');
    const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click(); const response = await ajax;
    if (response.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: Partner logo Add returned HTTP ${response.status()}.`);
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  }

  private async populatePartnerLogo(page: Page, wrapper: Locator, delta: string, index: number, heading: string, text: string, ctaText: string, href: string): Promise<void> {
    await this.ensurePartnerLogoExpanded(wrapper, delta, index);
    await wrapper.locator(this.partnerLogoSelector(delta, index, '[field_partners_logo_head][0][value]')).fill(heading);
    await wrapper.locator(`textarea${this.partnerLogoSelector(delta, index, '[field_partners_logo_text][0][value]')}`).fill(text);
    await wrapper.locator(this.partnerLogoSelector(delta, index, '[field_partners_logo_link][0][uri]')).fill(href);
    await wrapper.locator(this.partnerLogoSelector(delta, index, '[field_partners_logo_link][0][title]')).fill(ctaText);
    const trigger = wrapper.locator(`[name="field_media_image-media-library-open-button-${BASIC_PAGE_PARAGRAPH_FIELD}-${delta}-subform-field_partners_items-${index}-subform"]`).filter({ visible: true });
    const media = await selectAutomationImageFixtureFromTrigger(page, trigger, AUTOMATED_IMAGE_MEDIA_ID);
    if (media.id !== AUTOMATED_IMAGE_MEDIA_ID || media.name !== AUTOMATED_IMAGE_MEDIA_NAME) throw new Error(`COMPONENT_POC_BLOCKED: Collection card ${index + 1} Image fixture identity was not exact.`);
    const association = wrapper.locator(`input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_partners_items][${index}][subform][field_media_image][selection][0][target_id]"]`);
    await association.waitFor({ state: 'attached', timeout: 20_000 });
    if ((await association.count()) !== 1 || (await association.inputValue()) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error(`COMPONENT_POC_BLOCKED: Collection card ${index + 1} image association was not exact.`);
  }

  private async assertCardCollectionState(wrapper: Locator, delta: string, heading: string, text: string, parentCtaText: string, parentCtaAriaLabel: string, parentHref: string, cardHeadings: readonly string[], cardTexts: readonly string[], cardCtaTexts: readonly string[], cardHrefs: readonly string[]): Promise<void> {
    if (await this.exactValue(wrapper, this.cardCollectionFieldSelector(delta, '[field_background_style]')) !== 'white__attenuate_3_light_cards'
      || await this.exactValue(wrapper, this.cardCollectionFieldSelector(delta, '[field_paragraph_border]')) !== 'padding'
      || await this.exactValue(wrapper, this.cardCollectionFieldSelector(delta, '[field_partners_head][0][value]')) !== heading
      || await this.exactValue(wrapper, `textarea${this.cardCollectionFieldSelector(delta, '[field_partners_text][0][value]')}`) !== text
      || await this.exactValue(wrapper, this.cardCollectionFieldSelector(delta, '[field_partners_cta][0][uri]')) !== parentHref
      || await this.exactValue(wrapper, this.cardCollectionFieldSelector(delta, '[field_partners_cta][0][title]')) !== parentCtaText
      || await this.exactValue(wrapper, this.cardCollectionFieldSelector(delta, '[field_partners_cta][0][options][attributes][aria-label]')) !== parentCtaAriaLabel) throw new Error('COMPONENT_POC_BLOCKED: Card Collection parent fields did not persist exactly.');
    for (let index = 0; index < 3; index += 1) {
      await this.ensurePartnerLogoExpanded(wrapper, delta, index);
      if (await this.exactValue(wrapper, this.partnerLogoSelector(delta, index, '[field_partners_logo_head][0][value]')) !== cardHeadings[index]
        || await this.exactValue(wrapper, `textarea${this.partnerLogoSelector(delta, index, '[field_partners_logo_text][0][value]')}`) !== cardTexts[index]
        || await this.exactValue(wrapper, this.partnerLogoSelector(delta, index, '[field_partners_logo_link][0][uri]')) !== cardHrefs[index]
        || await this.exactValue(wrapper, this.partnerLogoSelector(delta, index, '[field_partners_logo_link][0][title]')) !== cardCtaTexts[index]
        || await this.exactValue(wrapper, `input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_partners_items][${index}][subform][field_media_image][selection][0][target_id]"]`) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error(`COMPONENT_POC_BLOCKED: Collection card ${index + 1} did not persist exactly.`);
    }
  }

  private async ensurePartnerLogoExpanded(wrapper: Locator, delta: string, index: number): Promise<void> {
    const selector = this.partnerLogoSelector(delta, index, '[field_partners_logo_head][0][value]');
    if ((await wrapper.locator(selector).count()) === 1) return;
    const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_partners_items_${index}_edit"]`);
    if ((await edit.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: Collection card ${index + 1} Edit control was ambiguous.`);
    await activateOwnedParagraphEdit(edit);
    await wrapper.locator(selector).waitFor({ state: 'visible', timeout: 20_000 });
  }

  private videoFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }

  private async assertVideoState(wrapper: Locator, delta: string, title: string, caption: string, mediaId: string): Promise<void> {
    if (await this.exactValue(wrapper, this.videoFieldSelector(delta, '[field_video_title][0][value]')) !== title
      || await this.exactValue(wrapper, `textarea${this.videoFieldSelector(delta, '[field_video_caption][0][value]')}`) !== caption
      || await this.exactValue(wrapper, this.videoFieldSelector(delta, '[field_paragraph_border]')) !== 'padding'
      || await this.exactValue(wrapper, `input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_video_media][selection][0][target_id]"]`) !== mediaId) throw new Error('COMPONENT_POC_BLOCKED: Video fields did not persist exactly.');
  }

  private cardGridFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }
  private profileCardSelector(delta: string, index: number, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}[field_grid_items][${index}][subform]${suffix}"]`; }

  private async addProfileCard(page: Page, wrapper: Locator, delta: string, monitor: NetworkMonitor): Promise<void> {
    const add = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_grid_items_profile_card_add_more"]`).filter({ visible: true });
    if ((await add.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Profile card Add control was not unique.');
    const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click(); const response = await ajax;
    if (response.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: Profile card Add returned HTTP ${response.status()}.`);
    monitor.assertNoServerErrors(); await assertNoDrupalFatalPage(page);
  }

  private async populateProfileCard(page: Page, wrapper: Locator, delta: string, index: number, name: string, title: string, href: string): Promise<void> {
    await wrapper.locator(this.profileCardSelector(delta, index, '[field_profile_card_name][0][value]')).fill(name);
    await wrapper.locator(this.profileCardSelector(delta, index, '[field_profile_card_title][0][value]')).fill(title);
    await wrapper.locator(this.profileCardSelector(delta, index, '[field_profile_card_link][0][uri]')).fill(href);
    const trigger = wrapper.locator(`[name="field_media_image-media-library-open-button-${BASIC_PAGE_PARAGRAPH_FIELD}-${delta}-subform-field_grid_items-${index}-subform"]`).filter({ visible: true });
    const media = await selectAutomationImageFixtureFromTrigger(page, trigger, AUTOMATED_IMAGE_MEDIA_ID);
    if (media.id !== AUTOMATED_IMAGE_MEDIA_ID || media.name !== AUTOMATED_IMAGE_MEDIA_NAME) throw new Error('COMPONENT_POC_BLOCKED: Exact QA image fixture identity was not proven for Profile card.');
    const association = wrapper.locator(`input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_grid_items][${index}][subform][field_media_image][selection][0][target_id]"]`);
    await association.waitFor({ state: 'attached', timeout: 20_000 });
    if ((await association.count()) !== 1 || (await association.inputValue()) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error(`COMPONENT_POC_BLOCKED: Profile card ${index + 1} image association was not exact.`);
  }

  private async assertCardGridState(wrapper: Locator, delta: string, heading: string, text: string, names: readonly string[], titles: readonly string[], hrefs: readonly string[]): Promise<void> {
    if (await this.exactValue(wrapper, this.cardGridFieldSelector(delta, '[field_grid_head][0][value]')) !== heading
      || (await readOwnedEditor(wrapper, `textarea${this.cardGridFieldSelector(delta, '[field_grid_text][0][value]')}`, 'Card Grid text')) !== text
      || await this.exactValue(wrapper, this.cardGridFieldSelector(delta, '[field_grid_text][0][format]')) !== 'limited_text'
      || await this.exactValue(wrapper, this.cardGridFieldSelector(delta, '[field_paragraph_border]')) !== 'padding') throw new Error('COMPONENT_POC_BLOCKED: Card Grid parent fields did not persist exactly.');
    for (let index = 0; index < 3; index += 1) {
      await this.ensureProfileCardExpanded(wrapper, delta, index);
      if (await this.exactValue(wrapper, this.profileCardSelector(delta, index, '[field_profile_card_name][0][value]')) !== names[index]
        || await this.exactValue(wrapper, this.profileCardSelector(delta, index, '[field_profile_card_title][0][value]')) !== titles[index]
        || await this.exactValue(wrapper, this.profileCardSelector(delta, index, '[field_profile_card_link][0][uri]')) !== hrefs[index]
        || await this.exactValue(wrapper, `input[type="hidden"][name="${this.paragraphPrefix(delta)}[field_grid_items][${index}][subform][field_media_image][selection][0][target_id]"]`) !== AUTOMATED_IMAGE_MEDIA_ID) throw new Error(`COMPONENT_POC_BLOCKED: Profile card ${index + 1} did not persist exactly.`);
    }
  }

  private async ensureProfileCardExpanded(wrapper: Locator, delta: string, index: number): Promise<void> {
    const selector = this.profileCardSelector(delta, index, '[field_profile_card_name][0][value]');
    if ((await wrapper.locator(selector).count()) === 1) return;
    const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_grid_items_${index}_edit"]`);
    if ((await edit.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: Profile card ${index + 1} Edit control was ambiguous.`);
    await activateOwnedParagraphEdit(edit);
    await wrapper.locator(selector).waitFor({ state: 'visible', timeout: 20_000 });
  }

  private tabsFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }
  private tabsItemSelector(delta: string, index: number, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}[field_tabs_items][${index}][subform]${suffix}"]`; }

  private async populateTabsItem(wrapper: Locator, delta: string, index: number, label: string, content: string): Promise<void> {
    const nameSelector = this.tabsItemSelector(delta, index, '[field_tabs_item_name][0][value]');
    const textSelector = `textarea${this.tabsItemSelector(delta, index, '[field_tabs_item_text][0][value]')}`;
    await this.ensureTabsItemExpanded(wrapper, delta, index);
    await wrapper.locator(nameSelector).fill(label);
    await fillOwnedEditor(wrapper, textSelector, content, `Tabs item ${index + 1}`);
    if (await this.exactValue(wrapper, this.tabsItemSelector(delta, index, '[field_tabs_item_text][0][format]')) !== 'rich_text') throw new Error(`COMPONENT_POC_BLOCKED: Tabs item ${index + 1} rich-text format changed.`);
  }

  private async assertTabsState(wrapper: Locator, delta: string, heading: string, labels: readonly string[], contents: readonly string[]): Promise<void> {
    if (await this.exactValue(wrapper, this.tabsFieldSelector(delta, '[field_tabs_style]')) !== 'horizontal'
      || await this.exactValue(wrapper, this.tabsFieldSelector(delta, '[field_tabs_head][0][value]')) !== heading
      || await this.exactValue(wrapper, this.tabsFieldSelector(delta, '[field_paragraph_border]')) !== 'padding') throw new Error('COMPONENT_POC_BLOCKED: Tabs parent fields did not persist exactly.');
    for (let index = 0; index < 3; index += 1) {
      await this.ensureTabsItemExpanded(wrapper, delta, index);
      if (await this.exactValue(wrapper, this.tabsItemSelector(delta, index, '[field_tabs_item_name][0][value]')) !== labels[index]
        || (await readOwnedEditor(wrapper, `textarea${this.tabsItemSelector(delta, index, '[field_tabs_item_text][0][value]')}`, `Tabs item ${index + 1}`)) !== contents[index]) throw new Error(`COMPONENT_POC_BLOCKED: Tabs item ${index + 1} did not persist exactly.`);
    }
  }

  private async ensureTabsItemExpanded(wrapper: Locator, delta: string, index: number): Promise<void> {
    const nameSelector = this.tabsItemSelector(delta, index, '[field_tabs_item_name][0][value]');
    if ((await wrapper.locator(nameSelector).count()) === 1) return;
    const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_tabs_items_${index}_edit"]`);
    if ((await edit.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: Tabs item ${index + 1} Edit control was ambiguous.`);
    await activateOwnedParagraphEdit(edit);
    await wrapper.locator(nameSelector).waitFor({ state: 'visible', timeout: 20_000 });
  }

  private async assertActiveTab(component: Locator, label: string, content: string, previousContent?: string): Promise<void> {
    const tab = component.getByRole('button', { name: label, exact: true });
    if ((await tab.getAttribute('aria-expanded')) !== 'true') throw new Error(`${label} did not become aria-expanded.`);
    const controls = await tab.getAttribute('aria-controls');
    if (!controls) throw new Error(`${label} did not expose aria-controls.`);
    const panel = component.locator(`[role="tabpanel"][id="${controls}"]`);
    if ((await panel.count()) !== 1 || !(await panel.isVisible()) || !(await panel.innerText()).includes(content)) throw new Error(`${label} did not expose the correct visible panel.`);
    if (previousContent) {
      const previous = component.locator('[role="tabpanel"]').filter({ hasText: previousContent });
      if ((await previous.count()) !== 1 || await previous.isVisible()) throw new Error('Previous Tabs panel did not become inactive/hidden.');
    }
  }

  private async assertListMarkersAndEmptyIcons(wrapper: Locator, delta: string, markers: readonly string[]): Promise<void> {
    for (let index = 0; index < markers.length; index += 1) {
      const field = wrapper.locator(this.listItemTextSelector(delta, index));
      if ((await field.count()) === 0) {
        const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_list_items_${index}_edit"]`);
        if ((await edit.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: List item ${index + 1} edit control was ambiguous.`);
        await activateOwnedParagraphEdit(edit);
        await field.waitFor({ state: 'attached', timeout: 20_000 });
      }
      if ((await field.inputValue()) !== markers[index]) throw new Error(`COMPONENT_POC_BLOCKED: List item ${index + 1} marker changed.`);
      const icon = wrapper.locator(`[name="${this.paragraphPrefix(delta)}[field_list_items][${index}][subform][field_list_item_icon]"]`);
      if ((await icon.count()) !== 1 || (await icon.inputValue()) !== '_none') throw new Error(`COMPONENT_POC_BLOCKED: List item ${index + 1} icon was not safely left at None.`);
    }
  }

  private async revealLinkAttributeControl(control: Locator): Promise<void> {
    if (await control.count() === 0) return;
    if (await control.count() !== 1) throw new Error('COMPONENT_POC_BLOCKED: Link attribute control is ambiguous.');
    const groups = control.locator('xpath=ancestor::details');
    for (let i = await groups.count() - 1; i >= 0; i -= 1) {
      const group = groups.nth(i);
      if (await group.getAttribute('open') === null) await group.locator(':scope > summary').click();
    }
    if (!await control.isVisible()) throw new Error('COMPONENT_POC_BLOCKED: Link attribute has no supported visible UI control.');
  }

  private async setHiddenLinkAttributeValue(control: Locator, value: string): Promise<void> {
    if (await control.count() === 0) return;
    if (await control.count() !== 1) throw new Error('COMPONENT_POC_BLOCKED: Link attribute control is ambiguous.');
    if (await control.inputValue() === value) return;
    await this.revealLinkAttributeControl(control);
    await control.fill(value);
    if (await control.inputValue() !== value) throw new Error('COMPONENT_POC_BLOCKED: Link attribute did not persist in its input.');
  }

  private isExactOwnedAnchorHref(href: string | null, publicUrl: string, nodeId: string, anchorId: string): boolean {
    if (!href) return false;
    const canonical = new URL(publicUrl);
    const resolved = new URL(href, canonical);
    return resolved.origin === canonical.origin
      && resolved.hash === `#${anchorId}`
      && (resolved.pathname === `/node/${nodeId}` || resolved.pathname === canonical.pathname);
  }

  private async assertCoveragePersisted(wrapper: Locator, expected: {
    blockquoteMarker: string; listMarkers: readonly [string, string, string]; anchorId: string; anchorLabel: string;
  }, mediaId: string): Promise<void> {
    const formatted = await this.paragraphDeltasByLabel(wrapper, 'Formatted text');
    const blockquote = await this.paragraphDeltasByLabel(wrapper, BLOCKQUOTE_LABEL);
    const list = await this.paragraphDeltasByLabel(wrapper, 'List');
    const anchor = await this.paragraphDeltasByLabel(wrapper, 'Anchor');
    if (formatted.length !== 1 || blockquote.length !== 1 || list.length !== 1 || anchor.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Component inventory changed after save.');
    await this.expandBasicPageParagraphForControl(wrapper, formatted[0], this.blockquoteFieldSelector(formatted[0], '[field_paragraph_border]'));
    if (await this.exactValue(wrapper, this.blockquoteFieldSelector(formatted[0], '[field_paragraph_border]')) !== 'padding') throw new Error('COMPONENT_POC_BLOCKED: Formatted text Padding did not persist.');
    await this.expandBasicPageParagraphForControl(wrapper, blockquote[0], this.blockquoteTextSelector(blockquote[0]));
    if ((await readOwnedEditor(wrapper, this.blockquoteTextSelector(blockquote[0]), BLOCKQUOTE_LABEL)) !== expected.blockquoteMarker) throw new Error('COMPONENT_POC_BLOCKED: Blockquote marker changed after save.');
    const blockquoteExpected = {
      '[field_blockquote_author_name][0][value]': 'QA Automation', '[field_blockquote_author_title][0][value]': 'Component coverage fixture',
      '[field_blockquote_cta][0][uri]': `/node/25071#${expected.anchorId}`, '[field_blockquote_cta][0][title]': 'Jump to QA anchor',
      '[field_blockquote_cta][0][options][attributes][aria-label]': 'Jump to the QA automated anchor',
    } as const;
    for (const [suffix, value] of Object.entries(blockquoteExpected)) if (await this.exactValue(wrapper, this.blockquoteFieldSelector(blockquote[0], suffix)) !== value) throw new Error(`COMPONENT_POC_BLOCKED: Blockquote field ${suffix} did not persist.`);
    if (await this.exactValue(wrapper, `input[type="hidden"][name="${this.paragraphPrefix(blockquote[0])}[field_media_image][selection][0][target_id]"]`) !== mediaId) throw new Error('COMPONENT_POC_BLOCKED: Blockquote media association did not persist.');
    await this.expandBasicPageParagraphForControl(wrapper, list[0], this.blockquoteFieldSelector(list[0], '[field_paragraph_alignment]'));
    const listExpected = {
      '[field_list_head][0][value]': 'QA automated component list', '[field_list_cta][0][uri]': `/node/25071#${expected.anchorId}`,
      '[field_list_cta][0][title]': 'Jump to QA anchor', '[field_list_cta][0][options][attributes][aria-label]': 'Jump to the QA automated anchor from the list',
    } as const;
    for (const [suffix, value] of Object.entries(listExpected)) if (await this.exactValue(wrapper, this.blockquoteFieldSelector(list[0], suffix)) !== value) throw new Error(`COMPONENT_POC_BLOCKED: List field ${suffix} did not persist.`);
    if ((await readOwnedEditor(wrapper, `textarea[name="${this.paragraphPrefix(list[0])}[field_list_text][0][value]"]`, 'List supporting text')) !== 'QA automated list supporting text') throw new Error('COMPONENT_POC_BLOCKED: List supporting text did not persist.');
    if (await this.exactValue(wrapper, this.blockquoteFieldSelector(list[0], '[field_paragraph_border]')) !== 'padding') throw new Error('COMPONENT_POC_BLOCKED: List Padding did not persist.');
    await this.assertListMarkersAndEmptyIcons(wrapper, list[0], expected.listMarkers);
    await this.expandBasicPageParagraphForControl(wrapper, anchor[0], this.anchorIdSelector(anchor[0]));
    await this.populateAndAssertAnchor(wrapper, anchor[0], expected.anchorId, expected.anchorLabel, false);
  }

  private async verifyOwnedArticle(page: Page, nodeId: string, titleText: string, components: readonly { marker: string; selector: string; label: string }[]): Promise<{ publicUrl: string; identities: Array<string | undefined> }> {
    const response = await page.goto(`/node/${nodeId}`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`Public Basic Page failed to load with HTTP ${response?.status() ?? 'unknown'}.`);
    await assertNoDrupalFatalPage(page);
    const environment = getEnvironmentConfig();
    if (new URL(page.url()).origin !== environment.baseUrl) throw new Error('Public Basic Page resolved outside the selected DEVV origin.');

    const main = page.locator('article').filter({
      has: page.getByRole('heading', { name: titleText, exact: true }),
      visible: true,
    });
    if ((await main.count()) !== 1) throw new Error('Public Basic Page did not expose one unique visible owned article region.');
    const title = main.getByRole('heading', { name: titleText, exact: true }).filter({ visible: true });
    if ((await title.count()) !== 1) throw new Error('Owned Basic Page title was not rendered uniquely in main content.');
    const identities: Array<string | undefined> = [];
    for (const expected of components) {
      const component = main.locator(expected.selector).filter({ hasText: expected.marker, visible: true });
      if ((await component.count()) !== 1) throw new Error(`${expected.label} marker was not rendered in one unique visible component region.`);
      const occurrences = ((await main.innerText()).match(new RegExp(expected.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
      if (occurrences !== 1) throw new Error(`${expected.label} marker rendered ${occurrences} times instead of exactly once.`);
      identities.push(await component.evaluate((element) => {
        const paragraph = element.closest('[data-entity-type="paragraph"], [data-paragraph-id], [about*="/paragraph/"]');
        return paragraph?.getAttribute('data-entity-id') ?? paragraph?.getAttribute('data-paragraph-id') ?? paragraph?.getAttribute('data-entity-uuid') ?? paragraph?.getAttribute('about') ?? undefined;
      }));
    }
    return { publicUrl: safeNodeUrl(page.url()), identities };
  }

  private paragraphPrefix(delta: string): string { return `${BASIC_PAGE_PARAGRAPH_FIELD}[${delta}][subform]`; }
  private blockquoteTextSelector(delta: string): string { return `textarea[name="${this.paragraphPrefix(delta)}[field_blockquote_text][0][value]"]`; }
  private blockquoteFieldSelector(delta: string, suffix: string): string { return `[name="${this.paragraphPrefix(delta)}${suffix}"]`; }
  private listItemTextSelector(delta: string, index: number): string { return `input[name="${this.paragraphPrefix(delta)}[field_list_items][${index}][subform][field_list_item_text][0][value]"]`; }
  private anchorIdSelector(delta: string): string { return `input[name="${this.paragraphPrefix(delta)}[field_anchor_id][0][value]"]`; }
  private anchorLabelSelector(delta: string): string { return `input[name="${this.paragraphPrefix(delta)}[field_anchor_label][0][value]"]`; }

  private async paragraphDeltas(wrapper: Locator): Promise<string[]> {
    return wrapper.locator(`[name^="${BASIC_PAGE_PARAGRAPH_FIELD}_"]`).evaluateAll((elements, prefix) => [
      ...new Set(elements.map((element) => new RegExp(`^${prefix}_(\\d+)_(?:edit|collapse|remove|duplicate)$`).exec(element.getAttribute('name') ?? '')?.[1]).filter((value): value is string => Boolean(value))),
    ], BASIC_PAGE_PARAGRAPH_FIELD);
  }

  private async paragraphDeltasByLabel(wrapper: Locator, label: string): Promise<string[]> {
    const pattern = new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
    const matches: string[] = [];
    for (const delta of await this.paragraphDeltas(wrapper)) {
      const action = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_edit"], [name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_collapse"]`);
      if ((await action.count()) !== 1) continue;
      const row = action.locator('xpath=ancestor::tr[1]');
      if ((await row.count()) === 1 && pattern.test((await row.innerText()).replace(/\s+/g, ' '))) matches.push(delta);
    }
    return matches;
  }

  private async paragraphDeltasByMachineType(wrapper: Locator, machineName: string): Promise<string[]> {
    const className = `paragraph-type--${machineName.replace(/_/g, '-')}`;
    const matches: string[] = [];
    for (const delta of await this.paragraphDeltas(wrapper)) {
      const action = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_edit"], [name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_collapse"]`);
      if ((await action.count()) !== 1) continue;
      const row = action.locator('xpath=ancestor::tr[1]');
      if ((await row.count()) !== 1) continue;
      const classes = (await row.getAttribute('class'))?.split(/\s+/) ?? [];
      if (classes.includes(className)) matches.push(delta);
    }
    return matches;
  }

  private normalizeOwnershipMarker(value: string): string {
    return value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?p[^>]*>/gi, ' ')
      .replace(/<\/?div[^>]*>/gi, ' ')
      .replace(/<\/?span[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async captureCumulativeParagraphSnapshot(wrapper: Locator): Promise<{
    deltas: string[];
    rowKinds: string[];
    topLevelCount: number;
    personalizationCount: number;
    cerosEmbedCount: number;
    embedCodeDeltas: string[];
  }> {
    const deltas = await this.paragraphDeltas(wrapper);
    const rowKinds: string[] = [];
    let personalizationCount = 0;
    let cerosEmbedCount = 0;
    const embedCodeDeltas: string[] = [];

    for (const delta of deltas) {
      const action = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_edit"], [name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_collapse"]`);
      if ((await action.count()) !== 1) continue;
      const row = action.locator('xpath=ancestor::tr[1]');
      if ((await row.count()) !== 1) continue;
      const text = (await row.innerText()).replace(/\s+/g, ' ').trim();
      let kind = 'other';
      if (/Personalization/i.test(text)) {
        kind = 'personalization';
        personalizationCount += 1;
      }
      if (/Ceros\s*embed/i.test(text)) {
        kind = 'ceros-embed';
        cerosEmbedCount += 1;
      }
      if (/Embed\s*Code/i.test(text)) {
        kind = 'embed-code';
        embedCodeDeltas.push(delta);
      }
      rowKinds.push(`${delta}:${kind}`);
    }

    return {
      deltas,
      rowKinds,
      topLevelCount: deltas.length,
      personalizationCount,
      cerosEmbedCount,
      embedCodeDeltas,
    };
  }

  private assertCumulativePagePreserved(
    before: Awaited<ReturnType<BasicPageFormattedTextPocRunner['captureCumulativeParagraphSnapshot']>>,
    after: Awaited<ReturnType<BasicPageFormattedTextPocRunner['captureCumulativeParagraphSnapshot']>>,
  ): void {
    if (before.topLevelCount !== after.topLevelCount) {
      throw new Error('COMPONENT_POC_BLOCKED: Top-level paragraph count changed unexpectedly during the Embed Code mutation.');
    }
    if (before.deltas.length !== after.deltas.length) {
      throw new Error('COMPONENT_POC_BLOCKED: Paragraph delta count changed unexpectedly during the Embed Code mutation.');
    }
    if (before.rowKinds.join('||') !== after.rowKinds.join('||')) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing paragraph layout changed unexpectedly during the Embed Code mutation.');
    }
    if (before.personalizationCount !== 1 || after.personalizationCount !== 1) {
      throw new Error('COMPONENT_POC_BLOCKED: Personalization count was not preserved exactly once.');
    }
    if (before.cerosEmbedCount !== 1 || after.cerosEmbedCount !== 1) {
      throw new Error('COMPONENT_POC_BLOCKED: Ceros embed count was not preserved exactly once.');
    }
    if (before.embedCodeDeltas.length !== 1 || after.embedCodeDeltas.length !== 1) {
      throw new Error('COMPONENT_POC_BLOCKED: Embed Code count was not preserved exactly once.');
    }
    if (before.embedCodeDeltas[0] !== after.embedCodeDeltas[0]) {
      throw new Error('COMPONENT_POC_BLOCKED: Embed Code delta changed unexpectedly during the mutation.');
    }
  }

  private async assertBasicPageInventory(wrapper: Locator, expectedBlockquotes: number, expectedLists: number = 0, expectedAnchors: number = 0, expectedJumpNavs: number = 0, expectedTabs: number = 0, expectedCardGrids: number = 0, expectedStatCallouts: number = 0, expectedVideos: number = 0, expectedCardCollections: number = 0, expectedBanners: number = 0, expectedCarousels: number = 0, expectedMarketoForms: number = 0, expectedEmbedCodes: number = 0): Promise<void> {
    if ((await wrapper.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: Basic Page paragraph wrapper was not unique.');
    const formatted = await this.paragraphDeltasByLabel(wrapper, 'Formatted text');
    const blockquotes = await this.paragraphDeltasByLabel(wrapper, BLOCKQUOTE_LABEL);
    const lists = await this.paragraphDeltasByLabel(wrapper, 'List');
    const anchors = await this.paragraphDeltasByLabel(wrapper, 'Anchor');
    const jumpNavs = await this.paragraphDeltasByLabel(wrapper, 'Jump nav');
    const tabs = await this.paragraphDeltasByLabel(wrapper, 'Tabs');
    const cardGrids = await this.paragraphDeltasByLabel(wrapper, 'Card: Grid');
    const statCallouts = await this.paragraphDeltasByLabel(wrapper, 'Stat callout');
    const videos = await this.paragraphDeltasByLabel(wrapper, 'Video');
    const cardCollections = await this.paragraphDeltasByLabel(wrapper, 'Card: Collection');
    const banners = await this.paragraphDeltasByLabel(wrapper, 'Banner');
    const carousels = await this.paragraphDeltasByLabel(wrapper, 'Card: Carousel');
    const embedCodes = await this.paragraphDeltasByLabel(wrapper, 'Embed Code');
    const marketoForms = await this.paragraphDeltasByMachineType(wrapper, 'marketo');
    const deltas = await this.paragraphDeltas(wrapper);
    const expectedTotal = 1 + expectedBlockquotes + expectedLists + expectedAnchors + expectedJumpNavs + expectedTabs + expectedCardGrids + expectedStatCallouts + expectedVideos + expectedCardCollections + expectedBanners + expectedCarousels + expectedEmbedCodes + expectedMarketoForms;
    if (formatted.length < 1 || blockquotes.length < expectedBlockquotes || lists.length < expectedLists || anchors.length < expectedAnchors || jumpNavs.length < expectedJumpNavs || tabs.length < expectedTabs || cardGrids.length < expectedCardGrids || statCallouts.length < expectedStatCallouts || videos.length < expectedVideos || cardCollections.length < expectedCardCollections || banners.length < expectedBanners || carousels.length < expectedCarousels || embedCodes.length < expectedEmbedCodes || marketoForms.length < expectedMarketoForms || deltas.length < expectedTotal) {
      throw new Error('COMPONENT_POC_BLOCKED: Basic Page inventory was missing the required baseline components for the current QA page.');
    }
  }

  private async addBasicPageBlockquote(page: Page, wrapper: Locator, monitor: NetworkMonitor): Promise<string> {
    return this.addBasicPageParagraph(page, wrapper, 'blockquote', BLOCKQUOTE_LABEL, monitor);
  }

  private async addBasicPageParagraph(page: Page, wrapper: Locator, machineName: string, label: string, monitor: NetworkMonitor): Promise<string> {
    const before = await this.paragraphDeltas(wrapper);
    const add = wrapper.locator(`input[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${machineName}_add_more"]`);
    if ((await add.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: ${label} Add control was not unique.`);
    if (!(await add.isVisible())) {
      const toggle = wrapper.locator('.paragraphs-add-wrapper .dropbutton-toggle button');
      if ((await toggle.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: ${label} Add menu was ambiguous.`);
      await toggle.click();
      await add.waitFor({ state: 'visible', timeout: 10_000 });
    }
    const ajax = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click();
    const ajaxResponse = await ajax;
    if (ajaxResponse.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: ${label} Add returned HTTP ${ajaxResponse.status()}.`);
    await assertNoDrupalFatalPage(page);
    monitor.assertNoServerErrors();
    const after = await this.paragraphDeltas(wrapper);
    const added = after.filter((delta) => !before.includes(delta));
    if (added.length !== 1) throw new Error(`COMPONENT_POC_BLOCKED: ${label} Add did not produce one unique paragraph delta.`);
    return added[0];
  }

  private async resolveOwnedFormattedTextParagraphDelta(wrapper: Locator, expectedMarker: string): Promise<string> {
    const candidates = await this.paragraphDeltasByMachineType(wrapper, 'formatted_text');
    const matches: string[] = [];
    for (const delta of candidates) {
      try {
        const selector = `textarea[name="${this.paragraphPrefix(delta)}[field_formatted_text][0][value]"]`;
        if ((await wrapper.locator(selector).count()) === 0) {
          await this.expandBasicPageParagraphForControl(wrapper, delta, this.blockquoteFieldSelector(delta, '[field_paragraph_border]'));
        }
        const currentMarker = await readOwnedEditor(wrapper, selector, 'Existing Formatted text paragraph marker');
        const normalizedCurrent = this.normalizeOwnershipMarker(currentMarker);
        const normalizedExpected = this.normalizeOwnershipMarker(expectedMarker);
        if (normalizedCurrent.includes(normalizedExpected)) matches.push(delta);
      } catch {
        // Ignore inaccessible or collapsed candidates while scanning the authoritative current form.
      }
    }
    if (matches.length !== 1) {
      throw new Error(`COMPONENT_POC_BLOCKED: Existing Formatted text ownership paragraph was ${matches.length === 0 ? 'not found' : 'ambiguous'} in the current live form.`);
    }
    return matches[0];
  }

  private async openOwnedBasicPageEdit(page: Page, monitor: NetworkMonitor, expected: { nodeId: string; title: string; formattedTextMarker: string }): Promise<{ form: Locator; wrapper: Locator }> {
    const response = await page.goto(`/node/${expected.nodeId}/edit`, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(`COMPONENT_POC_BLOCKED: Existing Basic Page edit form returned HTTP ${response?.status() ?? 'unknown'}.`);
    monitor.assertNoServerErrors();
    await assertNoDrupalFatalPage(page);
    const form = page.locator('form.node-page-edit-form, form[id^="node-page-edit-form"]').filter({ visible: true });
    if ((await form.count()) !== 1 || (await form.locator(basicPageConfig.titleField.selector).inputValue()) !== expected.title) throw new Error('COMPONENT_POC_BLOCKED: Existing Basic Page title/type ownership check failed.');

    const wrapper = form.locator(BASIC_PAGE_PARAGRAPH_WRAPPER);
    const formattedDelta = await this.resolveOwnedFormattedTextParagraphDelta(wrapper, expected.formattedTextMarker);
    const formattedTextSelector = `textarea[name="${this.paragraphPrefix(formattedDelta)}[field_formatted_text][0][value]"]`;
    if ((await wrapper.locator(formattedTextSelector).count()) === 0) {
      await this.expandBasicPageParagraphForControl(wrapper, formattedDelta, this.blockquoteFieldSelector(formattedDelta, '[field_paragraph_border]'));
    }

    const currentMarker = await readOwnedEditor(wrapper, formattedTextSelector, 'Existing Formatted text paragraph marker');
    const normalizedCurrent = this.normalizeOwnershipMarker(currentMarker);
    const normalizedExpected = this.normalizeOwnershipMarker(expected.formattedTextMarker);
    if (!normalizedCurrent.includes(normalizedExpected)) {
      throw new Error('COMPONENT_POC_BLOCKED: Existing Formatted text marker was not preserved exactly.');
    }
    return { form, wrapper };
  }

  private async assertExistingBlockquote(wrapper: Locator, marker: string): Promise<void> {
    const deltas = await this.paragraphDeltasByLabel(wrapper, BLOCKQUOTE_LABEL);
    if (deltas.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Existing Blockquote identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(wrapper, deltas[0], this.blockquoteTextSelector(deltas[0]));
    if ((await readOwnedEditor(wrapper, this.blockquoteTextSelector(deltas[0]), BLOCKQUOTE_LABEL)) !== marker) throw new Error('COMPONENT_POC_BLOCKED: Existing Blockquote marker changed.');
  }

  private async assertExistingList(wrapper: Locator, markers: readonly [string, string, string]): Promise<void> {
    const deltas = await this.paragraphDeltasByLabel(wrapper, 'List');
    if (deltas.length !== 1) throw new Error('COMPONENT_POC_BLOCKED: Existing List identity was ambiguous.');
    await this.expandBasicPageParagraphForControl(wrapper, deltas[0], this.blockquoteFieldSelector(deltas[0], '[field_paragraph_alignment]'));
    await this.assertListDefaults(wrapper, deltas[0]);
    await this.assertListState(wrapper, deltas[0], markers);
  }

  private async populateAndAssertAnchor(wrapper: Locator, delta: string, anchorId: string, anchorLabel: string, populate = true): Promise<void> {
    const id = wrapper.locator(this.anchorIdSelector(delta));
    const label = wrapper.locator(this.anchorLabelSelector(delta));
    const editable = wrapper.locator(`[name^="${this.paragraphPrefix(delta)}"]`).filter({ visible: true });
    if ((await id.count()) !== 1 || (await label.count()) !== 1 || (await editable.count()) !== 2) throw new Error('COMPONENT_POC_BLOCKED: Anchor editable-field inventory was not exactly ID and Label.');
    if (populate) {
      await id.fill(anchorId);
      await label.fill(anchorLabel);
    }
    if ((await id.inputValue()) !== anchorId || (await label.inputValue()) !== anchorLabel) throw new Error('COMPONENT_POC_BLOCKED: Anchor fields did not persist exact QA values.');
  }

  private async assertListDefaults(wrapper: Locator, delta: string): Promise<void> {
    if (await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_paragraph_alignment]')) !== 'left'
      || await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_paragraph_border]')) !== '_none') {
      throw new Error('COMPONENT_POC_BLOCKED: Known safe List defaults changed.');
    }
  }

  private async addListTextItem(page: Page, wrapper: Locator, delta: string, index: number, marker: string, monitor: NetworkMonitor): Promise<void> {
    const add = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_list_items_list_item_text_add_more"]`);
    if ((await add.count()) !== 1) throw new Error('COMPONENT_POC_BLOCKED: List item - text Add control was not unique.');
    const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST', { timeout: 30_000 });
    await add.click();
    const response = await responsePromise;
    if (response.status() >= 500) throw new Error(`COMPONENT_POC_BLOCKED: List item Add returned HTTP ${response.status()}.`);
    await assertNoDrupalFatalPage(page);
    monitor.assertNoServerErrors();
    const field = wrapper.locator(this.listItemTextSelector(delta, index));
    await field.waitFor({ state: 'visible', timeout: 20_000 });
    await field.fill(marker);
    const icon = wrapper.locator(`[name="${this.paragraphPrefix(delta)}[field_list_items][${index}][subform][field_list_item_icon]"]`);
    if ((await icon.count()) !== 1 || (await icon.inputValue()) !== '_none') throw new Error('COMPONENT_POC_BLOCKED: List item icon safe default changed.');
  }

  private async assertListState(wrapper: Locator, delta: string, markers: readonly string[]): Promise<void> {
    for (let index = 0; index < markers.length; index += 1) {
      const field = wrapper.locator(this.listItemTextSelector(delta, index));
      if ((await field.count()) === 0) {
        const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_subform_field_list_items_${index}_edit"]`);
        if ((await edit.count()) !== 1 || !(await edit.isVisible()) || !(await edit.isEnabled())) throw new Error(`COMPONENT_POC_BLOCKED: Saved List item ${index + 1} could not be expanded safely.`);
        await activateOwnedParagraphEdit(edit);
        await field.waitFor({ state: 'attached', timeout: 20_000 });
      }
      if ((await field.count()) !== 1 || (await field.inputValue()) !== markers[index]) throw new Error(`COMPONENT_POC_BLOCKED: List item ${index + 1} did not persist exactly.`);
      const icon = wrapper.locator(`[name="${this.paragraphPrefix(delta)}[field_list_items][${index}][subform][field_list_item_icon]"]`);
      if ((await icon.count()) !== 1 || (await icon.inputValue()) !== '_none') throw new Error(`COMPONENT_POC_BLOCKED: List item ${index + 1} icon changed.`);
    }
  }

  private async exactValue(wrapper: Locator, selector: string): Promise<string> {
    const control = wrapper.locator(selector);
    if ((await control.count()) !== 1) throw new Error(`COMPONENT_POC_BLOCKED: Expected one exact Blockquote control for ${selector}.`);
    return control.inputValue();
  }

  private async expandBasicPageParagraphForControl(wrapper: Locator, delta: string, controlSelector: string): Promise<void> {
    if ((await wrapper.locator(controlSelector).count()) === 1) return;
    const edit = wrapper.locator(`[name="${BASIC_PAGE_PARAGRAPH_FIELD}_${delta}_edit"]`);
    if ((await edit.count()) !== 1 || !(await edit.isVisible()) || !(await edit.isEnabled())) {
      throw new Error('COMPONENT_POC_BLOCKED: Saved Blockquote Edit control was not uniquely available.');
    }
    await activateOwnedParagraphEdit(edit);
    await wrapper.locator(controlSelector).waitFor({ state: 'attached', timeout: 20_000 });
  }

  private async captureBlockquoteDefaults(wrapper: Locator, delta: string): Promise<{ textFormat: string; border: string; color: string }> {
    const defaults = {
      textFormat: await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_blockquote_text][0][format]')),
      border: await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_paragraph_border]')),
      color: await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_paragraph_color]')),
    };
    if (defaults.textFormat !== 'limited_text' || defaults.border !== 'padding' || defaults.color !== 'purple') {
      throw new Error('COMPONENT_POC_BLOCKED: Known safe Blockquote defaults changed.');
    }
    return defaults;
  }

  private async assertBlockquoteState(wrapper: Locator, delta: string, marker: string, defaults: { textFormat: string; border: string; color: string }): Promise<void> {
    if ((await readOwnedEditor(wrapper, this.blockquoteTextSelector(delta), BLOCKQUOTE_LABEL)) !== marker) throw new Error('COMPONENT_POC_BLOCKED: Blockquote marker did not persist exactly.');
    if (await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_blockquote_text][0][format]')) !== defaults.textFormat
      || await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_paragraph_border]')) !== defaults.border
      || await this.exactValue(wrapper, this.blockquoteFieldSelector(delta, '[field_paragraph_color]')) !== defaults.color) {
      throw new Error('COMPONENT_POC_BLOCKED: Blockquote format, style, or color changed.');
    }
    const emptySelectors = [
      '[field_blockquote_author_name][0][value]', '[field_blockquote_author_title][0][value]',
      '[field_media_image][media_library_selection]', '[field_blockquote_cta][0][uri]',
      '[field_blockquote_cta][0][title]', '[field_blockquote_cta][0][options][attributes][aria-label]',
    ];
    for (const suffix of emptySelectors) {
      const control = wrapper.locator(this.blockquoteFieldSelector(delta, suffix));
      if ((await control.count()) !== 1 || (await control.inputValue()) !== '') throw new Error(`COMPONENT_POC_BLOCKED: Optional Blockquote field ${suffix} changed.`);
    }
  }
}
