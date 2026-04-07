import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // E2E uses Playwright API mocks for deterministic frontend smoke coverage.
}
