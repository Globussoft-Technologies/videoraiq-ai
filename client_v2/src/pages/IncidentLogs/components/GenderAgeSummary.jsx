import { useState } from 'react';
import { Users } from 'lucide-react';

function GenderCard({ label, count, zones, color }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? zones : zones.slice(0, 3);
  const countKey = label === 'Female' ? 'femaleCount' : 'maleCount';
  return <div className="flex flex-col gap-4 rounded-xl border border-[var(--bd)] bg-[var(--bg1)] p-4 sm:flex-row" style={{ borderLeft: `4px solid ${color}` }}>
    <div className="sm:w-32 sm:shrink-0">
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color }}><Users size={18} />{label}</div>
      <div className="mt-2 text-4xl font-bold tabular-nums" style={{ color }}>{count}</div>
      <p className="mt-2 text-xs text-[var(--tx3)]">Total in selected date range</p>
    </div>
    <div className="min-w-0 flex-1 overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[var(--tx3)]"><tr><th className="pb-2 pr-3 font-medium">Camera</th><th className="pb-2 font-medium">Zone</th><th scope="col" className="pb-2 text-right font-medium">Count</th></tr></thead>
        <tbody>{visible.map(zone => <tr key={`${zone.cameraId}:${zone.zoneIdx ?? zone.zone}`} className="border-t border-[var(--bd)]">
          <td className="py-2 pr-3 text-[var(--tx)]">{zone.cameraName}</td>
          <td className="py-2 text-[var(--tx2)]">{zone.zone}</td>
          <td className="py-2 text-right font-semibold tabular-nums" style={{ color }}>{zone[countKey] ?? 0}</td>
        </tr>)}</tbody>
      </table>
      {!zones.length && <p className="py-4 text-xs text-[var(--tx3)]">No zone details available yet.</p>}
      {zones.length > 3 && <button type="button" onClick={() => setExpanded(value => !value)} className="mt-2 w-full cursor-pointer text-right text-xs font-medium text-[var(--tx2)]">{expanded ? 'Show less' : 'View all'}</button>}
    </div>
  </div>;
}

export default function GenderAgeSummary({ summary, loading }) {
  const data = summary || { maleCount: 0, femaleCount: 0, totalCount: 0, zones: [] };
  return <section aria-label="Gender counts" aria-busy={loading} className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-[var(--tx)]">Gender counts</h2>
      <span className="text-xs text-[var(--tx2)]">Total in selected range: <strong>{data.totalCount}</strong></span>
    </div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <GenderCard label="Female" count={data.femaleCount} zones={data.zones} color="var(--violet)" />
      <GenderCard label="Male" count={data.maleCount} zones={data.zones} color="var(--blue)" />
    </div>
  </section>;
}
