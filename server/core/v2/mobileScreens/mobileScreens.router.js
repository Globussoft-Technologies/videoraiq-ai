import { Router } from 'express';
import { normalizePermissionConfig } from '../../../constants/tourModules.js';
import { MOBILE_SCREENS, buildMobileCatalogue, canAccessScreen } from '../../../constants/mobileScreens.js';
import Response from '../../../utils/response.js';

// Export a factory to exercise authorization and dispatch without a database.
export function createMobileScreensRouter({
  admins, permissions, logs, incidents, screens = MOBILE_SCREENS,
}) {
  const router = Router();
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const { adminId, memberId, user_id } = req.verified?.userData || {};
      if (!adminId) return res.status(401).json(Response.userFailResp('Authentication context is missing'));
      const [tenant, roleResult, effectiveLogs] = await Promise.all([
        admins.findById(adminId).select('moduleConfig').lean(),
        permissions.resolveRolePermission({ adminId, memberId }),
        logs.resolveLogsForAdmin({ adminId, userId: user_id }),
      ]);
      const role = roleResult.roles?.[0];
      if (!tenant || roleResult.error || !role?.permissionConfig || !effectiveLogs) {
        return res.status(403).json(Response.accessDeniedResp('Screen access could not be resolved'));
      }
      req.mobileScreenAccess = {
        permissions: normalizePermissionConfig(role.permissionConfig, role.roleName),
        logs: effectiveLogs, modules: tenant.moduleConfig,
      };
      next();
    } catch (error) { next(error); }
  });

  router.get('/', (req, res) => res.json(Response.userSuccessResp(
    'Mobile screens fetched', buildMobileCatalogue(req.mobileScreenAccess, screens),
  )));

  router.get('/:screenId/records', async (req, res, next) => {
    try {
      const screen = screens.find(({ id }) => id === req.params.screenId);
      if (!screen || !canAccessScreen(screen, req.mobileScreenAccess)) {
        return res.status(404).json(Response.notFoundResp('Screen not available'));
      }
      if (!screen.handler) return res.status(409).json(Response.userFailResp('This screen requires native support'));
      const allowed = new Set(['skip', 'limit', ...screen.request.filters.flatMap((filter) => filter.parameters || [filter.parameter])]);
      for (const [key, value] of Object.entries(req.query)) {
        if (!allowed.has(key) || typeof value !== 'string' || value.length > 2000) {
          return res.status(400).json(Response.userFailResp(`Unsupported query parameter: ${key}`));
        }
      }
      const skip = Number(req.query.skip ?? 0);
      const limit = Number(req.query.limit ?? 25);
      if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json(Response.userFailResp('skip must be non-negative; limit must be between 1 and 100'));
      }
      for (const filter of screen.request.filters) {
        const value = req.query[filter.parameter];
        if (value && filter.options && !filter.options.includes(value)) {
          return res.status(400).json(Response.userFailResp(`Invalid ${filter.parameter}`));
        }
        if (value && filter.encoding === 'comma-separated' && !value.split(',').every((id) => /^[a-f\d]{24}$/i.test(id.trim()))) {
          return res.status(400).json(Response.userFailResp(`Invalid ${filter.parameter}`));
        }
      }
      const { startDate, endDate } = req.query;
      if ((startDate || endDate) && (!startDate || !endDate ||
        !Number.isFinite(Date.parse(startDate)) || !Number.isFinite(Date.parse(endDate)) ||
        Date.parse(startDate) > Date.parse(endDate))) {
        return res.status(400).json(Response.userFailResp('Provide a valid startDate and endDate in ascending order'));
      }
      req.query = { ...req.query, skip: String(skip), limit: String(limit) };
      return await incidents[screen.handler](req, res, next);
    } catch (error) { next(error); }
  });
  return router;
}

