import React from 'react';
import ReactDOM from 'react-dom';
import { AlertCircle, Loader2, Siren, TriangleAlert } from 'lucide-react';


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
  confirmClass = 'bg-[#07486A] text-white hover:bg-red-700',
  loading = false,
  title = 'Confirm Delete',
}) => {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-300 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] flex flex-col transition-all duration-300 animate-fade-in-up">
        {/* Header with icon and title */}
        <div className="flex flex-col items-center mb-4">
          {icon !== undefined ? (
            <div className="mb-3 flex items-center bg-red-50 rounded-full p-4 justify-center">
              {icon}
            </div>
          ) : null}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        
        {/* Message */}
        <div className="text-center text-sm text-gray-600 leading-relaxed mb-6 break-words px-2">
          {message}
        </div>
        
        {/* Warning banner */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          <p className="text-xs text-red-800 text-center font-medium">
            <TriangleAlert className="w-4 h-4 inline-block mb-1" /> This action cannot be undone
          </p>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-3 justify-center w-full">
          <button
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            className={`cursor-pointer flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition flex items-center justify-center ${confirmClass}`}
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