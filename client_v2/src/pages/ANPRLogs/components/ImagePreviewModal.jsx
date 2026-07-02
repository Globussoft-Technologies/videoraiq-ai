import React from 'react';
import { X } from 'lucide-react';

/**
 * Fullscreen incident-image preview overlay. Matches the V1 ANPRLogs modal
 * exactly (light theme, hardcoded colors, spinner while loading).
 */
const ImagePreviewModal = ({ previewImage, loading, setLoading, onClose }) => {
  if (!previewImage) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 bg-[var(--bg1solid)] rounded-full p-1 cursor-pointer shadow-lg hover:bg-[var(--bg2)]"
          title="Close"
        >
          <X className="w-5 h-5 text-[var(--tx)]" />
        </button>
        {loading && (
          <div className="flex items-center justify-center w-[320px] h-[220px] rounded-lg bg-black/40">
            <svg
              className="animate-spin w-10 h-10 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
        <img
          src={previewImage}
          alt="preview"
          className={`max-w-[90vw] max-h-[85vh] rounded-lg shadow-xl border border-white transition-opacity duration-300 ${
            loading ? 'opacity-0 w-0 h-0' : 'opacity-100'
          }`}
          onLoadStart={() => setLoading(true)}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </div>
    </div>
  );
};

export default ImagePreviewModal;
