// Export hyperlinks must work outside the app; image reads can use the local
// API proxy so the browser does not require cross-origin image access.
export function resolvePackingMedia(path, { incidentBase = '', backendBase = '', origin = '' } = {}) {
  if (!path) return { link: '', fetchUrl: '' };
  if (/^data:/i.test(path)) return { link: path, fetchUrl: path };
  const absolute = /^(https?:)?\/\//i.test(path);
  const joined = absolute ? path : incidentBase
    ? incidentBase.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '') : path;
  const url = new URL(joined, origin || undefined);
  const link = url.href;
  const backend = String(backendBase).replace(/\/$/, '');
  // Proxy only the configured media service, never an unrelated image host.
  const mediaOrigin = incidentBase ? new URL(incidentBase, origin || undefined).origin : url.origin;
  const fetchUrl = backend.startsWith('/') && url.origin === mediaOrigin
    && /^\/api\/v2\//.test(url.pathname)
    ? backend + url.pathname.replace(/^\/api\/v2/, '') + url.search
    : link;
  return { link, fetchUrl };
}

export const packingMediaUrls = (path) => resolvePackingMedia(path, {
  incidentBase: import.meta.env?.VITE_INCIDENT_URL || '',
  backendBase: import.meta.env?.VITE_BACKEND || '',
  origin: typeof window !== 'undefined' ? window.location.origin : '',
});
