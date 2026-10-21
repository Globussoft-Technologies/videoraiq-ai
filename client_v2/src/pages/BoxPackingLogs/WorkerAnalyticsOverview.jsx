import { useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, Clock3, PackageCheck, Trophy } from 'lucide-react';
import { formatPackingDuration, packingEndTimestamp, packingWorkerId } from './boxPackingData';
import { WARN, mono, label, Panel } from '@/pages/SolderLine/ui';

const PACKING_TIMEZONE = 'Asia/Kolkata';
const WORKER_COLORS = ['#2563eb', '#8b5cf6', '#0f9f8f', '#f59e0b', '#e05a47', '#0891b2'];

function SummaryCard({ icon: Icon, title, value, detail, color }) {
  return <div style={{ position: 'relative', minWidth: 0, overflow: 'hidden', padding: '15px 16px', border: '1px solid var(--bd)', borderRadius: 13, background: 'var(--bg1)' }}>
    <span style={{ position: 'absolute', inset: '0 auto 0 0', width: 3, background: color }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, color }}><Icon size={14} /><span style={{ ...label, color: 'inherit' }}>{title}</span></div>
    <div style={{ marginTop: 7, fontFamily: 'var(--disp)', fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    <div style={{ marginTop: 4, color: 'var(--tx3)', fontSize: 11 }}>{detail}</div>
  </div>;
}

export default function WorkerAnalyticsOverview({ rows, cameraName }) {
  const [sort, setSort] = useState({ key: 'count', direction: 'desc' });
  const workers = useMemo(() => {
    const grouped = rows.reduce((result, row) => {
      const worker = packingWorkerId(row);
      if (!worker) return result;
      result[worker] ||= { worker, rows: [] };
      result[worker].rows.push(row);
      return result;
    }, {});

    return Object.values(grouped).map((group, index) => {
      const durations = group.rows.map((row) => Number(row.timeTakenSec) || 0).filter((value) => value > 0);
      const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
      const lastCompleted = group.rows.reduce((latest, row) => {
        const value = new Date(packingEndTimestamp(row)).getTime();
        return Number.isFinite(value) && value > latest ? value : latest;
      }, 0);
      return {
        ...group,
        color: WORKER_COLORS[index % WORKER_COLORS.length],
        count: group.rows.length,
        average,
        lastCompleted,
      };
    }).sort((left, right) => right.count - left.count || left.average - right.average || left.worker.localeCompare(right.worker));
  }, [rows]);

  const timedWorkers = workers.filter((worker) => worker.average > 0);
  const timedRows = workers.flatMap((worker) => worker.rows.map((row) => Number(row.timeTakenSec) || 0).filter((seconds) => seconds > 0));
  const teamAverage = timedRows.length ? timedRows.reduce((sum, seconds) => sum + seconds, 0) / timedRows.length : 0;
  const topWorker = workers[0];
  const fastestWorker = [...workers].filter((worker) => worker.count >= 2 && worker.average > 0).sort((left, right) => left.average - right.average)[0];
  const chartWorkers = [...workers].sort((left, right) => {
    if (!left.average) return 1;
    if (!right.average) return -1;
    return left.average - right.average;
  });
  const dailyBreakdown = useMemo(() => {
    const grouped = rows.reduce((result, row) => {
      const date = moment.tz(row.time, PACKING_TIMEZONE).format('YYYY-MM-DD');
      const worker = packingWorkerId(row);
      if (!worker || !date) return result;
      result[date] ||= {};
      result[date][worker] ||= { count: 0, seconds: 0 };
      result[date][worker].count += 1;
      result[date][worker].seconds += Number(row.timeTakenSec) || 0;
      return result;
    }, {});
    return Object.entries(grouped).sort(([left], [right]) => right.localeCompare(left)).map(([date, workerData]) => ({
      date,
      label: moment.tz(date, 'YYYY-MM-DD', PACKING_TIMEZONE).format('DD MMM'),
      total: Object.values(workerData).reduce((sum, item) => sum + item.count, 0),
      workerData,
    }));
  }, [rows]);
  const dailyMax = Math.max(...dailyBreakdown.flatMap((day) => Object.values(day.workerData).map((item) => item.count)), 1);
  const sortedWorkers = useMemo(() => [...workers].sort((left, right) => {
    const leftValue = sort.key === 'worker' ? left.worker.toLowerCase() : left[sort.key];
    const rightValue = sort.key === 'worker' ? right.worker.toLowerCase() : right[sort.key];
    const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    return sort.direction === 'asc' ? result : -result;
  }), [workers, sort]);
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const sortHeader = (key, text) => <button type="button" onClick={() => changeSort(key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, padding: 0, border: 0, color: sort.key === key ? '#4f46e5' : 'inherit', background: 'transparent', font: 'inherit', fontWeight: 600, letterSpacing: 'inherit', cursor: 'pointer', textAlign: 'left' }}>{text}{sort.key === key ? sort.direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <span style={{ opacity: .45 }}><ArrowDown size={11} /></span>}</button>;

  const comparisonLabel = (worker) => {
    if (!worker.average || !teamAverage) return { text: 'No timing data', color: 'var(--tx3)', background: 'var(--bg2)' };
    const difference = Math.round(worker.average - teamAverage);
    if (Math.abs(difference) < 1) return { text: 'Matches team average', color: '#4f46e5', background: '#4f46e514' };
    if (difference < 0) return { text: formatPackingDuration(Math.abs(difference)) + ' faster', color: '#078567', background: '#07856714' };
    return { text: formatPackingDuration(difference) + ' slower', color: WARN, background: WARN + '14' };
  };

  if (!workers.length) return <Panel>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}><BarChart3 size={17} color="#4f46e5" /><strong style={{ fontSize: 15 }}>Worker comparison</strong></div>
    <div style={{ color: 'var(--tx3)', fontSize: 12 }}>No worker packing activity is available for this camera in the selected period.</div>
  </Panel>;

  return <Panel pad={false} style={{ overflow: 'hidden' }}>
    <style>{'.worker-comparison-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.worker-time-ranking{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}@media(max-width:850px){.worker-comparison-summary{grid-template-columns:1fr}}'}</style>
    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--bd)', background: 'linear-gradient(110deg, rgba(79,70,229,.09), rgba(8,145,178,.04) 52%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 10, color: '#4f46e5', background: '#4f46e518', border: '1px solid #4f46e52b' }}><BarChart3 size={18} /></span>
        <div style={{ minWidth: 0 }}><div style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 17 }}>Worker comparison</div><div style={{ marginTop: 3, color: 'var(--tx3)', fontSize: 11.5 }}>Output and average completion time for {cameraName || 'the selected camera'}.</div></div>
        <span style={{ marginLeft: 'auto', padding: '5px 9px', borderRadius: 99, color: '#4f46e5', background: '#4f46e512', ...mono, fontSize: 9, fontWeight: 700 }}>{workers.length} ACTIVE WORKERS</span>
      </div>
    </div>

    <div className="worker-comparison-summary" style={{ padding: '16px 20px 4px' }}>
      <SummaryCard icon={Clock3} title="Team average" value={formatPackingDuration(teamAverage)} detail={timedRows.length + ' timed boxes'} color="#4f46e5" />
      <SummaryCard icon={PackageCheck} title="Most boxes" value={topWorker?.worker || '-'} detail={(topWorker?.count || 0) + ' completed'} color="#0f9f8f" />
      <SummaryCard icon={Trophy} title="Fastest average" value={fastestWorker?.worker || '-'} detail={fastestWorker ? formatPackingDuration(fastestWorker.average) + ' per box' : 'Needs 2+ boxes'} color="#2563eb" />
    </div>

    <div style={{ padding: '16px 20px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <CalendarDays size={15} color="#4f46e5" />
        <strong style={{ fontSize: 14 }}>Daily worker output</strong>
        <span style={{ color: 'var(--tx3)', fontSize: 10.5 }}>Boxes completed by each worker during every shift day.</span>
      </div>
      <div style={{ display: 'grid', gap: 9 }}>
        {dailyBreakdown.map((day) => <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) 52px', gap: 12, alignItems: 'center', padding: '11px 12px', border: '1px solid var(--bd)', borderRadius: 11, background: 'var(--bg2)' }}>
          <div><div style={{ fontWeight: 800, fontSize: 12 }}>{day.label}</div><div style={{ color: 'var(--tx3)', fontSize: 9 }}>shift total</div></div>
          <div style={{ display: 'grid', gap: 5 }}>
            {workers.map((worker) => { const item = day.workerData[worker.worker]; const width = item ? Math.max(5, (item.count / dailyMax) * 100) : 0; return <div key={worker.worker} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}><span style={{ width: 24, color: worker.color, fontSize: 10, fontWeight: 800 }}>{worker.worker}</span><div title={item ? `${worker.worker}: ${item.count} boxes` : `${worker.worker}: no boxes`} style={{ height: 8, flex: 1, borderRadius: 99, background: 'var(--bg1)', overflow: 'hidden' }}><div style={{ width: `${width}%`, height: '100%', borderRadius: 99, background: worker.color, opacity: item ? 1 : 0 }} /></div><span style={{ width: 22, textAlign: 'right', ...mono, fontSize: 10, fontWeight: 700 }}>{item?.count || 0}</span></div>; })}
          </div>
          <div style={{ textAlign: 'right', ...mono, fontSize: 12, fontWeight: 800, color: '#4f46e5' }}>{day.total}<div style={{ color: 'var(--tx3)', fontSize: 9, fontWeight: 500 }}>boxes</div></div>
        </div>)}
      </div>
      {!dailyBreakdown.length && <div style={{ padding: 16, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>No daily worker activity is available.</div>}
    </div>

    <div style={{ padding: '16px 20px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}><strong style={{ fontSize: 14 }}>Worker leaderboard</strong><span style={{ color: 'var(--tx3)', fontSize: 10.5 }}>Focused on output, average time and the latest completed box.</span></div>
      <div style={{ overflowX: 'auto', border: '1px solid var(--bd)', borderRadius: 11 }}>
        <table style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead><tr style={{ background: 'var(--bg2)', color: 'var(--tx3)', fontSize: 9, letterSpacing: '.06em', textAlign: 'left' }}>{[['worker', 'WORKER'], ['count', 'BOXES PACKED'], ['average', 'AVERAGE TIME'], ['lastCompleted', 'LAST COMPLETED']].map(([key, heading]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} style={{ padding: '11px 13px', fontWeight: 600 }}>{sortHeader(key, heading)}</th>)}</tr></thead>
          <tbody>{sortedWorkers.map((worker) => <tr key={worker.worker} style={{ borderTop: '1px solid var(--bd)' }}>
              <td style={{ padding: '12px 13px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ width: 31, height: 31, display: 'grid', placeItems: 'center', borderRadius: 9, color: worker.color, background: worker.color + '18', fontWeight: 800 }}>{worker.worker}</span><div style={{ color: worker.count < 2 ? WARN : 'var(--tx3)', fontSize: 10 }}>{worker.count < 2 ? 'Small sample' : worker.count + ' packing records'}</div></div></td>
              <td style={{ padding: '12px 13px', fontWeight: 800, ...mono }}>{worker.count}</td>
              <td style={{ padding: '12px 13px', fontWeight: 700, ...mono }}>{formatPackingDuration(worker.average)}</td>
              <td style={{ padding: '12px 13px', whiteSpace: 'nowrap', ...mono }}>{worker.lastCompleted ? moment.tz(worker.lastCompleted, PACKING_TIMEZONE).format('DD MMM, hh:mm A') : '-'}</td>
            </tr>)}</tbody>
        </table>
      </div>
    </div>

    <div style={{ padding: '18px 20px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 13 }}>
        <div><strong style={{ fontSize: 14 }}>Worker completion-time ranking</strong><div style={{ marginTop: 3, color: 'var(--tx3)', fontSize: 11 }}>Workers are ordered from the shortest to the longest average completion time.</div></div>
        <span style={{ padding: '6px 10px', borderRadius: 99, color: '#4f46e5', background: '#4f46e512', ...mono, fontSize: 10, fontWeight: 700 }}>TEAM AVERAGE {formatPackingDuration(teamAverage)}</span>
      </div>
      <div className="worker-time-ranking">
        {chartWorkers.map((worker, index) => {
          const comparison = comparisonLabel(worker);
          return <div key={worker.worker} style={{ position: 'relative', minWidth: 0, padding: '15px 16px', border: `1px solid ${index === 0 && worker.average ? worker.color : 'var(--bd)'}`, borderRadius: 13, background: index === 0 && worker.average ? 'linear-gradient(145deg, ' + worker.color + '12, var(--bg1))' : 'var(--bg2)', boxShadow: index === 0 && worker.average ? '0 8px 22px ' + worker.color + '12' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: '50%', color: index === 0 ? '#fff' : worker.color, background: index === 0 ? worker.color : worker.color + '16', ...mono, fontWeight: 800 }}>{index + 1}</span><div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 14 }}>{worker.worker}</div><div style={{ color: 'var(--tx3)', fontSize: 10 }}>{worker.count} completed box{worker.count === 1 ? '' : 'es'}</div></div>{index === 0 && worker.average > 0 && <span style={{ marginLeft: 'auto', padding: '4px 7px', borderRadius: 99, color: '#078567', background: '#07856714', fontSize: 9, fontWeight: 800 }}>FASTEST</span>}</div>
            <div style={{ marginTop: 16 }}><div style={{ ...label, color: 'var(--tx3)' }}>AVERAGE COMPLETION TIME</div><div style={{ marginTop: 5, fontFamily: 'var(--disp)', fontSize: 25, fontWeight: 800, color: worker.average ? 'var(--tx)' : 'var(--tx3)' }}>{formatPackingDuration(worker.average)}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 13, paddingTop: 11, borderTop: '1px solid var(--bd)' }}><span style={{ color: 'var(--tx3)', fontSize: 10 }}>Compared with team</span><span style={{ padding: '4px 8px', borderRadius: 99, color: comparison.color, background: comparison.background, fontSize: 10, fontWeight: 700 }}>{comparison.text}</span></div>
          </div>;
        })}
      </div>
      {!timedWorkers.length && <div style={{ padding: 18, textAlign: 'center', color: 'var(--tx3)', fontSize: 12 }}>No completion-time data is available for these workers.</div>}
    </div>
  </Panel>;
}
