import React, { useState } from 'react';
import { Download, LayoutGrid, List, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

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

export const PdfViewExportButton = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const select = async (format) => {
    setExporting(format);
    try {
      await onSelect(format);
      setOpen(false);
    } finally {
      setExporting('');
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => !exporting && setOpen(next)}>
      <PopoverTrigger asChild><ExportButton>PDF</ExportButton></PopoverTrigger>
      <PopoverContent className="w-[190px] rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] p-1.5 shadow-xl" align="end">
        {[['pdf', 'Export List View', List], ['pdf-grid', 'Export Grid View', LayoutGrid]].map(([format, label, Icon]) => (
          <button key={format} type="button" disabled={!!exporting} onClick={() => select(format)}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold text-[var(--tx)] hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-70">
            {exporting === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-[var(--violet)]" />}
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
