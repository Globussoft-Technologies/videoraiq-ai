import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Feedback covers file preparation and handoff to the browser. */
export default function DownloadButton({ action, children, description, disabled = false, style, ...props }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const isPrimaryDownload = /zip|excel report|pdf report/i.test(String(description || ''));
  const download = async () => {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    const id = toast.loading(`Preparing ${description}...`);
    try {
      // Give React and the browser time to paint before synchronous PDF/Excel work.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const result = await action();
      toast.success(result?.message || `${description} download.`, { id });
    } catch (error) {
      toast.error(`Could not download ${description}. ${error?.message || 'Please try again.'}`, { id });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <button {...props} type="button" disabled={disabled || busy} aria-busy={busy} onClick={download}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: isPrimaryDownload ? 40 : 30, padding: isPrimaryDownload ? '0 14px' : '0 12px', borderRadius: 8, color: isPrimaryDownload ? '#fff' : 'var(--tx2)', background: isPrimaryDownload ? 'linear-gradient(135deg, var(--blue), var(--violet))' : 'var(--bg2)', border: isPrimaryDownload ? 0 : '1px solid var(--bd2)', fontSize: 11, ...style, cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {busy ? 'Preparing...' : children}
    </button>
  );
}
