import { applySelectedDrupalTarget } from './environments';

export const AUTOMATED_CONTENT_PREFIX = 'QA-AUTOMATED-' as const;

export const AUTOMATED_IMAGE_FIXTURE = 'fixtures/qa-automated-image.png';
export const AUTOMATED_IMAGE_MEDIA_NAME = 'qa-automated-image.png';

interface SiteAutomationConfig {
  imageMediaId?: string;
  imageMediaName?: string;
  authorNodeId?: string;
  authorTitle?: string;
  m3TextNodeId?: string;
  protectedNodeIds: readonly string[];
}

const SITE_AUTOMATION_CONFIGS: Record<string, SiteAutomationConfig> = {
  'https://benefits-stage.leidos.com': {
    imageMediaId: '5921',
    authorNodeId: '621',
    authorTitle: "QA-AUTOMATED-BENEFITS-STAGE-Author-20261103-175709-dfae-UPDATED",
    protectedNodeIds: ['621', '626', '631', '636', '641', '646', '651'],
  },
  'https://stage.leidos.com': {
    imageMediaId: '45406',
    imageMediaName: 'Two people meeting and shaking hands.jpg',
    authorNodeId: '25346',
    authorTitle: 'QA-AUTOMATED-STAGE-Author-20261103-142507-6116-UPDATED',
    protectedNodeIds: ['25191', '25196', '25201', '25206', '25211', '25216', '25221', '25346', '25351', '25356', '25361', '25366', '25371', '25376'],
  },
  'https://devv.leidos.com': {
    imageMediaId: '45031',
    authorNodeId: '25051',
    authorTitle: 'QA-AUTOMATED-Author-20260917-080929-e57a-UPDATED',
    m3TextNodeId: '25011',
    protectedNodeIds: ['24946', '24951', '24956', '24961', '24966', '24971', '24976', '24981', '24986', '24991', '24996', '25001', '25006', '25011', '25016'],
  },
  'https://benefits-dev.leidos.com': {
    imageMediaId: '5691',
    authorNodeId: '626',
    authorTitle: 'QA-AUTOMATED-Author-20260917-133047-522e-UPDATED',
    m3TextNodeId: '651',
    protectedNodeIds: ['606', '611', '616', '621', '626', '631', '636', '641', '646', '651', '656'],
  },
  'https://dev.qtcm.com': {
    imageMediaId: '3221',
    authorNodeId: '1541',
    authorTitle: 'QA-AUTOMATED-Author-20260917-153921-e191-UPDATED',
    m3TextNodeId: '1566',
    protectedNodeIds: ['1521', '1526', '1531', '1536', '1541', '1546', '1551', '1556', '1561', '1566', '1571'],
  },
};

function activeSiteAutomationConfig(): SiteAutomationConfig {
  const configured = applySelectedDrupalTarget().baseUrl;
  return configured ? SITE_AUTOMATION_CONFIGS[configured] ?? { protectedNodeIds: [] } : { protectedNodeIds: [] };
}

const activeSite = activeSiteAutomationConfig();
export const AUTOMATED_IMAGE_MEDIA_ID = activeSite.imageMediaId ?? '';
export const AUTOMATED_REQUIRED_IMAGE_MEDIA_NAME = activeSite.imageMediaName ?? AUTOMATED_IMAGE_MEDIA_NAME;
export const AUTOMATED_AUTHOR_NODE_ID = activeSite.authorNodeId ?? '';
export const AUTOMATED_AUTHOR_TITLE = activeSite.authorTitle ?? '';
export const AUTOMATED_M3_TEXT_NODE_ID = activeSite.m3TextNodeId ?? '';
export const PROTECTED_SITE_NODE_IDS = new Set(activeSite.protectedNodeIds);

export function hasAutomatedContentPrefix(title: string): boolean {
  return title.startsWith(AUTOMATED_CONTENT_PREFIX);
}
