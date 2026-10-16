import { packingMediaUrls } from './packingMedia.js';

const cache = new Map();
const thumbnail = (image) => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, 900 / width, 600 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
};

export async function readPackingPdfImage(url, snapshot = false, { deadline = Date.now() + 4000 } = {}) {
  if (!url || Date.now() >= deadline) return null;
  const key = `${snapshot}:${url}`;
  if (cache.has(key)) return cache.get(key);
  const urls = snapshot ? packingMediaUrls(url) : { link: url, fetchUrl: url };
  const targets = [...new Set([urls.fetchUrl, urls.link])];
  const remember = (data) => {
    if (data) {
      if (cache.size >= 48) cache.delete(cache.keys().next().value);
      cache.set(key, data);
    }
    return data;
  };
  if (snapshot && typeof document !== 'undefined') {
    for (const image of document.images) {
      if (!image.complete || !image.naturalWidth) continue;
      if (!targets.some((target) => new URL(target, window.location.origin).href === image.src)) continue;
      try { return remember(thumbnail(image)); } catch { /* Cross-origin canvas: use the API proxy. */ }
    }
  }
  for (let i = 0; i < targets.length && Date.now() < deadline; i += 1) {
    const controller = new AbortController();
    // Leave time for the fallback URL if the proxy stalls.
    const remaining = deadline - Date.now();
    const timeout = Math.max(1, Math.min(2500, remaining / (targets.length - i)));
    let bitmap;
    let timer;
    try {
      const result = await Promise.race([
        (async () => {
          const response = await fetch(targets[i], { signal: controller.signal });
          if (!response.ok) return null;
          const blob = await response.blob();
          if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') return null;
          if (snapshot && typeof createImageBitmap === 'function') {
            bitmap = await createImageBitmap(blob);
            if (controller.signal.aborted) { bitmap.close(); return null; }
            return thumbnail(bitmap);
          }
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            controller.signal.addEventListener('abort', () => { reader.abort(); resolve(null); }, { once: true });
            reader.readAsDataURL(blob);
          });
        })(),
        new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeout); }),
      ]);
      if (result) return remember(result);
    } catch { /* Missing/blocked images must not prevent the report download. */ }
    finally { clearTimeout(timer); bitmap?.close(); }
  }
  return null;
}

// Preserve row order, deduplicate repeated images and keep network/CPU work bounded.
export async function loadPackingPdfImages(urls, { concurrency = 4, budgetMs = 10000, read = readPackingPdfImage } = {}) {
  const deadline = Date.now() + budgetMs;
  const unique = [...new Set(urls.filter(Boolean))];
  const images = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (next < unique.length && Date.now() < deadline) {
      const url = unique[next++];
      try { images.set(url, await read(url, true, { deadline: Math.min(deadline, Date.now() + 4000) })); }
      catch { images.set(url, null); }
    }
  }));
  return urls.map((url) => images.get(url) || null);
}
