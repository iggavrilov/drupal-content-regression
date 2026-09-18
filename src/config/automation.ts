import { applySelectedDrupalTarget } from './environments';

export const AUTOMATED_CONTENT_PREFIX = 'QA-AUTOMATED-' as const;

export const AUTOMATED_IMAGE_FIXTURE = 'fixtures/qa-automated-image.png';
export const AUTOMATED_IMAGE_MEDIA_NAME = 'qa-automated-image.png';

interface SiteAutomationConfig {
  imageMediaId?: string;
  authorNodeId?: string;
  authorTitle?: string;
  m3TextNodeId?: string;
  protectedNodeIds: readonly string[];
}

const SITE_AUTOMATION_CONFIGS: Record<string, SiteAutomationConfig> = {
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
export const AUTOMATED_AUTHOR_NODE_ID = activeSite.authorNodeId ?? '';
export const AUTOMATED_AUTHOR_TITLE = activeSite.authorTitle ?? '';
export const AUTOMATED_M3_TEXT_NODE_ID = activeSite.m3TextNodeId ?? '';
export const PROTECTED_SITE_NODE_IDS = new Set(activeSite.protectedNodeIds);

export function hasAutomatedContentPrefix(title: string): boolean {
  return title.startsWith(AUTOMATED_CONTENT_PREFIX);
}
