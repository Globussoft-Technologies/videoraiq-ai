import { randomBytes } from 'node:crypto';
import Admin from '../core/v1/admin/admin.model.js';
import logger from '../utils/logger.js';

const LEASE_MS = 120_000;
export async function acquireDetectionControlLease(adminId, kind) {
  const token = randomBytes(24).toString('hex');
  const owner = await Admin.findOneAndUpdate({ _id: adminId, $or: [
    { 'detectionControlLock.expiresAt': { $exists: false } },
    { 'detectionControlLock.expiresAt': { $lte: new Date() } },
  ] }, { $set: { detectionControlLock: { token, kind, expiresAt: new Date(Date.now() + LEASE_MS) } } });
  if (!owner) return null;
  const filter = { _id: adminId, 'detectionControlLock.token': token };
  const activeFilter = () => ({ ...filter, 'detectionControlLock.expiresAt': { $gt: new Date() } });
  const timer = setInterval(async () => {
    try {
      const result = await Admin.updateOne(activeFilter(), { $set: { 'detectionControlLock.expiresAt': new Date(Date.now() + LEASE_MS) } });
      if (!result.matchedCount) {
        clearInterval(timer);
        logger.warn(`Detection control lock expired or changed during ${kind} for admin ${adminId}`);
      }
    } catch (error) {
      logger.warn(`Detection control lock renewal failed during ${kind} for admin ${adminId}: ${error.message}`);
    }
  }, 15_000);
  timer.unref?.();
  return {
    token,
    async assertOwned() {
      if (!await Admin.exists(activeFilter())) {
        throw new Error('Bulk action was interrupted. Please retry the unfinished cameras.');
      }
    },
    async release() {
      clearInterval(timer);
      await Admin.updateOne(filter, { $unset: { detectionControlLock: 1 } });
    },
  };
}

