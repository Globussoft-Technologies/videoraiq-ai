import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Plus, Mail, Pencil, Trash2, Send, ChevronLeft, ChevronRight, Search, X, Pause, Play } from 'lucide-react';
import { DOWNLOADS, FREQ_OPTS, REPORT_OPTS } from '../data';
import { exportMeasurementRecords } from '../export';
import ScheduleModal from './ScheduleModal';
import {
  getReportSchedules,
  getReportFormOptions,
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  sendReportNow,
  formToPayload,
  reportToForm,
} from '../reportsApi';

const DL_KEY = { PDF: 'pdf', XLSX: 'xlsx', CSV: 'csv' };

const reportLabelOf = (t) => REPORT_OPTS.find((o) => o.v === t)?.l || t;
const freqLabelOf = (f) => FREQ_OPTS.find((o) => o.v === f)?.l || f;
const scopeLabelOf = (r) =>
  r.target?.scope === 'stations'
    ? r.target.stations?.join(', ') || 'Selected stations'
    : 'All stations';

const ReportsAutomation = ({ rows = [] }) => {
  const selectedCount = rows.length;

  const [schedules, setSchedules] = useState([]);
  const [options, setOptions] = useState({ recipients: [], stations: [] });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {} (new) | form object (edit)
  const [busyId, setBusyId] = useState(null);

  // Server-side filters for the schedule list.
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusF, setStatusF] = useState('');     // '' | 'active' | 'paused'
  const [freqF, setFreqF] = useState('');         // '' | daily | weekly | monthly | custom
  const [reportTypeF, setReportTypeF] = useState(''); // '' | full | summary | mismatch | qrerror
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const filtersActive = Boolean(searchDebounced || statusF || freqF || reportTypeF);

  // Paginate the schedule list — the panel shows one page at a time and scrolls
  // within a fixed height so a long list never pushes the footer off-screen.
  const PAGE = 4;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(schedules.length / PAGE));
  const safePage = Math.min(page, pageCount);
  const pageSchedules = useMemo(
    () => schedules.slice((safePage - 1) * PAGE, safePage * PAGE),
    [schedules, safePage],
  );
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [searchDebounced, statusF, freqF, reportTypeF]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ reports }, opts] = await Promise.all([
        getReportSchedules({
          limit: 50,
          search: searchDebounced,
          status: statusF,
          frequency: freqF,
          reportType: reportTypeF,
        }),
        getReportFormOptions().catch(() => ({ recipients: [], stations: [] })),
      ]);
      setSchedules(reports);
      setOptions(opts);
    } catch (e) {
      toast.error(e?.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [searchDebounced, statusF, freqF, reportTypeF]);

  useEffect(() => {
    load();
  }, [load]);

  const clearFilters = () => {
    setSearch('');
    setStatusF('');
    setFreqF('');
    setReportTypeF('');
  };

  const save = async (form) => {
    try {
      const payload = formToPayload(form);
      if (form.id) {
        await updateReportSchedule(form.id, payload);
        toast.success('Schedule updated');
      } else {
        await createReportSchedule(payload);
        toast.success('Schedule created');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error(e?.message || 'Failed to save schedule');
    }
  };

  const remove = async (id) => {
    setBusyId(id);
    try {
      await deleteReportSchedule(id);
      setSchedules((s) => s.filter((x) => x._id !== id));
      toast.success('Schedule deleted');
    } catch (e) {
      toast.error(e?.message || 'Failed to delete schedule');
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (r) => {
    setBusyId(r._id);
    try {
      await updateReportSchedule(r._id, { enabled: !r.enabled });
      toast.success(r.enabled ? 'Schedule paused' : 'Schedule enabled');
      // A status filter may now exclude this row — re-fetch with the filters.
      if (statusF) load();
      else
        setSchedules((s) =>
          s.map((x) => (x._id === r._id ? { ...x, enabled: !x.enabled } : x)),
        );
    } catch (e) {
      toast.error(e?.message || 'Failed to update schedule');
    } finally {
      setBusyId(null);
    }
  };

  const sendNow = async (id) => {
    setBusyId(id);
    try {
      const res = await sendReportNow(id);
      toast.success(`Report sent · ${res?.recordCount ?? 0} records`);
      load();
    } catch (e) {
      toast.error(e?.message || 'Failed to send report');
    } finally {
      setBusyId(null);
    }
  };

  const whenLabel = (r) => {
    const s = r.schedule || {};
    if (s.frequency === 'custom' && s.startDate && s.endDate) {
      const d = (x) => String(x).slice(0, 10);
      return `Custom · ${d(s.startDate)} → ${d(s.endDate)} · ${s.time || '07:00'}`;
    }
    return `${freqLabelOf(s.frequency)} · ${s.time || '07:00'}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4 items-start">
      {/* Download Report */}
      <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] overflow-hidden">
        <div className="p-[13px_16px] border-b border-[var(--bd)]">
          <div className="font-[var(--disp)] font-semibold text-[14px]">Download Report</div>
          <div className="text-[11px] text-[var(--tx3)] mt-[3px]">
            Applies the filters above · {selectedCount} records selected
          </div>
        </div>
        <div className="p-[14px_16px] flex flex-col gap-[10px]">
          {DOWNLOADS.map((d) => (
            <div
              key={d.fmt}
              onClick={() => exportMeasurementRecords(DL_KEY[d.fmt], rows)}
              className="flex items-center gap-3 p-[12px_13px] rounded-[11px] bg-[var(--bg2)] border border-[var(--bd)] cursor-pointer transition-colors hover:border-[var(--blue)]"
              style={{ '--dl-c': d.c }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = d.c; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; }}
            >
              <span
                className="w-[38px] h-[38px] shrink-0 rounded-[9px] flex items-center justify-center font-[var(--mono)] text-[9.5px] font-bold text-white"
                style={{ background: d.c }}
              >
                {d.fmt}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold">{d.title}</span>
                <span className="block text-[11px] text-[var(--tx3)] mt-[2px]">{d.sub}</span>
              </span>
              <Download size={16} className="text-[var(--tx3)] shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* Automated Email Reports */}
      <div className="bg-[var(--bg1)] border border-[var(--bd)] rounded-[14px] overflow-hidden">
        <div className="flex items-center gap-[9px] p-[13px_16px] border-b border-[var(--bd)]">
          <span>
            <span className="block font-[var(--disp)] font-semibold text-[14px]">
              Automated Email Reports
            </span>
            <span className="block text-[11px] text-[var(--tx3)] mt-[3px]">
              Generated on the plant server and mailed to recipients
            </span>
          </span>
          <span className="ml-auto">
            <span
              onClick={() => setModal({})}
              style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
              className="flex items-center gap-[6px] text-[12px] font-semibold text-white rounded-[8px] px-[13px] py-[7px] cursor-pointer"
            >
              <Plus size={14} />New Report Schedule
            </span>
          </span>
        </div>

        {/* Filter bar — server-side search by title / recipient, plus status, frequency + report type */}
        <div className="flex items-center gap-2 p-[10px_16px] border-b border-[var(--bd)] flex-wrap">
          <span className="flex items-center gap-[6px] h-[32px] px-[10px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[var(--tx3)] focus-within:border-[var(--blue)] transition-colors flex-1 min-w-[180px]">
            <Search size={13} strokeWidth={1.8} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or recipient…"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px] text-[var(--tx)] placeholder:text-[var(--tx3)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 text-[var(--tx3)] hover:text-[var(--crit)] transition-colors"
                aria-label="Clear search"
              >
                <X size={12} strokeWidth={2.4} />
              </button>
            )}
          </span>
          <select
            value={statusF}
            onChange={(e) => setStatusF(e.target.value)}
            className="h-[32px] pl-[9px] pr-[24px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[11.5px] text-[var(--tx2)] cursor-pointer outline-none focus:border-[var(--blue)]"
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <select
            value={freqF}
            onChange={(e) => setFreqF(e.target.value)}
            className="h-[32px] pl-[9px] pr-[24px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[11.5px] text-[var(--tx2)] cursor-pointer outline-none focus:border-[var(--blue)]"
          >
            <option value="">All frequencies</option>
            {FREQ_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          <select
            value={reportTypeF}
            onChange={(e) => setReportTypeF(e.target.value)}
            className="h-[32px] pl-[9px] pr-[24px] rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[11.5px] text-[var(--tx2)] cursor-pointer outline-none focus:border-[var(--blue)]"
          >
            <option value="">All types</option>
            {REPORT_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-[4px] h-[32px] px-[9px] rounded-[8px] text-[11px] font-semibold text-[var(--crit)] border border-[var(--bd)] hover:border-[var(--crit)] cursor-pointer transition-colors"
            >
              <X size={12} strokeWidth={2.4} />Clear
            </button>
          )}
        </div>

        {loading && (
          <div className="p-[16px] text-[12px] text-[var(--tx3)]">Loading schedules…</div>
        )}

        {!loading && !schedules.length && (
          <div className="p-[16px] text-[12px] text-[var(--tx3)]">
            {filtersActive
              ? 'No schedules match these filters.'
              : 'No schedules yet — create one to have reports mailed automatically.'}
          </div>
        )}

        <div className="max-h-[340px] overflow-y-auto">
        {!loading &&
          pageSchedules.map((s) => (
            <div
              key={s._id}
              className="flex items-center gap-[13px] p-[13px_16px] border-b border-[var(--bd)]"
            >
              <span className="w-[34px] h-[34px] shrink-0 rounded-[9px] bg-[var(--bg3)] border border-[var(--bd)] flex items-center justify-center">
                <Mail size={16} className="text-[var(--tx2)]" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-semibold">{s.title}</span>
                  <span
                    className="font-[var(--mono)] text-[9px] font-semibold rounded-[4px] px-[6px] py-px"
                    style={{
                      color: s.enabled ? 'var(--ok)' : 'var(--warn)',
                      border: `1px solid ${s.enabled ? 'var(--ok)' : 'var(--warn)'}`,
                    }}
                  >
                    {s.enabled ? 'ACTIVE' : 'PAUSED'}
                  </span>
                  <span className="font-[var(--mono)] text-[9px] text-[var(--tx3)] border border-[var(--bd)] rounded-[4px] px-[6px] py-px">
                    {reportLabelOf(s.reportType)}
                  </span>
                </span>
                <span className="block text-[11px] text-[var(--tx2)] mt-1">
                  {whenLabel(s)} · {(s.formats || []).map((f) => f.toUpperCase()).join(', ')} ·{' '}
                  {scopeLabelOf(s)} · {s.mismatchOnly ? 'mismatches only' : 'all records'}
                </span>
                <span className="block font-[var(--mono)] text-[10px] text-[var(--tx3)] mt-[3px] whitespace-nowrap overflow-hidden text-ellipsis">
                  {(s.recipients || []).length} recipient
                  {(s.recipients || []).length === 1 ? '' : 's'} ·{' '}
                  {(s.recipients || []).join(', ')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => sendNow(s._id)}
                disabled={busyId === s._id}
                title="Send now"
                className="w-[30px] h-[30px] shrink-0 rounded-[8px] flex items-center justify-center cursor-pointer text-[var(--violet)] bg-[rgba(146,116,245,.1)] border border-[rgba(146,116,245,.25)] hover:bg-[rgba(146,116,245,.18)] transition-colors disabled:opacity-50"
              >
                <Send size={13} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={() => setModal(reportToForm(s))}
                title="Edit schedule"
                className="w-[30px] h-[30px] shrink-0 rounded-[8px] flex items-center justify-center cursor-pointer text-[var(--blue)] bg-[rgba(59,130,246,.1)] border border-[rgba(59,130,246,.25)] hover:bg-[rgba(59,130,246,.18)] transition-colors"
              >
                <Pencil size={14} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={() => toggle(s)}
                disabled={busyId === s._id}
                title={s.enabled ? 'Pause schedule' : 'Resume schedule'}
                className={`w-[30px] h-[30px] shrink-0 rounded-[8px] flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50 ${
                  s.enabled
                    ? 'text-[var(--warn)] bg-[rgba(245,166,35,.1)] border border-[rgba(245,166,35,.25)] hover:bg-[rgba(245,166,35,.18)]'
                    : 'text-[var(--ok)] bg-[rgba(34,197,94,.1)] border border-[rgba(34,197,94,.25)] hover:bg-[rgba(34,197,94,.18)]'
                }`}
              >
                {s.enabled ? (
                  <Pause size={13} strokeWidth={2} />
                ) : (
                  <Play size={13} strokeWidth={2} />
                )}
              </button>
              <button
                type="button"
                onClick={() => remove(s._id)}
                disabled={busyId === s._id}
                title="Delete schedule"
                className="w-[30px] h-[30px] shrink-0 rounded-[8px] flex items-center justify-center cursor-pointer text-[var(--crit)] bg-[rgba(255,77,77,.1)] border border-[rgba(255,77,77,.25)] hover:bg-[rgba(255,77,77,.18)] transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} strokeWidth={1.9} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-[10px] p-[10px_16px] font-[var(--mono)] text-[10.5px] text-[var(--tx3)] border-t border-[var(--bd)]">
          <span className="w-[6px] h-[6px] rounded-full bg-[var(--ok)] shrink-0" />
          <span>
            {schedules.length} schedule{schedules.length === 1 ? '' : 's'} ·{' '}
            {schedules.filter((s) => s.enabled).length} active
          </span>

          {pageCount > 1 && (
            <span className="ml-auto flex items-center gap-[6px]">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="w-[24px] h-[24px] flex items-center justify-center rounded-[6px] border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] cursor-pointer hover:border-[var(--blue)] disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="tabular-nums">
                {safePage} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
                className="w-[24px] h-[24px] flex items-center justify-center rounded-[6px] border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] cursor-pointer hover:border-[var(--blue)] disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight size={13} />
              </button>
            </span>
          )}
        </div>
      </div>

      {modal !== null && (
        <ScheduleModal
          initial={modal.id ? modal : null}
          recipients={options.recipients}
          stations={options.stations}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}

    </div>
  );
};

export default ReportsAutomation;
