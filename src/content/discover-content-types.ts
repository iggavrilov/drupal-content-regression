import type { Page } from '@playwright/test';

export interface DiscoveredContentType {
  label: string;
  machineName: string;
  href: string;
}

export async function discoverContentTypes(
  page: Page,
): Promise<readonly DiscoveredContentType[]> {
  const links = await page.locator('a[href]').evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      label: anchor.textContent?.trim() ?? '',
      href: anchor.getAttribute('href') ?? '',
    })),
  );
  const discovered = new Map<string, DiscoveredContentType>();

  for (const link of links) {
    if (!link.label || !link.href) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(link.href, page.url());
    } catch {
      continue;
    }

    const match = url.pathname.match(/^\/node\/add\/([a-z0-9_]+)\/?$/i);
    if (!match) {
      continue;
    }

    const machineName = match[1];
    discovered.set(machineName, {
      label: link.label,
      machineName,
      href: url.pathname,
    });
  }

  return [...discovered.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}
