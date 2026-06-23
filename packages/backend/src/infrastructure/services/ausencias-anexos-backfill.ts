import { saveAusenciaAnexo, serveAusenciaAnexo } from './file-storage.js';

export interface BackfillAusenciasAnexosResult {
  total: number;
  updated: number;
  skipped: number;
  errors: Array<{ id: string; motivo: string }>;
}

export interface BackfillAusenciasAnexosDb {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface BackfillRow {
  id: string;
  documento_anexo: string;
}

export async function backfillAusenciasAnexos(
  db: BackfillAusenciasAnexosDb,
  options: { log?: (line: string) => void } = {}
): Promise<BackfillAusenciasAnexosResult> {
  const log = options.log ?? (() => {});
  const result = await db.query<BackfillRow>(`
    SELECT id, documento_anexo
    FROM ausencias
    WHERE documento_anexo IS NOT NULL
      AND documento_anexo <> ''
      AND documento_anexo NOT ILIKE 'data:%'
    ORDER BY criado_em ASC
  `);

  let updated = 0;
  let skipped = 0;
  const errors: Array<{ id: string; motivo: string }> = [];

  for (const row of result.rows) {
    try {
      const { buffer, mimeType, filename } = await serveAusenciaAnexo(row.documento_anexo);
      const dataUrl = await saveAusenciaAnexo({ filename, mimetype: mimeType, buffer });
      await db.query('UPDATE ausencias SET documento_anexo = $1 WHERE id = $2', [dataUrl, row.id]);
      updated += 1;
      log(`[OK] ${row.id} -> data URL`);
    } catch (error) {
      skipped += 1;
      const motivo = error instanceof Error ? error.message : String(error);
      errors.push({ id: row.id, motivo });
      log(`[SKIP] ${row.id} -> ${motivo}`);
    }
  }

  return {
    total: result.rows.length,
    updated,
    skipped,
    errors,
  };
}
