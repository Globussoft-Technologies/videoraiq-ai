import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import {
  Activity,
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
// Matches the Attendance Logs status badges so a colour means the same thing on
// both screens. "No log" is deliberately the quietest of the set - it's the
// remainder of the roster, not an event.
const COLORS = {
  present: 'var(--ok)',
  halfDay: 'var(--warn)',
  shortDay: 'var(--crit)',
  checkedIn: 'var(--blue)',
  noLog: 'rgba(245, 166, 35, 0.22)',
};

function numberFmt(value) {
  return Number(value || 0).toLocaleString('en-IN');
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

function MetricTile({ icon: Icon, label, metric, color, subLabel, positiveUp = true, onClick }) {
  const pct = Number(metric?.pct || 0);

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      style={{
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
        <span style={{ fontSize: 11, color: 'var(--tx3)', paddingBottom: 4 }}>{pct}%</span>
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
        <Trend trend={metric?.trend} positiveUp={positiveUp} />
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
 * Daily Activity â€” attendance headcount per day.
 *
 * Bars (left axis, headcount) stack to the full roster: present + checked out +
 * absent, so each bar's coloured share reads directly as "who turned up".
 */
function DailyActivity({ series = [], employees = 0 }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const rows = Array.isArray(series) ? series : [];
  const roster = Math.max(Number(employees) || 0, ...rows.map((row) => Number(row.attended || 0)), 0);

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
              const share = (value) => (roster > 0 ? (Number(value || 0) / roster) * 100 : 0);

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
                      height: `${roster > 0 ? (roster / left.max) * 100 : 0}%`,
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      borderRadius: 3,
                      overflow: 'hidden',
                      background: 'var(--bg3)',
                    }}
                  >
                    {/* Bottom-up (column-reverse): the graded statuses first,
                        then the un-logged remainder of the roster on top. */}
                    <span style={{ height: `${share(row.present)}%`, background: COLORS.present }} />
                    <span style={{ height: `${share(row.halfDay)}%`, background: COLORS.halfDay }} />
                    <span style={{ height: `${share(row.shortDay)}%`, background: COLORS.shortDay }} />
                    <span style={{ height: `${share(row.checkedIn)}%`, background: COLORS.checkedIn }} />
                    <span style={{ height: `${share(row.noLog)}%`, background: COLORS.noLog }} />
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
                aria-label={`${moment(row.date).format('D MMM')}: ${row.present} present, ${row.halfDay} half day, ${row.shortDay} absent, ${row.checkedIn} checked in, ${row.noLog} with no log`}
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
            <TooltipRow color={COLORS.present} label="Present" value={numberFmt(hover.row.present)} />
            <TooltipRow color={COLORS.halfDay} label="Half day" value={numberFmt(hover.row.halfDay)} />
            <TooltipRow color={COLORS.shortDay} label="Absent" value={numberFmt(hover.row.shortDay)} />
            <TooltipRow color={COLORS.checkedIn} label="Checked in" value={numberFmt(hover.row.checkedIn)} />
            <TooltipRow color={COLORS.noLog} label="No log" value={numberFmt(hover.row.noLog)} />
            <TooltipRow label="Attendance" value={`${attendancePct(hover.row)}%`} strong />

            <span style={{ height: 1, background: 'var(--bd)', margin: '3px 0' }} />

            <TooltipRow label="Check-in logs" value={numberFmt(hover.row.checkins)} />
            <TooltipRow label="Check-out logs" value={numberFmt(hover.row.checkouts)} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The KPI tiles are a single-day figure — presence only means anything for
 * one calendar day. They come from /analytics/attendance-presence, which
 * counts them from the Attendance Logs pipeline itself, so this widget and
 * the Attendance Logs page always agree for the same date.
 *
 * Rows are graded against the org's Settings > Attendance Rules thresholds:
 * Present (full day), Half Day, Absent (under half a day), and Checked In
 * (on site, no check-out yet).
 *
 * Both the KPI tiles and the Daily Activity chart are driven from the Range
 * control below rather than the page's shared Range filter (see
 * Analytics.jsx) — readers expect the chart to move with whatever range
 * they're inspecting right here, not a separate control at the top of the
 * page. It reuses the same 7/30/Custom picker the page-level filter uses.
 */
export default function AttendanceAnalytics({ timezone }) {
  const navigate = useNavigate();
  const today = useMemo(() => moment().format('YYYY-MM-DD'), []);

  const [range, setRange] = useState(defaultRange);

  const chartRange = useMemo(() => rangeParams(range), [range]);
  const chartRangeKey = useMemo(() => JSON.stringify(chartRange), [chartRange]);

  // Presence has no meaning over a range, so it shows the most recent day in
  // the selected range — the one day figure a range still unambiguously implies.
  const presenceDate = chartRange.endDate || today;

  // `includeAccess: false` — this widget shows attendance only, so the server
  // skips the two access-log rollups it would otherwise compute and discard.
  const analytics = useApi(
    () => getAttendanceAnalytics({ ...chartRange, timezone, includeAccess: false }),
    [chartRangeKey, timezone]
  );
  // Separate from `analytics` on purpose: changing the date must refetch only
  // this, not blank out the chart and anomalies behind a spinner.
  const presenceApi = useApi(
    () => getAttendancePresence({ date: presenceDate }),
    [presenceDate]
  );

  // Both halves refetch on the page's auto-refresh tick / manual refresh.
  // Silently, so the selected date and the chart stay put while they update.
  useAnalyticsRefresh(analytics.refetch);
  useAnalyticsRefresh(presenceApi.refetch);

  const data = analytics.data || {};
  const presence = presenceApi.data || {};
  const activeRangeLabel = formatRangeLabel(data.range);
  const presenceDayLabel = presenceDate === today ? 'Today' : moment(presenceDate).format('D MMM');

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
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
              Presence on {presenceDayLabel}
            </span>
            <RangeFilter range={range} onChange={setRange} />
          </div>

          {/* auto-fit rather than a fixed 5 columns: five tiles at 160px would
              overflow before the existing breakpoints kick in. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }} className="vq-att-kpi-grid">
            <MetricTile
              icon={Users}
              label="Total Employees"
              metric={{ count: presence.employees }}
              color="var(--blue)"
              subLabel="Registered users"
              onClick={() => navigate('/register-users')}
            />
            {/* Anyone who has checked in at all today, regardless of duration
                or whether they've since checked out. `checkin` is a
                duration-agnostic pseudo-status the backend matches on
                firstCheckIn presence, not one of the four real statuses. */}
            <MetricTile
              icon={UserCheck}
              label="Check In"
              metric={{ count: presence.checkinLogs }}
              color="var(--ok)"
              subLabel={`Checked in · ${presenceDayLabel}`}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: { startDate: presenceDate, endDate: presenceDate, statusFilter: 'checkin' },
                })
              }
            />
            <MetricTile
              icon={Hourglass}
              label="Half Day"
              metric={{ count: presence.halfDay }}
              color="var(--warn)"
              subLabel={`Part day · ${presenceDayLabel}`}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: { startDate: presenceDate, endDate: presenceDate, statusFilter: 'half_day' },
                })
              }
            />
            {/* Roster-based: total employees minus anyone who checked in
                today. Starts at the full roster and only drops as check-ins
                land — see attendancePresence() in analytics.service.js. The
                statusFilter=absent it links to can only surface employees who
                already have a log row (checked in/out under the half-day
                threshold); most of this count never checked in at all, so has
                no row to show. */}
            <MetricTile
              icon={UserX}
              label="Absentees"
              metric={{ count: presence.absent }}
              color="var(--crit)"
              subLabel={`No check-in · ${presenceDayLabel}`}
              positiveUp={false}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: { startDate: presenceDate, endDate: presenceDate, statusFilter: 'absent' },
                })
              }
            />
            <MetricTile
              icon={LogOut}
              label="Checkout"
              metric={{ count: presence.checkoutLogs }}
              color="var(--blue)"
              subLabel={`Checked out · ${presenceDayLabel}`}
              onClick={() =>
                navigate('/logs/attendance', {
                  state: { startDate: presenceDate, endDate: presenceDate, statusFilter: 'checkout' },
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, flexWrap: 'wrap' }}>
                <LegendItem color={COLORS.present} label="Present" />
                <LegendItem color={COLORS.halfDay} label="Half day" />
                <LegendItem color={COLORS.shortDay} label="Absent" />
                <LegendItem color={COLORS.checkedIn} label="Checked in" />
                <LegendItem color={COLORS.noLog} label="No log" />
              </div>
            </div>

            <DailyActivity series={data.series || []} employees={presence.employees} />

            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--tx3)' }}>
              Bars: employees per day, stacked to the full roster and graded by the same rules as the
              Attendance Logs page.
            </div>
          </div>
        </div>
      </AsyncBoundary>
    </Panel>
  );
}



