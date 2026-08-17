import {
  AUTOMATED_AUTHOR_NODE_ID,
  AUTOMATED_AUTHOR_TITLE,
  AUTOMATED_IMAGE_MEDIA_ID,
  AUTOMATED_IMAGE_MEDIA_NAME,
} from './automation';

export interface BaseFieldConfig {
  key: string;
  label: string;
  selector: string;
  optionalOnUpdate?: boolean;
  verifyPersisted?: boolean;
}

export interface TextFieldConfig extends BaseFieldConfig {
  type: 'text';
}

export interface CkEditorFieldConfig extends BaseFieldConfig {
  type: 'ckeditor';
}

export interface UrlFieldConfig extends BaseFieldConfig {
  type: 'url';
}

export interface ParagraphCkEditorFieldConfig extends BaseFieldConfig {
  type: 'paragraph_ckeditor';
  collapsedEditSelector?: string;
}

export type FieldConfig =
  | TextFieldConfig
  | UrlFieldConfig
  | CkEditorFieldConfig
  | ParagraphCkEditorFieldConfig;

export interface RequiredDefaultConfig {
  label: string;
  selector: string;
}

export interface UntouchedOptionalFieldConfig {
  label: string;
  selector: string;
}

export interface ExpectedControlConfig {
  label: string;
  selector: string;
}

export interface RequiredEntityReferenceConfig {
  label: string;
  selector: string;
  expectedLabel: string;
  expectedId: string;
  fixtureEditPath: string;
  fixtureTitleSelector: string;
}

export interface TestDataProfile {
  titleSegment: string;
  titleKey: string;
  values: Readonly<
    Record<string, { create: string; update: string }>
  >;
}

export interface ContentTypeConfig {
  machineName: string;
  label: string;
  formSelector: string;
  titleField: TextFieldConfig;
  fields: readonly FieldConfig[];
  requiredDefaults?: readonly RequiredDefaultConfig[];
  untouchedOptionalFields?: readonly UntouchedOptionalFieldConfig[];
  expectedControls?: readonly ExpectedControlConfig[];
  requiredMedia?: {
    label: string;
    selectionSelector: string;
    expectedName: string;
    expectedId: string;
  };
  requiredEntityReferences?: readonly RequiredEntityReferenceConfig[];
  moderation?: { enabled: true };
  testData: TestDataProfile;
}

const standardTitle: TextFieldConfig = {
  key: 'title',
  label: 'Title',
  type: 'text',
  selector: 'input[name="title[0][value]"]',
  verifyPersisted: true,
};

