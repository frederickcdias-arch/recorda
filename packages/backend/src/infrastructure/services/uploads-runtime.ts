import { promises as fs } from 'fs';
import path from 'path';

export type UploadsStorageMode = 'ephemeral' | 'local' | 'railway-volume' | 's3';

const UPLOAD_SUBDIRECTORIES = [
  'planilhas',
  'ocr',
  'ocr-recebimento',
  'ausencias',
  'logos',
  'relatorios',
  'mapas',
] as const;

export function getUploadsRoot(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads'));
}

export function getUploadsPath(...segments: string[]): string {
  return path.join(getUploadsRoot(), ...segments);
}

export function getUploadsStorageMode(): UploadsStorageMode {
  const raw = (process.env.UPLOADS_STORAGE_MODE ?? '').trim().toLowerCase();
  if (raw === 'local' || raw === 'railway-volume' || raw === 's3' || raw === 'ephemeral') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'ephemeral' : 'local';
}

export function isPersistentUploadsMode(mode = getUploadsStorageMode()): boolean {
  return mode === 'local' || mode === 'railway-volume' || mode === 's3';
}

export async function ensureUploadsDirectories(): Promise<void> {
  const root = getUploadsRoot();
  await Promise.all(
    UPLOAD_SUBDIRECTORIES.map(async (directory) => {
      await fs.mkdir(path.join(root, directory), { recursive: true });
    })
  );
}

export async function validateUploadsRuntime(): Promise<{
  root: string;
  mode: UploadsStorageMode;
  persistent: boolean;
  requirePersistent: boolean;
}> {
  const root = getUploadsRoot();
  const mode = getUploadsStorageMode();
  const persistent = isPersistentUploadsMode(mode);
  const requirePersistent = process.env.REQUIRE_PERSISTENT_UPLOADS === 'true';

  await ensureUploadsDirectories();
  await fs.access(root);

  if (requirePersistent && !persistent) {
    throw new Error(
      `Uploads persistentes sÃ£o obrigatÃ³rios, mas UPLOADS_STORAGE_MODE=${mode}. Configure um volume persistente e defina UPLOADS_STORAGE_MODE=railway-volume ou equivalente.`
    );
  }

  return { root, mode, persistent, requirePersistent };
}
