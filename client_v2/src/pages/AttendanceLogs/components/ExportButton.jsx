import React from 'react';
import { Download } from 'lucide-react';

/**
 * Gradient export button (blue → violet) with a download icon, matching the
 * VideoraIQ prototype toolbar. Pass an `onClick`; children are the label.
 */
const ExportButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-[8px] text-sm font-semibold text-white bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] hover:opacity-95 transition-opacity cursor-pointer ${className}`}
  >
    <Download className="w-4 h-4" />
    {children}
  </button>
);

export default ExportButton;
