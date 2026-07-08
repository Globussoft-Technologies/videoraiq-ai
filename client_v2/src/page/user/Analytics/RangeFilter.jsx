import moment from 'moment';
import DateRangePicker from '@/pages/AttendanceLogs/components/DateRangePicker';

const PRESETS = [
  { key: '7d', label: '7 Days', days: 7 },
  { key: '30d', label: '30 Days', days: 30 },
  { key: 'custom', label: 'Custom' },
];

/**
 * Range state shape: { preset: '7d'|'30d'|'custom', days, startDate, endDate }.
 * days is only used for the two presets; startDate/endDate (YYYY-MM-DD) are
 * only set once a custom range is applied — every analytics API accepts
 * either `days` or an explicit startDate/endDate pair.
 */
export function defaultRange() {
  return { preset: '30d', days: 30, startDate: null, endDate: null };
}

export function rangeParams(range) {
  if (range.preset === 'custom' && range.startDate && range.endDate) {
    return { startDate: range.startDate, endDate: range.endDate };
  }
  return { days: range.days };
}

/** Short label from an analytics API response — every endpoint echoes back
 * either `days` or `{startDate, endDate}` (see server's describeRange()). */
export function rangeLabel(apiData) {
  if (!apiData) return '';
  if (apiData.days) return `${apiData.days}d`;
  if (apiData.startDate && apiData.endDate) {
    return `${moment(apiData.startDate).format('D MMM')} – ${moment(apiData.endDate).format('D MMM')}`;
  }
  return '';
}

export default function RangeFilter({ range, onChange }) {
  const pickerDates =
    range.startDate && range.endDate
      ? { start: range.startDate, end: range.endDate }
      : { start: null, end: null };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--bd)' }}>
        {PRESETS.map((p) => {
          const active = range.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                if (p.key === 'custom') {
                  onChange({ ...range, preset: 'custom' });
                } else {
                  onChange({ preset: p.key, days: p.days, startDate: null, endDate: null });
                }
              }}
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 7,
                border: 0,
                cursor: 'pointer',
                fontFamily: 'var(--ui)',
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                color: active ? '#fff' : 'var(--tx2)',
                background: active ? 'linear-gradient(135deg,var(--blue),var(--violet))' : 'transparent',
                transition: 'background .15s,color .15s',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {range.preset === 'custom' && (
        <DateRangePicker
          startDate={pickerDates.start}
          endDate={pickerDates.end}
          maxDate={new Date()}
          onRangeChange={({ start, end }) => {
            if (!start) {
              onChange({ ...range, startDate: null, endDate: null });
              return;
            }
            onChange({
              ...range,
              startDate: moment(start).format('YYYY-MM-DD'),
              endDate: moment(end || start).format('YYYY-MM-DD'),
            });
          }}
        />
      )}
    </div>
  );
}
