import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';

/**
 * Incident-image preview overlay. Opens as a large card that sits within the
 * content area (between the sidebar and below the header), not a tiny thumbnail
 * and not an edge-to-edge takeover. Spinner only shows while genuinely loading.
 */
const ImagePreviewModal = ({ previewImage, onClose }) => {
  useEffect(() => {
    if (!previewImage) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewImage, onClose]);

  if (!previewImage) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-[var(--bg1solid)] rounded-2xl border border-[var(--bd)] shadow-2xl p-3 w-[min(88vw,1120px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 bg-[var(--bg1solid)] rounded-full p-1 cursor-pointer shadow-lg hover:bg-[var(--bg2)] border border-[var(--bd)]"
          title="Close"
        >
          <X className="w-5 h-5 text-[var(--tx)]" />
        </button>
        <ImageWithLoader
          src={previewImage}
          alt="incident preview"
          className="w-full rounded-xl flex items-center justify-center min-h-[240px]"
          imgClassName="w-full max-h-[78vh] object-contain"
        />
      </div>
    </div>
  );
};

export default ImagePreviewModal;
