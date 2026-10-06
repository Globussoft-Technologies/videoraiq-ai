import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Eye, Sparkles, X } from 'lucide-react';
import { detectionLabel } from '../../../lib/format';
import { api, unwrap } from '@/helpers/client';
import { runAssistantLogExport } from './assistantLogExport';

function clock(value) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Some create-workflow responses can contain the same success paragraph more
// than once (for example when the execution result and generated response are
// combined). Keep one copy in the visible transcript without merging distinct
// responses from separate inputs.
function displayText(value) {
  const text = sanitizeAssistantText(value);
  const parts = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return parts.filter((part, index) => parts.indexOf(part) === index).join('\n\n');
}

// Older conversations may contain a serialized validator/MCP error from
// before the server-side sanitization fix. Never render those internals in the
// transcript, even when they are loaded from history.
function sanitizeAssistantText(value) {
  const text = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value); } catch { return String(value ?? ''); }
  })();
  if (/invalid_value|invalid_type|unrecognized_keys|\"path\"\s*:\s*\[/i.test(text)) {
    if (/dateRange[\"']?\s*,\s*[\"']?type|dateRange.*type/i.test(text)) {
      return "I couldn't process that time range. Please try again with a range such as today, yesterday, or last 7 days.";
    }
    return "I couldn't process that request. Please try again with a simpler question.";
  }
  return text;
}

function formatAssistantTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(date);
  } catch {
    return value;
  }
}

function formatTimestampText(value) {
  return String(value ?? '').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g, formatAssistantTimestamp);
}

// Assistant responses are plain text today, but the backend commonly uses a
// small Markdown subset for labels in exported log results. Rendering that
// subset here keeps the transcript readable without adding a full Markdown
// dependency just for chat bubbles.
function renderInlineMarkdown(value, keyPrefix = '') {
  const pieces = String(value ?? '').split(/(\*\*[^*]+\*\*|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/g);
  return pieces.map((piece, index) => {
    const match = piece.match(/^\*\*(.+)\*\*$/);
    if (match) return <strong key={`${keyPrefix}-strong-${index}`} style={{ fontWeight: 750, color: 'var(--tx)' }}>{formatTimestampText(match[1])}</strong>;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(piece)) {
      return <time key={`${keyPrefix}-time-${index}`} dateTime={piece}>{formatAssistantTimestamp(piece)}</time>;
    }
    return <span key={`${keyPrefix}-text-${index}`}>{piece}</span>;
  });
}

function listItemParts(line) {
  const match = String(line ?? '').match(/^\s*(?:([*•-])|(\d+)[.)])\s+(.*?)\s*$/);
  if (!match) return null;
  return { marker: match[1] || `${match[2]}.`, value: match[3] };
}

function AssistantListLegacy({ items, ordered, keyPrefix }) {
  return <div className="vq-assistant-list" role="list">
    {items.map((item, index) => <div className="vq-assistant-list-item" key={`${keyPrefix}-item-${index}`} role="listitem">
      <span className={`vq-assistant-list-marker${ordered ? ' is-ordered' : ''}`}>{ordered ? index + 1 : '•'}</span>
      <span className="vq-assistant-list-value">{renderInlineMarkdown(item.value, `${keyPrefix}-${index}`)}</span>
    </div>)}
  </div>;
}

function AssistantText({ value }) {
  const lines = displayText(value).split('\n');
  const content = [];
  let list = [];
  let ordered = false;

  const flushList = (index) => {
    if (!list.length) return;
    content.push(<AssistantList key={`list-${index}`} items={list} ordered={ordered} keyPrefix={`list-${index}`} />);
    list = [];
  };

  lines.forEach((line, index) => {
    const item = listItemParts(line);
    if (item) {
      const isOrdered = /^\s*\d+[.)]\s+/.test(line);
      if (list.length && isOrdered !== ordered) flushList(index);
      ordered = isOrdered;
      list.push(item);
      return;
    }
    flushList(index);
    content.push(<div key={`line-${index}`} className="vq-assistant-text-line" style={{ minHeight: line ? undefined : 5 }}>{renderInlineMarkdown(line, `line-${index}`)}</div>);
  });
  flushList(lines.length);

  return <div className="vq-assistant-text">
    {content}
  </div>;
}

// Preserve explicit ordered-list markers from the response. A multi-result
// reply is separated by a blank line, so numbering each local list from zero
// would incorrectly render both results as "1".
function AssistantList({ items, ordered, keyPrefix }) {
  return <div className="vq-assistant-list" role="list">
    {items.map((item, index) => <div className="vq-assistant-list-item" key={`${keyPrefix}-item-${index}`} role="listitem">
      <span className={`vq-assistant-list-marker${ordered ? ' is-ordered' : ''}`}>{ordered ? item.marker : '•'}</span>
      <span className="vq-assistant-list-value">{renderInlineMarkdown(item.value, `${keyPrefix}-${index}`)}</span>
    </div>)}
  </div>;
}

