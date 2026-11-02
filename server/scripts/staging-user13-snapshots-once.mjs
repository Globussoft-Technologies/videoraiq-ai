// Standalone workaround. Run from ~/Backend on staging; no application deploy.
import 'dotenv/config';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const USER_ID = '13';
const EXPECTED_MACHINE = 'videoraiq-development-vnic';
const EXPECTED_STREAM_HOST = 'dev-stream.videoraiq.com';
let mongoose, redis, service;
let failures = 0;

async function captureLocally(url, token) {
  const playlist = await service.loadSnapshotPlaylist(url, token);
  const directory = await mkdtemp(path.join(tmpdir(), 'staging-snapshot-once-'));
  try {
    const resources = new Map();
    const localName = uri => {
      const target = new URL(uri);
      if (target.hostname !== EXPECTED_STREAM_HOST || target.protocol !== 'https:') throw new Error('Media URL is outside staging');
      if (!resources.has(uri)) {
        const ext = path.extname(target.pathname).toLowerCase();
        resources.set(uri, `media-${resources.size}${['.ts', '.mp4', '.m4s', '.aac', '.key'].includes(ext) ? ext : '.bin'}`);
      }
      return resources.get(uri);
    };
    const localPlaylist = playlist.split(/\r?\n/).map(line => {
      if (line.trim() && !line.startsWith('#')) return localName(line.trim());
      return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${localName(uri)}"`);
    }).join('\n');
    if (!resources.size || resources.size > 32) throw new Error('Invalid playlist resource count');
    const firstUrl = resources.keys().next().value;
    const directTs = !/#EXT-X-(?:KEY|MAP|BYTERANGE):/.test(playlist) && new URL(firstUrl).pathname.toLowerCase().endsWith('.ts');
    let transportStream;
    const { default: axios } = await import('axios');
    let size = 0;
    const limit = 32 * 1024 * 1024;
    const signal = AbortSignal.timeout(60000);
    for (const [uri, filename] of resources) {
      const response = await axios.get(uri, { responseType: 'arraybuffer', timeout: 15000, signal, maxContentLength: limit - size, maxRedirects: 0 });
      const bytes = Buffer.from(response.data);
      size += bytes.length;
      if (!bytes.length || size > limit) throw new Error('Empty or oversized media');
      if (directTs) { transportStream = bytes; break; }
      await writeFile(path.join(directory, filename), bytes);
    }
    const input = path.join(directory, 'snapshot.m3u8');
    await writeFile(input, localPlaylist);
    const { default: ffmpeg } = await import('ffmpeg-static');
    return await new Promise((resolve, reject) => {
      const child = spawn(process.env.FFMPEG_PATH || (process.platform === 'linux' ? 'ffmpeg' : ffmpeg) || 'ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error',
        '-threads', '1',
        ...(transportStream ? ['-f', 'mpegts', '-i', 'pipe:0'] : ['-protocol_whitelist', 'file,crypto', '-allowed_extensions', 'ALL', '-f', 'hls', '-i', input]),
        '-frames:v', '1', '-threads', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
      ], { stdio: [transportStream ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
      const chunks = [];
      let bytes = 0, stderr = '', failure;
      const timer = setTimeout(() => { failure = new Error('Local decode timed out'); child.kill('SIGKILL'); }, 20000);
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 15 * 1024 * 1024) { failure = new Error('JPEG exceeds size limit'); child.kill('SIGKILL'); }
        else chunks.push(chunk);
      });
      child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        if (failure || code !== 0 || !bytes) reject(failure || new Error(`Local FFmpeg exit ${code}, signal ${signal || 'none'}: ${service.snapshotFailureReason(new Error(stderr))}`));
        else resolve(Buffer.concat(chunks));
      });
      if (transportStream) {
        child.stdin.on('error', () => {});
        child.stdin.end(transportStream);
      }
    });
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
}

