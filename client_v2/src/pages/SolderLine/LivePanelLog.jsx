import { mediaUrl } from '@/lib/format';
import { Panel, PanelHead } from './ui';
import { buildSolderReportRows } from './reportRows.js';
import TotalReport from './TotalReport';

export default function LivePanelLog({ station, live }) {
  // Select before building report rows so a long date range stays inexpensive.
  const panels = [...(station.panels || [])]
    .sort((a, b) => a.start.valueOf() - b.start.valueOf())
    .slice(-5);
  const rows = buildSolderReportRows('total', { ...station, panels }, mediaUrl)
    .map(row => ({
      Panel: row.Panel,
      Snapshot: row.Snapshot,
      ...Object.fromEntries(Object.entries(row).filter(([key]) => /^P\d+$/.test(key))),
      Time: row.Time,
    }));

  return (
    <Panel pad={false}>
      <div style={{ padding: '12px 14px 0' }}>
        <PanelHead title="Recent panel log" sub={live
          ? 'Latest 5 panels · refreshes every 30 seconds · green: soldered, red: missed'
          : 'Latest 5 panels in the selected period · green: soldered, red: missed'} />
      </div>
      <div style={{ padding: '0 14px 12px', maxHeight: 320, overflowY: 'auto' }}>
        <TotalReport rows={rows} animate />
      </div>
    </Panel>
  );
}
