import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Box Packing download feedback keeps progress details in the toast, not the button label. */
export default function BoxPackingDownloadButton({ action, children, description, disabled = false, style, ...props }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const download = async () => {
    if (running.current || disabled) return;
    running.current = true;
    setBusy(true);
    const id = toast.loading(`Preparing ${description}...`);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const result = await action((value) => {
        const progress = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        toast.loading(`Preparing ${description}... ${progress}%`, { id });
      });
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
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, padding: '0 14px', borderRadius: 8, color: '#fff', background: 'linear-gradient(135deg, var(--blue), var(--violet))', border: 0, fontSize: 11, ...style, cursor: busy ? 'wait' : disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {busy ? 'Preparing...' : children}
    </button>
  );
}
