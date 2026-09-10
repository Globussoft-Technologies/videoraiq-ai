import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock3, Mail, FileText, Settings2, SlidersHorizontal, Check } from 'lucide-react';
import { REPORT_OPTS, FREQ_OPTS, DAY_OPTS } from '../data';
import SingleDatePicker from '@/components/SingleDatePicker';
import MultiSelect from '@/components/MultiSelect';

const EMPTY = {
  name: '', report: 'full', freq: 'daily', time: '07:00', day: 'mon', dom: '1',
  startDate: '', endDate: '',
  scope: 'all', formats: ['pdf'], mismatchOnly: false, includeSnaps: true,
  recipients: [],
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const inputCls =
  'w-full h-[38px] px-3 rounded-[8px] bg-[var(--bg2)] border border-[var(--bd)] text-[12.5px] text-[var(--tx)] outline-none focus:border-[var(--blue)] transition-colors';
const selectCls = `${inputCls} pr-7 cursor-pointer`;

const FieldLabel = ({ children, required }) => (
  <label className="block mb-[7px] text-[12px] font-bold text-[var(--tx2)]">
    {children}
    {required && <span className="text-[var(--crit)] ml-[3px]">*</span>}
  </label>
);

const Section = ({ title, icon: Icon, children }) => (
  <section className="py-[15px] border-t border-[var(--bd)]">
    <div className="flex items-center gap-[7px] mb-3 text-[var(--tx)]">
      <Icon size={15} className="text-[var(--blue)]" />
      <h3 className="m-0 text-[13.5px] font-bold">{title}</h3>
    </div>
    {children}
  </section>
);

// Radio-style pill button (matches the attendance modal's frequency selector).
const RadioPill = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 min-h-[38px] px-[11px] rounded-[8px] text-[12.5px] font-semibold border transition-colors cursor-pointer ${
      active
        ? 'border-[var(--blue)]/50 bg-[var(--blue)]/10 text-[var(--blue)]'
        : 'border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--tx)] hover:border-[var(--bd2)]'
    }`}
  >
    <span
      className={`w-[13px] h-[13px] rounded-full border-2 shrink-0 flex items-center justify-center ${
        active ? 'border-[var(--blue)]' : 'border-[var(--tx3)]'
      }`}
    >
      {active && <span className="w-[6px] h-[6px] rounded-full bg-[var(--blue)]" />}
    </span>
    {children}
  </button>
);

// Checkbox-style card (matches the attendance modal's "Report format").
const CheckCard = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 min-h-[38px] px-[11px] rounded-[8px] text-[12.5px] border transition-colors cursor-pointer ${
      active
        ? 'border-[var(--blue)]/50 bg-[var(--blue)]/10 text-[var(--tx)]'
        : 'border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--tx)] hover:border-[var(--bd2)]'
    }`}
  >
    <span
      className={`w-[15px] h-[15px] rounded-[4px] border shrink-0 flex items-center justify-center ${
        active ? 'border-[var(--blue)] bg-[var(--blue)]' : 'border-[var(--tx3)]'
      }`}
    >
      {active && <Check size={11} className="text-white" strokeWidth={3} />}
    </span>
    {children}
  </button>
);

// Toggle switch (matches the pill switches elsewhere in the app).
const Toggle = ({ on }) => (
  <span
    role="switch"
    aria-checked={on}
    style={on ? { background: 'linear-gradient(135deg,var(--blue),var(--violet))' } : undefined}
    className={`w-[38px] h-[22px] rounded-full p-[2px] shrink-0 transition-colors ${
      on ? '' : 'bg-[var(--toggleoff,#cbd5e1)]'
    }`}
  >
    <span
      className="block w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform"
      style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
    />
  </span>
);

const GRADIENT = 'linear-gradient(135deg,var(--blue),var(--violet))';

