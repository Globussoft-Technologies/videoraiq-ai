import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Feedback covers file preparation and handoff to the browser. */
export default function DownloadButton({ action, children, description, disabled = false, style, ...props }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const download = async () => {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    const id = toast.loading(`Preparing ${description}...`);
    try {
      // Give React and the browser time to paint before synchronous PDF/Excel work.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      await action();
      toast.success(`${description} download.`, { id });
    } catch (error) {
      toast.error(`Could not download ${description}. ${error?.message || 'Please try again.'}`, { id });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <button {...props} type="button" disabled={disabled || busy} aria-busy={busy} onClick={download}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 8, color: 'var(--tx2)', background: 'var(--bg2)', border: '1px solid var(--bd2)', fontSize: 11, ...style, cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {busy ? 'Preparing...' : children}
    </button>
  );
}
