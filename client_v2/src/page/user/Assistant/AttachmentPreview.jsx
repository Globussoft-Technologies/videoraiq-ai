import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

function pdfDocumentUrl(src) {
  const value = String(src || '');
  return `${value.split('#')[0]}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
}

function columnLabel(index) {
  let label = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}

function excelColor(color) {
  const raw = String(color?.rgb || color?.argb || '');
  if (/^[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return undefined;
}

function cellStyle(cell) {
  const style = cell?.s || {};
  const fill = style.fill?.fgColor || style.fill?.bgColor;
  const border = style.border || {};
  const borderCss = (side) => {
    if (!side?.style) return undefined;
    const width = { hair: 1, thin: 1, medium: 2, thick: 3, double: 3 }[side.style] || 1;
    return `${width}px solid ${excelColor(side.color) || '#cbd5e1'}`;
  };
  return {
    ...(fill && style.fill?.patternType !== 'none' ? { backgroundColor: excelColor(fill) || '#fff' } : {}),
    ...(style.font?.bold ? { fontWeight: 700 } : {}),
    ...(style.font?.italic ? { fontStyle: 'italic' } : {}),
    ...(style.font?.underline ? { textDecoration: 'underline' } : {}),
    ...(excelColor(style.font?.color) ? { color: excelColor(style.font.color) } : {}),
    ...(style.font?.sz ? { fontSize: `${Math.max(8, Math.min(28, Number(style.font.sz)))}px` } : {}),
    ...(style.alignment?.horizontal ? { textAlign: style.alignment.horizontal } : {}),
    ...(style.alignment?.vertical ? { verticalAlign: style.alignment.vertical === 'center' ? 'middle' : style.alignment.vertical } : {}),
    ...(style.alignment?.wrapText ? { whiteSpace: 'normal' } : {}),
    ...(borderCss(border.top) ? { borderTop: borderCss(border.top) } : {}),
    ...(borderCss(border.right) ? { borderRight: borderCss(border.right) } : {}),
    ...(borderCss(border.bottom) ? { borderBottom: borderCss(border.bottom) } : {}),
    ...(borderCss(border.left) ? { borderLeft: borderCss(border.left) } : {}),
  };
}

function makePreviewSheet(XLSX, workbook, name) {
  const worksheet = workbook.Sheets[name];
  if (!worksheet) return null;
  const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const rowEnd = Math.min(range.e.r, range.s.r + 99);
  const columnEnd = Math.min(range.e.c, range.s.c + 39);
  const merges = worksheet['!merges'] || [];
  const rows = [];
  for (let r = range.s.r; r <= rowEnd; r += 1) {
    const cells = [];
    for (let c = range.s.c; c <= columnEnd; c += 1) {
      const isCovered = merges.some((merge) => r >= merge.s.r && r <= merge.e.r && c >= merge.s.c && c <= merge.e.c && (r !== merge.s.r || c !== merge.s.c));
      if (isCovered) { cells.push(null); continue; }
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[address];
      const merge = merges.find((item) => item.s.r === r && item.s.c === c);
      cells.push({
        key: address,
        text: cell?.w ?? (cell?.v == null ? '' : String(cell.v)),
        style: cellStyle(cell),
        ...(merge ? { rowSpan: merge.e.r - merge.s.r + 1, colSpan: merge.e.c - merge.s.c + 1 } : {}),
      });
    }
    const row = worksheet['!rows']?.[r];
    rows.push({ number: r + 1, height: row?.hpt || (row?.hpx ? row.hpx * 0.75 : undefined), cells });
  }
  const widths = Array.from({ length: columnEnd - range.s.c + 1 }, (_, index) => {
    const column = worksheet['!cols']?.[range.s.c + index];
    return Math.max(48, Math.min(420, column?.wpx || (column?.wch ? column.wch * 7 + 12 : 128)));
  });
  return { name, rows, widths, range, columnStart: range.s.c, limited: range.e.r > rowEnd || range.e.c > columnEnd };
}

export default function AttachmentPreview({ attachment, onClose }) {
  const [sheet, setSheet] = useState({ loading: false, sheets: [], active: 0, error: '' });
  const [sheetZoom, setSheetZoom] = useState(1);
  const sheetViewportRef = useRef(null);

  useEffect(() => {
    if (!attachment || attachment.kind !== 'sheet') return undefined;
    let cancelled = false;
    setSheet({ loading: true, sheets: [], active: 0, error: '' });
    (async () => {
      try {
        const XLSX = await import('xlsx-js-style');
        const response = await fetch(attachment.src);
        if (!response.ok) throw new Error('The spreadsheet could not be loaded.');
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
        const sheets = workbook.SheetNames.map((name) => makePreviewSheet(XLSX, workbook, name)).filter(Boolean);
        if (!sheets.length || !sheets.some((item) => item.rows.some((row) => row.cells.some((cell) => cell?.text)))) throw new Error('The spreadsheet has no visible cells.');
        if (!cancelled) setSheet({ loading: false, sheets, active: 0, error: '' });
      } catch (error) {
        if (!cancelled) setSheet({ loading: false, sheets: [], active: 0, error: error?.message || 'Spreadsheet preview failed.' });
      }
    })();
    return () => { cancelled = true; };
  }, [attachment]);

  useEffect(() => {
    const viewport = sheetViewportRef.current;
    const active = sheet.sheets[sheet.active];
    if (!viewport || !active) return undefined;
    const updateZoom = () => {
      const width = 42 + active.widths.reduce((total, value) => total + value, 0);
      const height = 32 + active.rows.reduce((total, row) => total + (row.height || 25), 0);
      const availableWidth = Math.max(240, viewport.clientWidth - 52);
      const availableHeight = Math.max(180, viewport.clientHeight - 52);
      const fit = Math.min(availableWidth / width, availableHeight / height);
      setSheetZoom(Math.max(0.65, Math.min(2.5, fit)));
    };
    updateZoom();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateZoom);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  }, [sheet.active, sheet.sheets]);

  useEffect(() => {
    if (!attachment) return undefined;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const closeOnEscape = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [attachment, onClose]);

  if (!attachment) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Preview ${attachment.name}`} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2147483647, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(2,6,23,.78)' }}>
      <div onClick={(event) => event.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: 'min(1120px, 96vw)', height: 'min(860px, 92vh)', overflow: 'hidden', borderRadius: 14, background: '#fff', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
        <header style={{ flex: '0 0 auto', minHeight: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '0 58px 0 18px', borderBottom: '1px solid #e2e8f0', color: '#0f172a', background: '#f8fafc' }}>
          <strong style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{attachment.name}</strong>
          {attachment.src && <a href={attachment.src} download={attachment.name} style={{ flex: '0 0 auto', color: '#4f46e5', fontSize: 12, fontWeight: 650, textDecoration: 'none' }}>Download original</a>}
        </header>
        <button type="button" onClick={onClose} aria-label="Close preview" style={{ position: 'absolute', top: 10, right: 12, zIndex: 3, width: 34, height: 34, display: 'grid', placeItems: 'center', border: '1px solid #cbd5e1', borderRadius: '50%', background: '#fff', color: '#334155', cursor: 'pointer' }}><X size={18} /></button>
        {attachment.kind === 'pdf' && <iframe title={attachment.name} src={pdfDocumentUrl(attachment.src)} style={{ display: 'block', flex: 1, width: '100%', minHeight: 0, border: 0, background: '#e2e8f0' }} />}
        {attachment.kind === 'image' && <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', background: '#111827' }}><img src={attachment.src} alt={attachment.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div>}
        {attachment.kind === 'sheet' && <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#111827', background: '#f1f5f9' }}>
          {sheet.loading && <div style={{ padding: 28, fontSize: 13, color: '#475569' }}>Loading spreadsheet…</div>}
          {sheet.error && <div role="alert" style={{ margin: 20, padding: 14, borderRadius: 9, fontSize: 13, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca' }}>{sheet.error}</div>}
          {!!sheet.sheets.length && (() => {
            const active = sheet.sheets[sheet.active] || sheet.sheets[0];
            return <>
              {sheet.sheets.length > 1 && <nav aria-label="Worksheets" style={{ display: 'flex', flex: '0 0 auto', gap: 2, padding: '8px 12px 0', overflowX: 'auto', background: '#e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                {sheet.sheets.map((item, index) => <button key={item.name} type="button" onClick={() => setSheet((current) => ({ ...current, active: index }))} style={{ padding: '7px 13px', border: '1px solid #cbd5e1', borderBottom: index === sheet.active ? '1px solid #fff' : '1px solid #cbd5e1', borderRadius: '7px 7px 0 0', color: index === sheet.active ? '#1d4ed8' : '#475569', background: index === sheet.active ? '#fff' : '#f1f5f9', cursor: 'pointer', fontSize: 11, fontWeight: index === sheet.active ? 700 : 500, whiteSpace: 'nowrap' }}>{item.name}</button>)}
              </nav>}
              <div ref={sheetViewportRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 24 }}>
                <div style={{ width: 'max-content', margin: 'auto', zoom: sheetZoom, background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 3px 12px rgba(15,23,42,.12)' }}>
                  <table style={{ tableLayout: 'fixed', width: 'max-content', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: 12 }}>
                    <colgroup><col style={{ width: 42 }} />{active.widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
                    <thead><tr><th style={{ position: 'sticky', top: 0, zIndex: 2, padding: '5px 7px', border: '1px solid #d6dce5', background: '#e9edf3' }} />{active.widths.map((_, index) => <th key={index} style={{ position: 'sticky', top: 0, zIndex: 2, padding: '5px 7px', border: '1px solid #d6dce5', background: '#e9edf3', color: '#475569', fontSize: 10, fontWeight: 500 }}>{columnLabel(active.columnStart + index)}</th>)}</tr></thead>
                    <tbody>{active.rows.map((row) => <tr key={row.number} style={{ height: row.height ? `${Math.min(120, row.height)}px` : 25 }}>
                      <th style={{ position: 'sticky', left: 0, zIndex: 1, width: 42, minWidth: 42, padding: '4px 6px', border: '1px solid #d6dce5', background: '#e9edf3', color: '#475569', textAlign: 'center', fontSize: 10, fontWeight: 500 }}>{row.number}</th>
                      {row.cells.map((cell) => cell && <td key={cell.key} rowSpan={cell.rowSpan || 1} colSpan={cell.colSpan || 1} style={{ padding: '5px 7px', overflow: 'hidden', textOverflow: 'clip', border: '1px solid #d6dce5', whiteSpace: 'nowrap', ...cell.style }}>{cell.text}</td>)}
                    </tr>)}</tbody>
                  </table>
                </div>
                <div style={{ maxWidth: 900, margin: '12px auto 0', display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 10.5 }}><span>{active.name}</span><span>{active.limited ? 'Preview limited to the first 100 rows and 40 columns' : `${active.range.e.r - active.range.s.r + 1} rows · ${active.range.e.c - active.range.s.c + 1} columns`}</span></div>
              </div>
              {sheet.sheets.length === 1 && <div style={{ flex: '0 0 auto', padding: '7px 12px', borderTop: '1px solid #cbd5e1', color: '#64748b', background: '#e2e8f0', fontSize: 10.5 }}>{active.name}</div>}
            </>;
          })()}
        </div>}
      </div>
    </div>,
    document.documentElement,
  );
}
