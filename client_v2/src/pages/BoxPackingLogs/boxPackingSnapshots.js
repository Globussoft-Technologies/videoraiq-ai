import { zipSync } from 'fflate';
import { mediaUrl } from '@/lib/format';

const safeName = (value) => String(value || 'box-packing').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
const imagePath = (row) => row.Image || row.image || row.imageUrl || row.incidentImageUrl;

const extensionFromUrl = (url) => {
  const match = new URL(url, window.location.href).pathname.match(/\.(png|jpe?g|webp|gif|avif)$/i)?.[1];
  if (!match) return 'jpg';
  return match.toLowerCase() === 'jpeg' ? 'jpg' : match.toLowerCase();
};

const imageName = (row, url) => `${safeName(row.boxId || row.id)}.${extensionFromUrl(url)}`;

const browserMediaUrl = (url) => {
  const backend = String(import.meta.env.VITE_BACKEND || '').trim();
  if (!backend.startsWith('/') || !/^https?:/i.test(url)) return url;
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/^\/api\/v2(?=\/|$)/, '');
  return `${backend.replace(/\/$/, '')}${path}${parsed.search}`;
};

const getImage = async (row) => {
  const url = mediaUrl(imagePath(row));
  const response = await fetch(browserMediaUrl(url));
  if (!response.ok) throw new Error(`Could not fetch snapshot ${row.boxId || row.id}.`);
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new Error(`Snapshot ${row.boxId || row.id} is not an image.`);
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : extensionFromUrl(url);
  return { blob, name: `${safeName(row.boxId || row.id)}.${extension}` };
};

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function downloadBoxPackingSnapshotsZip(rows = [], onProgress) {
  const images = rows.filter((row) => row.Image || row.image || row.imageUrl || row.incidentImageUrl);
  if (!images.length) return;
  const reportProgress = typeof onProgress === 'function' ? onProgress : () => {};
  reportProgress(0);
  // Box IDs repeat between cameras. A page can contain several W1-0008
  // records, so give every selected snapshot its own ZIP entry.
  const zipEntries = images.map((row, index) => {
    const path = imagePath(row);
    const url = mediaUrl(path);
    const name = `${String(index + 1).padStart(3, '0')}-${imageName(row, url)}`;
    return { row, path, name };
  });
  // The ZIP endpoint accepts at most 100 files. Older running servers may also
  // fail while constructing an archive, so assemble one locally when needed.
  if (!onProgress && zipEntries.length <= 100) {
    const apiBase = String(import.meta.env.VITE_BACKEND || '/production-api').replace(/\/$/, '');
    try {
      const response = await fetch(`${apiBase}/uploads/zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: zipEntries.map(({ path, name }) => ({ path, name })) }),
      });
      if (response.ok) {
        saveBlob(await response.blob(), 'box-packing-snapshots.zip');
        return;
      }
    } catch {
      // The individual snapshot URLs can still be available when ZIP is not.
    }
  }

  const files = {};
  for (const [index, entry] of zipEntries.entries()) {
    const { blob, name } = await getImage(entry.row);
    const extension = name.slice(name.lastIndexOf('.'));
    const zipName = entry.name.replace(/\.[^.]+$/, extension);
    files[zipName] = new Uint8Array(await blob.arrayBuffer());
    reportProgress(((index + 1) / zipEntries.length) * 95);
  }
  reportProgress(98);
  saveBlob(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), 'box-packing-snapshots.zip');
  reportProgress(100);
}

export async function downloadBoxPackingSnapshot(row) {
  const url = mediaUrl(imagePath(row));
  if (!url) return;
  const name = imageName(row, url);
  const separator = url.includes('?') ? '&' : '?';
  const link = document.createElement('a');
  link.href = `${url}${separator}download=${encodeURIComponent(name)}`;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
