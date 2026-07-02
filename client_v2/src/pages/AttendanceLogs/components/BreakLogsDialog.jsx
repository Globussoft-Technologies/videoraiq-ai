import React, { useEffect, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { ArrowRight, Hourglass, LogOut, LogIn, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { getAttendanceUserLogs } from '../Api';

const msToHms = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`);
  return parts.join(' ');
};

const formatBreakDuration = (start, end) => {
  if (!start || !end) return '--';
  const startM = moment.utc(start);
  const endM = moment.utc(end);
  if (!startM.isValid() || !endM.isValid()) return '--';
  const diffMs = endM.diff(startM);
  if (diffMs <= 0) return '--';
  return msToHms(diffMs);
};

const formatTime = (utcTime, region) => {
  if (!utcTime) return '--';
  return moment.utc(utcTime).tz(region).format('hh:mm:ss A');
};

const resolveRowMoment = (log) => {
  if (!log) return null;
  for (const v of [log.login, log.logout, log.date]) {
    const m = moment(v);
    if (m.isValid()) return m;
  }
  return null;
};

const formatRowDate = (log) => {
  const m = resolveRowMoment(log);
  return m ? m.format('DD/MM/YYYY') : '';
};

const resolveRequestDate = (log) => {
  const m = resolveRowMoment(log);
  return m ? m.format('YYYY-MM-DD') : '';
};

const sanitizeFilename = (str) =>
  String(str || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'export';

/**
 * Break-logs dialog: per-employee check-out → check-in break periods, total
 * duration and PDF/Excel export. Theme-aware (dark/light) via CSS vars.
 */
const BreakLogsDialog = ({ open, onOpenChange, log, region, selectedDate, canEdit = true }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !log?.id) return;
    const date = resolveRequestDate(log) || selectedDate;
    if (!date) return;

    let cancelled = false;
    setLoading(true);
    getAttendanceUserLogs(log.id, date)
      .then((res) => {
        if (cancelled) return;
        setLogs(res?.data?.body?.data?.logs || []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.log('Error fetching user logs:', err);
        setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, log, selectedDate]);

  const breakEntries = useMemo(
    () =>
      (logs || []).map((entry) => ({
        checkoutTime: entry?.checkout?.timestamp,
        checkinTime: entry?.checkin?.timestamp,
      })),
    [logs]
  );

  const totalDurationLabel = useMemo(() => {
    if (breakEntries.length === 0) return '';
    const totalMs = breakEntries.reduce((acc, b) => {
      const s = moment.utc(b.checkoutTime);
      const e = moment.utc(b.checkinTime);
      if (!s.isValid() || !e.isValid()) return acc;
      const d = e.diff(s);
      return d > 0 ? acc + d : acc;
    }, 0);
    return msToHms(totalMs);
  }, [breakEntries]);

  const buildFileBaseName = () => {
    const empName = sanitizeFilename(log?.name);
    const dateForFile = sanitizeFilename(formatRowDate(log) || moment().format('DD-MM-YYYY'));
    return `break_logs_${empName}_${dateForFile}`;
  };

  const exportToExcel = () => {
    if (!breakEntries.length) {
      toast.error('No data to export');
      return;
    }
    const data = breakEntries.map((b, idx) => ({
      '#': idx + 1,
      'Check out': formatTime(b.checkoutTime, region),
      'Check in': formatTime(b.checkinTime, region),
      Duration: formatBreakDuration(b.checkoutTime, b.checkinTime),
    }));
    data.push({ '#': '', 'Check out': '', 'Check in': 'Total', Duration: totalDurationLabel });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Break Logs');
    XLSX.writeFile(workbook, `${buildFileBaseName()}.xlsx`);
  };

  const exportToPDF = () => {
    if (!breakEntries.length) {
      toast.error('No data to export');
      return;
    }
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Break Logs Report', 14, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Employee: ${log?.name || '--'}`, 14, 22);
    doc.text(`Date: ${formatRowDate(log) || '--'}`, 14, 28);
    doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 34);

    const headers = ['#', 'Check out', 'Check in', 'Duration'];
    const rows = breakEntries.map((b, idx) => [
      idx + 1,
      formatTime(b.checkoutTime, region),
      formatTime(b.checkinTime, region),
      formatBreakDuration(b.checkoutTime, b.checkinTime),
    ]);

    autoTable(doc, {
      head: [headers],
      body: rows,
      foot: [['', '', 'Total', totalDurationLabel]],
      startY: 40,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [7, 72, 106], textColor: 255 },
      footStyles: { fillColor: [243, 246, 250], textColor: [7, 72, 106], fontStyle: 'bold' },
    });

    doc.save(`${buildFileBaseName()}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--bg1solid)] text-[var(--tx)] rounded-[12px] p-4 sm:p-6 w-full max-w-[95vw] sm:max-w-[640px] max-h-[85vh] overflow-y-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-[var(--bd)]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-[var(--tx)] text-base font-semibold flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-[var(--brand)]" />
              Break Logs
            </DialogTitle>
            {!loading && canEdit && breakEntries.length > 0 && (
              <button
                type="button"
                onClick={exportToPDF}
                className="flex items-center gap-1.5 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white rounded-[8px] px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors"
                title="Export to PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                Export PDF
              </button>
            )}
          </div>
        </DialogHeader>

        {log && (
          <div className="flex items-center gap-3 mt-3 pb-3 border-b border-[var(--bd)]">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--bg2)] border border-[var(--bd2)] p-[1px] flex items-center justify-center">
              <img src={log.image} alt={log.name} className="w-12 h-12 object-cover rounded-full" />
            </div>
            <div className="flex flex-col">
              <span className="text-[var(--tx)] text-sm font-medium">{log.name || '--'}</span>
              <span className="text-[var(--tx2)] text-xs">{formatRowDate(log)}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 py-10 flex flex-col items-center text-center">
            <span className="text-sm text-[var(--tx2)]">Loading...</span>
          </div>
        ) : breakEntries.length === 0 ? (
          <div className="mt-6 py-10 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-[var(--bg2)] flex items-center justify-center mb-3">
              <Hourglass className="w-7 h-7 text-[var(--tx3)]" />
            </div>
            <span className="text-sm text-[var(--tx2)]">No breaks recorded</span>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2.5 max-h-[45vh] overflow-y-auto pr-1 customscrollbar">
              {breakEntries.map((b, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--bg2)] hover:bg-[var(--bg3)] transition-colors rounded-xl border border-[var(--bd)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--brand)] text-white text-xs font-semibold flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <span className="text-xs text-[var(--tx2)] font-medium uppercase tracking-wide">
                        Break {idx + 1}
                      </span>
                    </div>
                    <span className="bg-[var(--brand)]/10 text-[var(--brand)] text-xs font-semibold px-3 py-1 rounded-full">
                      {formatBreakDuration(b.checkoutTime, b.checkinTime)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[var(--bg1solid)] border border-[var(--bd2)] flex items-center justify-center flex-shrink-0">
                        <LogOut className="w-4 h-4 text-[var(--brand)]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-[var(--tx3)] uppercase tracking-wide">Check out</span>
                        <span className="text-sm text-[var(--tx)] font-medium truncate">
                          {formatTime(b.checkoutTime, region)}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-[var(--tx3)] flex-shrink-0" />

                    <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                      <div className="flex flex-col min-w-0 text-right">
                        <span className="text-[10px] text-[var(--tx3)] uppercase tracking-wide">Check in</span>
                        <span className="text-sm text-[var(--tx)] font-medium truncate">
                          {formatTime(b.checkinTime, region)}
                        </span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[var(--bg1solid)] border border-[var(--bd2)] flex items-center justify-center flex-shrink-0">
                        <LogIn className="w-4 h-4 text-[var(--brand)]" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--bd)] flex items-center justify-between">
              <span className="text-xs text-[var(--tx2)]">
                Total <span className="font-semibold text-[var(--tx)]">{breakEntries.length}</span>{' '}
                {breakEntries.length === 1 ? 'break' : 'breaks'}
              </span>
              <span className="text-sm font-semibold text-[var(--brand)]">{totalDurationLabel}</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BreakLogsDialog;
