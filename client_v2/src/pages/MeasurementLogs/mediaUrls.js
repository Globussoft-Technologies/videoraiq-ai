// API-owned images must use the same public host and proxy prefix as requests.
// Stored URLs may still refer to an old station address or localhost.
export function measurementMediaUrl(value, backend, origin = globalThis.location?.origin) {
  const source = typeof value === 'string' ? value.trim() : '';
  const base = String(backend || '').trim().replace(/\/+$/, '');
  if (!source || !base) return source;

  try {
    const url = new URL(source, 'https://measurement.invalid');
    if (!/^https?:$/.test(url.protocol)) return source;
    const match = url.pathname.match(/\/api\/v2(?=\/(?:measurements\/captures|uploads)(?:\/|$))/i);
    // External storage/CDN links are already complete and may be signed.
    if (!match) return source;
    const path = url.pathname.slice(match.index + match[0].length);
    const target = `${base}${path}${url.search}${url.hash}`;
    return origin ? new URL(target, origin).href : target;
  } catch {
    return source;
  }
}

export function measurementRecordMediaUrls(record, backend, origin) {
  return {
    ...record,
    shot: measurementMediaUrl(record.shot, backend, origin),
    shotUrl: measurementMediaUrl(record.shotUrl, backend, origin),
    qrImageUrl: measurementMediaUrl(record.qrImageUrl, backend, origin),
    measurementImageUrl: measurementMediaUrl(record.measurementImageUrl, backend, origin),
  };
}
