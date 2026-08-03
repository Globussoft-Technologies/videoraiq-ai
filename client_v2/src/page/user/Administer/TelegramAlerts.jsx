import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Copy, Check, Loader2, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { getTelegramLinkCode, unlinkTelegram } from '../../../helpers/telegram';

/* Public username of the platform bot users add to their channel. Env-driven so
   dev/staging/prod can each point at their own bot. */
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT || '@VideoraIQDEVAlertsbot';

/* Link detection: poll every 3s, give up after 60s. */
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

const btnBase = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  fontSize: 12.5, fontWeight: 600, borderRadius: 9,
  padding: '9px 16px', cursor: 'pointer',
};

export default function TelegramAlerts() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { code, linked, chatId }
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const pollTimer = useRef(null);
  const pollStopAt = useRef(0);
  const copyTimer = useRef(null);

  const clearPoll = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const load = async () => {
    const data = await getTelegramLinkCode();
    setStatus(data);
    return data;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    return clearPoll; // stop polling on unmount
  }, []);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  /* While NOT linked, poll for the link to complete (user posts the code in
     their channel -> Telegram webhook binds -> next poll flips to linked). */
  useEffect(() => {
    if (loading || !status || status.linked) {
      clearPoll();
      return;
    }
    pollStopAt.current = Date.now() + POLL_TIMEOUT_MS;
    clearPoll();
    pollTimer.current = setInterval(async () => {
      if (Date.now() > pollStopAt.current) {
        clearPoll();
        return;
      }
      const data = await load();
      if (data?.linked) {
        clearPoll();
        toast.success('Telegram channel connected');
      }
    }, POLL_INTERVAL_MS);
    return clearPoll;
    // Re-arm whenever the code changes or we transition to unlinked.
  }, [loading, status?.linked, status?.code]);

  async function handleCopy() {
    if (!status?.code) return;
    try {
      await navigator.clipboard.writeText(status.code);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the code');
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    const data = await load();
    setRefreshing(false);
    if (data?.linked) toast.success('Telegram channel connected');
    else toast.info('Not connected yet. Make sure you posted the code in your channel.');
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      const res = await unlinkTelegram();
      if (res?.statusCode === 200 || res?.body?.status === 'success') {
        toast.success('Telegram channel disconnected');
        await load(); // fresh (rotated) code, back to the connect state
      } else {
        toast.error(res?.body?.message || 'Failed to disconnect');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to disconnect');
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>
      <div
        onClick={() => setIsExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid var(--bd)' : 'none',
        }}
      >
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Telegram Alerts</span>
        {isExpanded
          ? <ChevronUp size={16} style={{ color: 'var(--tx3)' }} />
          : <ChevronDown size={16} style={{ color: 'var(--tx3)' }} />}
      </div>

      {isExpanded && (
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 0', color: 'var(--tx3)', fontSize: 12.5 }}>
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : !status ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 0' }}>
              <p style={{ fontSize: 12.5, color: 'var(--crit)' }}>Couldn’t load Telegram settings.</p>
              <button
                onClick={handleRefresh}
                style={{ ...btnBase, color: 'var(--tx2)', background: 'none', border: '1px solid var(--bd)' }}
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          ) : status.linked ? (
            /* ── Connected ─────────────────────────────────────────── */
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontWeight: 600, fontSize: 13 }}>
                <CheckCircle2 size={16} /> Telegram Connected
              </div>
              <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--tx2)' }}>
                Alerts are being delivered to your channel.
              </p>
              <p style={{ marginTop: 4, fontSize: 11.5, color: 'var(--tx3)' }}>
                Channel ID: <span style={{ fontFamily: 'var(--mono)' }}>{status.chatId}</span>
              </p>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                style={{
                  ...btnBase, marginTop: 16,
                  color: 'var(--crit)', background: 'none',
                  border: '1px solid rgba(255,77,77,.4)',
                  cursor: unlinking ? 'wait' : 'pointer',
                  opacity: unlinking ? 0.6 : 1,
                }}
              >
                {unlinking && <Loader2 size={13} className="animate-spin" />}
                Disconnect
              </button>
            </div>
          ) : (
            /* ── Not linked ────────────────────────────────────────── */
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: 'var(--tx)' }}>
                <Send size={15} style={{ color: 'var(--blue)' }} /> Connect Telegram Alerts
              </div>

              <ol style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--tx2)', lineHeight: 2 }}>
                <li>1. Create a Telegram channel.</li>
                <li>
                  2. Add our bot as an admin:{' '}
                  <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{BOT_USERNAME}</span>{' '}
                  (grant all the permissions).
                </li>
                <li>3. Copy the below code below and paste in your channel and hit enter</li>
              </ol>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <code style={{
                  borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--bg1)',
                  padding: '9px 14px', fontFamily: 'var(--mono)', fontSize: 13,
                  letterSpacing: '.06em', color: 'var(--tx)',
                }}>
                  {status.code}
                </code>
                <button
                  onClick={handleCopy}
                  style={{ ...btnBase, color: 'var(--tx2)', background: 'none', border: '1px solid var(--bd)' }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tx3)' }}>
                Once posted, this page will update to “Connected” automatically.
              </p>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                style={{
                  ...btnBase, marginTop: 12, color: '#fff', border: 'none',
                  background: 'linear-gradient(135deg,var(--blue),var(--violet))',
                  cursor: refreshing ? 'wait' : 'pointer',
                  opacity: refreshing ? 0.7 : 1,
                }}
              >
                {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                I’ve posted the code — Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
