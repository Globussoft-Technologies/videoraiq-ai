// Only these read endpoints are cached. Management tables, streams, auth,
// attendance and reports continue to use their existing network behavior.
const READS = new Map([
  ['post /authorizedChannels/getNVRS', 'nvrs'],
  ['post /authorizedChannels/getChannels', 'cameras'],
  ['post /departments/get', 'departments'],
  ['post /authorizedChannels/departments', 'departments'],
  ['post /locations/employee-location', 'locations'],
  ['post /authorizedUsers/fetch-unique-locations', 'locations'],
  ['get /shifts/list', 'shifts'],
  ['get /shifts', 'shifts'], // paginated picker only; management reads opt out below
]);
export const DROPDOWN_DOMAINS = ['nvrs', 'cameras', 'departments', 'locations', 'shifts'];
export const DROPDOWN_LIMITS = Object.freeze({ entries: 64, bytes: 2 * 1024 * 1024,
  entryBytes: 128 * 1024, pending: 32, ttlMs: 60_000 });

function stable(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function successful(response) {
  if (response.status < 200 || response.status >= 300) return false;
  try {
    const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return body?.body?.status === 'success' && (!body.statusCode || body.statusCode < 300);
  } catch { return false; }
}
function header(config, name) {
  return config.headers?.get?.(name) ?? config.headers?.[name] ?? '';
}

// Independent of React, cookies and the transport so concurrency/limits can be
// tested without a browser or production services.
export function createDropdownCache({ now = Date.now, limits = DROPDOWN_LIMITS } = {}) {
  const entries = new Map();
  const pending = new Map();
  const listeners = new Set();
  const revisions = Object.fromEntries(DROPDOWN_DOMAINS.map(domain => [domain, 0]));
  let bytes = 0;
  let scope = '';
  let epoch = 0;
  function remove(key) {
    const entry = entries.get(key);
    if (entry) { bytes -= entry.bytes; entries.delete(key); }
  }
  function invalidate(domains = DROPDOWN_DOMAINS, notify = true) {
    domains = domains.filter(domain => domain in revisions);
    for (const domain of domains) revisions[domain]++;
    for (const [key, entry] of entries) if (domains.includes(entry.domain)) remove(key);
    // Detached promises still settle for their original callers, but cannot
    // populate this generation or delete a newer pending request.
    for (const [key, item] of pending) if (domains.includes(item.domain)) pending.delete(key);
    if (notify && domains.length) for (const listener of listeners) listener(domains);
  }
  function clear(notify = true) { epoch++; invalidate(DROPDOWN_DOMAINS, notify); }
  function prune() {
    for (const [key, entry] of entries) if (entry.expires <= now()) remove(key);
  }
  function snapshot(response) {
    return { status: response.status, statusText: response.statusText,
      headers: { ...response.headers }, data: typeof response.data === 'string'
        ? response.data : JSON.stringify(response.data) };
  }
  async function read({ key, domain, identity, config, load }) {
    if (!identity) return load(config);
    if (identity !== scope) { scope = identity; clear(false); }
    prune();
    const entry = entries.get(key);
    if (entry) {
      entries.delete(key); entries.set(key, entry); // LRU, bounded to 64 entries.
      return { ...entry.response, headers: { ...entry.response.headers }, config };
    }
    const existing = pending.get(key);
    if (existing) {
      const response = await existing.promise;
      return { ...response, headers: { ...response.headers }, config };
    }
    const trackPending = pending.size < limits.pending;
    const item = { domain };
    item.promise = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const version = revisions[domain];
        const generation = epoch;
        const response = await load(config);
        // Never give an old account's response to a newly mounted consumer.
        if (scope !== identity || generation !== epoch) throw new Error('Dropdown request scope changed');
        if (version !== revisions[domain]) continue;
        const result = snapshot(response);
        if (successful(response)) {
          const size = 2 * (result.data.length + key.length + JSON.stringify(result.headers).length + (result.statusText || '').length);
          if (size <= limits.entryBytes) {
            while (entries.size && (entries.size >= limits.entries || bytes + size > limits.bytes)) {
              remove(entries.keys().next().value);
            }
            if (size <= limits.bytes) {
              entries.set(key, { domain, response: result, bytes: size, expires: now() + limits.ttlMs });
              bytes += size;
            }
          }
        }
        return result;
      }
      throw new Error('Dropdown changed repeatedly during loading; please retry');
    })();
    if (trackPending) pending.set(key, item);
    try {
      const response = await item.promise;
      return { ...response, headers: { ...response.headers }, config };
    } finally { if (pending.get(key) === item) pending.delete(key); }
  }
  return { read, invalidate, clear,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    stats() { prune(); return { entries: entries.size, bytes, pending: pending.size }; },
  };
}

