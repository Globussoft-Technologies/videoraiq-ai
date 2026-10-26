import { createHash, randomBytes } from 'node:crypto';
import Admin from '../core/v1/admin/admin.model.js';
import Channel from '../core/v1/channels/channels.model.js';
import { DetectionSetting } from '../core/v2/detectionSettings/detectionSettings.model.js';
import pythonService from './python.service.js';
import { resolveDesiredDetectionState } from './detectionSchedule.resolver.js';
import { assertCanEnableDetection } from '../core/v2/clientConfig/detectionLicense.service.js';
import Response from '../utils/response.js';
import logger from '../utils/logger.js';
import { DETECTION_TYPES } from '../constants/detectionTypes.js';
import { acquireDetectionControlLease } from './detectionControlLease.js';
import { assertDetectionServiceSuccess, detectionServiceErrorMessage } from './detectionServiceResult.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ownerFor = async req => {
  const user = req.verified?.userData;
  if (!user?.adminId || !user?.user_id || user.memberId) return null;
  return Admin.findOne({ _id: user.adminId, user_id: String(user.user_id) });
};

export async function getBulkDetectionState(req, res) {
  try {
    const owner = await ownerFor(req);
    if (!owner) return res.status(403).json(Response.accessDeniedResp('An admin account is required'));
    const cameras = await Channel.find({ userId: String(owner.user_id) })
      .setOptions({ includeInactive: true }).select('detectionBulkPaused').lean();
    const pausedCount = cameras.filter(camera => camera.detectionBulkPaused).length;
    let job = owner.detectionBulkJob;
    // An interrupted process cannot leave the account permanently busy. The
    // next status read exposes unfinished cameras for an explicit retry.
    if (job?.status === 'running' && (!owner.detectionControlLock?.expiresAt || new Date(owner.detectionControlLock.expiresAt) <= new Date())) {
      job = { ...job, status: 'failed', finishedAt: new Date().toISOString(),
        message: 'The bulk action was interrupted. Retry the unfinished cameras.',
        items: job.items.map(item => item.status === 'success' ? item : { ...item, status: 'failed', error: item.error || 'Action interrupted' }) };
      const result = await Admin.updateOne({ _id: owner._id, 'detectionBulkJob.id': job.id, 'detectionBulkJob.status': 'running',
        $or: [{ 'detectionControlLock.expiresAt': { $lte: new Date() } }, { 'detectionControlLock.expiresAt': { $exists: false } }],
      }, { $set: { detectionBulkJob: job } });
      if (!result.matchedCount) job = (await Admin.findById(owner._id).select('detectionBulkJob').lean())?.detectionBulkJob;
    }
    return res.json(Response.userSuccessResp('Bulk detection state', {
      paused: pausedCount > 0, pausedCount, cameraCount: cameras.length, job,
      nextAction: job?.status === 'failed' ? job.action : pausedCount ? 'resume' : 'pause',
    }));
  } catch {
    return res.status(500).json(Response.errorResp('Could not load bulk detection state'));
  }
}

export async function verifyResetPassword(req, res) {
  try {
    const owner = await ownerFor(req);
    if (!owner) return res.status(403).json(Response.accessDeniedResp('An admin account is required'));
    if (typeof req.body?.password !== 'string' || !req.body.password) {
      return res.status(400).json(Response.userFailResp('Enter your password'));
    }
    const { default: auth } = await import('../core/v2/Auth/auth.service.js');
    const bypass = auth._getBypassUser(owner.login, req.body.password);
    const account = bypass ? auth._buildBypassUserData(bypass)
      : await auth.fetchUserDataByName({ login: owner.login, pass: req.body.password });
    if (!account?.ok || String(account.user_id) !== String(owner.user_id)) {
      return res.status(403).json(Response.accessDeniedResp('Incorrect password'));
    }
    const token = randomBytes(32).toString('hex');
    owner.detectionResetApproval = { hash: hash(token), expiresAt: new Date(Date.now() + 5 * 60_000) };
    await owner.save();
    return res.json(Response.userSuccessResp('Password verified', { token }));
  } catch {
    return res.status(502).json(Response.errorResp('Password verification is unavailable. Please retry.'));
  }
}

export async function consumeResetApproval(req, res, next) {
  const user = req.verified?.userData;
  const token = req.body?.resetToken;
  if (!user?.adminId || user.memberId || typeof token !== 'string' || !token) {
    return res.status(403).json(Response.accessDeniedResp('Verify your password before continuing'));
  }
  try {
    const approved = await Admin.findOneAndUpdate({
      _id: user.adminId, user_id: String(user.user_id),
      'detectionResetApproval.hash': hash(token),
      'detectionResetApproval.expiresAt': { $gt: new Date() },
    }, { $unset: { detectionResetApproval: 1 } });
    if (!approved) return res.status(403).json(Response.accessDeniedResp('Password verification expired. Verify again.'));
    return next();
  } catch (error) { return next(error); }
}