const ScheduleModal = ({ initial, recipients = [], stations = [], onClose, onSave }) => {
  const [form, setForm] = useState(EMPTY);

  const scopeOpts = [
    { v: 'all', l: 'All stations' },
    ...stations.map((s) => ({ v: s, l: s })),
  ];
  const recipientOptions = recipients.map((r) => ({
    id: String(r.email).toLowerCase(),
    label: r.name ? `${r.name} — ${r.email}` : r.email,
  }));

  useEffect(() => {
    setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
  }, [initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => setForm((f) => ({ ...f, [k]: !f[k] }));
  const toggleFmt = (k) =>
    setForm((f) => ({
      ...f,
      formats: f.formats.includes(k) ? f.formats.filter((x) => x !== k) : [...f.formats, k],
    }));

  const isEdit = Boolean(initial?.id);
  const customIncomplete =
    form.freq === 'custom' &&
    (!form.startDate || !form.endDate || form.startDate > form.endDate);
  const canSave =
    form.name.trim().length >= 2 &&
    form.recipients.length > 0 &&
    form.formats.length > 0 &&
    !customIncomplete;

  const reportDesc = REPORT_OPTS.find((o) => o.v === form.report)?.d;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="w-[min(100%,760px)] max-h-[min(900px,calc(100vh-32px))] flex flex-col bg-[var(--bg1solid)] border border-[var(--bd2)] rounded-[14px] shadow-2xl overflow-hidden"
      >
        {/* Gradient header */}
        <div
          className="flex items-center justify-between gap-3 px-[18px] py-[15px] text-white shrink-0"
          style={{ background: GRADIENT }}
        >
          <div>
            <h2 className="m-0 font-[var(--disp)] text-[17px] font-bold">
              {isEdit ? 'Edit Report Schedule' : 'New Report Schedule'}
            </h2>
            <p className="m-0 mt-[3px] text-[11.5px] opacity-90">
              Choose the report, when it runs, the file formats and who receives it
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-[30px] h-[30px] grid place-items-center rounded-[8px] bg-white/15 text-white cursor-pointer shrink-0 hover:bg-white/25 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        <div className="vq-scroll flex-1 overflow-y-auto px-[20px] pb-[18px] pt-[8px]">
          {/* Schedule name */}
          <div className="py-[15px]">
            <FieldLabel required>Schedule name</FieldLabel>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Daily QC Summary — Line 2"
              maxLength={120}
            />
          </div>

          {/* Report type */}
          <Section title="Report type" icon={FileText}>
            <FieldLabel required>Report preset</FieldLabel>
            <select
              className={selectCls}
              value={form.report}
              onChange={(e) => set('report', e.target.value)}
            >
              {REPORT_OPTS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
            {reportDesc && (
              <p className="mt-[6px] text-[10.5px] text-[var(--tx3)] leading-snug">{reportDesc}</p>
            )}
          </Section>

          {/* Frequency */}
          <Section title="Frequency" icon={Clock3}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {FREQ_OPTS.map((o) => (
                <RadioPill
                  key={o.v}
                  active={form.freq === o.v}
                  onClick={() => set('freq', o.v)}
                >
                  {o.l}
                </RadioPill>
              ))}
            </div>
            <div
              className={`grid gap-[10px] mt-3 ${
                form.freq === 'daily'
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-3'
              }`}
            >
              <div>
                <FieldLabel required>Send time</FieldLabel>
                <input
                  type="time"
                  className={`${inputCls} font-[var(--mono)]`}
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                />
              </div>
              {form.freq === 'weekly' && (
                <div>
                  <FieldLabel required>Weekly day</FieldLabel>
                  <select
                    className={selectCls}
                    value={form.day}
                    onChange={(e) => set('day', e.target.value)}
                  >
                    {DAY_OPTS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.freq === 'monthly' && (
                <div>
                  <FieldLabel required>Monthly day</FieldLabel>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    className={`${inputCls} font-[var(--mono)]`}
                    value={form.dom}
                    onChange={(e) => set('dom', e.target.value)}
                  />
                </div>
              )}
              {form.freq === 'custom' && (
                <>
                  <div className="min-w-0">
                    <FieldLabel required>Start date</FieldLabel>
                    <SingleDatePicker
                      value={form.startDate}
                      maxDate={form.endDate || todayIso()}
                      placeholder="Start date"
                      clearable
                      onChange={(d) => set('startDate', d)}
                    />
                  </div>
                  <div className="min-w-0">
                    <FieldLabel required>End date</FieldLabel>
                    <SingleDatePicker
                      value={form.endDate}
                      minDate={form.startDate || undefined}
                      maxDate={todayIso()}
                      placeholder="End date"
                      clearable
                      onChange={(d) => set('endDate', d)}
                    />
                  </div>
                </>
              )}
            </div>
            {form.freq === 'custom' && (
              <p className="mt-[8px] text-[10.5px] text-[var(--tx3)]">
                A custom schedule sends once for the chosen range, then turns off automatically.
              </p>
            )}
          </Section>

          {/* Recipients */}
          <Section title="Recipients" icon={Mail}>
            <FieldLabel required>Verified email recipients</FieldLabel>
            {recipients.length > 0 ? (
              <MultiSelect
                options={recipientOptions}
                value={form.recipients}
                onChange={(v) => set('recipients', v)}
                placeholder="Select verified recipients"
                searchPlaceholder="Search verified recipients..."
                msg="No verified email recipients found"
                maxHeight="max-h-48"
              />
            ) : (
              <div className="flex items-center gap-2 px-[12px] py-[10px] rounded-[8px] border border-dashed border-[var(--crit)]/40 bg-[var(--bg2)] text-[11.5px] text-[var(--tx3)]">
                No verified recipients yet — add and verify one under Settings → Recipients.
              </div>
            )}
          </Section>

          {/* Stations */}
          <Section title="Stations covered" icon={Settings2}>
            <select
              className={selectCls}
              value={form.scope}
              onChange={(e) => set('scope', e.target.value)}
            >
              {scopeOpts.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </Section>

          {/* Report format */}
          <Section title="Report format" icon={FileText}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[['pdf', 'PDF'], ['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV']].map(([k, label]) => (
                <CheckCard
                  key={k}
                  active={form.formats.includes(k)}
                  onClick={() => toggleFmt(k)}
                >
                  {label}
                </CheckCard>
              ))}
            </div>
            {!form.formats.length && (
              <p className="mt-[6px] text-[10.5px] text-[var(--crit)]">
                Pick at least one file format.
              </p>
            )}
          </Section>

          {/* Content options */}
          <Section title="Content" icon={SlidersHorizontal}>
            <div className="flex flex-col gap-[10px] p-[13px_14px] rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)]">
              <div
                onClick={() => toggle('includeSnaps')}
                className="flex items-center gap-[11px] cursor-pointer"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">Include camera snapshots</span>
                  <span className="block text-[10.5px] text-[var(--tx3)] mt-[2px]">
                    Adds a Snapshot column linking the QR-cam frame for every record
                  </span>
                </span>
                <Toggle on={form.includeSnaps} />
              </div>
              <div className="h-px bg-[var(--bd)]" />
              <div
                onClick={() => toggle('mismatchOnly')}
                className="flex items-center gap-[11px] cursor-pointer"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">Only mismatched units</span>
                  <span className="block text-[10.5px] text-[var(--tx3)] mt-[2px]">
                    Skip records where printed and measured size agree
                  </span>
                </span>
                <Toggle on={form.mismatchOnly} />
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-[10px] px-[20px] py-[15px] border-t border-[var(--bd2)] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-[12.5px] font-semibold text-[var(--tx2)] cursor-pointer rounded-[8px] px-[16px] py-[9px] border border-[var(--bd)] bg-[var(--bg2)] transition-colors hover:text-[var(--tx)] hover:border-[var(--bd2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={!canSave}
            style={{ background: GRADIENT }}
            className="ml-auto text-[12.5px] font-semibold text-white rounded-[8px] px-[16px] py-[9px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEdit ? 'Save changes' : 'Create schedule'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ScheduleModal;
