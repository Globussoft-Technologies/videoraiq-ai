import { zipSync } from 'fflate';
import { mediaUrl } from '@/lib/format';

const safeName = (value) => String(value || 'alert').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);

const extension = (type, url) => {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  const pathExtension = new URL(url, window.location.href).pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1];
  if (pathExtension) return pathExtension.toLowerCase() === 'jpeg' ? 'jpg' : pathExtension.toLowerCase();
  return 'jpg';
};

const getImage = async (row) => {
  const url = mediaUrl(row.image);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch snapshot ${row.id}.`);
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new Error(`Snapshot ${row.id} is not an image.`);
  return { blob, name: `${safeName(row.station.name)}_${safeName(row.id)}.${extension(blob.type, url)}` };
};

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function downloadSnapshot(row) {
  const { blob, name } = await getImage(row);
  saveBlob(blob, name);
}

export async function downloadSnapshotsZip(rows) {
  const images = rows.filter((row) => row.image);
  if (!images.length) return;
  const files = {};
  for (const row of images) {
    const { blob, name } = await getImage(row);
    files[name] = new Uint8Array(await blob.arrayBuffer());
  }
  const zip = zipSync(files, { level: 0 });
  saveBlob(new Blob([zip], { type: 'application/zip' }), 'solder-alert-snapshots.zip');
}
