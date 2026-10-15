import { zipSync } from 'fflate';
import { mediaUrl } from '@/lib/format';

const safeName = (value) => String(value || 'box-packing').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);

const getImage = async (row) => {
  const url = mediaUrl(row.Image || row.image || row.imageUrl || row.incidentImageUrl);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch snapshot ${row.boxId || row.id}.`);
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new Error(`Snapshot ${row.boxId || row.id} is not an image.`);
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob, name: `${safeName(row.boxId || row.id)}.${extension}` };
};

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function downloadBoxPackingSnapshotsZip(rows = []) {
  const images = rows.filter((row) => row.Image || row.image || row.imageUrl || row.incidentImageUrl);
  if (!images.length) return;
  const files = {};
  for (const row of images) {
    const { blob, name } = await getImage(row);
    files[name] = new Uint8Array(await blob.arrayBuffer());
  }
  saveBlob(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), 'box-packing-snapshots.zip');
}

export async function downloadBoxPackingSnapshot(row) {
  const { blob, name } = await getImage(row);
  saveBlob(blob, name);
}