try {
  // Refuse other machines before importing application modules or connecting.
  if (hostname().split('.')[0] !== EXPECTED_MACHINE) throw new Error('Not the expected staging machine');
  if (process.env.NODE_ENV !== 'development') throw new Error('Run with NODE_ENV=development');
  const { default: config } = await import('config');
  if (new URL(config.get('RTSPStream.host')).hostname !== EXPECTED_STREAM_HOST) throw new Error('Not the expected staging stream host');
  ({ default: mongoose } = await import('mongoose'));
  await mongoose.connect(config.get('mongodb_uri'), { serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.name !== 'videora') throw new Error('Unexpected database name');
  ({ redis } = await import('../utils/database.js'));
  service = await import('../services/cameraSnapshots.service.js');
  const { default: Channel } = await import('../core/v1/channels/channels.model.js');
  const { default: NVR } = await import('../core/v1/NVR/nvr.model.js');
  const { default: Admin } = await import('../core/v1/admin/admin.model.js');
  const { resolveStream, buildRTSPUrl } = await import('../utils/rtspStream.js');
  const { putMediaV2, deleteMediaV2 } = await import('../core/v2/adminStorage/mediaStorage.v2.js');
  const admin = await Admin.findOne({ user_id: USER_ID }).select('_id').lean();
  if (!admin) throw new Error('Staging account 13 not found');
  const base = { userId: USER_ID, isAdded: true };
  let saved = 0, skipped = 0;
  const cameras = Channel.find(base).select('_id').lean().cursor();
  for await (const row of cameras) {
    const token = randomUUID();
    const now = new Date();
    const camera = await Channel.findOneAndUpdate({ ...base, _id: row._id, $or: [
      { snapshotLeaseUntil: { $exists: false } }, { snapshotLeaseUntil: { $lte: now } },
    ] }, { $set: { snapshotLeaseToken: token, snapshotLeaseUntil: new Date(+now + 600000) } }, { new: true }).select('+snapshotPendingDelete').lean();
    if (!camera) { skipped++; continue; }
    const owned = { ...base, _id: row._id, snapshotLeaseToken: token };
    let stage = 'resolve';
    try {
      const nvr = await NVR.findById(camera.nvrId).lean();
      const stream = await resolveStream(USER_ID);
      const url = service.snapshotStreamUrl(camera, nvr, stream);
      if (!url || new URL(url).hostname !== EXPECTED_STREAM_HOST) throw new Error('Camera does not use the expected staging stream host');
      stage = 'capture';
      let buffer;
      try { buffer = await captureLocally(url, service.createSnapshotPlaybackToken(USER_ID)); }
      catch (error) {
        const message = error.response?.data?.message || error.response?.data;
        const missing = error.response?.status === 404 && typeof message === 'string' && /camera not found in config/i.test(message);
        if (!missing || stream.appEnv !== 'cloud' || String(nvr?.userId) !== USER_ID) throw error;
        stage = 'registration';
        const channel = nvr.connectionMode === 'direct'
          ? await Channel.findOne({ _id: camera._id, userId: USER_ID }).select('+manualRtspUrl').lean()
          : camera;
        const rtspUrl = buildRTSPUrl(nvr, channel, 'main');
        const { default: axios } = await import('axios');
        const response = await axios.post(`${stream.host.replace(/\/+$/, '')}/api/add-camera`, {
          id: `${nvr._id}-${camera._id}`, rtsp_url: rtspUrl, generate: 'true',
        }, { headers: { Authorization: `Bearer ${stream.token}` }, timeout: 10000 });
        if (response.data?.status !== 'success') throw new Error('Camera registration was not confirmed');
        console.log('REGISTERED missing staging stream', camera.customName || camera.name, String(camera._id));
        stage = 'capture';
        buffer = await captureLocally(url, service.createSnapshotPlaybackToken(USER_ID));
      }
      const capturedAt = new Date();
      stage = 'upload';
      const mediaPath = await putMediaV2({ adminId: admin._id, buffer, mediaType: 'image', folderName: 'camera-snapshots', originalName: `${camera._id}.jpg` });
      stage = 'database';
      const updated = await Channel.updateOne(owned, {
        $set: { latestSnapshot: { path: mediaPath, capturedAt }, snapshotNextAttemptAt: new Date(Date.now() + 1800000) },
        ...(camera.latestSnapshot?.path ? { $addToSet: { snapshotPendingDelete: camera.latestSnapshot.path } } : {}),
      });
      if (!updated.matchedCount) { await deleteMediaV2(mediaPath); throw new Error('Camera lease changed; unused new image removed'); }
      saved++;
      console.log('SAVED', camera.customName || camera.name, String(camera._id), capturedAt.toISOString());
      // Only delete paths recorded on this camera, inside the snapshot folder.
      stage = 'cleanup';
      for (const old of new Set([...(camera.snapshotPendingDelete || []), camera.latestSnapshot?.path].filter(Boolean))) {
        if (old === mediaPath || !old.includes('/uploads/images/camera-snapshots/')) continue;
        try {
          await deleteMediaV2(old);
          await Channel.updateOne(owned, { $pull: { snapshotPendingDelete: old } });
        } catch { console.log('CLEANUP PENDING', String(camera._id)); }
      }
    } catch (error) {
      failures++;
      console.log('FAILED', camera.customName || camera.name, String(camera._id), stage, service.snapshotFailureReason(error));
    } finally {
      await Channel.updateOne({ _id: row._id, userId: USER_ID, snapshotLeaseToken: token }, { $unset: { snapshotLeaseUntil: 1, snapshotLeaseToken: 1 } });
    }
  }
  console.log(JSON.stringify({ userId: USER_ID, saved, failed: failures, skipped }));
} catch (error) {
  failures++;
  console.error('STOPPED:', service ? service.snapshotFailureReason(error) : error.name);
} finally {
  redis?.disconnect();
  await mongoose?.disconnect();
  process.exit(failures ? 1 : 0);
}
