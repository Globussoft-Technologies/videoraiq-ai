import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';

export default function SnapshotCell({ value }) {
  const url = typeof value === 'string' && /^(https?:\/\/|\/|data:image\/)/i.test(value) ? value : '';
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setFailed(false); setOpen(false); }, [url]);
  if (!url) return <span style={{ fontSize: 11, color: 'var(--tx3)' }}>No snapshot</span>;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" title="Open snapshot" aria-label="Open incident snapshot" style={{ display: 'inline-flex', padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in', color: 'var(--blue)', fontSize: 10 }}>
          {failed ? <span>Image unavailable</span> : <img src={url} alt="Incident snapshot" loading="lazy" onError={() => setFailed(true)} style={{ width: 48, height: 30, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--bd)' }} />}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} onEscapeKeyDown={event => event.preventDefault()} style={{ position: 'fixed', inset: 0, zIndex: 200, outline: 'none' }}>
          <Dialog.Title className="sr-only">Incident snapshot</Dialog.Title>
          <ImagePreviewModal previewImage={url} imageKey={url} onClose={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
