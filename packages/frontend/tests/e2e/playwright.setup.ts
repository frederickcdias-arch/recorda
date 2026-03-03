import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Futuramente podemos garantir que backend/frontend estejam rodando ou preparar dados.
}
