import axios from 'axios';
import { api } from '@/helpers/client';
import { dropdownCache, installDropdownCache } from './dropdownCache';

const backend = import.meta.env.VITE_BACKEND;
// Only invalidation notices cross tabs. No tokens or response data are stored
// in localStorage/sessionStorage or sent through this channel.
let channel;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(`vq-dropdowns:${new URL(backend, window.location.origin).href}`);
    channel.onmessage = ({ data }) => {
      if (Array.isArray(data?.domains)) dropdownCache.invalidate(data.domains);
    };
  }
} catch { /* TTL and focus refresh also work when messaging is unavailable. */ }
const options = { onInvalidate(domains) { channel?.postMessage({ domains }); } };
installDropdownCache(axios, axios, backend, options);
installDropdownCache(axios, api, backend, options);

let lastRefresh = Date.now();
function refreshOnReturn() {
  if (document.visibilityState === 'hidden' || Date.now() - lastRefresh < 15_000) return;
  lastRefresh = Date.now();
  dropdownCache.invalidate();
}
window.addEventListener('focus', refreshOnReturn);
document.addEventListener('visibilitychange', refreshOnReturn);
const onSettingsUpdated = () => dropdownCache.invalidate();
window.addEventListener('vq-assistant-settings-updated', onSettingsUpdated);

if (import.meta.hot) import.meta.hot.dispose(() => {
  channel?.close();
  window.removeEventListener('focus', refreshOnReturn);
  document.removeEventListener('visibilitychange', refreshOnReturn);
  window.removeEventListener('vq-assistant-settings-updated', onSettingsUpdated);
});
