import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check, Loader2, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { getTelegramLinkCode, unlinkTelegram } from '../../../helpers/telegram';

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT || '@VideoraIQDEVAlertsbot';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

const btnBase = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  fontSize: 12.5, fontWeight: 600, borderRadius: 9,
  padding: '9px 16px', cursor: 'pointer',
};

function TelegramConnectSteps({ status, copied, onCopy, onRefresh, refreshing }) {
  return (
    <>
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
          onClick={onCopy}
          style={{ ...btnBase, color: 'var(--tx2)', background: 'none', border: '1px solid var(--bd)' }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p style={{ marginTop: 12, fontSize: 11.5, color: 'var(--tx3)' }}>
        Once posted, this page will update to "Connected" automatically.
      </p>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          ...btnBase, marginTop: 12, color: '#fff', border: 'none',
          background: 'linear-gradient(135deg,var(--blue),var(--violet))',
          cursor: refreshing ? 'wait' : 'pointer',
          opacity: refreshing ? 0.7 : 1,
        }}
      >
        {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        I've posted the code - Refresh
      </button>
    </>
  );
}

export default function TelegramAlerts({
  showConnectedChannels = true,
  initiallyExpanded = true,
  onStatusChange = null,
}) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinkingChatId, setUnlinkingChatId] = useState(null);

  const pollTimer = useRef(null);
  const pollStopAt = useRef(0);
  const copyTimer = useRef(null);
  const connectAttemptBaselineRef = useRef(0);

  const clearPoll = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const getActiveLinkedChannelCount = (data) =>
    Array.isArray(data?.linkedChannels)
      ? data.linkedChannels.filter((channel) => channel?.active !== false).length
      : data?.linked
        ? 1
        : 0;

  const isTargetChannelConnected = (data) => {
    if (!data) return false;
    return getActiveLinkedChannelCount(data) > connectAttemptBaselineRef.current;
  };

  const load = async ({ preserveConnectBaseline = false } = {}) => {
    const data = await getTelegramLinkCode();
    setStatus(data);
    if (!preserveConnectBaseline) {
      connectAttemptBaselineRef.current = getActiveLinkedChannelCount(data);
    }
    if (typeof onStatusChange === 'function') {
      onStatusChange(data);
    }
    return data;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    return clearPoll;
  }, []);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

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
      if (isTargetChannelConnected(data)) {
        clearPoll();
        toast.success('Telegram channel connected');
      }
    }, POLL_INTERVAL_MS);
    return clearPoll;
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
    connectAttemptBaselineRef.current = getActiveLinkedChannelCount(status);
    setRefreshing(true);
    const data = await load({ preserveConnectBaseline: true });
    setRefreshing(false);
    if (isTargetChannelConnected(data)) {
      toast.success('Telegram channel connected');
      connectAttemptBaselineRef.current = getActiveLinkedChannelCount(data);
    } else {
      toast.info('Not connected yet. Make sure you posted the code in your channel.');
    }
  }

  const linkedChannels = status?.linkedChannels?.length
    ? status.linkedChannels
    : status?.linked
      ? [{
          chatId: status.chatId,
          channelName: status.channelName,
          channelTitle: status.channelTitle,
          channelUsername: status.channelUsername,
          chatType: status.chatType,
        }]
      : [];

  async function handleUnlink(chatId) {
    setUnlinkingChatId(chatId || '__all__');
    try {
      const res = await unlinkTelegram(chatId);
      if (res?.statusCode === 200 || res?.body?.status === 'success') {
        toast.success('Telegram channel disconnected');
        await load();
      } else {
        toast.error(res?.body?.message || 'Failed to disconnect');
      }
    } catch (e) {
      toast.error(e?.response?.data?.body?.message || 'Failed to disconnect');
    } finally {
      setUnlinkingChatId(null);
    }
  }

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 14, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--bd)',
        }}
      >
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14 }}>Telegram Alerts</span>
      </div>

      <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 0', color: 'var(--tx3)', fontSize: 12.5 }}>
              <Loader2 size={16} className="animate-spin" />
              Loading...
            </div>
          ) : !status ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 0' }}>
              <p style={{ fontSize: 12.5, color: 'var(--crit)' }}>Couldn't load Telegram settings.</p>
              <button
                onClick={handleRefresh}
                style={{ ...btnBase, color: 'var(--tx2)', background: 'none', border: '1px solid var(--bd)' }}
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          ) : status.linked ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 520px', minWidth: 320 }}>
                  {!showConnectedChannels && (
                    <div style={{
                      marginBottom: 14,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(34,197,94,.22)',
                      background: 'rgba(34,197,94,.08)',
                      fontSize: 12,
                      color: 'var(--tx2)',
                    }}>
                      <span style={{ color: 'var(--ok)', fontWeight: 700 }}>
                        {linkedChannels.length} Telegram {linkedChannels.length === 1 ? 'channel' : 'channels'} connected.
                      </span>{' '}
                      Manage connected channels in the section below.
                    </div>
                  )}
                  <TelegramConnectSteps
                    status={status}
                    copied={copied}
                    onCopy={handleCopy}
                    onRefresh={handleRefresh}
                    refreshing={refreshing}
                  />
                </div>

                {showConnectedChannels && (
                  <div style={{ flex: '0 0 320px', width: '100%', maxWidth: 360 }}>
                    <div style={{ paddingTop: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {linkedChannels.map((channel, index) => {
                        const displayName = channel.channelName || channel.channelUsername || channel.chatId || `Channel ${index + 1}`;
                        const isUnlinking = unlinkingChatId === (channel.chatId || '__all__');

                        return (
                          <div
                            key={channel.chatId || `telegram-channel-${index}`}
                            style={{
                              padding: '14px 16px',
                              borderRadius: 12,
                              border: '1px solid var(--bd)',
                              background: 'rgba(255,255,255,0.45)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontWeight: 600, fontSize: 13 }}>
                              <CheckCircle2 size={16} /> Telegram Connected
                            </div>
                            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--tx2)' }}>
                              Alerts are being delivered to{' '}
                              <strong style={{ color: 'var(--tx)' }}>{displayName}</strong>.
                            </p>
                            {channel.channelUsername && (
                              <p style={{ marginTop: 4, fontSize: 11.5, color: 'var(--tx3)' }}>
                                @{String(channel.channelUsername).replace(/^@/, '')}
                              </p>
                            )}
                            <p style={{ marginTop: 4, fontSize: 11.5, color: 'var(--tx3)' }}>
                              Channel Name:{' '}
                              <span style={{ fontFamily: 'var(--mono)' }}>
                                {displayName}
                              </span>
                            </p>

                            <button
                              onClick={() => handleUnlink(channel.chatId)}
                              disabled={isUnlinking}
                              style={{
                                ...btnBase, marginTop: 16,
                                color: 'var(--crit)', background: 'none',
                                border: '1px solid rgba(255,77,77,.4)',
                                cursor: isUnlinking ? 'wait' : 'pointer',
                                opacity: isUnlinking ? 0.6 : 1,
                              }}
                            >
                              {isUnlinking && <Loader2 size={13} className="animate-spin" />}
                              Disconnect
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: 'var(--tx)' }}>
                <Send size={15} style={{ color: 'var(--blue)' }} /> Connect Telegram Alerts
              </div>

              <TelegramConnectSteps
                status={status}
                copied={copied}
                onCopy={handleCopy}
                onRefresh={handleRefresh}
                refreshing={refreshing}
              />
            </div>
          )}
      </div>
    </div>
  );
}
