import React, { useState } from 'react';
import { Loader, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { generateAdminToken } from './Api/post';

const MAX_DAYS = 3;
const REGISTER_PATH = '/register-employee';

const GenerateRegLinkModal = ({ open, onClose, adminId }) => {
  const [days, setDays] = useState('');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);

  const baseUrl = import.meta.env.VITE_EMPLOYEE_PORTAL_URL || window.location.origin;

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
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:w-[95%] max-w-lg bg-white rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-3 bg-[#07486A] text-white">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold">
            Generate Registration Link
          </h2>
          <button onClick={handleClose} className="cursor-pointer">✕</button>
        </div>

        {/* BODY */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 block">
              Valid for (days) — max {MAX_DAYS}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={days}
              onChange={handleDaysChange}
              placeholder={`Enter 1 to ${MAX_DAYS}`}
              className="w-full px-3 py-2 border border-[#D9D9D9] rounded-md text-sm outline-none focus:border-[#07486A]"
            />
            <p className="text-xs text-gray-500">
              Employees can self-register with this link until it expires.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !days}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#07486A] text-white rounded-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : 'Generate Link'}
          </button>

          {link && (
            <div className="space-y-1.5 pt-3 border-t">
              <label className="text-sm font-medium text-gray-700 block">Registration link</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 px-3 py-2 bg-gray-50 border border-[#D9D9D9] rounded-md text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 px-3 py-2 bg-[#07486A] text-white rounded-md cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {expiresAt && (
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">Expires: {new Date(expiresAt).toLocaleString()}</span>
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
