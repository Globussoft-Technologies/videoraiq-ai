import { useMemo, useRef, useState } from 'react';
import moment from 'moment';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Panel, PanelHeader, Badge } from '../../../components/primitives';
import { AsyncBoundary } from '../../../components/States';
import { useApi } from '../../../hooks/useApi';
import { getAttendanceAnalytics } from '../../../helpers/analytics';
import { getAttendanceLogs } from '../../../pages/AttendanceLogs/Api';
import { authorizedUsers } from '../../../pages/RegisterUser/Api';
import AnalyticsBlurb from './AnalyticsBlurb';

// Same page size Attendance Logs' own KPI tiles are counted from, reused
// here so "Currently Present" / "Absentees" match Attendance Logs exactly
// for the same range instead of the range-wide server aggregate.
const LOGS_STATS_LIMIT = 200;

/**
 * Attendance Analytics.
 *
 * Sourced from attendance logs only: employees, present, checked out,
 * absentees, check-in and check-out counts, the Daily Activity bars, and
 * attendance anomalies.
 *
 * Access-log-derived "unauthorized access" figures were removed â€” the
 * underlying detection-to-roster matching isn't reliable enough yet for
 * testers to verify against, so surfacing it here was misleading rather
 * than useful.
 */

const severityColor = {
  critical: 'var(--crit)',
  high: 'var(--crit)',
  medium: 'var(--warn)',
  info: 'var(--ok)',
};

