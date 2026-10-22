/** Public figure URLs only — Cloudinary (or Nest /papers/figures/...) paths. */
export function uniqueFigureUrls(
  values: string[] | undefined | null,
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (
      !trimmed ||
      seen.has(trimmed) ||
      !(
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/papers/figures/')
      )
    ) {
      continue;
    }
    seen.add(trimmed);
    urls.push(trimmed);
    if (urls.length >= 8) {
      break;
    }
  }
  return urls;
}
