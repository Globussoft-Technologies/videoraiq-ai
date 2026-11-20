import { agentApi } from './agentApi';

const imageLink = /^\/agent\/camera-inventory\/([a-f0-9]{32})\/images\/([a-f0-9]{24}(?:-[a-z0-9]{1,80})?\.jpg)$/i;
const cacheLifetime = 5 * 60_000;

export function inventoryImageFile(href, inventoryId) {
  const match = typeof href === 'string' && href.match(imageLink);
  return match?.[1] === inventoryId ? match[2] : undefined;
}

export function createInventoryImageLoader(inventoryId) {
  const images = new Map();
  const queue = [];
  let active = 0;
  let cachedBytes = 0;

  const remove = (file) => {
    cachedBytes -= images.get(file)?.bytes || 0;
    images.delete(file);
  };
  const drain = () => {
    while (active < 5 && queue.length) {
      active += 1;
      queue.shift()().finally(() => {
        active -= 1;
        drain();
      });
    }
  };

  return (file) => {
    const cached = images.get(file);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    remove(file);

    const entry = { bytes: 0, expiresAt: Infinity };
    entry.promise = new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          const blob = await agentApi.cameraInventoryImage(inventoryId, file);
          if (!blob?.size || blob.type !== 'image/jpeg') throw new Error('Invalid inventory image');
          entry.bytes = blob.size;
          entry.expiresAt = Date.now() + cacheLifetime;
          cachedBytes += entry.bytes;
          for (const [key, image] of images) {
            if (cachedBytes <= 24 * 1024 * 1024 && image.expiresAt > Date.now()) continue;
            if (image.bytes) remove(key);
          }
          resolve(blob);
        } catch (error) {
          if ([404, 410].includes(error.response?.status)) entry.expiresAt = Date.now() + cacheLifetime;
          else remove(file);
          reject(error);
        }
      });
    });
    images.set(file, entry);
    drain();
    return entry.promise;
  };
}
