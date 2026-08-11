import React from 'react';
import ReactDOM from 'react-dom';
import { Loader2 } from 'lucide-react';


/**
 * A reusable confirmation modal.
 * Props:
 * - open: boolean (show/hide modal)
 * - message: string | ReactNode (main message, supports dynamic content)
 * - icon: ReactNode (optional, icon to show)
 * - confirmLabel: string (button text, default 'Delete')
 * - cancelLabel: string (button text, default 'Cancel')
 * - onClose: function (called on cancel/close)
 * - onConfirm: function (called on confirm)
 * - confirmClass: string (optional, extra classes for confirm button)
 * - loading: boolean (optional, show spinner in confirm button)
 * - title: string (optional, title for the modal)
 */
const ConfirmationModal = ({
  open,
  message,
  icon,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onClose,
  onConfirm,
  confirmClass = 'bg-[var(--crit)] text-white hover:opacity-90 shadow-sm shadow-[var(--crit)]/20',
  loading = false,
  title = 'Confirm Delete',
}) => {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-fade-in">
      <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-2xl shadow-2xl p-4 sm:p-6 w-[86vw] max-w-[380px] flex flex-col transition-all duration-300 animate-fade-in-up">
        {/* Header with icon and title */}
        <div className="flex flex-col items-center mb-3 sm:mb-4">
          {icon !== undefined ? (
            <div className="mb-2 sm:mb-3 flex items-center bg-[var(--crit)]/10 rounded-full p-3 sm:p-4 justify-center">
              {icon}
            </div>
          ) : null}
          <h3 className="text-base sm:text-lg font-semibold text-[var(--tx)]">{title}</h3>
        </div>

        {/* Message */}
        <div className="text-center text-sm text-[var(--tx2)] leading-relaxed mb-4 sm:mb-6 break-words px-2">
          {message}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-center w-full">
          <button
            className="flex-1 px-4 py-2.5 text-sm font-medium text-[var(--tx2)] bg-[var(--bg2)] border border-[var(--bd)] hover:bg-[var(--bg3)] hover:text-[var(--tx)] rounded-lg transition-colors cursor-pointer"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            className={`cursor-pointer flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all active:scale-95 flex items-center justify-center ${confirmClass}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin w-4 h-4" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmationModal;