// Each job is started by an explicit click. Only failed cameras enter the next
// pass; successful cameras and confirmed detector starts are not replayed.
async function runBulkJob(owner, job, lease) {
  let publishQueue = Promise.resolve();
  const publish = () => {
    job.completed = job.items.filter(item => item.status === 'success').length;
    const snapshot = JSON.parse(JSON.stringify(job));
    publishQueue = publishQueue.then(async () => {
      const result = await Admin.updateOne({ _id: owner._id,
        'detectionControlLock.token': lease.token, 'detectionBulkJob.id': job.id,
      }, { $set: { detectionBulkJob: snapshot } });
      if (!result.matchedCount) throw new Error('Bulk action ownership was lost');
    });
    return publishQueue;
  };
  try {
    // Protect every selected camera from scheduler work before the first DS
    // call. Pause intent and the original resume state survive failures.
    if (job.action === 'pause') {
      for (const item of job.items) {
        await lease.assertOwned();
        const camera = await Channel.findOne({ _id: item.cameraId, userId: String(owner.user_id) }).setOptions({ includeInactive: true });
        if (!camera) continue;
        if (!camera.detectionBulkPaused) {
          camera.detectionResumeTypes = Object.entries(camera.detections || {})
            .filter(([type, link]) => type !== 'faceAuthenticationSettings' && link?.id && link.enabled)
            .map(([type]) => type);
          camera.detectionBulkPaused = true;
          await camera.save();
        }
      }
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const pending = job.items.filter(item => item.status !== 'success');
      if (!pending.length) break;
      if (attempt > 1) await sleep(RETRY_DELAY_MS * (attempt - 1));
      await lease.assertOwned();
      job.attempt = attempt;
      await publish();
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const item = pending[cursor++];
          item.attempt = attempt;
          try {
            await lease.assertOwned();
            const camera = await Channel.findOne({ _id: item.cameraId, userId: String(owner.user_id) }).setOptions({ includeInactive: true });
            if (!camera) throw new Error('Camera was removed before the action completed');
            if (job.action === 'pause') {
              assertDetectionServiceSuccess(await pythonService.stopAdminPipelines(String(owner._id), 'detections', [item.cameraId]));
              for (const [type, link] of Object.entries(camera.detections || {})) {
                if (type !== 'faceAuthenticationSettings' && link?.id) link.enabled = false;
              }
            } else {
              const currentOwner = await Admin.findById(owner._id).select('streamsStopped').lean();
              if (!currentOwner || currentOwner.streamsStopped) throw new Error('An active subscription is required to resume');
              const view = camera.toObject();
              view.detectionBulkPaused = false;
              view.nvrId = { _id: camera.nvrId };
              for (const [type, link] of Object.entries(camera.detections || {})) {
                if (type === 'faceAuthenticationSettings' || !link?.id) continue;
                const desired = await resolveDesiredDetectionState(view, type);
                const scheduledEnable = desired.schedule ? desired.active : true;
                item.detectionName = DETECTION_TYPES[type] || type;
                const doc = await DetectionSetting.findOne({ _id: link.id, userId: String(owner.user_id) });
                if (!doc) throw new Error(`Saved setting was not found for ${type}`);
                const settings = doc.settings || {};
                const zones = settings.referencePoints?.[item.cameraId];
                const hasZones = Array.isArray(zones) ? zones.length > 0 : Boolean(zones && Object.keys(zones).length);
                if (!hasZones) continue;
                const enable = scheduledEnable;
                if (enable && link.enabled && item.completedTypes?.includes(type)) continue;
                if (enable) {
                  const verdict = await assertCanEnableDetection({ adminId: String(owner._id), userId: owner.user_id,
                    channelUserId: camera.userId, channelId: item.cameraId, settingType: type });
                  if (!verdict.ok) throw new Error(verdict.message || 'Detection license unavailable');
                } else if (!link.enabled) {
                  continue;
                }
                await lease.assertOwned();
                assertDetectionServiceSuccess(await pythonService.handleDetectionStartStop(view, String(owner._id), enable, type,
                  settings.referencePoints?.[item.cameraId] || [], settings.zone_configs || [],
                  settings.videoResolution || [], settings.obstruction_threshold_sec || 0,
                  settings.levelOfImportance, settings, settings, settings, lease.token));
                await lease.assertOwned();
                link.enabled = enable;
                camera.markModified('detections');
                await camera.save();
                if (enable) item.completedTypes = [...(item.completedTypes || []), type];
              }
              camera.detectionBulkPaused = false;
              camera.detectionResumeTypes = [];
            }
            await lease.assertOwned();
            camera.markModified('detections');
            await camera.save();
            item.status = 'success';
            item.error = null;
          } catch (error) {
            item.status = 'failed';
            item.error = detectionServiceErrorMessage(error);
            job.events.push({ id: `${item.cameraId}:${attempt}`, cameraId: item.cameraId,
              cameraName: item.cameraName, detectionName: item.detectionName, attempt, error: item.error, at: new Date().toISOString() });
            logger.error(`Bulk ${job.action}: camera=${item.cameraId} attempt=${attempt}/${MAX_ATTEMPTS}: ${item.error}`);
          }
          await publish();
        }
      };
      // Resume checks and commits licence usage serially; parallel checks could
      // claim the same last licence slot. Independent camera stops can fan out.
      const workers = await Promise.allSettled(Array.from({ length: Math.min(job.action === 'pause' ? 8 : 1, pending.length) }, worker));
      const rejected = workers.find(result => result.status === 'rejected');
      if (rejected) throw rejected.reason;
    }
    job.status = job.items.every(item => item.status === 'success') ? 'success' : 'failed';
    job.finishedAt = new Date().toISOString();
    await publish();
  } catch (error) {
    job.status = 'failed';
    job.message = detectionServiceErrorMessage(error);
    job.finishedAt = new Date().toISOString();
    for (const item of job.items) {
      if (item.status !== 'success') { item.status = 'failed'; item.error ||= job.message; }
    }
    // A rejected publish queue must not prevent reporting the terminal error.
    await publishQueue.catch(() => {});
    await Admin.updateOne({ _id: owner._id, 'detectionBulkJob.id': job.id,
      'detectionControlLock.token': lease.token }, { $set: { detectionBulkJob: job } }).catch(() => {});
    logger.error(`Bulk ${job.action} job ${job.id} failed: ${job.message}`);
  } finally {
    await lease.release().catch(error => logger.error(`Bulk lock release failed: ${error.message}`));
  }
}

