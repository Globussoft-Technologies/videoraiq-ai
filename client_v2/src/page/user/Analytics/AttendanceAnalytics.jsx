import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { useEffect } from 'react';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  Activity,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  LogOut,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Panel, PanelHeader } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getAttendanceAnalytics, getAttendancePresence } from '../../../helpers/analytics';
import { getLocations } from '../../../helpers/monitoring';
import { useAnalyticsRefresh } from './AnalyticsRefreshContext';
import AnalyticsBlurb from './AnalyticsBlurb';
import RangeFilter, { defaultRange, rangeParams } from './RangeFilter';

/**
 * Attendance Analytics.
 *
 * Sourced from attendance logs only. Every figure is graded by the same rules
 * as the Attendance Logs page (Settings > Attendance Rules), so the two screens
 * always agree: the KPI tiles and the log counts for the selected day, and the
 * Daily Activity bars across the range.
 *
 * Two things were removed rather than left half-true. Access-log-derived
 * "unauthorized access" figures went first - the detection-to-roster matching
 * isn't reliable enough to verify against. The anomalies/Insights panel went
 * next: its only surviving finding restated the roster gap the chart's "No log"
 * band already shows, in different units and over a different window, which
 * read as a contradiction rather than an insight.
 */

const PLOT_H = 172;
const LOCATION_STORAGE_KEY = 'attendance_analytics_location';
const ALL_LOCATIONS = 'All Locations';
// One colour per bucket, matching the KPI tile of the same name so a colour
// means the same thing in both places — and matching the Attendance Logs status
// badges, so it means the same thing on that screen too.
const COLORS = {
  fullDay: 'var(--violet)',
  halfDay: 'var(--warn)',
  absentees: 'var(--crit)',
  stillIn: 'var(--blue)',
};

/**
 * The four states a roster splits into on a given day, and the only four that
 * are mutually exclusive: every employee is in exactly one, and they sum to the
 * roster. That is what makes them stackable.
 *
 * Check In and Checkout are deliberately not here. They are "did this event
 * happen at all", so they overlap all four — stacking them alongside these
 * counted the same people twice and made every band the wrong height. On 28 Aug
 * that stack totalled 619 against a roster of 562.
 */
function dayBuckets(row) {
  const fullDay = Number(row?.present || 0);
  const halfDay = Number(row?.halfDay || 0);
  // Left before the half-day mark, never checked out and timed out, or never
  // logged at all — the same total the Absentees tile shows.
  const absentees = Number(row?.shortDay || 0) + Number(row?.noLog || 0);
  // On site with no check-out yet, still inside the grace window. Empties out
  // once a day is over, which is why finished days now add up.
  const stillIn = Number(row?.checkedIn || 0);
  return { fullDay, halfDay, absentees, stillIn, total: fullDay + halfDay + absentees + stillIn };
}

