import { useEffect, useState } from 'react';
import { ImageOff, LoaderCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { agentApi } from './agentApi';
import { inventoryImageFile } from './inventoryImages';
import { useTheme, V2ThemeProvider } from '@/theme/ThemeContext';

function Snapshot({ inventoryId, file }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) return undefined;
    const controller = new AbortController();
    let url;
    agentApi.cameraInventoryImage(inventoryId, file, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      if (!blob?.size || blob.type !== 'image/jpeg') throw new Error('Invalid image');
      url = URL.createObjectURL(blob);
      setSrc(url);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      const status = failure.response?.status;
      setError(status === 404 || status === 410
        ? 'This saved zone image is no longer available.'
        : 'This zone image could not be loaded.');
    });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [inventoryId, file]);

  if (!file || error) {
    return <p className="flex items-center gap-2" role="alert">
      <ImageOff size={20} aria-hidden="true" />{error || 'This zone image link is invalid.'}
    </p>;
  }
  if (!src) return <p className="flex items-center gap-2" role="status"><LoaderCircle size={20} className="animate-spin" aria-hidden="true" />Loading zone image…</p>;
  return <img className="max-h-[80dvh] max-w-full rounded-lg object-contain" src={src} alt="Saved camera zone snapshot"
    onError={() => setError('This zone image could not be loaded.')} />;
}

function InventoryImageView() {
  const { inventoryId, fileName } = useParams();
  const { theme } = useTheme();
  const file = inventoryImageFile(`/agent/camera-inventory/${inventoryId}/images/${fileName}`, inventoryId);

  return <main className={`flex min-h-dvh flex-col items-center justify-center gap-4 p-4 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
    <h1 className="text-lg font-semibold">Camera zone image</h1>
    <Snapshot key={`${inventoryId}/${fileName}`} inventoryId={inventoryId} file={file} />
  </main>;
}

export default function InventoryImagePage() {
  return <V2ThemeProvider defaultTheme="light"><InventoryImageView /></V2ThemeProvider>;
}