export const basicPageConfig: ContentTypeConfig = {
  machineName: 'page',
  label: 'Basic page',
  formSelector:
    'form.node-page-form, form.node-form, form[id^="node-page-form"]',
  titleField: standardTitle,
  fields: [
    standardTitle,
    {
      key: 'body',
      label: 'Basic page formatted text',
      type: 'paragraph_ckeditor',
      selector:
        'textarea[name*="[field_formatted_text]"][name$="[value]"]',
      optionalOnUpdate: true,
    },
  ],
  requiredDefaults: [
    {
      label: 'Footer color',
      selector: 'select[name="field_page_footer_color"]',
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Basic-Page',
    titleKey: 'title',
    values: {
      body: {
        create: 'Automated Drupal regression test content. Run: {runId}',
        update:
          'Automated Drupal regression test content updated. Run: {runId}',
      },
    },
  },
};

export const landingPageConfig: ContentTypeConfig = {
  machineName: 'landing_page',
  label: 'Landing page',
  formSelector:
    'form.node-landing-page-form, form.node-form, form[id^="node-landing-page-form"]',
  titleField: standardTitle,
  fields: [
    standardTitle,
    {
      key: 'body',
      label: 'Landing page Body',
      type: 'ckeditor',
      selector: 'textarea[name="body[0][value]"]',
      optionalOnUpdate: true,
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Landing-Page',
    titleKey: 'title',
    values: {
      body: {
        create:
          'Automated Drupal Landing page regression content. Run: {runId}',
        update:
          'Automated Drupal Landing page regression content updated. Run: {runId}',
      },
    },
  },
};

export const statisticConfig: ContentTypeConfig = {
  machineName: 'statistic',
  label: 'Statistic',
  formSelector:
    'form.node-statistic-form, form.node-form, form[id^="node-statistic-form"]',
  titleField: { ...standardTitle, label: 'Administrative title' },
  fields: [
    { ...standardTitle, label: 'Administrative title' },
    {
      key: 'statistic',
      label: 'Statistic',
      type: 'text',
      selector: 'input[name="field_statistic_value[0][value]"]',
      verifyPersisted: true,
    },
  ],
  untouchedOptionalFields: [
    {
      label: 'Image media',
      selector: 'input[name="field_media_image[media_library_selection]"]',
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Statistic',
    titleKey: 'title',
    values: {
      statistic: { create: '100', update: '200' },
    },
  },
};

const authorAdministrativeTitle: TextFieldConfig = {
  ...standardTitle,
  label: 'Administrative title',
};

export const authorConfig: ContentTypeConfig = {
  machineName: 'author',
  label: 'Author',
  formSelector:
    'form.node-author-form, form.node-form, form[id^="node-author-form"]',
  titleField: authorAdministrativeTitle,
  fields: [
    authorAdministrativeTitle,
    {
      key: 'biography',
      label: 'Biography',
      type: 'ckeditor',
      selector: 'textarea[name="field_author_biography[0][value]"]',
      optionalOnUpdate: true,
      verifyPersisted: true,
    },
  ],
  untouchedOptionalFields: [
    {
      label: 'Image media',
      selector: 'input[name="field_media_image[media_library_selection]"]',
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Author',
    titleKey: 'title',
    values: {
      biography: {
        create:
          'Automated Drupal Author biography regression content. Run: {runId}',
        update:
          'Automated Drupal Author biography regression content updated. Run: {runId}',
      },
    },
  },
};

export const insightExternalConfig: ContentTypeConfig = {
  machineName: 'insight_external',
  label: 'Insight (external)',
  formSelector:
    'form.node-insight-external-form, form.node-form, form[id^="node-insight-external-form"]',
  titleField: standardTitle,
  fields: [
    standardTitle,
    {
      key: 'externalLink',
      label: 'External Link',
      type: 'url',
      selector: 'input[name="field_external_link[0][uri]"]',
      verifyPersisted: true,
    },
  ],
  requiredMedia: {
    label: 'Image',
    selectionSelector:
      'input[name="field_media_image[selection][0][target_id]"]',
    expectedName: AUTOMATED_IMAGE_MEDIA_NAME,
    expectedId: AUTOMATED_IMAGE_MEDIA_ID,
  },
  untouchedOptionalFields: [
    {
      label: 'Authors',
      selector: 'input[name="field_insight_author[0][target_id]"]',
    },
    {
      label: 'Insights tags',
      selector: 'input[name="field_insights_tags[target_id]"]',
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Insight-External',
    titleKey: 'title',
    values: {
      externalLink: {
        create: 'https://example.com/qa-automated-insight/{runId}',
        update: 'https://example.com/qa-automated-insight/{runId}/updated',
      },
    },
  },
};

export const insightConfig: ContentTypeConfig = {
  machineName: 'insight',
  label: 'Insight',
  formSelector: 'form.node-insight-form, form.node-form, form[id^="node-insight-form"]',
  titleField: standardTitle,
  fields: [
    standardTitle,
    {
      key: 'formattedText',
      label: 'Formatted text',
      type: 'paragraph_ckeditor',
      selector:
        'textarea[name="field_insight_paragraphs[0][subform][field_formatted_text][0][value]"]',
      collapsedEditSelector:
        'input[name="field_insight_paragraphs_0_edit"]',
      verifyPersisted: true,
    },
  ],
  requiredMedia: {
    label: 'Image',
    selectionSelector:
      'input[name^="field_media_image[selection]"][name$="[target_id]"]',
    expectedName: AUTOMATED_IMAGE_MEDIA_NAME,
    expectedId: AUTOMATED_IMAGE_MEDIA_ID,
  },
  requiredEntityReferences: [
    {
      label: 'Author',
      selector: 'input[name="field_insight_author[0][target_id]"]',
      expectedLabel: AUTOMATED_AUTHOR_TITLE,
      expectedId: AUTOMATED_AUTHOR_NODE_ID,
      fixtureEditPath: `/node/${AUTOMATED_AUTHOR_NODE_ID}/edit`,
      fixtureTitleSelector: 'input[name="title[0][value]"]',
    },
  ],
  untouchedOptionalFields: [
    {
      label: 'Insights tags',
      selector: 'input[name="field_insights_tags[target_id]"]',
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Insight',
    titleKey: 'title',
    values: {
      formattedText: {
        create: 'Automated Drupal Insight regression content. Run: {runId}',
        update:
          'Automated Drupal Insight regression content updated. Run: {runId}',
      },
    },
  },
};

export const insightSearchConfig: ContentTypeConfig = {
  machineName: 'insight_search',
  label: 'Insight Search Filter Page',
  formSelector:
    'form.node-insight-search-form, form.node-form, form[id^="node-insight-search-form"]',
  titleField: standardTitle,
  fields: [
    standardTitle,
    {
      key: 'insightLead',
      label: 'Insight lead',
      type: 'ckeditor',
      selector: 'textarea[name="field_insight_lead[0][value]"]',
      verifyPersisted: true,
    },
  ],
  untouchedOptionalFields: [
    {
      label: 'Background image',
      selector: 'input[name="field_bg_image[media_library_selection]"]',
    },
    {
      label: 'Insight Tag',
      selector: 'input[name="field_insight_tag[0][target_id]"]',
    },
    {
      label: 'Authored by',
      selector: 'input[name="uid[0][target_id]"]',
    },
  ],
  expectedControls: [
    {
      label: 'Preview',
      selector: 'input#edit-preview[name="op"][value="Preview"]',
    },
  ],
  moderation: { enabled: true },
  testData: {
    titleSegment: 'Insight-Search',
    titleKey: 'title',
    values: {
      insightLead: {
        create: 'Automated Drupal Insight Search regression lead. Run: {runId}',
        update:
          'Automated Drupal Insight Search regression lead updated. Run: {runId}',
      },
    },
  },
};

export const contentTypes: readonly ContentTypeConfig[] = [
  basicPageConfig,
  landingPageConfig,
  statisticConfig,
  authorConfig,
  insightExternalConfig,
  insightConfig,
  insightSearchConfig,
];
