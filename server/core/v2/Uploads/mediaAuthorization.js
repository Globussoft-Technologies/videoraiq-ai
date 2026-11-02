import { Incident } from "../incidents/incidents.model.js";
import { parseV2StoragePath } from "../adminStorage/adminStorage.resolver.js";

export async function canReadMedia(req, mediaPath) {
  const user = req.verified?.userData || {};
  if (!user.adminId || typeof mediaPath !== "string" || !mediaPath.trim()
    || mediaPath.includes("..") || /[\x00\\]/.test(mediaPath)) return false;
  const encodedOwner = parseV2StoragePath(mediaPath)?.adminId;
  if (encodedOwner && encodedOwner !== String(user.adminId)) return false;
  if (!user.memberId && encodedOwner) return true;
  // Legacy paths contain no trustworthy tenant identity. Resolve them through
  // an incident; members must additionally own camera scope for that incident.
  const userId = user.user_id || user.userId;
  if (!userId) return false;
  const filter = { userId: String(userId), $or: [{ Image: mediaPath }, { videoLink: mediaPath }] };
  if (user.memberId) filter.channelId = { $in: req.verified?.authorizedChannel?.channels || [] };
  return Boolean(await Incident.exists(filter));
}

export async function authorizeMediaRead(req, res, next) {
  try {
    const paths = req.method === "POST" ? req.body?.files?.map((file) => file?.path) : [req.params.mediaPath];
    if (!Array.isArray(paths) || !paths.length || paths.length > 100) {
      return res.status(400).json({ statusCode: 400, body: { status: "failed", errorCode: "INVALID_MEDIA_REQUEST", message: "Provide between 1 and 100 media paths." } });
    }
    for (const mediaPath of paths) {
      let timer;
      const allowed = await Promise.race([
        canReadMedia(req, mediaPath),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MEDIA_AUTH_TIMEOUT')), 10_000); }),
      ]).finally(() => clearTimeout(timer));
      if (!allowed) return res.status(403).json({ statusCode: 403, body: { status: "failed", errorCode: "MEDIA_ACCESS_DENIED", message: "Media is unavailable in your scope." } });
    }
    next();
  } catch (error) {
    if (error.message === 'MEDIA_AUTH_TIMEOUT') return res.status(504).json({ statusCode: 504, body: { status: 'failed', errorCode: 'MEDIA_AUTH_TIMEOUT', message: 'Media access check timed out.' } });
    next(error);
  }
}
