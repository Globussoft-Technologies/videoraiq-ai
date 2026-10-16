import { MOBILE_SCREENS, canAccessScreen } from './mobileScreens.js';

export const MOBILE_WEB_SCREENS = [
  ...MOBILE_SCREENS.map(screen => ({ ...screen, webPath: '/' + screen.path })),
  { id: 'stockCountingAnalytics', title: 'Loading/Unloading Analytics', group: 'Stock Counting', moduleId: 'core',
    permissionKey: 'logs', permissionSubKey: 'stockCountingLogs', logsConfigKey: 'stockCountingLogs', webPath: '/logs/stock-counting/analytics' },
];

export function permittedWebScreens(context) {
  return MOBILE_WEB_SCREENS.filter(screen => canAccessScreen(screen, context)).map(({ id, title, group, moduleId, webPath }) => ({
    id, title, group, moduleId, webPath, launchEndpoint: '/mobile-access/launch',
  }));
}
