import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment-timezone';
import { X, Pencil, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import * as incidentApi from '../Api';
import { parseTime, formatTime } from '@/pages/AttendanceLogs/components/timeUtils';
import { UnifiedTimePicker } from '@/pages/AttendanceLogs/components/TimePickerComponents';

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

const toDateInput = (value) => {
  const m = moment(value);
  return m.isValid() ? m.format('YYYY-MM-DD') : '';
};
const toTimeParts = (value) => {
  const m = moment(value);
  return m.isValid() ? parseTime(m.format('hh:mm A')) : parseTime('');
};

/**
 * Theme-aware edit dialog for an incident-log row. Ported from V1's
 * EditANPRLogDialog — edits incident name, NVR, camera, severity and time (plus
 * the ANPR-only vehicle number when `showVehicleNumber`) via
 * PATCH /incidents/:id/details. Built as a self-contained modal using the vq
 * theme tokens so it renders correctly in both light and dark mode (the shared
 * shadcn Dialog uses bg-background, which isn't wired to the vq palette).
 *
 * `api` supplies { getNVRs, getchannels, editIncidentDetails } so any log page
 * can reuse this with its own Api module; defaults to the IncidentLogs Api.
 */
const EditIncidentDialog = ({
  open,
  row,
  onClose,
  onSaved,
  title = 'Edit Incident Log',
  showVehicleNumber = false,
  api = incidentApi,
}) => {
  const [form, setForm] = useState({
    incidentName: '',
    vehicleNumber: '',
    severity: '',
    incidentDate: '',
    nvrId: '',
    channelId: '',
  });
  const [timeParts, setTimeParts] = useState({ hour: '', minute: '', period: '' });
  const [saving, setSaving] = useState(false);
  const [nvrList, setNvrList] = useState([]);
  const [channelList, setChannelList] = useState([]);

  useEffect(() => {
    if (!open || !row) return;
    const source = row.timeOfIncident && row.timeOfIncident !== '--' ? row.timeOfIncident : row.createdAt;
    setForm({
      incidentName: row.incidentName === '--' ? '' : row.incidentName || '',
      vehicleNumber: row.vehicleNumber === '--' ? '' : row.vehicleNumber || '',
      severity: row.severity === '--' ? '' : row.severity || '',
      incidentDate: toDateInput(source),
      nvrId: row.nvrId || '',
      channelId: row.channelId || '',
    });
    setTimeParts(toTimeParts(source));
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    api.getNVRs()
      .then((res) => setNvrList(res?.data?.body?.data || []))
      .catch((err) => console.log('Error fetching NVRs:', err));
  }, [open, api]);

  useEffect(() => {
    if (!open || !form.nvrId) {
      setChannelList([]);
      return;
    }
    api.getchannels({ nvrIds: [form.nvrId] })
      .then((res) => setChannelList(res?.data?.body?.data || []))
      .catch((err) => console.log('Error fetching channels:', err));
  }, [open, form.nvrId, api]);

  if (!open || !row) return null;

  const handleNvrChange = (nvrId) => setForm((f) => ({ ...f, nvrId, channelId: '' }));

  const handleTimeChange = (part, value) => setTimeParts((p) => ({ ...p, [part]: value }));

  const handleSave = async () => {
    if (!row?._id) return;
    setSaving(true);
    try {
      const timeString = formatTime(timeParts.hour, timeParts.minute, timeParts.period);
      const combined =
        timeString && form.incidentDate
          ? moment(`${form.incidentDate} ${timeString}`, 'YYYY-MM-DD hh:mm A')
          : null;

      await api.editIncidentDetails(row._id, {
        incidentName: form.incidentName,
        ...(showVehicleNumber ? { vehicleNumber: form.vehicleNumber } : {}),
        severity: form.severity,
        timeOfIncident: combined?.isValid() ? combined.toISOString() : undefined,
        nvrId: form.nvrId || undefined,
        channelId: form.channelId || undefined,
      });
      toast.success('Incident details updated');
      onClose();
      onSaved?.();
    } catch (err) {
      console.log('Error updating incident details:', err);
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to update incident details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[480px] max-h-[88vh] overflow-y-auto bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[14px] p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--tx3)] hover:text-[var(--tx)] cursor-pointer"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <Pencil className="w-4 h-4 text-[var(--brand)]" />
          <h3 className="text-base font-semibold text-[var(--tx)]">{title}</h3>
        </div>

        <div className="space-y-4">
          {/* Incident Name */}
          <Field label="Incident Name">
            <input
              value={form.incidentName}
              onChange={(e) => setForm((f) => ({ ...f, incidentName: e.target.value }))}
              placeholder="Enter incident name"
              className="w-full h-9 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-sm text-[var(--tx)] placeholder:text-[var(--tx3)] outline-none focus:border-[var(--brand)]"
            />
          </Field>

          {/* NVR */}
          <Field label="NVR Name">
            <InlineSelect
              value={form.nvrId}
              onChange={handleNvrChange}
              options={nvrList.map((n) => ({ value: n._id || n.id, label: n.nvrName }))}
              placeholder="Select NVR"
            />
          </Field>

          {/* Camera */}
          <Field label="Camera Name">
            <InlineSelect
              value={form.channelId}
              onChange={(v) => setForm((f) => ({ ...f, channelId: v }))}
              options={channelList.map((c) => ({ value: c._id || c.id, label: c.customName || c.name }))}
              placeholder="Select Camera"
              disabled={!form.nvrId}
            />
          </Field>

          {/* Vehicle Number (ANPR only) */}
          {showVehicleNumber && (
            <Field label="Vehicle Number">
              <input
                value={form.vehicleNumber}
                onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
                placeholder="Enter vehicle number"
                className="w-full h-9 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-sm text-[var(--tx)] placeholder:text-[var(--tx3)] outline-none focus:border-[var(--brand)]"
              />
            </Field>
          )}

          {/* Severity */}
          <Field label="Severity">
            <InlineSelect
              value={form.severity}
              onChange={(v) => setForm((f) => ({ ...f, severity: v }))}
              options={SEVERITY_OPTIONS}
              placeholder="Select severity"
            />
          </Field>

          {/* Time of Incident */}
          <Field label="Time of Incident">
            <div className="flex items-start gap-2">
              <input
                type="date"
                value={form.incidentDate}
                onChange={(e) => setForm((f) => ({ ...f, incidentDate: e.target.value }))}
                className="h-10 flex-1 min-w-0 px-3 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-sm text-[var(--tx)] outline-none focus:border-[var(--brand)] [color-scheme:light] dark:[color-scheme:dark]"
              />
              <div className="flex-1 min-w-0">
                <UnifiedTimePicker
                  hour={timeParts.hour}
                  minute={timeParts.minute}
                  period={timeParts.period}
                  onChange={handleTimeChange}
                />
              </div>
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-9 px-4 rounded-lg text-sm font-medium border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] hover:text-[var(--tx)] cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] hover:opacity-95 cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-[var(--tx2)]">{label}</label>
    {children}
  </div>
);

/** Inline single-select styled with vq tokens (theme-aware). */
const InlineSelect = ({ value, onChange, options, placeholder, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full h-9 px-3 border border-[var(--bd)] rounded-lg text-sm bg-[var(--bg2)] cursor-pointer flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? 'text-[var(--tx)] capitalize truncate' : 'text-[var(--tx3)]'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--tx3)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-[95] mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] shadow-lg p-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--tx3)]">No options</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--bg2)] rounded flex items-center justify-between capitalize ${
                  value === opt.value ? 'bg-[var(--bg2)] font-medium text-[var(--brand)]' : 'text-[var(--tx)]'
                }`}
              >
                {opt.label}
                {value === opt.value && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default EditIncidentDialog;
