import { useState } from 'react';
import { Loader, Copy, Check, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { generateAdminToken } from './Api';

const MAX_DAYS = 3;
const REGISTER_PATH = '/employee-register';

/* dd/mm/yy plus the time — en-GB gives day-first ordering regardless of the
   viewer's locale, so the format doesn't change machine to machine. */
const formatExpiry = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/** Modal that mints a time-limited self-registration link employees can open. */
const GenerateRegLinkModal = ({ open, onClose, adminId }) => {
  const [days, setDays] = useState('');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);

  // Use VITE_FRONTEND for the registration portal, but map app.videoraiq.com to app-dashboard.videoraiq.com
  const frontendUrl = import.meta.env.VITE_FRONTEND || window.location.origin;
  const baseUrl = frontendUrl.replace('app.videoraiq.com', 'app-dashboard.videoraiq.com');

  if (!open) return null;

  const handleClose = () => {
    setDays('');
    setLink('');
    setExpiresAt('');
    setCopied(false);
    onClose();
  };

  // Digits only, and never let the field hold a value above the cap.
  const handleDaysChange = (e) => {
    const raw = e.target.value;
    if (raw === '') return setDays('');
    if (!/^\d+$/.test(raw)) return;
    const n = Number(raw);
    if (n < 1 || n > MAX_DAYS) return;
    setDays(raw);
  };

  const handleGenerate = async () => {
    const n = Number(days);
    if (!days || !Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
      toast.error(`Enter a number between 1 and ${MAX_DAYS}`);
      return;
    }
    if (!adminId) {
      toast.error('Could not read admin ID from your session');
      return;
    }

    setLoading(true);
    try {
      const res = await generateAdminToken({ adminId, days: n });
      if (!res?.ok || !res?.token) {
        toast.error(res?.msg || 'Failed to generate token');
        return;
      }
      setLink(`${baseUrl}${REGISTER_PATH}?token=${encodeURIComponent(res.token)}`);
      setExpiresAt(res.expiresAt || '');
      setCopied(false);
      toast.success('Registration link generated');
    } catch (err) {
      toast.error(err?.response?.data?.msg || err?.message || 'Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — select the link and copy manually');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70]">
      <div className="w-full sm:w-[95%] max-w-lg bg-[var(--bg1solid)] border border-[var(--bd)] rounded-t-xl sm:rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-3 bg-[var(--blue)] text-white">
          <h2 className="flex items-center gap-2 text-sm sm:text-base font-semibold">
            <LinkIcon className="w-4 h-4" />
            Generate Registration Link
          </h2>
          <button onClick={handleClose} className="cursor-pointer text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--tx)] block">
              Valid for (days) — max {MAX_DAYS}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={days}
              onChange={handleDaysChange}
              placeholder={`Enter 1 to ${MAX_DAYS}`}
              className="w-full px-3 py-2 bg-[var(--bg2)] border border-[var(--bd)] rounded-md text-sm text-[var(--tx)] placeholder:text-[var(--tx3)] outline-none focus:border-[var(--blue)]"
            />
            <p className="text-xs text-[var(--tx3)]">
              Employees can self-register with this link until it expires.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !days}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--blue)] hover:opacity-95 text-white rounded-md text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Generate Link'}
          </button>

          {link && (
            <div className="space-y-1.5 pt-3 border-t border-[var(--bd)]">
              <label className="text-sm font-medium text-[var(--tx)] block">Registration link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 px-3 py-2 bg-[var(--bg2)] border border-[var(--bd)] rounded-md text-xs text-[var(--tx2)] outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy link"
                  className="shrink-0 px-3 py-2 bg-[var(--blue)] hover:opacity-95 text-white rounded-md cursor-pointer transition-all"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {expiresAt && (
                <p className="text-xs text-[var(--tx3)]">
                  <span className="font-semibold text-[var(--tx2)]">
                    Expires: {formatExpiry(expiresAt)}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateRegLinkModal;
