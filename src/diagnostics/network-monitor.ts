import type { Page, Response } from '@playwright/test';

const SERVER_ERROR_STATUSES = new Set([500, 501, 502, 503, 504, 505]);

export interface ServerErrorRecord {
  status: number;
  method: string;
  url: string;
}

export interface DrupalFatalPageResult {
  detected: boolean;
  indicator?: string;
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[unparseable URL]';
  }
}

export class NetworkMonitor {
  private page?: Page;
  private readonly serverErrors: ServerErrorRecord[] = [];

  private readonly handleResponse = (response: Response): void => {
    if (!SERVER_ERROR_STATUSES.has(response.status())) {
      return;
    }

    this.serverErrors.push({
      status: response.status(),
      method: response.request().method(),
      url: sanitizeUrl(response.url()),
    });
  };

  start(page: Page): void {
    this.stop();
    this.serverErrors.length = 0;
    this.page = page;
    page.on('response', this.handleResponse);
  }

  stop(): void {
    this.page?.off('response', this.handleResponse);
    this.page = undefined;
  }

  getServerErrors(): readonly ServerErrorRecord[] {
    return this.serverErrors.map((record) => ({ ...record }));
  }

  assertNoServerErrors(): void {
    if (this.serverErrors.length === 0) {
      return;
    }

    const details = this.serverErrors
      .map(({ status, method, url }) => `HTTP ${status} ${method} ${url}`)
      .join('\n');

    throw new Error(`Server error responses were detected:\n${details}`);
  }
}

interface FatalIndicator {
  selector: string;
  indicator: string;
}

const fatalIndicators: readonly FatalIndicator[] = [
  {
    selector: 'body:has-text("The website encountered an unexpected error")',
    indicator: 'Drupal unexpected-error page',
  },
  {
    selector: 'h1:has-text("Internal Server Error")',
    indicator: 'Internal Server Error heading',
  },
  {
    selector: 'h1:has-text("Service Unavailable")',
    indicator: 'Service Unavailable heading',
  },
  {
    selector: 'h1:has-text("Bad Gateway")',
    indicator: 'Bad Gateway heading',
  },
  {
    selector: 'h1:has-text("Gateway Timeout")',
    indicator: 'Gateway Timeout heading',
  },
  {
    selector:
      '[data-drupal-messages] .messages--error:has-text("unexpected error"), .messages--error:has-text("unexpected error")',
    indicator: 'Drupal fatal error message',
  },
];

export async function detectDrupalFatalPage(
  page: Page,
): Promise<DrupalFatalPageResult> {
  for (const { selector, indicator } of fatalIndicators) {
    if (await page.locator(selector).first().isVisible()) {
      return { detected: true, indicator };
    }
  }

  return { detected: false };
}

export async function assertNoDrupalFatalPage(page: Page): Promise<void> {
  const result = await detectDrupalFatalPage(page);

  if (result.detected) {
    throw new Error(
      `Drupal fatal page detected at ${sanitizeUrl(page.url())}: ${result.indicator}`,
    );
  }
}
