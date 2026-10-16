import admins from '../admin/admin.model.js';
import permissions from '../permission/permissions.utility.js';
import logs from '../logsConfiguration/logsConfiguration.service.js';
import incidents from '../incidents/incidents.controller.js';
import { createMobileScreensRouter } from './mobileScreens.router.js';

export { createMobileScreensRouter } from './mobileScreens.router.js';
export default createMobileScreensRouter({ admins, permissions, logs, incidents });
