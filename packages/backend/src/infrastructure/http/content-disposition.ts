function sanitizeAsciiFilename(filename: string): string {
  const normalized = filename.normalize('NFKD');
  const ascii = normalized.replace(/[^\x20-\x7E]/g, '');
  const safe = ascii.replace(/["\\]/g, '_').trim();
  return safe.length > 0 ? safe : 'anexo';
}

export function buildContentDisposition(
  disposition: 'inline' | 'attachment',
  filename: string
): string {
  const fallback = sanitizeAsciiFilename(filename);
  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
