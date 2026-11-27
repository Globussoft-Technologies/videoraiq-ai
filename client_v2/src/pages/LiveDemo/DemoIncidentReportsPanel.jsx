import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { mediaUrl } from '@/lib/format';
import { formatUtcInConfiguredTimezone } from '@/utils/timezone';
import { getDemoIncidents } from './api/post';
import { getVideoRecords } from './api/get';
import { downloadIncidentReports } from './liveDemoIncidentExport';

function videoUrl(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_INCIDENT_URL || import.meta.env.VITE_BACKEND || '';
  return `${String(base).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

function clipName(path) {
  const lastPart = String(path || '').split('/').pop() || 'Demo clip';
  let name = lastPart;
  try { name = decodeURIComponent(lastPart); } catch { /* keep the stored filename */ }
  return name.replace(/^\d+-[0-9a-f-]{36}-/i, '') || 'Demo clip';
}

function detectionLabel(record, options) {
  const settingType = Object.entries(record?.detections || {}).find(([, enabled]) => enabled)?.[0];
  return options.find((option) => option.settingType === settingType)?.name
    || String(settingType || 'Detection').replace(/Settings$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export default function DemoIncidentReportsPanel({ history, filters, sourceLoading, detections }) {
  const [allHistory, setAllHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfSelection, setPdfSelection] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (sourceLoading) {
      setAllHistory([]);
      setHistoryLoading(true);
      return undefined;
    }
    const firstPage = Array.isArray(history) ? history : [];
    setAllHistory(firstPage);
    setHistoryError(false);
    if (firstPage.length < 100) {
      setHistoryLoading(false);
      return undefined;
    }
    setHistoryLoading(true);
    const loadRemaining = async () => {
      try {
        const records = [...firstPage];
        let total = Infinity;
        while (records.length < total) {
          const page = await getVideoRecords({ skip: records.length, limit: 100, ...filters });
          records.push(...page.records);
          total = Number(page.total) || records.length;
          if (!page.records.length) break;
        }
        if (!cancelled) setAllHistory(records);
      } catch (loadError) {
        console.error('Failed to load remaining Live Demo reports', loadError);
        if (!cancelled) setHistoryError(true);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    loadRemaining();
    return () => { cancelled = true; };
  }, [history, filters, sourceLoading]);

  const runs = useMemo(() => allHistory
    .filter((record) => record?.detections?.faceAuthenticationSettings !== true)
    .flatMap((record) => (record?.videos || [])
      .filter((video) => video?.dsVideoUrl)
      .map((video) => ({
        id: String(video._id || video.id || record._id || record.id),
        detectionName: detectionLabel(record, detections),
        clipName: clipName(video.videoUrl),
        generatedAt: record.updatedAt || record.createdAt,
        originalUrl: videoUrl(video.videoUrl),
        processedUrl: videoUrl(video.dsVideoUrl),
      })))
    .sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0)), [allHistory, detections]);

  useEffect(() => {
    let cancelled = false;
    if (historyLoading) {
      setIncidents([]);
      return undefined;
    }
    if (!runs.length) {
      setIncidents([]);
      setLoading(false);
      setError(false);
      return undefined;
    }
    setLoading(true);
    setError(false);
    const load = async () => {
      try {
        const all = [];
        const pageSize = 200;
        let total = Infinity;
        while (all.length < total) {
          const page = await getDemoIncidents({
            skip: all.length,
            limit: pageSize,
            eventSource: 'live_demo',
            statusFilter: ['new', 'reported', 'resolved'],
          });
          all.push(...page.items);
          total = Number(page.totalCount) || all.length;
          if (!page.items.length) break;
        }
        if (!cancelled) setIncidents(all);
      } catch (loadError) {
        console.error('Failed to load Live Demo incidents for reports', loadError);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [runs, historyLoading]);

  const reports = useMemo(() => {
    const byVideoId = new Map();
    for (const incident of incidents) {
      const key = String(incident?.videoId || '');
      if (!key) continue;
      if (!byVideoId.has(key)) byVideoId.set(key, []);
      byVideoId.get(key).push({ ...incident, imageUrl: mediaUrl(incident.Image) });
    }
    return runs.map((run) => ({ ...run, events: byVideoId.get(run.id) || [] }));
  }, [runs, incidents]);

  const download = async (format, selection, pdfView = 'list') => {
    setExporting(true);
    try {
      await downloadIncidentReports(format, selection, { pdfView });
    } catch (exportError) {
      console.error('Failed to export Live Demo report', exportError);
      toast.error(`Could not create the ${format === 'excel' ? 'Excel' : 'PDF'} report`);
    } finally {
      setExporting(false);
    }
  };
  const disabled = historyLoading || loading || historyError || error || exporting;

  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-bold text-[var(--tx)]">Demo reports</h2>
          {reports.length > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-1.5 text-[11px] font-bold text-white">
              {reports.length}
            </span>
          )}
          <span className="truncate text-[11px] text-[var(--tx3)]">Every processed demo is kept here for this selection.</span>
          {(historyLoading || loading) && <Loader className="h-3.5 w-3.5 animate-spin text-[var(--blue)]" />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" disabled={disabled || !reports.length} onClick={() => download('excel', reports)}
            className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[9px] bg-gradient-to-br from-[#14b8a6] to-[#22c55e] px-[15px] text-xs font-semibold text-white shadow-[0_6px_16px_rgba(34,197,94,0.28)] transition-shadow hover:shadow-[0_8px_22px_rgba(34,197,94,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
            <Download className="h-3.5 w-3.5" /> All · Excel
          </button>
          <button type="button" disabled={disabled || !reports.length} onClick={() => setPdfSelection(reports)}
            className="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[9px] bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] px-[15px] text-xs font-semibold text-white shadow-[0_6px_16px_rgba(99,102,241,0.3)] transition-shadow hover:shadow-[0_8px_22px_rgba(124,92,255,0.45)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
            <Download className="h-3.5 w-3.5" /> All · PDF
          </button>
        </div>
      </div>
      {historyError || error ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          Reports could not be loaded. Please refresh to try again.
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--bd2)] bg-[var(--bg2)] p-6 text-center text-xs text-[var(--tx3)]">
          {historyLoading || loading ? 'Loading reports…' : 'No processed demos in this selection yet.'}
        </div>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {reports.map((report) => (
            <div key={report.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--blue)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--tx)]">{report.detectionName} — Event Log</div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--tx3)]">
                  {report.generatedAt ? formatUtcInConfiguredTimezone(report.generatedAt, 'DD MMM YYYY, hh:mm A') : 'Processed'} · {report.clipName}
                </div>
              </div>
              <span className="shrink-0 rounded-md border border-[var(--bd)] bg-[var(--bg1solid)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--tx3)]">
                {report.events.length} event{report.events.length === 1 ? '' : 's'}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" disabled={disabled} onClick={() => download('excel', report)}
                  className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(34,197,94,0.45)] px-3 text-[11.5px] font-semibold text-[var(--ok)] transition-colors hover:bg-[rgba(34,197,94,0.1)] disabled:cursor-not-allowed disabled:opacity-40">
                  <Download className="h-3 w-3" /> Excel
                </button>
                <button type="button" disabled={disabled} onClick={() => setPdfSelection(report)}
                  className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(59,130,246,0.4)] px-3 text-[11.5px] font-semibold text-[var(--blue)] transition-colors hover:bg-[rgba(59,130,246,0.1)] disabled:cursor-not-allowed disabled:opacity-40">
                  <Download className="h-3 w-3" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pdfSelection && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPdfSelection(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="demo-pdf-view-title" className="w-full max-w-sm rounded-2xl border border-[var(--bd)] bg-[var(--bg1solid)] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 id="demo-pdf-view-title" className="text-sm font-bold text-[var(--tx)]">Download PDF</h3>
            <p className="mt-1 text-xs text-[var(--tx3)]">Choose how events appear in the report.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={disabled} onClick={() => { const selection = pdfSelection; setPdfSelection(null); download('pdf', selection, 'grid'); }} className="rounded-lg border border-[var(--blue)] bg-[var(--blue)]/10 px-3 py-3 text-xs font-semibold text-[var(--blue)] disabled:opacity-50">Grid view<br /><span className="font-normal">Images shown directly</span></button>
              <button type="button" disabled={disabled} onClick={() => { const selection = pdfSelection; setPdfSelection(null); download('pdf', selection, 'list'); }} className="rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 py-3 text-xs font-semibold text-[var(--tx)] disabled:opacity-50">List view<br /><span className="font-normal text-[var(--tx3)]">Clickable image links</span></button>
            </div>
            <button type="button" onClick={() => setPdfSelection(null)} className="mt-3 w-full rounded-lg border border-[var(--bd)] px-3 py-2 text-xs text-[var(--tx2)]">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
