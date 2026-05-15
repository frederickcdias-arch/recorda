import fs from 'node:fs/promises';
import path from 'node:path';
import { processDocumentImage } from '../src/infrastructure/services/document-image-processor.js';

interface CliOptions {
  inputDir: string;
  outputDir: string;
  limit?: number;
  mode: 'map_document' | 'color_document' | 'text_document';
}

interface EvaluationRow {
  file: string;
  outputFile: string;
  success: boolean;
  engine: string;
  confidence: number;
  fallback: boolean;
  documentClass?: string;
  decision?: string;
  warnings?: string[];
  width: number;
  height: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith('--') && value && !value.startsWith('--')) {
      args.set(key, value);
      i += 1;
    }
  }

  const inputDir = args.get('--input-dir');
  const outputDir = args.get('--output-dir');
  if (!inputDir || !outputDir) {
    throw new Error(
      'Uso: tsx scripts/evaluate-document-pipeline.ts --input-dir <dir> --output-dir <dir> [--mode map_document] [--limit 20]'
    );
  }

  const modeArg = args.get('--mode');
  const mode =
    modeArg === 'text_document' || modeArg === 'color_document' || modeArg === 'map_document'
      ? modeArg
      : 'map_document';
  const limitRaw = args.get('--limit');
  const limit = limitRaw ? Math.max(1, Number(limitRaw)) : undefined;

  return { inputDir: path.resolve(inputDir), outputDir: path.resolve(outputDir), limit, mode };
}

function mimeTypeFromExt(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outputDir, { recursive: true });

  const entries = await fs.readdir(options.inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(options.inputDir, entry.name))
    .filter((filePath) => mimeTypeFromExt(filePath))
    .slice(0, options.limit);

  const rows: EvaluationRow[] = [];

  for (const filePath of files) {
    const mimeType = mimeTypeFromExt(filePath);
    if (!mimeType) continue;
    const inputBuffer = await fs.readFile(filePath);
    const baseName = path.parse(filePath).name;
    const outputFile = path.join(options.outputDir, `${baseName}-processed.jpg`);
    try {
      const result = await processDocumentImage({
        imageBuffer: inputBuffer,
        mimeType,
        options: {
          processingMode: options.mode,
          preserveColors: true,
          outputFormat: 'jpeg',
          quality: 92,
        },
      });
      await fs.writeFile(outputFile, result.processedBuffer);
      rows.push({
        file: path.basename(filePath),
        outputFile: path.basename(outputFile),
        success: true,
        engine: result.metadata.engine,
        confidence: result.metadata.confidence,
        fallback: result.metadata.fallback,
        documentClass: result.metadata.documentClass,
        decision: result.metadata.decision,
        warnings: result.metadata.warnings,
        width: result.metadata.width,
        height: result.metadata.height,
      });
    } catch (error) {
      rows.push({
        file: path.basename(filePath),
        outputFile: path.basename(outputFile),
        success: false,
        engine: 'erro',
        confidence: 0,
        fallback: true,
        warnings: [error instanceof Error ? error.message : 'Erro desconhecido'],
        width: 0,
        height: 0,
      });
    }
  }

  const summaryPath = path.join(options.outputDir, 'evaluation-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({ mode: options.mode, rows }, null, 2));

  const totals = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.success) acc.success += 1;
      if (row.fallback) acc.fallback += 1;
      if (row.decision === 'manual_review_recommended') acc.review += 1;
      return acc;
    },
    { total: 0, success: 0, fallback: 0, review: 0 }
  );

  console.log(JSON.stringify({ ...totals, summaryPath }, null, 2));
}

void main();