function fieldLabel(key) {
  return {
    fullName: 'Full name',
    firstName: 'First name',
    lastName: 'Last name',
    employeeId: 'Employee ID',
    email: 'Email address',
    designation: 'Designation',
    departmentId: 'Department ID',
    department: 'Department',
    location: 'Location',
    vehicleNumber: 'Vehicle number',
    incidentTypes: 'Detection types',
  }[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

// Older assistant messages may have been stored before workflow UI metadata
// was persisted. Recover the text and face cards from their explicit prompts
// so an in-progress registration does not lose its controls after refresh.
function inferredRegistrationUi(msg) {
  if (msg?.role !== 'assistant' || msg?.ui) return msg?.ui || null;
  const text = String(msg.text || '');
  const face = text.match(/provide the (front|left|right) face image/i);
  if (face) {
    const angle = face[1].toLowerCase();
    return { type: 'image_step', workflow: 'register_new_user', currentStep: `${angle}Face`, field: `${angle}Face`, label: `${face[1][0].toUpperCase()}${face[1].slice(1)} Face`, inputType: 'image' };
  }
  const fields = [
    ['first name', 'First Name', 'firstName', false],
    ['last name', 'Last Name', 'lastName', false],
    ['employee id', 'Employee ID', 'employeeId', true],
    ['email address', 'Email', 'email', true],
    ['designation', 'Designation', 'designation', false],
    ['vehicle number', 'Vehicle Number', 'vehicleNumber', true],
  ];
  const field = fields.find(([phrase]) => new RegExp(`employee.?['’]?s ${phrase}`, 'i').test(text));
  if (!field) return null;
  return { type: 'form_step', workflow: 'register_new_user', currentStep: field[2], field: field[2], label: field[1], inputType: field[1] === 'Email' ? 'email' : 'text', required: !field[3], allowSkip: field[3] };
}

function workflowUiForMessage(msg) {
  return msg?.ui || inferredRegistrationUi(msg);
}

function ExportCard({ ui }) {
  // Export metadata is persisted with autoDownload disabled. Treat that
  // rehydrated state as completed so a refresh does not lose the final status.
  const [status, setStatus] = useState(ui?.autoDownload === false ? 'Downloaded successfully' : 'Preparing download…');
  const started = useRef(false);

  useEffect(() => {
    if (!ui || !['export', 'multi_export'].includes(ui.type) || !ui.autoDownload || started.current) return;
    started.current = true;
    const download = async () => {
      setStatus('Preparing download…');
      try {
        const results = [];
        const exports = ui.type === 'multi_export' ? (ui.exports || []) : [ui];
        for (const item of exports) {
          const formats = Array.isArray(item.formats) && item.formats.length ? item.formats : [item.format];
          for (const format of formats) {
            results.push(await runAssistantLogExport(item, format));
          }
        }
        setStatus(results.some((result) => result === false) ? 'Download failed' : 'Downloaded successfully');
      } catch {
        setStatus('Download failed');
      }
    };
    download();
  }, [ui]);

  if (!ui || !['export', 'multi_export'].includes(ui.type)) return null;
  return <div style={{ marginTop: 9, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx2)', fontSize: 12, fontWeight: 600 }}>
    {status}
  </div>;
}

const displayValue = (value) => {
  if (value === undefined || value === null || String(value).trim() === '' || String(value).toLowerCase() === 'undefined' || String(value).toLowerCase() === 'null') return '-';
  return String(value);
};

const vehicleField = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '-';
};

function normalizeVehicleRecord(record, timezone) {
  return {
    model: displayValue(vehicleField(record, ['modelName', 'modelname', 'model_name', 'carModelName', 'carModel', 'model'])),
    vehicleNumber: displayValue(vehicleField(record, ['vehicleNumber', 'numberPlate', 'plateNumber', 'carNumber'])),
    color: displayValue(vehicleField(record, ['color', 'colour', 'carColor'])),
    company: displayValue(vehicleField(record, ['company', 'make', 'carCompany'])),
    nvr: displayValue(record?.nvrData?.nvrName || record?.nvrName || record?.nvr),
    channel: displayValue(record?.channelData?.name || record?.channelName || record?.channel),
    raw: record,
  };
}

function VehicleLogsResult({ ui }) {
  const allRecords = Array.isArray(ui?.records) ? ui.records : [];
  const total = Number.isFinite(Number(ui?.total)) ? Number(ui.total) : allRecords.length;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(allRecords.length / pageSize));
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState(null);
  const [exporting, setExporting] = useState('');
  const rows = allRecords.slice((page - 1) * pageSize, page * pageSize).map((record) => normalizeVehicleRecord(record, ui.timezone));
  const allRows = allRecords.map((record) => normalizeVehicleRecord(record, ui.timezone));
  const filterEntries = Object.entries(ui.filters || {}).filter(([key, value]) => !key.startsWith('_') && value !== undefined && value !== null && value !== '' && value !== false);
  const uniqueCount = (key) => new Set(allRows.map((row) => row[key]).filter((value) => value !== '-')).size;

  useEffect(() => setPage(1), [ui]);

  const exportLogs = async (format) => {
    setExporting(format);
    try {
      await runAssistantLogExport({ ...ui, resource: 'vehicle_checkin_checkout_logs' }, format === 'excel' ? 'xlsx' : format);
    } finally {
      setExporting('');
    }
  };

  if (!allRecords.length) return <div style={{ marginTop: 10, padding: 14, borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx2)' }}>No vehicle logs found for the selected criteria.</div>;

  return <div style={{ width: 'min(920px, calc(100vw - 100px))', maxWidth: '100%', marginTop: 10, padding: 14, boxSizing: 'border-box', borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg2)' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div><div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--tx)', fontSize: 15, fontWeight: 750 }}>🚗 {ui.title || 'Vehicle Logs'}</div><div style={{ marginTop: 4, color: 'var(--tx2)', fontSize: 12 }}>{total} record{total === 1 ? '' : 's'} found</div></div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button type="button" onClick={() => exportLogs('excel')} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--bd)', borderRadius: 8, padding: '7px 10px', background: 'var(--bg1)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 11.5, fontWeight: 650 }}><Download size={13} />{exporting === 'excel' ? 'Exporting…' : 'Excel'}</button>
        <button type="button" onClick={() => exportLogs('pdf')} disabled={!!exporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--bd)', borderRadius: 8, padding: '7px 10px', background: 'var(--bg1)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 11.5, fontWeight: 650 }}><Download size={13} />{exporting === 'pdf' ? 'Exporting…' : 'PDF'}</button>
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7, marginTop: 12 }}>
      {[['Total Logs', total], ['Unique Vehicles', uniqueCount('vehicleNumber')], ['Companies', uniqueCount('company')], ['NVRs', uniqueCount('nvr')]].map(([label, value]) => <div key={label} style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--bg1)', border: '1px solid var(--bd)' }}><div style={{ color: 'var(--tx3)', fontSize: 10.5 }}>{label}</div><div style={{ marginTop: 2, color: 'var(--tx)', fontSize: 16, fontWeight: 750 }}>{value}</div></div>)}
    </div>
    {filterEntries.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 11 }}>{filterEntries.map(([key, value]) => <span key={key} style={{ padding: '4px 8px', borderRadius: 999, background: 'var(--bg1)', border: '1px solid var(--bd)', color: 'var(--tx2)', fontSize: 10.5 }}>{key.replace(/([A-Z])/g, ' $1')}: {String(value)}</span>)}</div>}
    <div style={{ marginTop: 12, overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 9 }}><table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 11.5 }}><thead><tr>{[['#', 'index'], ['Model', 'model'], ['Vehicle No.', 'vehicleNumber'], ['Color', 'color'], ['Company', 'company'], ['NVR', 'nvr'], ['Channel', 'channel'], ['', 'details']].map(([label, key]) => <th key={key} style={{ padding: '9px 8px', textAlign: key === 'index' ? 'center' : 'left', whiteSpace: 'nowrap', color: 'var(--tx3)', background: 'var(--bg1)', borderBottom: '1px solid var(--bd)', fontWeight: 700 }}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.vehicleNumber}-${index}`} style={{ borderBottom: '1px solid var(--bd)' }}><td style={{ padding: '8px', textAlign: 'center', color: 'var(--tx3)' }}>{(page - 1) * pageSize + index + 1}</td><td style={{ padding: '8px', color: 'var(--tx)' }}>{row.model}</td><td style={{ padding: '8px' }}><code style={{ padding: '3px 6px', borderRadius: 5, background: 'rgba(99,102,241,.1)', color: 'var(--blue)', whiteSpace: 'nowrap' }}>{row.vehicleNumber}</code></td><td style={{ padding: '8px', color: 'var(--tx2)' }}>{row.color}</td><td style={{ padding: '8px', color: 'var(--tx2)' }}>{row.company}</td><td style={{ padding: '8px', color: 'var(--tx2)' }}>{row.nvr}</td><td style={{ padding: '8px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{row.channel}</td><td style={{ padding: '8px' }}><button type="button" onClick={() => setDetails(row)} aria-label={`View details for ${row.vehicleNumber}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--bd)', borderRadius: 6, padding: '5px 7px', background: 'var(--bg1)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 10.5 }}><Eye size={12} />Details</button></td></tr>)}</tbody></table></div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 10, color: 'var(--tx3)', fontSize: 11.5 }}><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, allRecords.length)} of {total}</span><div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} style={{ border: '1px solid var(--bd)', borderRadius: 6, padding: '5px 8px', background: 'var(--bg1)', color: 'var(--tx2)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>Previous</button><span>{page} / {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} style={{ border: '1px solid var(--bd)', borderRadius: 6, padding: '5px 8px', background: 'var(--bg1)', color: 'var(--tx2)', cursor: page === pageCount ? 'not-allowed' : 'pointer' }}>Next</button></div></div>
    {details && <div style={{ marginTop: 12, padding: 12, borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--bg1)' }}><div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tx)', fontWeight: 700 }}>Vehicle Details <button type="button" onClick={() => setDetails(null)} aria-label="Close vehicle details" style={{ border: 0, background: 'transparent', color: 'var(--tx2)', cursor: 'pointer' }}><X size={14} /></button></div>{Object.entries(details).filter(([key]) => key !== 'raw').map(([key, value]) => <div key={key} style={{ display: 'flex', gap: 12, marginTop: 7, fontSize: 12 }}><span style={{ width: 100, color: 'var(--tx3)' }}>{key}</span><span style={{ color: 'var(--tx)' }}>{value}</span></div>)}</div>}
  </div>;
}

