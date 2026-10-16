import jwt from 'jsonwebtoken';
import config from 'config';
import { redis } from '../../../utils/database.js';
import authenticate from '../../../middlewares/verifyToken.js';
import { createMobileAccessRouter } from './mobileAccess.router.js';
import { resolveMobileAccess, mobileFrontendUrl, checkParentSession } from './mobileAccess.service.js';

export default createMobileAccessRouter({ redis, authenticate, resolveAccess: resolveMobileAccess,
  frontendUrl: mobileFrontendUrl, checkSession: checkParentSession,
  sign: (claims, ttl) => jwt.sign(claims, config.get('jwt.secretKey'), { expiresIn: ttl }),
});
