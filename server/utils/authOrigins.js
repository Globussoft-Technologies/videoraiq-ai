import config from 'config';

// Explicit origins are required for credentialed cross-origin browser auth.
export function configuredAuthOrigins() {
  const origins = (process.env.AUTH_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const configured = config.has('auth.allowedOrigins') ? config.get('auth.allowedOrigins') : [];
  if (Array.isArray(configured)) {
    for (const value of configured) {
      if (typeof value !== 'string' || !value.trim()) continue;
      try { origins.push(new URL(value.trim()).origin); } catch { /* Ignore invalid optional URLs. */ }
    }
  }
  for (const key of ['frontend.baseUrl', 'webUrl']) {
    if (config.has(key)) {
      try { origins.push(new URL(config.get(key)).origin); } catch { /* Ignore invalid optional URLs. */ }
    }
  }
  return [...new Set(origins)];
}

export function authOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return !req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin';
  return configuredAuthOrigins().includes(origin) || origin === `${req.protocol}://${req.get('host')}`;
}
