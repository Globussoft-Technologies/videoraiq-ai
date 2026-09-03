const KEY = 'videoraiq.liveDemo.active';

export function readLiveDemoSession(storage = sessionStorage) {
  try {
    return JSON.parse(storage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function updateLiveDemoSession(patch, storage = sessionStorage) {
  const current = readLiveDemoSession(storage) || {};
  storage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
}

export function clearLiveDemoSession(storage = sessionStorage) {
  storage.removeItem(KEY);
}
