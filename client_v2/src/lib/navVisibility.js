import { NAV_GROUPS, LOGS_GROUP_LABEL } from '@/layout/nav.config';

/**
 * The rules that decide whether a sidebar nav item is shown at all.
 *
 * These used to live inside Sidebar.jsx. They moved here because the guided
 * tour has to answer exactly the same question: a tour step pointing at a nav
 * item the current role can't see would spotlight nothing, and a tour that
 * carried its own copy of the rules would drift from the sidebar the first time
 * either changed. One definition, two consumers.
 */

// Same rule as V1's Header.jsx navLinks.filter(): while permissions haven't
// loaded yet (empty object) show everything, so the sidebar doesn't flash
// empty on first render; once loaded, an item with a permissionKey needs
// permissions[key]?.view === true to appear at all — hidden, not disabled.
export function isItemVisible(item, permissions) {
  if (!item.permissionKey) return true;
  if (!permissions || Object.keys(permissions).length === 0) return true;
  if (item.permissionSubKey) {
    const module = permissions?.[item.permissionKey];
    if (module?.[item.permissionSubKey]?.view === true) return true;
    if (module?.global?.view === true) return true;
    if (module?.view === true) return true;
    return false;
  }
  return permissions?.[item.permissionKey]?.view === true;
}

/**
 * Log & record pages follow GET /logs-configuration, which already accounts for
 * the admin's own preference, auto-enable, and the detection licence.
 *
 * Fails open, and for the same reason as the permission filter above: while the
 * config is loading — or if the request failed — show the item. Hiding pages
 * first and revealing them later reads as the sidebar losing them, and a failed
 * fetch must never strip a client of navigation they are entitled to.
 */
export function isItemLogEnabled(item, logsConfig) {
  if (!item.logsConfigKey) return true;
  if (!logsConfig) return true;
  return logsConfig[item.logsConfigKey] !== false;
}

/**
 * Every nav item this user can actually reach, flattened across groups and in
 * sidebar order, each tagged with the group it came from.
 *
 * `hidden` groups are dropped here as well — they are excluded from the sidebar
 * render, so a tour must not walk the user into them either.
 *
 * Note this deliberately ignores the user's custom LOGS & RECORDS ordering
 * (Settings ▸ Log Order): that is a personal display preference, whereas the
 * onboarding tour reads better in the shipped, curated order — Command Center
 * before the logs that feed it.
 */
export function visibleNavItems(permissions, logsConfig) {
  return NAV_GROUPS.filter((group) => !group.hidden).flatMap((group) =>
    group.items
      .filter((item) => isItemVisible(item, permissions) && isItemLogEnabled(item, logsConfig))
      .map((item) => ({ ...item, group: group.label }))
  );
}

export { LOGS_GROUP_LABEL };