function numberFmt(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function ratioPct(count, total) {
  const denominator = Number(total || 0);
  if (denominator <= 0) return 0;
  return (Number(count || 0) / denominator) * 100;
}

function formatPct(value) {
  const pct = Number(value || 0);
  if (!Number.isFinite(pct)) return '0%';
  return `${Math.round(pct)}%`;
}

/**
 * Rounded axis bounds: a step of 1, 2, 2.5 or 5 Ã— 10â¿ so ticks land on numbers
 * a reader can actually use. The old axis divided the raw maximum into
 * quarters, which produced labels like "3,17,325".
 */
function niceScale(maxValue, tickCount = 4) {
  const max = Math.max(Number(maxValue) || 0, 1);
  const rawStep = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const stepFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = stepFactor * magnitude;
  const top = Math.ceil(max / step) * step;

  const ticks = [];
  for (let value = 0; value <= top + step / 2; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return { max: top, ticks };
}

/**
 * A period-over-period change of several orders of magnitude is unreadable
 * as a percentage, so past Ã—10 it's shown as a multiple instead.
 */
function trendLabel(trend) {
  if (!trend) return '0%';
  const delta = Number(trend.delta || 0);
  if (delta === 0) return 'No change';
  if (trend.pct == null) return `${delta > 0 ? '+' : ''}${numberFmt(delta)} new`;
  if (Math.abs(trend.pct) >= 900 && trend.multiple) {
    return `Ã—${trend.multiple >= 10 ? numberFmt(Math.round(trend.multiple)) : Math.round(trend.multiple * 10) / 10}`;
  }
  return `${delta > 0 ? '+' : ''}${trend.pct}%`;
}

function trendColor(trend, positiveUp = true) {
  const direction = trend?.direction || 'flat';
  if (direction === 'flat') return 'var(--tx3)';
  const upGood = direction === 'up' && positiveUp;
  const downGood = direction === 'down' && !positiveUp;
  return upGood || downGood ? 'var(--ok)' : 'var(--crit)';
}

function formatRangeLabel(range) {
  if (!range) return '';
  if (range.startDate && range.endDate) {
    return `${moment(range.startDate).format('D MMM')} - ${moment(range.endDate).format('D MMM')}`;
  }
  if (range.days) return `${range.days}d`;
  return '';
}

/** "9h" / "4.5h" — the threshold a tile's count was graded against. */
function hoursLabel(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${Math.round(value * 10) / 10}h`;
}

/**
 * Tile footnote, e.g. "Full day ≥9h · 31 Aug". The threshold is dropped rather
 * than guessed at when the server hasn't reported one.
 */
function ruleSubLabel(prefix, hours, dayLabel) {
  const threshold = hoursLabel(hours);
  return `${prefix}${threshold ? ` ≥${threshold}` : ''} · ${dayLabel}`;
}

function attendancePct(row) {
  const attended = Number(row?.attended || 0);
  const roster = Number(row?.employees || 0);
  return roster > 0 ? Math.round((attended / roster) * 1000) / 10 : 0;
}

function Trend({ trend, positiveUp = true }) {
  const direction = trend?.direction || 'flat';
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Activity;
  const color = trendColor(trend, positiveUp);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={13} strokeWidth={2.2} />
      {trendLabel(trend)}
    </span>
  );
}

// Worded for "the selected day" rather than "today": the day stepper beside the
// tiles can point these at any past date.
function tileTooltipText(label) {
  switch (label) {
    case 'Check In':
      return 'Employees who were recorded at a check-in camera on the selected day. This includes everyone who arrived, however long they stayed and whether or not they have checked out.';
    case 'Full Day':
      return 'Employees whose first check-in to last check-out on the selected day spans at least the full-day requirement. Anyone still on site with no check-out yet is not counted, so this figure only settles once the day is over.';
    case 'Half Day':
      return 'Employees who checked in on the selected day and spent enough time on site for a half day, but not enough to count as a full day.';
    case 'Absentees':
      return 'Employees who are absent on the selected day. This includes people who never checked in and people who left too early to meet the half-day rule.';
    case 'Checkout':
      return 'Employees who were recorded at a check-out camera on the selected day after leaving the site.';
    default:
      return '';
  }
}

/**
 * Day stepper for the presence tiles.
 *
 * None of these figures are stored — every one is re-derived from the raw
 * check-in/check-out events on read — so the only way to check a calculation is
 * to point it at a day that has already finished and compare it against the
 * Attendance Logs rows for the same day. Stepping back one day at a time is
 * what that check actually needs; the range picker beside it drives the chart
 * and can't express "just yesterday" without switching to Custom.
 *
 * Forward is capped at today: there is nothing to grade in the future.
 */
function DayStepper({ date, maxDate, onChange }) {
  const day = moment(date, 'YYYY-MM-DD');
  const max = moment(maxDate, 'YYYY-MM-DD');
  const atMax = !day.isBefore(max, 'day');
  const isToday = day.isSame(max, 'day');
  // Year only when it isn't the current one, so the control stays narrow in the
  // case that's true 99% of the time. The full date is on the title attribute.
  const label = isToday ? 'Today' : day.format(day.isSame(max, 'year') ? 'D MMM' : 'D MMM YY');

  const stepButton = (delta, Icon, hint, disabled) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={hint}
      title={hint}
      onClick={() => onChange(day.clone().add(delta, 'day').format('YYYY-MM-DD'))}
      style={{
        height: 24,
        width: 24,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 6,
        border: 0,
        background: 'transparent',
        color: disabled ? 'var(--tx3)' : 'var(--tx2)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <Icon size={14} strokeWidth={2.2} />
    </button>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
      }}
    >
      {stepButton(-1, ChevronLeft, 'Previous day', false)}
      <span
        style={{
          minWidth: 62,
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--tx)',
          textTransform: 'none',
          letterSpacing: 0,
        }}
        title={day.format('dddd, D MMMM YYYY')}
      >
        {label}
      </span>
      {stepButton(1, ChevronRight, 'Next day', atMax)}
    </div>
  );
}

function MetricTile({ icon: Icon, label, metric, color, subLabel, positiveUp = true, onClick, footerValue = null }) {
  const pct = Number(metric?.pct || 0);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipText = tileTooltipText(label);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      style={{
        position: 'relative',
        border: '1px solid var(--bd)',
        background: 'var(--bg2)',
        borderRadius: 8,
        padding: 12,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {tooltipText && showTooltip && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 'calc(100% + 8px)',
            background: 'var(--tx)',
            color: 'var(--bg1)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 10.5,
            lineHeight: 1.45,
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.2)',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          {tooltipText}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            color,
            background: 'var(--bg3)',
            border: `1px solid ${color}`,
            flex: '0 0 auto',
          }}
        >
          <Icon size={16} strokeWidth={2.1} />
        </span>
        <span style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, minWidth: 0 }}>{label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: 'var(--disp)', fontSize: 24, fontWeight: 700, color: 'var(--tx)' }}>
          {numberFmt(metric?.count)}
        </span>
      </div>

      <div style={{ height: 5, borderRadius: 4, background: 'var(--bg3)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(Math.max(pct, 0), 100)}%`,
            background: color,
            borderRadius: 4,
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={subLabel}
        >
          {subLabel}
        </span>
        {footerValue != null ? (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--tx2)' }}>{footerValue}</span>
        ) : (
          <Trend trend={metric?.trend} positiveUp={positiveUp} />
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label, note, line = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      {line ? (
        <i style={{ display: 'inline-block', width: 13, height: 2, borderRadius: 2, background: color }} />
      ) : (
        <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color }} />
      )}
      <span style={{ color: 'var(--tx2)' }}>{label}</span>
      {note && <span style={{ color: 'var(--tx3)' }}>{note}</span>}
    </span>
  );
}