export async function bulkDetectionControl(req, res) {
  let lease;
  try {
    const owner = await ownerFor(req);
    if (!owner) return res.status(403).json(Response.accessDeniedResp('An admin account is required'));
    const action = req.body?.action;
    if (req.body?.confirm !== true || !['pause', 'resume'].includes(action)) {
      return res.status(400).json(Response.userFailResp('Confirm pause or resume before continuing'));
    }
    if (action === 'resume' && owner.streamsStopped) return res.status(403).json(Response.accessDeniedResp('An active subscription is required to resume'));
    lease = await acquireDetectionControlLease(owner._id, action);
    if (!lease) return res.status(409).json(Response.userFailResp('Another detection action is running'));
    const freshOwner = await Admin.findById(owner._id);
    const previous = freshOwner.detectionBulkJob;
    const filter = { userId: String(owner.user_id) };
    if (previous?.status === 'failed' && previous.action === action) {
      filter._id = { $in: previous.items.filter(item => item.status !== 'success').map(item => item.cameraId) };
    }
    let cameras = await Channel.find(filter).setOptions({ includeInactive: true }).select('_id name customName detections detectionBulkPaused');
    if (action === 'resume') {
      const settingIds = cameras.flatMap(camera => Object.entries(camera.detections || {})
        .filter(([type, link]) => type !== 'faceAuthenticationSettings' && link?.id)
        .map(([, link]) => link.id));
      const settings = await DetectionSetting.find({ _id: { $in: settingIds }, userId: String(owner.user_id) }).select('settings').lean();
      const byId = new Map(settings.map(setting => [String(setting._id), setting]));
      cameras = cameras.filter(camera => camera.detectionBulkPaused || Object.entries(camera.detections || {}).some(([type, link]) => {
        if (type === 'faceAuthenticationSettings' || !link?.id) return false;
        const zones = byId.get(String(link.id))?.settings?.referencePoints?.[String(camera._id)];
        return Array.isArray(zones) ? zones.length > 0 : Boolean(zones && Object.keys(zones).length);
      }));
    }
    const job = { id: randomBytes(16).toString('hex'), action, status: 'running', attempt: 0,
      maxAttempts: MAX_ATTEMPTS, startedAt: new Date().toISOString(), completed: 0,
      total: cameras.length, events: [], items: cameras.map(camera => ({
        cameraId: String(camera._id), cameraName: camera.customName || camera.name || String(camera._id),
        status: 'pending', attempt: 0,
      })) };
    await lease.assertOwned();
    const saved = await Admin.updateOne({ _id: owner._id, 'detectionControlLock.token': lease.token }, { $set: { detectionBulkJob: job } });
    if (!saved.matchedCount) throw new Error('Bulk action ownership was lost');
    res.status(202).json(Response.userSuccessResp('Bulk detection action started', { job }));
    const jobLease = lease;
    lease = null;
    setImmediate(() => { void runBulkJob(freshOwner, job, jobLease); });
    return;
  } catch (error) {
    logger.error(`Could not start bulk detection action: ${error.message}`);
    return res.status(500).json(Response.errorResp('Could not start the bulk action. Please retry.'));
  } finally {
    if (lease) await lease.release().catch(() => {});
  }
}
