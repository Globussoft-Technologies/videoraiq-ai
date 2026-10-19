import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearMobileEmbed, saveMobileEmbed } from '@/utils/mobileEmbed';
import MobilePageLoader from '@/components/MobilePageLoader';

// Consume the fragment before any async request or third-party component runs.
let exchange;
export default function MobileSso() {
  const navigate = useNavigate();
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
      navigate(`${path}?embedded=1`, { replace: true });
    }).catch(reason => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, []);
  return error ? <main role="alert" style={{ padding: 24 }}>{error}</main> : <MobilePageLoader />;
}
