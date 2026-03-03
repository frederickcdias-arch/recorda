export function debugImport(...args: unknown[]) {
  if (process.env.RECORDA_IMPORT_DEBUG === '1') {
    // Prefix to make logs searchable in production logs
    console.debug('[import-debug]', ...args);
  }
}
