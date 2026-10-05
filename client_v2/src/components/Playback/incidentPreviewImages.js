/** Playback-only fallbacks for the existing incident media GET routes. */
export function incidentPreviewImageUrls(path, { primaryUrl = '', incidentBase = '', backendBase = '' } = {}) {
  const imagePath = typeof path === 'string' ? path.trim() : '';
  if (!imagePath) return [];
  // Preserve external/signed URLs and browser-created images as supplied.
  if (/^(data:|blob:)/i.test(imagePath)) return [imagePath];
  if (/^(https?:)?\/\//i.test(imagePath)) {
    // A stored absolute URL can also point at the configured media host.
    // Only retry our own uploads API for that host, never for signed/provider URLs.
    try {
      const base = new URL(incidentBase);
      const image = new URL(imagePath, base);
      const prefix = `${base.pathname.replace(/\/+$/, '')}/`;
      if (backendBase && image.origin === base.origin && image.pathname.startsWith(prefix) && !image.search && !image.hash) {
        const fallback = `${backendBase.replace(/\/+$/, '')}/uploads/${image.pathname.slice(prefix.length)}`;
        return [...new Set([imagePath, fallback])];
      }
    } catch { /* A missing media base must not affect a supplied absolute URL. */ }
    return [imagePath];
  }

  const relativePath = imagePath.replace(/^\/+/, '');
  const mediaPath = relativePath.replace(/^api\/v\d+\/uploads\//i, '');
  const join = (base, value) => `${base.replace(/\/+$/, '')}/${value}`;
  return [...new Set([
    primaryUrl || (incidentBase ? `${incidentBase}${imagePath}` : imagePath),
    incidentBase && join(incidentBase, mediaPath),
    backendBase && join(`${backendBase.replace(/\/+$/, '')}/uploads`, mediaPath),
  ].filter(Boolean))];
}