function isRegistrationUi(ui) {
  return ui?.workflow === 'register_new_user'
    || ['firstName', 'lastName', 'employeeId', 'email', 'designation', 'department', 'location', 'vehicleNumber'].includes(String(ui?.field || ui?.currentStep || ''));
}

// The MCP NVR workflow can return a natural-language prompt without the
// structured `ui` object used by the other workflow cards. Keep the action
// controls available in that case as well.
function isNvrWorkflowPrompt(value) {
  const text = String(value || '');
  return /\b(?:nvr|network recorder)\b/i.test(text)
    && ( /\breply\s+["']?yes\b/i.test(text)
      || /\bready to create\b/i.test(text)
      || /\b(?:provide|enter|select|confirm|create|add)\b/i.test(text));
}

function isNvrConfirmationPrompt(value) {
  const text = String(value || '');
  return /\b(?:ready to create\b.*\b(?:nvr|network recorder)\b|(?:nvr|network recorder).*\bready to create\b)/i.test(text)
    || /\breply\s+["']?yes\b/i.test(text);
}

function initials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function RecipientReviewCard({ item }) {
  const name = item?.fullName || 'Unnamed recipient';
  const types = Array.isArray(item?.incidentTypes) ? item.incidentTypes : [];
  return (
    <div style={{ padding: 12, borderRadius: 11, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 30, height: 30, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'linear-gradient(135deg,var(--blue),var(--violet))', color: '#fff', fontSize: 11, fontWeight: 800 }}>{initials(name)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--tx)', fontSize: 13, fontWeight: 750, overflowWrap: 'anywhere' }}>{name}</div>
          <div style={{ color: 'var(--tx2)', fontSize: 11.5, overflowWrap: 'anywhere' }}>{item?.email || 'No email address'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(86px, auto) minmax(0, 1fr)', alignItems: 'start', gap: '8px 12px', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bd)', fontSize: 11.5 }}>
        <span style={{ color: 'var(--tx3)' }}>Detection Types</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
          {types.length ? types.map((type) => <span key={type} style={{ maxWidth: '100%', padding: '4px 7px', borderRadius: 999, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.22)', color: 'var(--blue)', fontSize: 10.5, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{detectionLabel(type)}</span>) : <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>Skipped</span>}
        </div>
      </div>
    </div>
  );
}

function AssistantAvatar({ error = false }) {
  return (
    <span style={{ width: 29, height: 29, borderRadius: 9, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, background: error ? 'rgba(255,77,77,.14)' : 'linear-gradient(135deg,var(--blue),var(--violet))', border: error ? '1px solid var(--crit)' : '1px solid rgba(255,255,255,.16)' }}>
      {error ? <AlertTriangle size={14} strokeWidth={2} style={{ color: 'var(--crit)' }} /> : <Sparkles size={14} strokeWidth={2} style={{ color: '#fff' }} />}
    </span>
  );
}

function reviewValue(key, value) {
  if (['employeeIds', 'departmentIds'].includes(key) && Array.isArray(value)) {
    const label = key === 'employeeIds' ? 'employee' : 'department';
    return `${value.length} ${label}${value.length === 1 ? '' : 's'} selected`;
  }
  if (Array.isArray(value)) return value.map((entry) => reviewValue('', entry)).join(', ') || '—';
  if (value && typeof value === 'object') {
    // Reference fields retain both the selected id and its display name.
    // Rendering the object directly produces the unhelpful "[object Object]".
    const displayValue = value.departmentName || value.locationName || value.name || value.label || value.title;
    if (displayValue) return String(displayValue);
    if (value.id || value._id) return String(value.id || value._id);
    try { return JSON.stringify(value); } catch { return '—'; }
  }
  return String(value ?? '—');
}

function reviewLabel(key) {
  return ({
    employeeIds: 'Employees',
    departmentIds: 'Departments',
    sendTestMail: 'Send test email',
    startDate: 'Start date',
    endDate: 'End date',
  })[key] || fieldLabel(key);
}

function MultiSelectCard({ ui, onSelectOption }) {
  const options = Array.isArray(ui?.options) ? ui.options : [];
  const [selected, setSelected] = useState(() => new Set(
    Array.isArray(ui?.values?.[ui.field]) ? ui.values[ui.field].map(String) : [],
  ));
  const [query, setQuery] = useState('');

  const visibleOptions = options.filter((option) => {
    const label = String(option?.label ?? option?.value ?? '');
    return !query.trim() || label.toLowerCase().includes(query.trim().toLowerCase());
  });

  const isAudienceSelector = ['employeeIds', 'departmentIds'].includes(String(ui?.field || ''));
  const audienceLabel = ui?.field === 'employeeIds' ? 'employees' : 'departments';

  const toggle = (value) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

  const selectAll = () => setSelected(new Set(
    options
      .map((option) => String(option?.value ?? option?.label ?? '').trim())
      .filter(Boolean),
  ));

  const clearAll = () => setSelected(new Set());

  const submit = () => {
    const selectedOptions = options
      .filter((option) => selected.has(String(option?.value ?? option?.label ?? '')))
      .map((option) => ({
        value: String(option?.value ?? option?.label ?? '').trim(),
        label: String(option?.label ?? option?.value ?? '').trim(),
      }))
      .filter((option) => option.value && option.label);
    if (!selectedOptions.length) return;

    // The NVR workflow expects the discovered channel IDs, prefixed with its
    // explicit action command. Generic multi-select workflows continue to send
    // the human-readable labels as before.
    if (ui.inputType === 'camera_select') {
      onSelectOption?.(`Add selected cameras: ${selectedOptions.map((option) => option.value).join(', ')}`);
      return;
    }
    // Attendance report audience steps are persisted as ObjectId arrays. Send
    // the option values (IDs) for those fields so bulk selections remain
    // unambiguous; the other assistant multi-selects continue sending labels
    // because their workflows expect human-readable values.
    const submittedValues = isAudienceSelector
      ? selectedOptions.map((option) => option.value)
      : selectedOptions.map((option) => option.label);
    // Employee/department selections can contain hundreds of IDs. Keep them
    // out of the natural-language message (and its 4,000-character limit).
    onSelectOption?.(isAudienceSelector
      ? { action: 'select', workflow: ui.workflow, step: ui.field, values: submittedValues }
      : submittedValues.join(', '));
  };

  return (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 100px)', boxSizing: 'border-box', marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{ui.label || 'Select options'}</div>
      {isAudienceSelector && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
          <button type="button" onClick={selectAll} disabled={!options.length} style={{ border: 0, padding: 0, color: options.length ? 'var(--blue)' : 'var(--tx3)', background: 'transparent', cursor: options.length ? 'pointer' : 'not-allowed', fontSize: 11.5, fontWeight: 700 }}>
            Select All
          </button>
          <button type="button" onClick={clearAll} disabled={!selected.size} style={{ border: 0, padding: 0, color: selected.size ? 'var(--crit)' : 'var(--tx3)', background: 'transparent', cursor: selected.size ? 'pointer' : 'not-allowed', fontSize: 11.5, fontWeight: 700 }}>
            Clear All
          </button>
        </div>
      )}
      {options.length > 6 && (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${isAudienceSelector ? audienceLabel : 'options'}...`}
          aria-label={`Search ${ui.label || 'options'}`}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', outline: 'none', fontSize: 12 }}
        />
      )}
      <div style={{ display: 'grid', gap: 6, maxHeight: 240, overflowY: 'auto', marginTop: 10 }}>
        {visibleOptions.length ? visibleOptions.map((option) => {
          const value = String(option?.value ?? option?.label ?? '');
          const label = String(option?.label ?? option?.value ?? value);
          const checked = selected.has(value);
          return (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 8, background: checked ? 'rgba(99,102,241,.12)' : 'var(--bg2)', border: `1px solid ${checked ? 'rgba(99,102,241,.4)' : 'var(--bd)'}`, color: 'var(--tx)', cursor: 'pointer', fontSize: 12 }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(value)} />
              <span>{label}</span>
            </label>
          );
        }) : <div style={{ color: 'var(--tx3)', fontSize: 12 }}>No options available.</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {ui.allowSkip && <button type="button" onClick={() => onSelectOption?.('Skip')} style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 13px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Skip</button>}
        <button type="button" onClick={submit} disabled={!selected.size} style={{ border: 0, borderRadius: 8, padding: '8px 13px', color: '#fff', background: selected.size ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg3)', cursor: selected.size ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 12 }}>
          Continue{selected.size ? ` (${selected.size} selected)` : ''}
        </button>
      </div>
    </div>
  );
}

function SelectCard({ ui, onSelectOption }) {
  const [loadedOptions, setLoadedOptions] = useState([]);
  const options = Array.isArray(ui?.options) && ui.options.length ? ui.options : loadedOptions;

  useEffect(() => {
    if (ui?.workflow !== 'register_new_user' || ui?.field !== 'department' || (Array.isArray(ui?.options) && ui.options.length)) return undefined;
    let cancelled = false;
    api.post('/departments/get', { skip: 0, limit: 1000, search: '' })
      .then((response) => {
        if (cancelled) return;
        const payload = unwrap(response);
        const rows = Array.isArray(payload) ? payload : payload?.data || payload?.departments || payload?.items || [];
        setLoadedOptions(rows.map((row) => ({ value: String(row?._id || row?.id || row?.departmentId || ''), label: String(row?.departmentName || row?.name || row?.title || '') })).filter((option) => option.value && option.label));
      })
      .catch(() => { if (!cancelled) setLoadedOptions([]); });
    return () => { cancelled = true; };
  }, [ui?.workflow, ui?.field, ui?.options]);

  const submitOption = (option) => {
    const value = String(option?.value ?? option?.label ?? '').trim();
    const label = String(option?.label ?? option?.value ?? value).trim();
    if (!value || !label) return;

    // NVR field steps are parsed as labelled replies. Sending the option label
    // alone (for example, "CP Plus") loses the selected field and causes the
    // workflow to validate brand as missing on the next turn. Keep action
    // selectors such as connection retry commands as their exact values.
    const isNvrField = ui?.workflow === 'add_network_recorder'
      && ['brand', 'location'].includes(String(ui?.field || '').toLowerCase());
    if (isNvrField) {
      const fieldLabel = String(ui.field).toLowerCase() === 'brand' ? 'Brand' : 'Location';
      onSelectOption?.(`${fieldLabel}: ${value}`);
      return;
    }

    // Registration reference selections must stay out of the natural-language
    // input. The backend needs the ID as a typed workflow field so it can
    // resolve the authorized department without treating the ID as a name.
    if (ui?.workflow === 'register_new_user' && ui?.field === 'department') {
      const action = {
        action: 'select',
        workflow: 'register_new_user',
        step: 'department',
        field: 'department',
        value,
        valueType: 'reference',
      };
      console.info('DEPARTMENT_SELECT', { optionLabel: label, optionValue: value, submittedValue: value, valueType: 'reference' });
      onSelectOption?.(action);
      return;
    }
    onSelectOption?.(label);
  };

  return (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 100px)', boxSizing: 'border-box', marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{ui.label || 'Select an option'}</div>
      <div style={{ display: 'grid', gap: 7, maxHeight: 240, overflowY: 'auto', marginTop: 10, paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: 'var(--tx3) transparent' }}>
        {options.length ? options.map((option) => {
          const value = String(option?.value ?? option?.label ?? '').trim();
          const label = String(option?.label ?? option?.value ?? value).trim();
          if (!value || !label) return null;
          return (
            <button
              key={value}
              type="button"
              onClick={() => submitOption(option)}
              style={{ width: '100%', minHeight: 38, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', textAlign: 'left', cursor: 'pointer', fontSize: 12, lineHeight: 1.35 }}
            >
              {label}
            </button>
          );
        }) : <div style={{ color: 'var(--tx3)', fontSize: 12 }}>No options available.</div>}
      </div>
      {isRegistrationUi(ui) && <button type="button" onClick={() => onSelectOption?.('cancel')} style={{ marginTop: 11, border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 13px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12 }}>Cancel registration</button>}
    </div>
  );
}

function TextInputCard({ ui, onSelectOption }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const current = ui?.values?.[ui.field];
    setValue(current === undefined || current === null ? '' : String(current));
  // A validation error can return the same step with its value cleared (for
  // example, an End Date earlier than Start Date). Include the current field
  // value so the input does not keep resubmitting the rejected local value.
  }, [ui?.currentStep, ui?.field, ui?.values?.[ui?.field]]);

  const submit = (event) => {
    event.preventDefault();
    const next = value.trim();
    if (next) onSelectOption?.(next);
  };

  return (
    <form onSubmit={submit} style={{ width: 360, maxWidth: 'calc(100vw - 100px)', boxSizing: 'border-box', marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
        {ui.label || 'Enter a value'}
        <input
          autoFocus
          type={ui.inputType === 'number' || ui.inputType === 'date' || ui.inputType === 'time' ? ui.inputType : ui.inputType === 'password' ? 'password' : 'text'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          min={ui.inputType === 'date' ? ui.min : undefined}
          max={ui.inputType === 'date' ? ui.max : undefined}
          placeholder={ui.placeholder || ''}
          aria-label={ui.label || 'Enter a value'}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: 9, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--tx)', outline: 'none', fontSize: 12 }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
        <button type="submit" disabled={!value.trim()} style={{ border: 0, borderRadius: 8, padding: '8px 13px', color: '#fff', background: value.trim() ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg3)', cursor: value.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 12 }}>Continue</button>
        {ui.allowSkip && <button type="button" onClick={() => onSelectOption?.('Skip')} style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 13px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Skip</button>}
        {isRegistrationUi(ui) && <button type="button" onClick={() => onSelectOption?.('cancel')} style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 13px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Cancel</button>}
      </div>
    </form>
  );
}

function ImageStepCard({ ui, onWorkflowUpload, uploading = false }) {
  const inputRef = useRef(null);
  const angle = String(ui?.field || ui?.currentStep || '').replace(/Face$/i, '').toLowerCase();
  const label = ui?.label || 'Face image';

  const handleChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !['image/jpeg', 'image/png'].includes(file.type)) return;
    onWorkflowUpload?.({ angle, file });
  };

  return (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 100px)', boxSizing: 'border-box', marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{label}</div>
      <div style={{ marginTop: 6, color: 'var(--tx2)', fontSize: 12, lineHeight: 1.45 }}>Upload a clear JPG or PNG image for this face angle.</div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" hidden onChange={handleChange} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={{ marginTop: 12, border: 0, borderRadius: 8, padding: '8px 13px', color: '#fff', background: uploading ? 'var(--bg3)' : 'linear-gradient(135deg,var(--blue),var(--violet))', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12 }}>
        {uploading ? 'Uploading…' : `Upload ${label}`}
      </button>
    </div>
  );
}

function FaceBatchCard({ onWorkflowBatchUpload, onSelectOption, uploading = false, faceEnrollment = {} }) {
  const [files, setFiles] = useState({ front: null, left: null, right: null });
  const angles = [['front', 'Front Face'], ['left', 'Left Face'], ['right', 'Right Face']];
  const selected = angles.map(([angle]) => files[angle]).filter(Boolean);
  const completed = angles.filter(([angle]) => files[angle] || faceEnrollment?.[angle]);
  const choose = (angle, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && ['image/jpeg', 'image/png'].includes(file.type)) setFiles((current) => ({ ...current, [angle]: file }));
  };
  return <div style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box', marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Face Enrollment</div>
    <div style={{ marginTop: 6, color: 'var(--tx2)', fontSize: 12, lineHeight: 1.45 }}>Add one image for each required face view.</div>
    <div style={{ marginTop: 8, color: 'var(--tx2)', fontSize: 12 }}>Progress: {completed.length} / 3</div>
    <div style={{ display: 'grid', gap: 7, marginTop: 12 }}>
      {angles.map(([angle, label]) => <div key={angle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0, padding: '8px 9px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
        <span style={{ minWidth: 0, fontSize: 12, color: 'var(--tx)' }}>{label}</span>
        <input type="file" accept="image/jpeg,image/png" hidden onChange={(event) => choose(angle, event)} />
        <button type="button" onClick={(event) => event.currentTarget.previousElementSibling?.click()} disabled={uploading} title={files[angle]?.name || 'Choose image'} style={{ flex: '0 1 150px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid var(--bd2)', borderRadius: 7, padding: '6px 9px', color: 'var(--tx2)', background: 'var(--bg1)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 11 }}>{files[angle]?.name || (faceEnrollment?.[angle] ? 'Uploaded' : 'Choose image')}</button>
      </div>)}
    </div>
    <button type="button" onClick={() => selected.length > 0 && onWorkflowBatchUpload?.({ files: selected })} disabled={selected.length === 0 || uploading} style={{ marginTop: 12, border: 0, borderRadius: 8, padding: '8px 13px', color: '#fff', background: selected.length > 0 && !uploading ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'var(--bg3)', cursor: selected.length > 0 && !uploading ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 12 }}>{uploading ? 'Uploading...' : 'Continue'}</button>
    <button type="button" onClick={() => onSelectOption?.('cancel')} style={{ marginTop: 8, border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 13px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Cancel registration</button>
  </div>;
}

function WorkflowCard({ ui, onConfirm, onSelectOption, onWorkflowUpload, onWorkflowBatchUpload, uploading = false, active = true }) {
  // Create workflows use a dedicated `select` card for single-choice steps
  // (frequency, weekday, report filter, and test-email choice). Keep it in
  // the same workflow-card pipeline as the other structured controls so
  // follow-up prompts do not degrade to plain text.
  // Registration reference fields (Department/Location) are returned by the
  // workflow as `reference_select`, while the generic workflows use
  // `select`. They share the same option shape and interaction, so render
  // both through the single-choice selector instead of dropping the card.
  if (!ui || !['review', 'form_step', 'select', 'reference_select', 'multi_select', 'image_step', 'face_upload'].includes(ui.type)) return null;
  if (!active) return null;

  if (ui.type === 'image_step' || ui.type === 'face_upload') return <FaceBatchCard onWorkflowBatchUpload={onWorkflowBatchUpload} onSelectOption={onSelectOption} uploading={uploading} faceEnrollment={ui.faceEnrollment} />;
  if (ui.type === 'multi_select') return <MultiSelectCard ui={ui} onSelectOption={onSelectOption} />;
  if (ui.type === 'select' || ui.type === 'reference_select') return <SelectCard ui={ui} onSelectOption={onSelectOption} />;

  if (ui.type === 'form_step') {
    if (ui.inputType === 'select') return <SelectCard ui={ui} onSelectOption={onSelectOption} />;
    const isNvrCameraSelection = ui.workflow === 'add_network_recorder'
      && (ui.inputType === 'camera_select' || ui.field === 'cameras' || ui.currentStep === 'selectCameras');
    if (isNvrCameraSelection) return <MultiSelectCard ui={ui} onSelectOption={onSelectOption} />;
    return <TextInputCard ui={ui} onSelectOption={onSelectOption} />;
  }

  // Registration review payloads store the employee fields directly in
  // `values`, while list-oriented workflows use `values.items`. Normalize
  // both shapes so the review card never renders as an empty shell.
  const items = Array.isArray(ui.values?.items)
    ? ui.values.items
    : ui.workflow === 'register_new_user' && ui.values && typeof ui.values === 'object'
      ? [ui.values]
      : [];

  return (
    <div style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box', marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--bg1)', border: '1px solid var(--bd)', boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Review {items.length ? `(${items.length} ${ui.workflow === 'create_alert_recipient' ? `recipient${items.length === 1 ? '' : 's'}` : `record${items.length === 1 ? '' : 's'}`})` : ''}</div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {items.length ? items.map((item, index) => ui.workflow === 'create_alert_recipient' ? (
          <RecipientReviewCard key={index} item={item} />
        ) : (
          <div key={index} style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', fontSize: 12, color: 'var(--tx2)' }}>
            {Object.entries(item || {}).filter(([key]) => !/password/i.test(key)).map(([key, value]) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 34%) minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
                <span style={{ color: 'var(--tx3)' }}>{reviewLabel(key)}</span><span style={{ minWidth: 0, textAlign: 'right', color: 'var(--tx)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{reviewValue(key, value)}</span>
              </div>
            ))}
          </div>
        )) : <div style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)', color: 'var(--tx3)', fontSize: 12 }}>No review details available.</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" onClick={() => onConfirm?.(ui)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 8, padding: '8px 12px', color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}><Check size={14} /> {ui.workflow === 'add_network_recorder' ? 'Yes' : 'Confirm'}</button>
        <button type="button" onClick={() => onSelectOption?.('cancel')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 12px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12 }}><X size={13} /> Cancel</button>
      </div>
    </div>
  );
}

function NvrActionCard({ text, workflow, onSelectOption, active = true }) {
  const nvrWorkflow = workflow === 'add_network_recorder' || isNvrWorkflowPrompt(text);
  if (!active || !nvrWorkflow) return null;
  const confirmation = isNvrConfirmationPrompt(text);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {confirmation && <button type="button" onClick={() => onSelectOption?.('Yes')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 8, padding: '8px 13px', color: '#fff', background: 'linear-gradient(135deg,var(--blue),var(--violet))', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}><Check size={14} /> Yes</button>}
      <button type="button" onClick={() => onSelectOption?.('cancel')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--bd)', borderRadius: 8, padding: '8px 13px', color: 'var(--tx2)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12 }}><X size={13} /> Cancel</button>
    </div>
  );
}

function MessageAttachments({ attachments = [] }) {
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    const next = attachments.map((attachment) => {
      if (typeof attachment === 'string') return { src: attachment, name: 'Attached image' };
      if (attachment?.url) return { src: attachment.url, name: attachment.name || attachment.fileName || 'Attached image' };
      if (attachment?.path) {
        // VITE_BACKEND is normally the API v2 base (for example
        // http://localhost:5000/api/v2), while legacy media is served from
        // the API origin at /api/v1/uploads. Do not produce /api/v2/api/v1.
        const base = String(import.meta.env.VITE_BACKEND || '')
          .replace(/\/api\/v2\/?$/i, '')
          .replace(/\/api\/v1\/?$/i, '')
          .replace(/\/+$/, '');
        const path = String(attachment.path).replace(/^\/+/, '');
        return { src: `${base}/api/v1/uploads/${path}`, name: attachment.name || attachment.fileName || `${attachment.angle || 'Attached'} image` };
      }
      if (attachment instanceof Blob) return { src: URL.createObjectURL(attachment), name: attachment.name || 'Attached image', revoke: true };
      if (attachment?.attachmentId) {
        return {
          missing: true,
          name: attachment.fileName || `${attachment.angle || 'Attached'} image`,
          detail: `${attachment.angle || 'image'} · ${attachment.attachmentId}`,
        };
      }
      return null;
    }).filter(Boolean);
    setPreviews(next);
    return () => next.forEach((preview) => preview.revoke && URL.revokeObjectURL(preview.src));
  }, [attachments]);
  if (!previews.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
    {previews.map((preview, index) => preview.missing
      ? <div key={`${preview.name}-${index}`} title={preview.detail} style={{ width: 132, minHeight: 56, boxSizing: 'border-box', padding: '7px 8px', borderRadius: 7, border: '1px dashed rgba(255,255,255,.55)', color: '#fff', fontSize: 10, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{preview.name}<br /><span style={{ opacity: .75 }}>Preview unavailable</span></div>
      : <img key={`${preview.name}-${index}`} src={preview.src} alt={preview.name} title={preview.name} style={{ width: 74, height: 56, objectFit: 'cover', borderRadius: 7, border: '1px solid rgba(255,255,255,.35)' }} />)}
  </div>;
}

function Bubble({ msg, onConfirm, onSelectOption, onWorkflowUpload, onWorkflowBatchUpload, uploading, activeWorkflow }) {
  const isUser = msg.role === 'user';
  const [copyState, setCopyState] = useState('idle');
  const copyTimerRef = useRef(null);
  const workflowUi = workflowUiForMessage(msg);
  const isVehicleLogs = workflowUi?.type === 'vehicle_logs';
  const isStructuredResult = isVehicleLogs;
  const isVehicleLogsFallback = !isUser && !workflowUi && /\*\*(?:Time of Incident|Model|Vehicle Number):?\*\*/i.test(String(msg.text || ''));

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const copyUserMessage = async () => {
    try {
      const text = String(msg.text || '');
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      setCopyState('copied');
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('error');
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 1600);
    }
  };

  return (
    <div className={`vq-fadeup ${isUser ? 'vq-user-message' : ''}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      {!isUser && <AssistantAvatar error={msg.error} />}
      <div style={{
        width: !isUser && (isVehicleLogs || isVehicleLogsFallback) ? 'min(920px, calc(100vw - 100px))' : !isUser && workflowUi ? 'min(360px, calc(100vw - 100px))' : undefined,
        maxWidth: !isUser && (workflowUi || isVehicleLogsFallback) ? 'calc(100% - 39px)' : 'min(76%, 720px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}>
        {!isStructuredResult && <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
          <div style={{ padding: isVehicleLogsFallback ? '14px 16px' : '11px 14px', borderRadius: 14, borderTopRightRadius: isUser ? 5 : 14, borderTopLeftRadius: isUser ? 14 : 5, fontSize: 13.5, lineHeight: 1.65, wordBreak: 'break-word', color: isUser ? '#fff' : 'var(--tx)', background: isUser ? 'linear-gradient(135deg,var(--blue),var(--violet))' : msg.error ? 'rgba(255,77,77,.08)' : 'var(--bg2)', border: isUser ? '1px solid rgba(255,255,255,.16)' : `1px solid ${msg.error ? 'rgba(255,77,77,.35)' : 'var(--bd)'}`, boxShadow: isUser ? '0 6px 18px rgba(99,102,241,.22)' : 'none' }}>
            {workflowUi?.type === 'review' ? 'Please review the records below and confirm when ready.' : isUser ? displayText(msg.text) : <AssistantText value={msg.text} />}
            {isUser && <MessageAttachments attachments={msg.attachments} />}
          </div>
          {isUser && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, marginRight: 4 }}>
            <button
              type="button"
              onClick={copyUserMessage}
              title={copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy message'}
              aria-label={copyState === 'copied' ? 'Copied message' : 'Copy message'}
              style={{ width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid var(--bd)', background: 'var(--bg2)', color: copyState === 'copied' ? 'var(--ok, #16a34a)' : 'var(--tx2)', cursor: 'pointer', opacity: 0, transition: 'opacity .15s, color .15s' }}
              className="vq-user-copy-action"
            >
              {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)' }}>{clock(msg.at)}</span>
          </div>}
        </div>}
        {!isUser && <>
          {isVehicleLogs && <VehicleLogsResult ui={workflowUi} />}
          <ExportCard ui={workflowUi} />
          <WorkflowCard ui={workflowUi} onConfirm={onConfirm} onSelectOption={onSelectOption} onWorkflowUpload={onWorkflowUpload} onWorkflowBatchUpload={onWorkflowBatchUpload} uploading={uploading} active={activeWorkflow} />
          {(!msg.ui || msg.ui.type === 'form_step') && <NvrActionCard text={msg.text} workflow={msg.ui?.workflow} onSelectOption={onSelectOption} active={activeWorkflow} />}
        </>}
        {!isUser && <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--tx3)', margin: '5px 4px 0' }}>{clock(msg.at)}</span>}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="vq-fadeup" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 40, padding: '0 15px', borderRadius: 14, borderTopLeftRadius: 5, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
        {[0, 1, 2].map((i) => <span key={i} className="vq-typing-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--tx2)', animationDelay: `${i * 0.16}s` }} />)}
      </div>
    </div>
  );
}

export default function MessageThread({ messages = [], sending = false, uploading = false, onConfirm, onSelectOption, onWorkflowUpload, onWorkflowBatchUpload }) {
  const endRef = useRef(null);

  // A workflow card belongs to the unanswered assistant prompt immediately
  // before the next user response. Once the user clicks Skip or submits text,
  // keep that response in the transcript but disable/hide the old card.
  const latestWorkflowIndex = messages.findLastIndex((item) => item.role === 'assistant' && (
    ['review', 'form_step', 'select', 'reference_select', 'multi_select', 'image_step', 'face_upload'].includes(workflowUiForMessage(item)?.type) || (!item.ui && isNvrWorkflowPrompt(item.text))
  ));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, sending]);

  return (
    <div style={{ width: '100%', padding: '18px clamp(14px, 3vw, 28px) 10px', display: 'flex', flexDirection: 'column', gap: 11, boxSizing: 'border-box' }}>
      {messages.map((msg, index) => {
        const hasUserResponseAfter = messages.slice(index + 1).some((item) => item.role === 'user');
        return <Bubble key={msg.id || `${msg.at || 'message'}-${index}`} msg={msg} onConfirm={onConfirm} onSelectOption={onSelectOption} onWorkflowUpload={onWorkflowUpload} onWorkflowBatchUpload={onWorkflowBatchUpload} uploading={uploading} activeWorkflow={index === latestWorkflowIndex && !hasUserResponseAfter} />;
      })}
      {sending && <TypingBubble />}
      <div ref={endRef} />
    </div>
  );
}
