import React, { useCallback, useEffect, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import {
  CarFront,
  ChevronDown,
  ChevronRight,
  Loader2,
  LogIn,
  LogOut,
  Search,
  SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import DateRangePicker from '@/pages/AttendanceLogs/components/DateRangePicker';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import ExportButton from '@/pages/AttendanceLogs/components/ExportButton';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { usePermissions } from '@/context/PermissionContext';
import {
  fetchVehicleCheckInOutLogs,
  fetchVehicleCheckInOutHistory,
} from './Api';
import { handleVehicleCheckInOutExport } from './vehicleCheckInOutExport';

const PAGE_SIZES = [10, 25, 50];

/** Same resolver Car Logs uses — DS sends a path, not a URL. */
const getImageUrl = (item) => {
  const path = item?.Image || item?.image || item?.imageUrl || '';
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${import.meta.env.VITE_INCIDENT_URL || ''}${path}`;
};

const fmtTime = (value) => (value ? moment(value).format('DD/MM/YYYY hh:mm A') : '--');
const dash = (value) => (value === null || value === undefined || value === '' ? '--' : value);

const cameraName = (row) => row?.channelData?.customName || row?.channelData?.name || '--';

/**
 * Custody is the reason this page exists: a car that checked in and has not
 * checked back out is still on the premises, so it reads as a state, not a
 * timestamp.
 */
const CustodyChip = ({ inCustody }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
    style={{
      color: inCustody ? 'var(--warn)' : 'var(--ok)',
      background: `color-mix(in srgb, ${inCustody ? 'var(--warn)' : 'var(--ok)'} 15%, transparent)`,
    }}
  >
    <span
      className="w-1.5 h-1.5 rounded-full"
      style={{ background: inCustody ? 'var(--warn)' : 'var(--ok)' }}
    />
    {inCustody ? 'In custody' : 'Returned'}
  </span>
);

const DirectionChip = ({ checkin }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
    style={{
      color: checkin ? 'var(--ok)' : 'var(--warn)',
      background: `color-mix(in srgb, ${checkin ? 'var(--ok)' : 'var(--warn)'} 14%, transparent)`,
    }}
  >
    {checkin ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
    {checkin ? 'Check-In' : 'Check-Out'}
  </span>
);

const CUSTODY_TABS = [
  { id: '', label: 'All' },
  { id: 'true', label: 'In custody' },
  { id: 'false', label: 'Returned' },
];

const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)] whitespace-nowrap';
const td = 'px-4 py-3 text-sm text-[var(--tx)] align-middle';

const VehicleCheckInOutLogs = () => {
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [custody, setCustody] = useState('');
  const [startDate, setStartDate] = useState(moment().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(moment().format('YYYY-MM-DD'));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // vehicleKey -> { loading, data } for the expanded sub-rows.
  const [expanded, setExpanded] = useState({});
  const [previewImage, setPreviewImage] = useState(null);
  const [exporting, setExporting] = useState(null);

  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.logs?.carLogs?.view ?? permissions?.logs?.view ?? true;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVehicleCheckInOutLogs({
        skip: (page - 1) * pageSize,
        limit: pageSize,
        startDate,
        endDate,
        custody,
        search: debouncedSearch,
      });
      const data = res?.data?.body?.data;
      setRows(data?.data || []);
      setTotalCount(data?.totalCount || 0);
      // Any open sub-rows belong to the previous result set.
      setExpanded({});
    } catch (err) {
      console.error(err);
      toast.error(
        err?.response?.data?.body?.message || 'Failed to fetch vehicle check-in/out logs',
      );
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, custody, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  /** Sub-rows are fetched on first expand and kept until the page reloads. */
  const toggleRow = async (row) => {
    const key = row.vehicleKey;
    if (expanded[key]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    setExpanded((prev) => ({ ...prev, [key]: { loading: true, data: [] } }));
    try {
      const res = await fetchVehicleCheckInOutHistory({
        vehicleKey: key,
        startDate,
        endDate,
      });
      setExpanded((prev) => ({
        ...prev,
        [key]: { loading: false, data: res?.data?.body?.data?.data || [] },
      }));
    } catch (err) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.error(
        err?.response?.data?.body?.message || 'Failed to load this vehicle history',
      );
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Exactly what the table is currently showing. Paging is deliberately absent:
  // an export covers the whole filtered set, not the page on screen.
  const exportFilters = useMemo(
    () => ({ startDate, endDate, custody, search: debouncedSearch }),
    [startDate, endDate, custody, debouncedSearch],
  );

  const runExport = async (format) => {
    setExporting(format);
    try {
      await handleVehicleCheckInOutExport(format, exportFilters);
    } finally {
      setExporting(null);
    }
  };

  const summary = useMemo(
    () => ({
      inCustody: rows.filter((r) => r.custody).length,
      returned: rows.filter((r) => !r.custody).length,
    }),
    [rows],
  );

  if (permissionsLoading) return <PageLoader />;
  if (!canView) return <AccessDenied />;

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-[18px] min-h-full">
      <div className="w-full flex-1 flex flex-col p-3 sm:p-5 bg-[var(--bg1)] border border-[var(--bd)] rounded-[16px] gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="relative w-full md:w-[320px]">
            <Input
              type="text"
              placeholder="Search plate, model, camera..."
              className="pl-4 pr-10 shadow-none border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] h-10 text-sm focus:border-[var(--blue)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tx3)]" />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onRangeChange={({ start, end }) => {
                setStartDate(start);
                setEndDate(end);
                setPage(1);
              }}
            />
            <ExportButton
              onClick={() => runExport('excel')}
              disabled={Boolean(exporting) || !rows.length}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'excel' ? 'Exporting…' : 'Excel'}
            </ExportButton>
            <ExportButton
              onClick={() => runExport('pdf')}
              disabled={Boolean(exporting) || !rows.length}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
            </ExportButton>
          </div>
        </div>

        {/* Custody filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-[10px] bg-[var(--bg2)] border border-[var(--bd)]">
            {CUSTODY_TABS.map((tab) => (
              <button
                key={tab.id || 'all'}
                type="button"
                onClick={() => {
                  setCustody(tab.id);
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-colors cursor-pointer"
                style={{
                  background: custody === tab.id ? 'var(--bg3)' : 'transparent',
                  color: custody === tab.id ? 'var(--tx)' : 'var(--tx3)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-[var(--tx3)] ml-auto">
            {totalCount} vehicle{totalCount === 1 ? '' : 's'} · {summary.inCustody} in custody on
            this page
          </span>
        </div>

        {/* Table */}
        <div className="relative overflow-auto customscrollbar border border-[var(--bd)] rounded-[12px] min-h-[320px]">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg1solid)]/70">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--tx3)]" />
            </div>
          )}

          <table className="w-full border-collapse min-w-[1000px]">
            <thead className="bg-[var(--bg2)]">
              <tr className="border-b border-[var(--bd)]">
                <th className={`${th} w-10`} />
                <th className={th}>Image</th>
                <th className={th}>Model Name</th>
                <th className={th}>Vehicle Number</th>
                <th className={th}>Custody</th>
                <th className={th}>In / Out</th>
                <th className={th}>Company</th>
                <th className={th}>Colour</th>
                <th className={th}>Year</th>
                <th className={th}>NVR Name</th>
                <th className={th}>Camera Name</th>
                <th className={th}>First Check-In</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const open = Boolean(expanded[row.vehicleKey]);
                const image = getImageUrl(row);
                return (
                  <React.Fragment key={row.vehicleKey}>
                    <tr
                      onClick={() => toggleRow(row)}
                      className="border-b border-[var(--bd)] hover:bg-[var(--bg2)] transition-colors cursor-pointer"
                    >
                      <td className={`${td} text-[var(--tx3)]`}>
                        {open ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className={td}>
                        {image ? (
                          <ImageWithLoader
                            src={image}
                            alt={dash(row.vehicleNumber)}
                            className="w-12 h-9 rounded-md overflow-hidden border border-[var(--bd)]"
                            imgClassName="w-full h-full object-cover"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage(image);
                            }}
                          />
                        ) : (
                          <span className="inline-flex items-center justify-center w-12 h-9 rounded-md bg-[var(--bg3)] text-[var(--tx3)]">
                            <CarFront className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                      <td className={td}>{dash(row.model_name)}</td>
                      <td className={`${td} font-medium`}>{dash(row.vehicleNumber)}</td>
                      <td className={td}>
                        <CustodyChip inCustody={row.custody} />
                      </td>
                      <td className={`${td} text-[var(--tx2)] whitespace-nowrap`}>
                        {row.checkInCount} / {row.checkOutCount}
                      </td>
                      <td className={td}>{dash(row.company)}</td>
                      <td className={td}>{dash(row.color)}</td>
                      <td className={td}>{dash(row.year)}</td>
                      <td className={td}>{dash(row?.nvrData?.nvrName)}</td>
                      <td className={td}>{cameraName(row)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {fmtTime(row.timeOfIncident)}
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-b border-[var(--bd)]">
                        <td colSpan={12} className="p-0">
                          <div className="bg-[var(--bg2)] px-6 py-4">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tx2)] mb-2">
                              All crossings for {dash(row.vehicleNumber)}
                            </div>

                            {expanded[row.vehicleKey].loading ? (
                              <div className="flex items-center gap-2 text-xs text-[var(--tx3)] py-3">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Loading…
                              </div>
                            ) : (
                              <div className="rounded-[10px] border border-[var(--bd)] bg-[var(--bg1solid)] divide-y divide-[var(--bd)]">
                                {expanded[row.vehicleKey].data.map((sub) => (
                                  <div
                                    key={sub._id}
                                    className="flex flex-wrap items-center gap-4 px-4 py-2.5"
                                  >
                                    <DirectionChip checkin={sub.checkin} />
                                    <span className="text-xs text-[var(--tx)] whitespace-nowrap">
                                      {fmtTime(sub.timeOfIncident)}
                                    </span>
                                    <span className="text-[11px] text-[var(--tx3)]">
                                      {dash(sub?.nvrData?.nvrName)} · {cameraName(sub)}
                                    </span>
                                    {sub.zone && (
                                      <span className="text-[11px] text-[var(--tx3)]">
                                        Zone: {sub.zone}
                                      </span>
                                    )}
                                    {getImageUrl(sub) && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewImage(getImageUrl(sub))}
                                        className="ml-auto text-[11px] text-[var(--blue)] hover:underline cursor-pointer"
                                      >
                                        View image
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-16 text-center">
                    <SearchX className="w-7 h-7 mx-auto text-[var(--tx3)] mb-2" />
                    <p className="text-sm text-[var(--tx2)]">
                      No vehicle check-in/out logs for this range.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paging */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--tx2)]">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 px-2 rounded-md border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx)] text-xs outline-none focus:border-[var(--blue)] cursor-pointer"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-md border border-[var(--bd)] bg-[var(--bg2)] text-xs text-[var(--tx2)] hover:text-[var(--tx)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs text-[var(--tx3)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-[var(--bd)] bg-[var(--bg2)] text-xs text-[var(--tx2)] hover:text-[var(--tx)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {previewImage && (
        <ImagePreviewModal
          previewImage={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
};

export default VehicleCheckInOutLogs;
