import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from 'config';
import { validTimezone } from '../../../utils/timezone.js';

const router = Router();
router.post('/token', (req, res) => {
  const sourceToken = req.get('x-access-token');
  const source = sourceToken && jwt.decode(sourceToken);
  const user = req.verified?.userData;
  if (!source || !user || source.tokenType === 'detection-agent' || !Number.isInteger(source.exp))
    return res.status(401).json({ errorCode: 'UNAUTHENTICATED', message: 'A dashboard token is required.' });
  const requested = req.body?.scopes;
  if (!Array.isArray(requested) || requested.some((scope) => !['read', 'prepare'].includes(scope)) || !requested.includes('read'))
    return res.status(400).json({ errorCode: 'INVALID_REQUEST', message: 'Valid scopes are required.' });
  const expires = Math.min(source.exp, Math.floor(Date.now() / 1000) + 8 * 3600);
  if (expires <= Math.floor(Date.now() / 1000)) return res.status(401).json({ errorCode: 'UNAUTHENTICATED', message: 'Dashboard token expired.' });
  const writesEnabled = String(process.env.DETECTION_AGENT_WRITES_ENABLED ?? (config.has('DETECTION_AGENT_WRITES_ENABLED') ? config.get('DETECTION_AGENT_WRITES_ENABLED') : false)) === 'true';
  const scopes = requested.includes('prepare') && writesEnabled ? ['read', 'prepare'] : ['read'];
  const principalId = String(user.memberId || user.userId || user.user_id || '');
  const tenantId = String(user.adminId || '');
  if (!principalId || !tenantId) return res.status(403).json({ errorCode: 'FORBIDDEN', message: 'This user cannot access the agent.' });
  const agentToken = jwt.sign({ ...source, tokenType: 'detection-agent', scopes, iat: Math.floor(Date.now() / 1000), exp: expires }, config.get('jwt.secretKey'));
  return res.json({ statusCode: 200, body: { status: 'success', data: {
    agentToken, expiresAt: new Date(expires * 1000).toISOString(), principalId, tenantId,
    timezone: validTimezone(user.timezone) || 'UTC', scopes,
  } } });
});
export default router;
