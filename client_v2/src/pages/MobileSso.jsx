import { useEffect, useState } from 'react';
import { clearMobileEmbed, saveMobileEmbed } from '@/utils/mobileEmbed';

// Consume the fragment before any async request or third-party component runs.
let exchange;
export default function MobileSso() {
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!exchange) {
      const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
      window.history.replaceState(null, '', '/mobile-sso');
      clearMobileEmbed();
      exchange = (async () => {
        if (!code) throw new Error('Open this page again from the mobile app.');
        const response = await fetch(`${import.meta.env.VITE_BACKEND}/mobile-access/exchange`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
        });
        const result = await response.json();
        if (!response.ok || result.body?.status !== 'success') throw new Error(result.body?.message || 'Unable to open this page.');
        return result.body.data;
      })();
    }
    exchange.then(session => {
      if (cancelled) return;
      const path = session.screen?.webPath;
      if (!path?.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new Error('Invalid page destination');
      saveMobileEmbed(session);
      window.location.replace(`${path}?embedded=1`);
    }).catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  return <main style={{ padding: 24 }}><p role="status">{error || 'Opening your page…'}</p></main>;
}