function TooltipRow({ color, label, value, strong = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: strong ? 'var(--tx)' : 'var(--tx2)' }}>
        {color && <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, background: color }} />}
        {label}
      </span>
      <span style={{ color: 'var(--tx)', fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

/**
 * Daily Activity â€” attendance mix per day.
 *
 * Each stick is split using the same counts shown in the tooltip so the
 * largest visible number always owns the largest visible colour share.
 */
function DailyActivity({ series = [], employees = 0 }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const rows = Array.isArray(series) ? series : [];
  const roster = Math.max(Number(employees) || 0, ...rows.map((row) => Number(row.attended || 0)), 0);
  const hasAttendanceData = rows.some((row) => {
    const present = Number(row?.present || 0);
    const halfDay = Number(row?.halfDay || 0);
    const shortDay = Number(row?.shortDay || 0);
    const checkedIn = Number(row?.checkedIn || 0);
    const noLog = Number(row?.noLog || 0);
    return present > 0 || halfDay > 0 || shortDay > 0 || checkedIn > 0 || noLog > 0;
  });

  const left = niceScale(roster, 4);

  const gridCols = `38px minmax(0, 1fr)`;
  const labelEvery = rows.length > 31 ? Math.ceil(rows.length / 31) : 1;

  const onHover = (event, row, index) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = event.clientX ? event.clientX - rect.left : rect.width / 2;
    const y = event.clientY ? event.clientY - rect.top : 0;
    setHover({ row, index, x, y });
  };

  if (!rows.length) {
    return (
      <div style={{ height: PLOT_H, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>
        No activity in the selected range
      </div>
    );
  }

  if (!hasAttendanceData) {
    return (
      <div style={{ height: PLOT_H, display: 'grid', placeItems: 'center', color: 'var(--tx3)', fontSize: 12 }}>
        No data available for the selected range
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8 }}>
        {/* Left axis â€” employees */}
        <div style={{ position: 'relative', height: PLOT_H }}>
          {left.ticks.map((tick) => (
            <span
              key={tick}
              style={{
                position: 'absolute',
                right: 0,
                top: `${(1 - tick / left.max) * 100}%`,
                transform: 'translateY(-50%)',
                fontFamily: 'var(--mono)',
                fontSize: 9.5,
                color: 'var(--tx3)',
              }}
            >
              {numberFmt(tick)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div
          style={{
            position: 'relative',
            height: PLOT_H,
            borderLeft: '1px solid var(--bd2)',
            borderBottom: '1px solid var(--bd2)',
          }}
        >
          {/* Gridlines, aligned to the left-axis ticks */}
          {left.ticks.map((tick) => (
            <span
              key={tick}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${(1 - tick / left.max) * 100}%`,
                borderTop: '1px solid var(--grid)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Hovered column highlight */}
          {hover && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(hover.index / rows.length) * 100}%`,
                width: `${(1 / rows.length) * 100}%`,
                background: 'var(--track)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Attendance bars â€” left axis */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end' }}>
            {rows.map((row) => {
              const buckets = dayBuckets(row);
              const share = (value) => (buckets.total > 0 ? (Number(value || 0) / buckets.total) * 100 : 0);

              return (
                <div
                  key={row.date}
                  style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '100%' }}
                >
                  <div
                    style={{
                      width: '58%',
                      minWidth: 4,
                      maxWidth: 18,
                      height: `${buckets.total > 0 ? (buckets.total / left.max) * 100 : 0}%`,
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      borderRadius: 3,
                      overflow: 'hidden',
                      background: 'var(--bg3)',
                    }}
                  >
                    <span style={{ height: `${share(buckets.fullDay)}%`, background: COLORS.fullDay }} />
                    <span style={{ height: `${share(buckets.halfDay)}%`, background: COLORS.halfDay }} />
                    <span style={{ height: `${share(buckets.absentees)}%`, background: COLORS.absentees }} />
                    <span style={{ height: `${share(buckets.stillIn)}%`, background: COLORS.stillIn }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hit areas â€” one per day, covering the full column height */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {rows.map((row, index) => (
              <div
                key={row.date}
                tabIndex={0}
                onMouseMove={(event) => onHover(event, row, index)}
                onFocus={(event) => onHover(event, row, index)}
                aria-label={`${moment(row.date).format('D MMM')}: ${row.employees} total employees, ${row.present || 0} full day, ${row.halfDay || 0} half day, ${(row.shortDay || 0) + (row.noLog || 0)} absentees, ${row.checkedIn || 0} still in, ${row.checkins || 0} checked in, ${row.checkouts || 0} checked out`}
                style={{ flex: '1 1 0', minWidth: 0, outline: 'none', cursor: 'default' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* X axis */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, marginTop: 5 }}>
        <span />
        <div style={{ display: 'flex' }}>
          {rows.map((row, index) => (
            <div
              key={row.date}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                textAlign: 'center',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: hover?.index === index ? 'var(--tx)' : 'var(--tx3)',
                fontWeight: hover?.index === index ? 700 : 400,
              }}
            >
              {index % labelEvery === 0 ? moment(row.date).format(rows.length > 10 ? 'DD' : 'DD MMM') : ''}
            </div>
          ))}
        </div>
        <span />
      </div>

      {hover?.row && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(hover.x + 14, 8), Math.max((wrapRef.current?.clientWidth || 320) - 208, 8)),
            top: Math.max(hover.y - 30, 4),
            width: 200,
            background: 'var(--tooltip)',
            border: '1px solid var(--bd2)',
            borderRadius: 8,
            padding: '9px 11px',
            backdropFilter: 'blur(6px)',
            pointerEvents: 'none',
            boxShadow: '0 10px 30px rgba(0,0,0,.22)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--tx)',
              marginBottom: 7,
            }}
          >
            <span>{moment(hover.row.date).format('DD MMM')}</span>
            <span style={{ color: 'var(--tx3)', fontWeight: 500 }}>{moment(hover.row.date).format('ddd')}</span>
          </div>

          <div style={{ display: 'grid', gap: 3.5, fontFamily: 'var(--mono)', fontSize: 10.5 }}>
            <TooltipRow label="Total Employees" value={numberFmt(hover.row.employees)} strong />
            <TooltipRow color={COLORS.fullDay} label="Full Day" value={numberFmt(hover.row.present)} />
            <TooltipRow color={COLORS.halfDay} label="Half Day" value={numberFmt(hover.row.halfDay)} />
            <TooltipRow
              color={COLORS.absentees}
              label="Absentees"
              value={numberFmt((hover.row.shortDay || 0) + (hover.row.noLog || 0))}
            />
            <TooltipRow color={COLORS.stillIn} label="Still In" value={numberFmt(hover.row.checkedIn)} />
            {/* Below the rule: not bands. These two overlap the four above —
                everyone who arrived, and everyone who left — so they get no
                swatch, which would promise a colour the stick doesn't have. */}
            <div style={{ borderTop: '1px solid var(--bd2)', marginTop: 2, paddingTop: 4, display: 'grid', gap: 3.5 }}>
              <TooltipRow label="Check In" value={numberFmt(hover.row.checkins)} />
              <TooltipRow label="Checkout" value={numberFmt(hover.row.checkouts)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function hasDailyAttendanceData(series = []) {
  return (Array.isArray(series) ? series : []).some((row) => {
    const present = Number(row?.present || 0);
    const halfDay = Number(row?.halfDay || 0);
    const shortDay = Number(row?.shortDay || 0);
    const checkedIn = Number(row?.checkedIn || 0);
    const noLog = Number(row?.noLog || 0);
    return present > 0 || halfDay > 0 || shortDay > 0 || checkedIn > 0 || noLog > 0;
  });
}

/**
 * The KPI tiles are a single-day figure — presence only means anything for
 * one calendar day. They come from /analytics/attendance-presence, which
 * counts them from the Attendance Logs pipeline itself, so this widget and
 * the Attendance Logs page always agree for the same date.
 *
 * Rows are graded against the org's Settings > Attendance Rules thresholds:
 * Present (full day), Half Day, Absent (under half a day), and Checked In
 * (on site, no check-out yet). The full-day bucket is shown as the "Full Day"
 * tile — "checked in" and "worked a full day" are different questions and this
 * screen now answers both separately, since an employee stays checked in long
 * after their shift ends and a check-in on its own says nothing about hours.
 *
 * Both the KPI tiles and the Daily Activity chart are driven from the Range
 * control below rather than the page's shared Range filter (see
 * Analytics.jsx) — readers expect the chart to move with whatever range
 * they're inspecting right here, not a separate control at the top of the
 * page. It reuses the same 7/30/Custom picker the page-level filter uses.
 *
 * The tiles additionally carry a day stepper: none of these numbers are stored,
 * so verifying one means re-deriving a finished day and comparing it with the
 * Attendance Logs rows behind it, which the range picker alone can't ask for.
 */
export default function AttendanceAnalytics({ timezone }) {
  const navigate = useNavigate();
  const today = useMemo(() => moment().format('YYYY-MM-DD'), []);

  const [range, setRange] = useState(defaultRange);
  // null = follow the range's last day (the old, only behaviour). A day picked
  // on the stepper wins until the range moves, at which point the tiles snap
  // back to the range again rather than stranding a day outside it.
  const [presenceDay, setPresenceDay] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(() => localStorage.getItem(LOCATION_STORAGE_KEY) || '');
  const [locationOptions, setLocationOptions] = useState([ALL_LOCATIONS]);

  useEffect(() => setPresenceDay(null), [range]);

  useEffect(() => {
    (async () => {
      try {
        const locations = await getLocations(0, 1000);
        const names = (Array.isArray(locations) ? locations : [])
          .map((location) => location?.locationName || location?.name || '')
          .filter(Boolean);
        setLocationOptions([ALL_LOCATIONS, ...new Set(names)]);
      } catch (error) {
        console.error('Failed to load locations for attendance analytics', error);
        setLocationOptions([ALL_LOCATIONS]);
      }
    })();
  }, []);

  useEffect(() => {
    const currentLabel = selectedLocation || ALL_LOCATIONS;
    if (locationOptions.includes(currentLabel)) return;
    localStorage.setItem(LOCATION_STORAGE_KEY, '');
    setSelectedLocation('');
  }, [locationOptions, selectedLocation]);

  const chartRange = useMemo(
    () => ({
      ...rangeParams(range),
      ...(selectedLocation ? { location: selectedLocation } : {}),
    }),
    [range, selectedLocation]
  );
  const chartRangeKey = useMemo(() => JSON.stringify(chartRange), [chartRange]);

  // Presence has no meaning over a range, so it defaults to the most recent day
  // in the selected range — the one day figure a range still unambiguously
  // implies — and the stepper beside the tiles can walk it back from there.
  const defaultPresenceDate = chartRange.endDate || today;
  const presenceDate = presenceDay || defaultPresenceDate;

  // `includeAccess: false` — this widget shows attendance only, so the server
  // skips the two access-log rollups it would otherwise compute and discard.
  const analytics = useApi(
    () => getAttendanceAnalytics({ ...chartRange, timezone, includeAccess: false }),
    [chartRangeKey, timezone]
  );
  // Separate from `analytics` on purpose: changing the date must refetch only
  // this, not blank out the chart and anomalies behind a spinner.
  const presenceApi = useApi(
    () => getAttendancePresence({ date: presenceDate, ...(selectedLocation ? { location: selectedLocation } : {}) }),
    [presenceDate, selectedLocation]
  );

  // Both halves refetch on the page's auto-refresh tick / manual refresh.
  // Silently, so the selected date and the chart stay put while they update.
  useAnalyticsRefresh(analytics.refetch);
  useAnalyticsRefresh(presenceApi.refetch);

  const data = analytics.data || {};
  const presence = presenceApi.data || {};
  const activeRangeLabel = formatRangeLabel(data.range);
  const presenceDayLabel = presenceDate === today ? 'Today' : moment(presenceDate).format('D MMM');
  const showDailyActivityHelpers = hasDailyAttendanceData(data.series || []);
  const totalEmployees = Number(presence.employees || 0);
  const totalEmployeesPct = ratioPct(totalEmployees, totalEmployees);
  const checkInPct = ratioPct(presence.checkinLogs, totalEmployees);
  // `present` is the server's name for the full-day bucket — first check-in to
  // last check-out spanning at least the org's full-day hours. It is surfaced
  // as "Full Day" because that is what the number means: "Present" reads as
  // "checked in and here", which is the Check In tile beside it.
  const fullDayPct = ratioPct(presence.present, totalEmployees);
  const halfDayPct = ratioPct(presence.halfDay, totalEmployees);
  const absentPct = ratioPct(presence.absent, totalEmployees);
  const checkoutPct = ratioPct(presence.checkoutLogs, totalEmployees);
  // Thresholds the server actually graded this day with, so the tiles state
  // their own rule instead of the reader having to open Attendance Rules.
  const fullDayHours = presence.rules?.fullDayHours;
  const halfDayHours = presence.rules?.halfDayHours;

  return (
    <Panel>
      {/* No range badge here: every figure on this widget is now driven by the
          date picker below, so a second date in the header just competed with
          it. The chart still carries the range in its own subtitle. */}
      <PanelHeader title="Attendance Analytics" dot dotColor="var(--blue)" />
      <div style={{ padding: '0 14px 0' }}>
        <AnalyticsBlurb>
          Attendance logs for the selected range: workforce presence, absentee patterns, and attendance anomalies.
        </AnalyticsBlurb>
      </div>
      <AsyncBoundary
        loading={analytics.loading}
        error={analytics.error}
        onRetry={() => analytics.refetch()}
        minH={220}
        emptyLabel="No attendance analytics available"
      >
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                Presence on
              </span>
              <DayStepper date={presenceDate} maxDate={today} onChange={setPresenceDay} />
              {/* One click back to the range's own day, so checking something
                  three weeks ago isn't three weeks of clicking to undo. */}
              {presenceDay && presenceDay !== defaultPresenceDate && (
                <button
                  type="button"
                  onClick={() => setPresenceDay(null)}
                  style={{
                    background: 'none',
                    border: 0,
                    padding: 0,
                    font: 'inherit',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--blue)',
                    cursor: 'pointer',
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}
                >
                  {defaultPresenceDate === today ? 'Today' : moment(defaultPresenceDate).format('D MMM')}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: 'var(--ui)', fontSize: 11.5, color: 'var(--tx3)' }}>Location</span>
                <div style={{ width: 230 }}>
                  <SearchableSelect
                    value={selectedLocation || ALL_LOCATIONS}
                    options={locationOptions}
                    onChange={(next) => {
                      const normalized = next === ALL_LOCATIONS ? '' : next;
                      localStorage.setItem(LOCATION_STORAGE_KEY, normalized);
                      setSelectedLocation(normalized);
                    }}
                    placeholder="Select location"
                    searchPlaceholder="Search location..."
                    emptyLabel="No locations found"
                  />
                </div>
              </div>
              <RangeFilter range={range} onChange={setRange} />
            </div>
          </div>

          {/* auto-fit rather than a fixed 5 columns: five tiles at 160px would
              overflow before the existing breakpoints kick in. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }} className="vq-att-kpi-grid">
            <MetricTile
              icon={Users}
              label="Total Employees"
              metric={{ count: presence.employees, pct: totalEmployeesPct }}
              color="var(--blue)"
              subLabel="Registered users"
              footerValue={formatPct(totalEmployeesPct)}
              onClick={() => navigate('/register-users')}
            />
            {/* Anyone who has checked in at all today, regardless of duration
                or whether they've since checked out. `checkin` is a
                duration-agnostic pseudo-status the backend matches on
                firstCheckIn presence, not one of the four real statuses. */}
            <MetricTile
              icon={UserCheck}
              label="Check In"
              metric={{ count: presence.checkinLogs, pct: checkInPct }}
              color="var(--ok)"
              subLabel={`Checked in · ${presenceDayLabel}`}
              footerValue={formatPct(checkInPct)}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: {
                    startDate: presenceDate,
                    endDate: presenceDate,
                    statusFilter: 'checkin',
                    employeeLocations: selectedLocation ? [selectedLocation] : [],
                  },
                })
              }
            />
            {/* The day actually worked, as opposed to merely started. Graded on
                elapsed time from the day's first check-in to its last
                check-out against Settings > Attendance Rules, so an employee
                still on site with no check-out yet is not counted here — they
                sit in Check In until they leave. That is why this tile can
                read 0 mid-morning and fill in over the afternoon; step the day
                back to see a finished one. */}
            <MetricTile
              icon={CalendarCheck}
              label="Full Day"
              metric={{ count: presence.present, pct: fullDayPct }}
              color={COLORS.fullDay}
              subLabel={ruleSubLabel('Full day', fullDayHours, presenceDayLabel)}
              footerValue={formatPct(fullDayPct)}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: {
                    startDate: presenceDate,
                    endDate: presenceDate,
                    statusFilter: 'present',
                    employeeLocations: selectedLocation ? [selectedLocation] : [],
                  },
                })
              }
            />
            <MetricTile
              icon={Hourglass}
              label="Half Day"
              metric={{ count: presence.halfDay, pct: halfDayPct }}
              color="var(--warn)"
              subLabel={ruleSubLabel('Half day', halfDayHours, presenceDayLabel)}
              footerValue={formatPct(halfDayPct)}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: {
                    startDate: presenceDate,
                    endDate: presenceDate,
                    statusFilter: 'half_day',
                    employeeLocations: selectedLocation ? [selectedLocation] : [],
                  },
                })
              }
            />
            {/* The full absence bucket for the selected day: employees who
                checked in but still graded absent, plus employees who never
                checked in at all. The Attendance Logs screen splits that same
                server-calculated total into Early Leave and Not Checked In. */}
            <MetricTile
              icon={UserX}
              label="Absentees"
              metric={{ count: presence.absent, pct: absentPct }}
              color="var(--crit)"
              subLabel={`Absent · ${presenceDayLabel}`}
              footerValue={formatPct(absentPct)}
              positiveUp={false}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: {
                    startDate: presenceDate,
                    endDate: presenceDate,
                    statusFilter: 'absent',
                    employeeLocations: selectedLocation ? [selectedLocation] : [],
                  },
                })
              }
            />
            <MetricTile
              icon={LogOut}
              label="Checkout"
              metric={{ count: presence.checkoutLogs, pct: checkoutPct }}
              color="var(--blue)"
              subLabel={`Checked out · ${presenceDayLabel}`}
              footerValue={formatPct(checkoutPct)}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: {
                    startDate: presenceDate,
                    endDate: presenceDate,
                    statusFilter: 'checkout',
                    employeeLocations: selectedLocation ? [selectedLocation] : [],
                  },
                })
              }
            />
          </div>

          {presenceApi.error && (
            <div style={{ fontSize: 11, color: 'var(--crit)' }}>
              Couldn&apos;t load presence for {presenceDayLabel}.{' '}
              <button
                type="button"
                onClick={() => presenceApi.refetch()}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--blue)', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Full width now that the Insights column is gone. Thirty stacked
              bars in a 1.35fr column were the most cramped thing on the page. */}
          <div style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: 12, background: 'var(--bg2)', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Daily Activity</span>
                <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{activeRangeLabel || 'Selected range'}</span>
              </div>
              {showDailyActivityHelpers && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, flexWrap: 'wrap' }}>
                  <LegendItem color={COLORS.fullDay} label="Full Day" />
                  <LegendItem color={COLORS.halfDay} label="Half Day" />
                  <LegendItem color={COLORS.absentees} label="Absentees" />
                  <LegendItem color={COLORS.stillIn} label="Still In" />
                </div>
              )}
            </div>

            <DailyActivity series={data.series || []} employees={presence.employees} />

            {showDailyActivityHelpers && (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--tx3)' }}>
                Bars: the four exclusive buckets every employee falls into, so each day's stick adds up to the
                full roster. Check In and Checkout sit below the line in the tooltip — they overlap these four
                rather than dividing them, so they aren&apos;t bands.
              </div>
            )}
          </div>
        </div>
      </AsyncBoundary>
    </Panel>
  );
}



