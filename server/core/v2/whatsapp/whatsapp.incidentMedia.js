import config from 'config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import Admin from '../admin/admin.model.js';
import { Incident } from '../incidents/incidents.model.js';
import { streamMediaV2 } from '../adminStorage/mediaStorage.v2.js';
import { parseV2StoragePath } from '../adminStorage/adminStorage.resolver.js';

const TTL = 7 * 24 * 60 * 60;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const origin = () => new URL(config.get('ImageView')).origin;
const signatureFor = (id, adminId, expires, image) => createHmac('sha256', config.get('jwt.secretKey'))
  .update(JSON.stringify(['whatsapp-image-v1', String(id), String(adminId), String(expires), image])).digest('hex');

// Resolve only an incident owned by this sender account. No arbitrary paths or
// remote URLs from the caller are fetched with backend privileges.
async function ownedImage(incidentId, adminId) {
  if (!mongoose.isValidObjectId(incidentId) || !mongoose.isValidObjectId(adminId)) throw new Error('Invalid incident image reference');
  const [incident, admin] = await Promise.all([
    Incident.findById(incidentId).select('Image userId').lean(),
    Admin.findById(adminId).select('user_id').lean(),
  ]);
  if (!admin || !incident?.Image || String(incident.userId) !== String(admin.user_id)) throw new Error('Incident image is unavailable for this account');
  let image = String(incident.Image);
  if (/^https?:\/\//i.test(image)) {
    const url = new URL(image);
    if (url.origin !== origin() || url.username || url.password) throw new Error('Incident image is outside configured media storage');
    const match = /^\/api\/v[12]\/uploads\/(.+)$/.exec(url.pathname);
    if (!match) throw new Error('Unsupported incident image URL');
    image = decodeURIComponent(match[1]);
  }
  if (/[\x00\\?#]/.test(image) || image.split('/').includes('..')) throw new Error('Invalid incident image path');
  const owner = parseV2StoragePath(image)?.adminId;
  if (/^\/?v2\//.test(image) && !owner) throw new Error('Invalid versioned media path');
  if (owner && owner !== String(adminId)) throw new Error('Incident image storage belongs to another account');
  return { image, incident };
}

export async function prepareIncidentImage(incidentId, adminId) {
  const { image } = await ownedImage(incidentId, adminId);
  const chunks = [];
  let size = 0;
  const output = new Writable({ write(chunk, encoding, next) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) return next(new Error('WhatsApp incident image exceeds 5 MB'));
    chunks.push(Buffer.from(chunk)); next();
  } });
  // Storage streams set response metadata; this collector needs only the bytes.
  output.setHeader = () => {};
  output.headersSent = true;
  const deadline = AbortSignal.timeout(20000);
  await streamMediaV2(image, output, { signal: deadline });
  const buffer = Buffer.concat(chunks);
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw new Error('Incident snapshot is not a JPEG or PNG image');
  const expires = String(Math.floor(Date.now() / 1000) + TTL);
  const signature = signatureFor(incidentId, adminId, expires, image);
  const url = new URL(`/api/v2/whatsapp/incident-image/${incidentId}`, origin());
  url.search = new URLSearchParams({ adminId: String(adminId), expires, signature }).toString();
  return { buffer, mimetype: jpeg ? 'image/jpeg' : 'image/png', url: url.href };
}

export async function serveIncidentImage(req, res) {
  try {
    const { adminId, expires, signature } = req.query;
    const expiry = Number(expires);
    if (typeof expires !== 'string' || !/^\d+$/.test(expires) || !Number.isSafeInteger(expiry)
      || expiry < Math.floor(Date.now() / 1000) || expiry > Math.floor(Date.now() / 1000) + TTL
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return res.sendStatus(403);
    const { image } = await ownedImage(req.params.incidentId, adminId);
    const expected = Buffer.from(signatureFor(req.params.incidentId, adminId, expires, image));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.sendStatus(403);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type(/\.png$/i.test(image) ? 'image/png' : 'image/jpeg');
    const abort = new AbortController();
    const cancel = () => { if (!res.writableEnded) abort.abort(); };
    res.once('close', cancel);
    const timer = setTimeout(() => abort.abort(), 20000);
    try { await streamMediaV2(image, res, { signal: abort.signal }); }
    finally { clearTimeout(timer); res.off('close', cancel); }
  } catch {
    if (!res.headersSent) res.sendStatus(404);
    else res.destroy();
  }
}
