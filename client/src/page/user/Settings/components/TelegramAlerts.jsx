import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Loader2, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getTelegramLinkCode } from '../Api/get';
import { unlinkTelegram } from '../Api/post';

// TODO: replace with the real public bot username once confirmed.
const BOT_USERNAME = '@VideoraIQDEVAlertsbot';

// Poll settings for link detection: check every 3s, give up after 60s.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

const TelegramAlerts = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { code, linked, chatId }
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const pollTimer = useRef(null);
  const pollStopAt = useRef(0);

  const clearPoll = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  // Load current code + link status.
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

  // While NOT linked, poll for the link to complete (user posts the code in
  // their channel -> Telegram webhook binds -> next poll flips to linked).
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
    // Re-arm the poll whenever the code changes or we transition to unlinked.
  }, [loading, status?.linked, status?.code]);

  const handleCopy = async () => {
    if (!status?.code) return;
    try {
      await navigator.clipboard.writeText(status.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the code');
    }
  };

  // Manual "I've posted the code" refresh.
  const handleRefresh = async () => {
    setRefreshing(true);
    const data = await load();
    setRefreshing(false);
    if (data?.linked) toast.success('Telegram channel connected');
    else toast.info('Not connected yet. Make sure you posted the code in your channel.');
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const res = await unlinkTelegram();
      if (res?.statusCode === 200 || res?.body?.status === 'success') {
        toast.success('Telegram channel disconnected');
        await load(); // fresh (rotated) code, back to the connect state
      } else {
        toast.error(res?.body?.message || 'Failed to disconnect');
      }
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] rounded-[10px]">
      <div
        className="flex items-center justify-between px-4 py-6 rounded-[10px] bg-[#FAFAFA] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="md:text-[20px] text-sm font-medium text-[#333333]">
          Telegram Alerts
        </h2>
        {isExpanded ? (
          <ChevronUp className="w-8 h-8 text-[#333333]" />
        ) : (
          <ChevronDown className="w-8 h-8 text-[#333333]" />
        )}
      </div>

      {isExpanded && (
        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[#7A7A7A]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : !status ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-red-600">Couldn’t load Telegram settings.</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-[#07486A] px-4 py-2 text-sm font-medium text-[#07486A] hover:bg-[#07486A] hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          ) : status.linked ? (
            /* ---------- State B: Connected ---------- */
            <div className="rounded-[10px] bg-[#FAFAFA] p-5">
              <div className="flex items-center gap-2 text-[#15803D]">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Telegram Connected</span>
              </div>
              <p className="mt-2 text-sm text-[#5D5D5D]">
                Alerts are being delivered to your channel.
              </p>
              <p className="mt-1 text-xs text-[#7A7A7A]">
                Channel ID: <span className="font-mono">{status.chatId}</span>
              </p>
              <button
                type="button"
                onClick={handleUnlink}
                disabled={unlinking}
                className="mt-4 inline-flex items-center gap-2 rounded-full border cursor-pointer border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                {unlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Disconnect
              </button>
            </div>
          ) : (
            /* ---------- State A: Not linked ---------- */
            <div className="rounded-[10px] bg-[#FAFAFA] p-5">
              <div className="flex items-center gap-2 text-[#333333]">
                <Send className="w-5 h-5 text-[#07486A]" />
                <span className="font-medium">Connect Telegram Alerts</span>
              </div>

              <ol className="mt-4 space-y-2 text-sm text-[#5D5D5D] list-decimal list-inside">
                <li>Create a Telegram channel.</li>
                <li>
                  Add our bot as an admin:{' '}
                  <span className="font-medium text-[#07486A]">{BOT_USERNAME}</span>{' '}
                  (grant all the permissions).
                </li>
                <li>Copy the below code below and paste in your channel and hit enter</li>
              </ol>

              {/* Code + copy */}
              <div className="mt-4 flex items-center gap-2">
                <code className="rounded-lg border border-[#80808059] bg-white px-4 py-2 font-mono text-base tracking-wider text-[#333333]">
                  {status.code}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg cursor-pointer border border-[#07486A] px-3 py-2 text-sm font-medium text-[#07486A] hover:bg-[#07486A] hover:text-white transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* <p className="mt-3 text-xs text-[#7A7A7A]">
                Once posted, this page will update to “Connected” automatically.
              </p> */}

              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="mt-3 inline-flex items-center gap-2 rounded-full cursor-pointer bg-[#07486A] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                I’ve posted the code — Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TelegramAlerts;