export const dropdownCache = createDropdownCache();

export function mutationDomains(method, path) {
  if (method === 'get' && path === '/nvr/delete-all') return ['nvrs', 'cameras'];
  if (['get', 'head', 'options'].includes(method) || READS.has(`${method} ${path}`)) return [];
  if (/^\/(users|roles|permissions|authorizedChannels)(\/|$)/.test(path)) {
    if (/\/(fetch|locations|departments|user-permissions)$/.test(path)) return [];
    return DROPDOWN_DOMAINS;
  }
  if (/^\/nvr(\/|$)/.test(path)) return ['nvrs', 'cameras'];
  if (/^\/channel(\/|$)/.test(path)) {
    if (/playback|playBack/.test(path)) return [];
    return ['cameras', 'nvrs'];
  }
  if (/^\/departments\/(create|update|delete)$/.test(path)) return ['departments', 'cameras'];
  if (/^\/locations\/(create|update|delete)$/.test(path)) return ['locations'];
  if (/^\/authorizedUsers\/(create|update|delete|delete-all|bulk-import|status|tag-user)$/.test(path)) return ['locations', 'departments', 'shifts'];
  if (/^\/shifts(\/|$)/.test(path) && !/\/(preview|schedule)$/.test(path)) return ['shifts'];
  return [];
}

const installed = new WeakSet();
export function installDropdownCache(axios, instance, backendURL, { onInvalidate = () => {} } = {}) {
  if (installed.has(instance) || !backendURL) return;
  installed.add(instance);
  instance.interceptors.request.use(config => {
    const adapter = axios.getAdapter(config.adapter?.dropdownTransport || config.adapter || instance.defaults.adapter);
    config.adapter = async finalConfig => {
      let url, base, path, key, domain;
      const method = (finalConfig.method || 'get').toLowerCase();
      try {
        const origin = globalThis.location?.origin || 'http://localhost';
        base = new URL(backendURL, origin);
        url = new URL(instance.getUri(finalConfig), origin);
        const root = base.pathname.replace(/\/$/, '');
        if (url.origin !== base.origin || !url.pathname.startsWith(`${root}/`)) return adapter(finalConfig);
        path = url.pathname.slice(root.length).replace(/\/$/, '') || '/';
        domain = READS.get(`${method} ${path}`);
        url.searchParams.sort();
        // Do not parse/stringify upload, video or unrelated API payloads.
        // Even allowlisted metadata requests with huge filters bypass caching.
        if (domain) {
          let data = finalConfig.data || '';
          if (url.href.length > 8192 || (typeof data === 'string' && data.length > 8192)) {
            domain = undefined;
          } else {
            if (typeof data === 'string' && data) data = stable(JSON.parse(data));
            key = JSON.stringify([url.href, method, data, finalConfig.responseType || 'json']);
          }
        }
      } catch { return adapter(finalConfig); }
      const changes = mutationDomains(method, path);
      const bypass = finalConfig.dropdownCache === false || finalConfig.signal || finalConfig.cancelToken || finalConfig.timeout > 0 ||
        (path === '/shifts' && finalConfig.dropdownCache !== true) ||
        /no-cache|no-store/i.test(header(finalConfig, 'Cache-Control')) || (key && key.length > 8192) ||
        (finalConfig.responseType && finalConfig.responseType !== 'json');
      const load = async requestConfig => {
        const response = await adapter(requestConfig);
        try {
          if (changes.length && successful(response)) {
            dropdownCache.invalidate(changes);
            onInvalidate(changes);
          }
        } catch { /* Invalidation cannot turn a successful mutation into an error. */ }
        return response;
      };
      if (!domain || bypass) return load(finalConfig);
      const identity = header(finalConfig, 'x-access-token') || header(finalConfig, 'Authorization');
      return dropdownCache.read({ key, domain, identity, config: finalConfig, load });
    };
    config.adapter.dropdownTransport = adapter;
    return config;
  });
}
