import { useEffect, useState } from 'react';
import { NAV_GROUPS, LOGS_GROUP_LABEL } from '../layout/nav.config';

/**
 * Custom ordering for the sidebar's LOGS & RECORDS section.
 *
 * Browser-local by design: this is a personal display preference, so it lives
 * in localStorage next to the sidebar-collapsed and read-notification state
 * rather than on the account. It does not follow the user to another device.
 *
 * The order is only applied while the feature is switched on (Settings ▸ Log
 * Order). Switching it off restores the shipped sequence without discarding
 * the saved arrangement, so it can be turned back on later unchanged.
 */
const ORDER_KEY = 'logs-order';
const ENABLED_KEY = 'logs-order-enabled';

// The `storage` event only fires in OTHER tabs, so every write also broadcasts
// this one — that's what keeps the Settings list and the live sidebar in step
// within a single tab.
const CHANGE_EVENT = 'logs-order-changed';

const compareLogs = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

/** All log nav items in alphabetical order, independent of their declaration order. */
export function defaultLogItems() {
  return [...(NAV_GROUPS.find((g) => g.label === LOGS_GROUP_LABEL)?.items || [])].sort(compareLogs);
}

function readOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function readEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function broadcast() {
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* non-browser / blocked — the write itself already happened */
  }
}

export function saveLogOrder(keys) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(keys));
  } catch {
    /* ignore storage errors (e.g. private browsing quota) */
  }
  broadcast();
}

export function clearLogOrder() {
  try {
    localStorage.removeItem(ORDER_KEY);
  } catch {
    /* ignore */
  }
  broadcast();
}

export function setLogOrderEnabled(on) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  broadcast();
}

/**
 * Reorder `items` to match `order` (a list of item keys).
 *
 * Saved keys retain their relative order. New logs are inserted according to
 * their alphabetical position among the current log labels.
 */
export function applyLogOrder(items, order) {
  const sorted = [...items].sort(compareLogs);
  if (!order?.length) return sorted;
  const byKey = new Map(sorted.map((item) => [item.key, item]));
  const result = [...new Set(order)].map((key) => byKey.get(key)).filter(Boolean);
  const saved = new Set(result.map((item) => item.key));
  for (const item of sorted) {
    if (saved.has(item.key)) continue;
    const next = result.findIndex((existing) => compareLogs(item, existing) < 0);
    result.splice(next < 0 ? result.length : next, 0, item);
  }
  return result;
}

/** applyLogOrder, but a no-op while the feature is switched off. */
export function orderLogItems(items, { enabled, order }) {
  return applyLogOrder(items, enabled ? order : []);
}

/**
 * Move `dragKey` to `targetKey`'s position and persist the result.
 *
 * Resolved against the FULL log list rather than the rows the sidebar happens
 * to be showing: a log hidden by permissions is not draggable, but it still
 * has a place in the order, and rebuilding from the visible subset alone would
 * flush every hidden one to the end.
 */
export function moveLogItem(order, dragKey, targetKey) {
  if (!dragKey || !targetKey || dragKey === targetKey) return;
  const keys = applyLogOrder(defaultLogItems(), order).map((item) => item.key);
  const from = keys.indexOf(dragKey);
  const to = keys.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return;
  keys.splice(to, 0, keys.splice(from, 1)[0]);
  saveLogOrder(keys);
}

/** Live {enabled, order}, resynced on any change in this tab or another. */
export function useLogOrder() {
  const [state, setState] = useState(() => ({ enabled: readEnabled(), order: readOrder() }));

  useEffect(() => {
    const sync = () => setState({ enabled: readEnabled(), order: readOrder() });
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return state;
}