const PLOT_H = 172;
const COLORS = {
  present: 'var(--ok)',
  checkedOut: 'var(--blue)',
  // --warn resolves to the same hex in both themes, so a literal alpha of it
  // reads correctly in light and dark. Absent is deliberately the quietest of
  // the three â€” it's the remainder of the roster, not an event.
  absent: 'rgba(245, 166, 35, 0.34)',
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

function MetricTile({ icon: Icon, label, metric, color, subLabel, positiveUp = true }) {
  const pct = Number(metric?.pct || 0);

  return (
    <div
      style={{
        border: '1px solid var(--bd)',
        background: 'var(--bg2)',
        borderRadius: 8,
        padding: 12,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
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
              const present = Number(row.present || 0);
              const checkedOut = Number(row.checkedOut || 0);
              const absent = Number(row.absentees || 0);
              const share = (value) => (roster > 0 ? (value / roster) * 100 : 0);

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
                    <span style={{ height: `${share(present)}%`, background: COLORS.present }} />
                    <span style={{ height: `${share(checkedOut)}%`, background: COLORS.checkedOut }} />
                    <span style={{ height: `${share(absent)}%`, background: COLORS.absent }} />
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
                aria-label={`${moment(row.date).format('D MMM')}: ${row.present} present, ${row.absentees} absent`}
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
            <TooltipRow color={COLORS.checkedOut} label="Checked out" value={numberFmt(hover.row.checkedOut)} />
            <TooltipRow color={COLORS.absent} label="Absent" value={numberFmt(hover.row.absentees)} />
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

function CountStrip({ title, items = [] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }} className="vq-att-event-grid">
        {items.map(([label, value, hint]) => (
          <div
            key={label}
            title={hint || undefined}
            style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: '9px 10px', background: 'var(--bg2)', minWidth: 0 }}
          >
            <div style={{ fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </div>
            <div style={{ marginTop: 4, fontFamily: 'var(--disp)', fontSize: 17, fontWeight: 700 }}>{numberFmt(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCounts({ counts = {} }) {
  return (
    <CountStrip
      title="From attendance logs"
      items={[
        ['Attendance logs', counts.attendanceLogs, 'Employee-day rows, same unit as the Attendance Logs page'],
        ['Check-in logs', counts.checkinLogs, 'Attendance logs containing at least one check-in'],
        ['Check-out logs', counts.checkoutLogs, 'Attendance logs containing at least one check-out'],
      ]}
    />
  );
}

function Anomalies({ items = [] }) {
  if (!items.length) {
    return (
      <div
        style={{
          height: '100%',
          minHeight: 120,
          display: 'grid',
          placeItems: 'center',
          border: '1px dashed var(--bd)',
          borderRadius: 8,
          color: 'var(--tx3)',
          fontSize: 11.5,
          padding: 12,
          textAlign: 'center',
        }}
      >
        No attendance anomalies detected
      </div>
    );
  }

  return (
    <div className="vq-scroll" style={{ display: 'grid', gap: 8, alignContent: 'start', maxHeight: 260, overflowY: 'auto' }}>
      {items.map((item) => {
        const color = severityColor[item.severity] || 'var(--tx3)';
        return (
          <div
            key={`${item.type}-${item.title}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              alignItems: 'start',
              gap: 9,
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${color}`,
              background: 'var(--bg2)',
            }}
          >
            <AlertTriangle size={16} strokeWidth={2} style={{ color, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{item.title}</span>
                {item.group && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--tx3)', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                    {item.group}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 2, fontSize: 11, color: 'var(--tx2)' }}>{item.message}</div>
            </div>
            <Badge color={color}>{item.severity}</Badge>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Total Employees / Currently Present / Absentees counted the same way
 * Attendance Logs counts its own tiles: from raw attendance-log rows for
 * the selected range, not the attendance-summary server aggregate. Present
 * = checked in AND checked out; Absent = every other loaded row (mirrors
 * AttendanceLogs.jsx's `stats` exactly, including that a row which checked
 * in but hasn't checked out yet counts as Absent here too).
 */
function useLogsStyleTotals(params) {
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  const rosterApi = useApi(
    () => authorizedUsers(0, 1, '', {}),
    [paramsKey],
    { pollMs: 60000 }
  );
  const logsApi = useApi(
    () =>
      getAttendanceLogs(
        '',
        '',
        '',
        params.startDate || '',
        params.endDate || '',
        1,
        LOGS_STATS_LIMIT,
        'name',
        'asc',
        '',
        '',
        '',
        '',
        false,
        []
      ),
    [paramsKey],
    { pollMs: 60000 }
  );

  const totalEmployees = rosterApi.data?.body?.data?.totalCount || 0;
  const rows = logsApi.data?.data?.body?.data?.attendanceLogs || [];
  const present = rows.filter((r) => r.logInTime && r.logOutTime).length;
  const absent = rows.length - present;

  return {
    loading: rosterApi.loading || logsApi.loading,
    error: rosterApi.error || logsApi.error,
    refetch: () => {
      rosterApi.refetch();
      logsApi.refetch();
    },
    totalEmployees,
    present,
    absent,
  };
}

export default function AttendanceAnalytics({ params = {} }) {
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const analytics = useApi(() => getAttendanceAnalytics(params), [paramsKey], { pollMs: 60000 });
  const logsStyle = useLogsStyleTotals(params);
  const data = analytics.data || {};
  const counts = data.eventCounts || {};
  const activeRangeLabel = formatRangeLabel(data.range);

  const rangeAction = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--tx3)', fontSize: 11, fontWeight: 700 }}>
      <CalendarDays size={14} strokeWidth={2} />
      {activeRangeLabel || 'Selected range'}
    </span>
  );

  return (
    <Panel>
      <PanelHeader title="Attendance Analytics" dot dotColor="var(--blue)" action={rangeAction} />
      <div style={{ padding: '0 14px 0' }}>
        <AnalyticsBlurb>
          Attendance logs for the selected range: workforce presence, absentee patterns, and attendance anomalies.
        </AnalyticsBlurb>
      </div>
      <AsyncBoundary
        loading={analytics.loading || logsStyle.loading}
        error={analytics.error || logsStyle.error}
        onRetry={() => {
          analytics.refetch();
          logsStyle.refetch();
        }}
        minH={220}
        emptyLabel="No attendance analytics available"
      >
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 12 }} className="vq-att-kpi-grid">
            <MetricTile
              icon={Users}
              label="Total Employees"
              metric={{ count: logsStyle.totalEmployees }}
              color="var(--blue)"
              subLabel="Registered users"
            />
            <MetricTile
              icon={UserCheck}
              label="Currently Present"
              metric={{ count: logsStyle.present }}
              color="var(--ok)"
              subLabel="From attendance logs"
            />
            <MetricTile
              icon={UserX}
              label="Absentees"
              metric={{ count: logsStyle.absent }}
              color="var(--warn)"
              subLabel="From attendance logs"
              positiveUp={false}
            />
          </div>

          <EventCounts counts={counts} />

          <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 14 }} className="vq-att-detail-grid">
            <div style={{ border: '1px solid var(--bd)', borderRadius: 8, padding: 12, background: 'var(--bg2)', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>Daily Activity</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, flexWrap: 'wrap' }}>
                  <LegendItem color={COLORS.present} label="Present" />
                  <LegendItem color={COLORS.checkedOut} label="Checked out" />
                  <LegendItem color={COLORS.absent} label="Absent" />
                </div>
              </div>

              <DailyActivity series={data.series || []} employees={logsStyle.totalEmployees} />

              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--tx3)' }}>
                Bars: employees per day, stacked to the full roster (attendance logs).
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <Anomalies items={(data.anomalies || []).filter((item) => item.group === 'attendance')} />
            </div>
          </div>
        </div>
      </AsyncBoundary>
    </Panel>
  );
}



