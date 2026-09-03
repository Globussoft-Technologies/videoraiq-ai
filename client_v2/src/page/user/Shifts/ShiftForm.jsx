import React, { useState, useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Clock, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createShift, updateShift } from './Api';
import {
  DAYS,
  DAY_TYPE_META,
  defaultWorkingDays,
  nextDayType,
  readWorkingDays,
  windowMinutes,
} from './shiftDays';

const fieldClass =
  'border border-[var(--bd)] bg-[var(--bg3)] text-[var(--tx)] shadow-none rounded-[10px]';
const labelClass = 'text-xs text-[var(--tx2)] mb-1 ml-1 block';
const errorClass = 'text-[var(--crit)] text-[10px] mt-1 ml-1';

/** Number inputs post as strings; the API wants numbers. */
const asMinutes = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const minutesField = (label, max = 1440) =>
  Yup.number()
    .transform((value, original) => (String(original).trim() === '' ? undefined : value))
    .typeError(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} cannot exceed ${max} minutes`)
    .required(`${label} is required`);

const schema = Yup.object().shape({
  name: Yup.string().trim().min(3, 'Shift name must be at least 3 characters').max(100).required('Shift name is required'),
  startTime: Yup.string().matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Enter a valid start time').required('Start time is required'),
  endTime: Yup.string()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Enter a valid end time')
    .required('End time is required')
    .test('not-identical', 'End time must differ from the start time', function (value) {
      return !value || value !== this.parent.startTime;
    }),
  breakMinutes: minutesField('Break').test(
    'shorter-than-shift',
    'Break cannot be longer than the shift itself',
    function (value) {
      const span = windowMinutes(this.parent.startTime, this.parent.endTime);
      return span === null || value === undefined || value < span;
    },
  ),
  graceLateMinutes: minutesField('Grace late'),
  graceEarlyMinutes: minutesField('Grace early'),
  maxOvertimeMinutes: minutesField('Max overtime'),
  workingDays: Yup.object().test(
    'has-a-working-day',
    'Select at least one working day',
    (days) => Object.values(days || {}).some((day) => day?.type !== 'off'),
  ),
});

/** Square check control matching the Night Shift / Default Shift pills. */
const CheckPill = ({ checked, onChange, icon, label, tint }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex items-center gap-2.5 px-3.5 h-11 rounded-[10px] border transition-colors cursor-pointer"
    style={{
      borderColor: checked ? tint : 'var(--bd)',
      background: checked ? `color-mix(in srgb, ${tint} 14%, transparent)` : 'var(--bg2)',
    }}
    aria-pressed={checked}
  >
    <span
      className="w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center shrink-0"
      style={{
        borderColor: checked ? tint : 'var(--bd2)',
        background: checked ? tint : 'transparent',
      }}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="#fff" strokeWidth="2.2">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
    <span style={{ color: tint }}>{icon}</span>
    <span className="text-sm text-[var(--tx)]">{label}</span>
  </button>
);

const ShiftForm = ({ trigger, initialValues = null, mode = 'create', onSave }) => {
  const [open, setOpen] = useState(false);
  const suppressValidation = useRef(false);

  const formik = useFormik({
    initialValues: {
      name: initialValues?.name || '',
      startTime: initialValues?.startTime || '09:00',
      endTime: initialValues?.endTime || '18:00',
      breakMinutes: initialValues?.breakMinutes ?? 60,
      graceLateMinutes: initialValues?.graceLateMinutes ?? 15,
      graceEarlyMinutes: initialValues?.graceEarlyMinutes ?? 15,
      maxOvertimeMinutes: initialValues?.maxOvertimeMinutes ?? 0,
      isNightShift: initialValues?.isNightShift ?? false,
      isDefault: initialValues?.isDefault ?? false,
      workingDays: initialValues ? readWorkingDays(initialValues) : defaultWorkingDays(),
    },
    validationSchema: schema,
    validateOnBlur: false,
    validateOnChange: false,
    enableReinitialize: true,
    onSubmit: async (values, helpers) => {
      const payload = {
        name: values.name.trim(),
        startTime: values.startTime,
        endTime: values.endTime,
        breakMinutes: asMinutes(values.breakMinutes),
        graceLateMinutes: asMinutes(values.graceLateMinutes),
        graceEarlyMinutes: asMinutes(values.graceEarlyMinutes),
        maxOvertimeMinutes: asMinutes(values.maxOvertimeMinutes),
        isNightShift: values.isNightShift,
        isDefault: values.isDefault,
        // Per-day overrides are only sent when they differ from the shift-level
        // window, so an unchanged day keeps inheriting it.
        workingDays: Object.fromEntries(
          DAYS.map(({ key }) => {
            const day = values.workingDays[key] || { type: 'off' };
            return [
              key,
              {
                type: day.type,
                ...(day.start ? { start: day.start } : {}),
                ...(day.end ? { end: day.end } : {}),
              },
            ];
          }),
        ),
      };

      try {
        const response =
          mode === 'edit'
            ? await updateShift(initialValues._id, payload)
            : await createShift(payload);

        if (response?.data?.statusCode === 200) {
          toast.success(
            response?.data?.body?.message ||
              (mode === 'edit' ? 'Shift updated successfully' : 'Shift created successfully'),
          );
          onSave?.(response?.data?.body?.data?.shift || null);
          setOpen(false);
          return;
        }
        toast.error(response?.data?.body?.message || 'Something went wrong');
      } catch (err) {
        // The service returns its Joi messages as an array under `error`.
        const body = err?.response?.data?.body;
        const detail = Array.isArray(body?.error) ? body.error[0] : body?.error;
        toast.error(detail || body?.message || 'Something went wrong');
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  const closeModal = () => {
    formik.setTouched({});
    formik.setErrors({});
    formik.setSubmitting(false);
    setOpen(false);
    setTimeout(() => formik.resetForm(), 0);
  };

  const handleOpenChange = (next) => {
    if (!next) {
      closeModal();
      return;
    }
    setOpen(true);
    setTimeout(() => {
      formik.resetForm();
      formik.setTouched({});
    }, 0);
  };

  const cycleDay = (key) => {
    const current = formik.values.workingDays[key]?.type || 'off';
    formik.setFieldValue('workingDays', {
      ...formik.values.workingDays,
      [key]: { ...formik.values.workingDays[key], type: nextDayType(current) },
    });
  };

  const numberField = (name, label, extraProps = {}) => (
    <div>
      <label className={labelClass}>{label}</label>
      <Input
        type="number"
        name={name}
        min={0}
        value={formik.values[name]}
        onChange={formik.handleChange}
        onBlur={suppressValidation.current ? undefined : formik.handleBlur}
        className={fieldClass}
        {...extraProps}
      />
      {formik.errors[name] && <div className={errorClass}>{formik.errors[name]}</div>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[18px] p-4 sm:p-5 shadow-xl w-[94vw] max-w-[720px] max-h-[92vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] hide-scrollbar scrollbar-hide"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] transition-colors top-5 right-5"
      >
        <DialogHeader className="flex-row items-center gap-3 text-left space-y-0">
          <span
            className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--blue) 16%, transparent)' }}
          >
            <Clock className="w-5 h-5 text-[var(--blue)]" />
          </span>
          <div>
            <DialogTitle className="text-base sm:text-lg font-semibold text-[var(--tx)]">
              {mode === 'edit' ? 'Edit Shift' : 'Create Shift'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--tx3)]">
              Configure shift timing &amp; working days
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={formik.handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className={labelClass}>
              Shift Name <span className="text-[var(--crit)]">*</span>
            </label>
            <Input
              name="name"
              placeholder="e.g., General Shift, Night Shift, Weekend Shift"
              value={formik.values.name}
              onChange={formik.handleChange}
              maxLength={100}
              className={fieldClass}
            />
            {formik.errors.name && <div className={errorClass}>{formik.errors.name}</div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start Time</label>
              <Input
                type="time"
                name="startTime"
                value={formik.values.startTime}
                onChange={formik.handleChange}
                className={fieldClass}
              />
              {formik.errors.startTime && <div className={errorClass}>{formik.errors.startTime}</div>}
            </div>
            <div>
              <label className={labelClass}>End Time</label>
              <Input
                type="time"
                name="endTime"
                value={formik.values.endTime}
                onChange={formik.handleChange}
                className={fieldClass}
              />
              {formik.errors.endTime && <div className={errorClass}>{formik.errors.endTime}</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {numberField('breakMinutes', 'Break (min)')}
            {numberField('graceLateMinutes', 'Grace Late (min)')}
            {numberField('graceEarlyMinutes', 'Grace Early (min)')}
          </div>

          <div>
            <div className="sm:max-w-[220px]">
              {numberField('maxOvertimeMinutes', 'Max overtime (minutes)')}
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--tx3)] mt-2">
              How long past the shift end an open check-in is still treated as active (so a
              forgotten checkout or genuine OT the next morning rolls over correctly). Set 0 for
              the system default (12 hours).
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <CheckPill
              checked={formik.values.isNightShift}
              onChange={(next) => formik.setFieldValue('isNightShift', next)}
              icon={<Moon className="w-4 h-4" />}
              label="Night Shift"
              tint="var(--violet)"
            />
            <CheckPill
              checked={formik.values.isDefault}
              onChange={(next) => formik.setFieldValue('isDefault', next)}
              icon={<Sun className="w-4 h-4" />}
              label="Default Shift"
              tint="var(--warn)"
            />
          </div>

          <div className="bg-[var(--bg2)] border border-[var(--bd)] rounded-[12px] p-3 sm:p-4">
            <div className="text-sm font-medium text-[var(--tx)] mb-3">Working Days</div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {DAYS.map(({ key, short }) => {
                const type = formik.values.workingDays[key]?.type || 'off';
                const meta = DAY_TYPE_META[type];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => cycleDay(key)}
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-[10px] border text-xs font-medium transition-colors cursor-pointer"
                    style={{ background: meta.bg, borderColor: meta.border, color: meta.fg }}
                    title={`${short}: ${meta.label}`}
                  >
                    <span>{short}</span>
                    <span className="text-[10px] opacity-80">{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--tx3)] text-center mt-3">
              Click to cycle: Off → Full Day → Half Day → Off
            </p>
            {formik.errors.workingDays && (
              <div className={`${errorClass} text-center`}>{formik.errors.workingDays}</div>
            )}
          </div>

          <DialogFooter className="mt-2 flex flex-row justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onMouseDown={() => {
                suppressValidation.current = true;
              }}
              onClick={closeModal}
              className="rounded-[10px] border-[var(--bd)] text-[var(--tx2)] hover:bg-[var(--bg3)] hover:text-[var(--tx)] bg-transparent transition-colors"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={formik.isSubmitting}
              className="bg-[var(--blue)] hover:opacity-95 active:scale-95 text-white rounded-[10px] transition-all cursor-pointer shadow-sm shadow-[var(--blue)]/20"
            >
              {mode === 'edit' ? 'Save Changes' : 'Create Shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ShiftForm;
