import { useState } from 'react';
import { mediaUrl } from '@/lib/format';
import { Panel, PanelHead } from './ui';
import { buildSolderReportRows } from './reportRows.js';
import TotalReport from './TotalReport';

export default function LivePanelLog({ station }) {
  const [visibleCount, setVisibleCount] = useState(10);
  // Select before building report rows so a long date range stays inexpensive.
  const panels = [...(station.panels || [])]
    .sort((a, b) => a.start.valueOf() - b.start.valueOf())
    .slice(-visibleCount);
  const hasMore = panels.length < (station.panels || []).length;
  function loadOnScroll(event) {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (hasMore && scrollHeight - scrollTop - clientHeight <= 48) {
      setVisibleCount(count => Math.min(count + 10, station.panels.length));
    }
  }
  const rows = buildSolderReportRows('total', { ...station, panels }, mediaUrl)
    .map(row => ({
      Panel: row.Panel,
      Snapshot: row.Snapshot,
      ...Object.fromEntries(Object.entries(row).filter(([key]) => /^P\d+$/.test(key))),
      Time: row.Time,
    }));

  return (
    <Panel pad={false} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
      <div style={{ padding: '12px 14px 0' }}>
        <PanelHead title="Recent logs" />
      </div>
      <div onScroll={loadOnScroll} style={{ padding: '0 14px 12px', maxHeight: 218, minHeight: 0, overflowY: 'auto' }}>
        <TotalReport rows={rows} animate sortable={false} />
        {hasMore && <div style={{ padding: '8px 0', fontSize: 11, color: 'var(--tx3)', textAlign: 'center' }}>Scroll for more logs</div>}
      </div>
    </Panel>
  );
}
