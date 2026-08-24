import React, { useEffect, useCallback, useMemo, useState } from 'react';
import moment from 'moment-timezone';
import { ArrowDownUp, ArrowUp, ArrowDown, Play, Filter, RotateCcw, X, Image, LayoutGrid, List, Search, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import { formatDateRange } from '@/utils/formatDateRange';
import Month from '@/assets/Calendar.svg';
import ReusableTablePage from './ReusableTablePage';
import AutoRefreshComponent from './components/AutoRefreshComponent';
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
import { getNVRs, getchannels } from './Api/post';
import MultiSelect from '@/components/ui/multiselect';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

const HOST = import.meta.env.VITE_BACKEND;
const IST_ZONE = 'Asia/Kolkata';

const REFRESH_KEY = 'crusher_auto_refresh_enabled';
const INTERVAL_KEY = 'crusher_auto_refresh_interval';

const styles = {
  text: 'text-[#333333] text-xs font-normal',
};

const fetchCrusherLogs = async ({
  skip, limit, startDate, endDate, sortField, sortOrder,
  nvrIds, channelIds, severity, search,
}) => {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/incidents/logs/crusher-detection`, {
    params: {
      skip,
      limit,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(sortField && { sortField }),
      ...(sortOrder && { sortOrder }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
      ...(severity && { severity }),
      ...(search && { search }),
    },
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};

const CrusherLogs = () => {
  const todayISO = moment().format('YYYY-MM-DD');
  const maxDateDefault = moment().endOf('day').toDate();
  const limit = 12;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState(todayISO);

  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [selectedNvrIds, setSelectedNvrIds] = useState([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState([]);
  const [severity, setSeverity] = useState('');

  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem(INTERVAL_KEY);
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewImageLoading, setPreviewImageLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

  const fetchAllForExport = async () => {
    const token = getAccessToken();
    const res = await axios.get(`${HOST}/api/v1/incidents/logs/crusher-detection`, {
      params: {
        skip: 0,
        limit: 10000,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(selectedNvrIds?.length && { nvrIds: selectedNvrIds.join(',') }),
        ...(selectedChannelIds?.length && { channelIds: selectedChannelIds.join(',') }),
        ...(severity && { severity }),
        ...(searchInput && { search: searchInput }),
      },
      headers: { Accept: 'application/json', 'x-access-token': token },
    });
    const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
    const list = res?.data?.body?.data?.data || [];
    return list.map((item) => ({
      incidentName: item.incidentName || '--',
      currentStatus: item.currentStatus || '--',
      nvrName: item.nvrData?.nvrName || '--',
      channelName: item.channelData?.name || '--',
      createdAt: item.createdAt
        ? moment.utc(item.createdAt).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
        : '--',
        severity: item.severity || '--',
      incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : '',
    }));
  };

  const exportToPDF = async () => {
    try {
      const allLogs = await fetchAllForExport();
      if (!allLogs.length) { toast.error('No data to export'); return; }

      const doc = new jsPDF('landscape');
      doc.setFont('helvetica');
      doc.setFontSize(12);
      doc.text('Crusher Detection Logs', 14, 12);
      doc.setFontSize(9);
      doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm')}`, 14, 18);

      const headers = ['#', 'Incident Name', 'Current Status', 'Severity', 'NVR Name', 'Camera Name', 'Created At', 'Image'];
      const tableRows = allLogs.map((row, i) => [i + 1, row.incidentName, row.currentStatus, row.severity, row.nvrName, row.channelName, row.createdAt, '']);

      autoTable(doc, {
        head: [headers],
        body: tableRows,
        startY: 24,
        styles: { fontSize: 7 },
        columnStyles: { 7: { cellWidth: 40 } },
        didDrawCell: (data) => {
          if (data.column.index === 7 && data.section === 'body') {
            const url = allLogs[data.row.index]?.incidentImageUrl;
            if (url) {
              doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
              doc.setTextColor(0, 0, 255);
              const text = 'View Image';
              const textX = data.cell.x + 4;
              const textY = data.cell.y + data.cell.height / 2 + 2;
              doc.text(text, textX, textY);
              const textWidth = doc.getTextWidth(text);
              doc.setLineWidth(0.3);
              doc.line(textX, textY + 1, textX + textWidth, textY + 1);
              doc.setTextColor(0, 0, 0);
            }
          }
        },
      });
      doc.save('crusher_logs.pdf');
    } catch {
      toast.error('Failed to export PDF');
    }
  };

  const exportToExcel = async () => {
    try {
      const allLogs = await fetchAllForExport();
      if (!allLogs.length) { toast.error('No data to export'); return; }

      const data = allLogs.map((row, i) => ({
        '#': i + 1,
        'Incident Name': row.incidentName,
        'Current Status': row.currentStatus,
        'Severity': row.severity,
        'NVR Name': row.nvrName,
        'Camera Name': row.channelName,
        'Created At': row.createdAt,
        'Image': '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      allLogs.forEach((row, i) => {
        if (row.incidentImageUrl) {
          const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: 7 });
          worksheet[cellRef] = { t: 'f', f: `HYPERLINK("${row.incidentImageUrl}", "View Image")` };
        }
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Crusher Logs');
      XLSX.writeFile(workbook, 'crusher_logs.xlsx');
    } catch {
      toast.error('Failed to export Excel');
    }
  };

  useEffect(() => { localStorage.setItem(REFRESH_KEY, autoRefresh); }, [autoRefresh]);
  useEffect(() => { localStorage.setItem(INTERVAL_KEY, refreshInterval); }, [refreshInterval]);

  useEffect(() => {
    const fetchNvrs = async () => {
      try {
        const res = await getNVRs();
        setNvrList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching NVRs:', err);
      }
    };
    fetchNvrs();
  }, []);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await getchannels({ nvrIds: selectedNvrIds });
        setCameraList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching channels:', err);
      }
    };
    fetchChannels();
  }, [selectedNvrIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, selectedNvrIds, selectedChannelIds, severity]);

  const skip = (currentPage - 1) * limit;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCrusherLogs({
        skip, limit, startDate, endDate, sortField, sortOrder,
        nvrIds: selectedNvrIds,
        channelIds: selectedChannelIds,
        severity,
        search: searchInput,
      });

      const data = res?.data?.body?.data;
      const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';

      const mapped = (data?.data || []).map((item) => ({
        _id: item._id,
        incidentName: item.incidentName || '--',
        currentStatus: item.currentStatus || '',
        severity: item.severity || '--',
        nvrName: item.nvrData?.nvrName || '--',
        channelName: item.channelData?.name || '--',
        createdAt: item.createdAt || '--',
        incidentImageUrl: item.Image ? `${INCIDENT_URL}${item.Image}` : null,
      }));

      setRows(mapped);
      setTotalCount(data?.totalCount || 0);
    } catch (err) {
      console.log('Error fetching crusher logs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [skip, limit, startDate, endDate, sortField, sortOrder,
      selectedNvrIds, selectedChannelIds, severity, searchInput]);

  useEffect(() => { fetchLogs(); }, [fetchLogs, manualTrigger]);

  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(fetchLogs, refreshInterval * 1000);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [autoRefresh, refreshInterval, fetchLogs]);

  const nvrOptions = useMemo(() =>
    nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList]
  );

  const cameraOptions = useMemo(() =>
    cameraList.map((cam) => ({ label: cam.customName || cam.name, id: cam._id || cam.id })),
    [cameraList]
  );

  const activeFiltersCount = [
    selectedNvrIds.length > 0,
    selectedChannelIds.length > 0,
    !!severity,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSelectedNvrIds([]);
    setSelectedChannelIds([]);
    setSeverity('');
  };

  const columns = useMemo(
    () => {
      const onSort = (field) => {
        setSortOrder((prev) => (sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
        setSortField(field);
      };

      const SortIcon = ({ field }) => {
        if (sortField !== field) return <ArrowDownUp className="w-4 h-4 text-gray-400" />;
        return sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
      };

      return [
        {
          accessorKey: 'incidentName',
          header: () => (
            <button onClick={() => onSort('incidentName')} className="flex items-center gap-1 cursor-pointer">
              Incident Name 
              {/* <SortIcon field="incidentName" /> */}
            </button>
          ),
          cell: ({ row }) => <span className={styles.text}>{row.original.incidentName}</span>,
        },
        {
          accessorKey: 'currentStatus',
          header: 'Current Status',
          cell: ({ row }) => {
            const s = row.original.currentStatus;
            const isEmpty = !s;
            return (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                isEmpty ? 'text-gray-400 bg-gray-100' : 'text-[#07486A] bg-[#EEF6FB]'
              }`}>
                {isEmpty ? '--' : s}
              </span>
            );
          },
        },
        {
          accessorKey: 'severity',
          header: 'Severity',
          cell: ({ row }) => {
            const s = (row.original.severity || '--').toLowerCase();
            const colorClass = s === 'low' ? 'text-green-700 bg-green-100'
              : s === 'moderate' ? 'text-yellow-700 bg-yellow-100'
              : s === 'high' ? 'text-red-700 bg-red-100'
              : 'text-gray-500 bg-gray-100';
            return (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${colorClass}`}>
                {row.original.severity || '--'}
              </span>
            );
          },
        },
        {
          accessorKey: 'nvrName',
          header: () => (
            <button onClick={() => onSort('nvrData.nvrName')} className="flex items-center gap-1 cursor-pointer">
              NVR Name
              {/* <SortIcon field="nvrData.nvrName" /> */}
            </button>
          ),
          cell: ({ row }) => <span className={styles.text}>{row.original.nvrName}</span>,
        },
        {
          accessorKey: 'channelName',
          header: 'Camera Name',
          cell: ({ row }) => <span className={styles.text}>{row.original.channelName}</span>,
        },
        {
          accessorKey: 'createdAt',
          header: () => (
            <button onClick={() => onSort('createdAt')} className="flex items-center gap-1 cursor-pointer">
             Time of Incident
              {/* <SortIcon field="createdAt" /> */}
            </button>
          ),
          cell: ({ row }) => {
            const t = row.original.createdAt;
            return (
              <span className={styles.text}>
                {t ?moment
      .utc(t)
      .tz(moment.tz.guess())
      .format('DD/MM/YYYY hh:mm A') : '--'}
              </span>
            );
          },
        },
        {
          accessorKey: 'action',
          header: 'Image',
          cell: ({ row }) => {
            const incidentUrl = row.original.incidentImageUrl;
            return (
              <button
                disabled={!incidentUrl}
                onClick={() => { if (incidentUrl) { setPreviewImageLoading(true); setPreviewImage(incidentUrl); } }}
                className={`p-2 rounded-full bg-transparent cursor-pointer ${
                  !incidentUrl ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'
                }`}
                title="View incident image"
              >
                <Image className="w-5 h-5 text-[#07486A]"  />
              </button>
            );
          },
        },
      ];
    },
    [sortField, sortOrder]
  );

  const FilterPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="flex bg-[linear-gradient(94.16deg,#FFFFFF_0.77%,#AAE2FF_99.4%)] rounded-lg text-[#333333] cursor-pointer items-center gap-2 relative h-9 md:h-10">
          <Filter className="w-4 h-4" />
          Filters
          {activeFiltersCount > 0 && (
            <span className="bg-[#005480] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] rounded-xl p-4" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2">
            <h4 className="font-semibold text-base text-[#333333]">Filters</h4>
            {activeFiltersCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-[#07486A] hover:underline"
              >
                <RotateCcw className="w-3 h-3" /> Reset all
              </button>
            )}
          </div>

          <div className="space-y-3">
            <MultiSelect
              options={nvrOptions}
              value={selectedNvrIds}
              onChange={setSelectedNvrIds}
              placeholder="Select NVR"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No NVR Found"
            />

            <MultiSelect
              options={cameraOptions}
              value={selectedChannelIds}
              onChange={setSelectedChannelIds}
              placeholder="Select Camera"
              searchable
              className="w-full"
              maxHeight="max-h-40"
              msg="No Camera Found"
            />

            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-full h-9 border border-[#C7C7C7] rounded-lg text-sm bg-white text-[#595959] cursor-pointer">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="cursor-pointer">Low</SelectItem>
                <SelectItem value="moderate" className="cursor-pointer">Moderate</SelectItem>
                <SelectItem value="high" className="cursor-pointer">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  const viewToggle = (
    <div className="flex items-center border border-[#C7C7C7] rounded-[8px] overflow-hidden h-9">
      <button
        onClick={() => setViewMode('list')}
        className={`flex cursor-pointer items-center justify-center px-2.5 h-full transition-colors ${
          viewMode === 'list' ? 'bg-[#07486A] text-white' : 'bg-white text-[#595959] hover:bg-gray-50'
        }`}
        title="List view"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => setViewMode('grid')}
        className={`flex cursor-pointer items-center justify-center px-2.5 h-full transition-colors ${
          viewMode === 'grid' ? 'bg-[#07486A] text-white' : 'bg-white text-[#595959] hover:bg-gray-50'
        }`}
        title="Grid view"
      >
        <LayoutGrid className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <>
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => { setPreviewImage(null); setPreviewImageLoading(false); }}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setPreviewImage(null); setPreviewImageLoading(false); }}
              className="absolute -top-3 -right-3 z-10 bg-white rounded-full p-1 cursor-pointer shadow-lg hover:bg-gray-100"
              title="Close"
            >
              <X className="w-5 h-5 text-[#333333]" />
            </button>
            {previewImageLoading && (
              <div className="flex items-center justify-center w-[320px] h-[220px] rounded-lg bg-black/40">
                <svg className="animate-spin w-10 h-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            )}
            <img
              src={previewImage}
              alt="preview"
              className={`max-w-[90vw] max-h-[85vh] rounded-lg shadow-xl border border-white transition-opacity duration-300 ${previewImageLoading ? 'opacity-0 w-0 h-0' : 'opacity-100'}`}
              onLoadStart={() => setPreviewImageLoading(true)}
              onLoad={() => setPreviewImageLoading(false)}
              onError={() => setPreviewImageLoading(false)}
            />
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        <ReusableTablePage
          title="Crusher Detection Logs"
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          attendanceLogsCount={totalCount}
          limit={limit}
          searchKeys={['incidentName', 'currentStatus', 'nvrName', 'channelName']}
          searchQuery={searchInput}
          onSearchChange={setSearchInput}
          startDate={startDate}
          endDate={endDate}
          maxDate={maxDateDefault}
          onDateRangeChange={({ start, end }) => {
            const toIso = (d) => d instanceof Date ? moment(d).format('YYYY-MM-DD') : d;
            setStartDate(start ? toIso(start) : '');
            setEndDate(end ? toIso(end) : '');
          }}
        >
          <Button
            className="bg-[#07486A] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer"
            onClick={exportToExcel}
          >
            Export Excel
          </Button>
          <Button
            className="bg-[#07486A] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer"
            onClick={exportToPDF}
          >
            Export PDF
          </Button>
          <AutoRefreshComponent
            isActive={autoRefresh}
            onActiveChange={setAutoRefresh}
            refreshInterval={refreshInterval}
            onIntervalChange={setRefreshInterval}
            onManualRefresh={() => setManualTrigger((prev) => prev + 1)}
          />
          {FilterPopover}
          {viewToggle}
        </ReusableTablePage>
      ) : (
        /* ── Grid view ── */
        <div className="min-h-screen">
          <div className="w-full overflow-x-auto p-3 sm:p-4 space-y-5 md:space-y-7 xl:space-y-8 bg-white rounded-[18px]">
            <div className="border-gray-200 rounded-[8px] xl:rounded-[20px] bg-[#FAFAFA] p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <div className="relative w-full md:w-[15%]">
                  <Input
                    type="text"
                    placeholder="Search"
                    className="pl-4 pr-10 shadow-none border border-[#C7C7C7] text-[#595959] h-9 md:h-10"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#595959]" />
                </div>
                <DateRangePickerComponent
                  startDate={startDate ? moment(startDate).startOf('day').toDate() : null}
                  endDate={endDate ? moment(endDate).endOf('day').toDate() : null}
                  maxDate={maxDateDefault}
                  onRangeChange={({ start, end }) => {
                    const toIso = (d) => d instanceof Date ? moment(d).format('YYYY-MM-DD') : d;
                    setStartDate(start ? toIso(start) : '');
                    setEndDate(end ? toIso(end) : '');
                  }}
                  buttonClassName="h-9 transition-shadow duration-300 ease-in-out hover:shadow-sm text-[#5D5D5D] font-medium cursor-pointer py-1.5 px-2 bg-[#FFFFFF] rounded-lg text-xs border border-[#C7C7C7] flex items-center justify-between w-full max-w-[280px] sm:min-w-[160px] md:w-auto md:px-2"
                  buttonContent={
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center overflow-hidden whitespace-nowrap">
                        <img src={Month} className="w-3.5 h-3.5 mr-1.5 shrink-0 mt-0.5" alt="Calendar Icon" />
                        <span className="truncate block w-[100px] text-left">
                          {startDate && endDate
                            ? formatDateRange(moment(startDate).startOf('day').toDate(), moment(endDate).endOf('day').toDate())
                            : 'Select Date'}
                        </span>
                      </div>
                      <ChevronDown className="w-[12px] h-[12px] text-[#5D5D5D] ml-1.5 shrink-0" />
                    </div>
                  }
                  popoverClassName="mt-1 z-50"
                  calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8]"
                />
                <div className="w-full md:flex md:items-center md:ml-auto md:w-auto gap-3 flex flex-wrap">
                  <Button
                    className="bg-[#07486A] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer"
                    onClick={exportToExcel}
                  >
                    Export Excel
                  </Button>
                  <Button
                    className="bg-[#07486A] text-white rounded-[8px] px-3 py-2 text-sm cursor-pointer"
                    onClick={exportToPDF}
                  >
                    Export PDF
                  </Button>
                  <AutoRefreshComponent
                    isActive={autoRefresh}
                    onActiveChange={setAutoRefresh}
                    refreshInterval={refreshInterval}
                    onIntervalChange={setRefreshInterval}
                    onManualRefresh={() => setManualTrigger((prev) => prev + 1)}
                  />
                  {FilterPopover}
                  {viewToggle}
                </div>
              </div>

              {/* Cards */}
              {loading ? (
                <div className="text-center py-4 text-gray-500">Loading..</div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 min-h-[60vh]">
                  <p className="text-gray-400 text-sm">No records found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {rows.map((row) => (
                    <div
                      key={row._id}
                      className="bg-white border border-[#E5E5E5] rounded-[12px] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Image area */}
                      <div className="relative w-full h-40 bg-[#F0F0F0] flex items-center justify-center">
                        {row.incidentImageUrl ? (
                          <img
                            src={row.incidentImageUrl}
                            alt="incident"
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => { setPreviewImageLoading(true); setPreviewImage(row.incidentImageUrl); }}
                          />
                        ) : (
                          <Image className="w-10 h-10 text-[#C7C7C7]" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="p-3 space-y-2">
                        <div>
                          <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide">Incident Name</p>
                          <p className="text-xs font-semibold text-[#07486A] truncate">{row.incidentName}</p>
                        </div>
                        <div className="flex items-center gap-2">
  <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide leading-none">
    Current Status
  </p>

  {row.currentStatus ? (
    <span className="text-xs font-medium px-2.5 py-1 rounded-full text-[#07486A] bg-[#EEF6FB]">
      {row.currentStatus}
    </span>
  ) : (
    <span className="text-xs text-[#333333]">--</span>
  )}
</div>
                        <div>
                          <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide">NVR Name</p>
                          <p className="text-xs text-[#333333] truncate">{row.nvrName}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide">Camera Name</p>
                          <p className="text-xs text-[#333333] truncate">{row.channelName}</p>
                        </div>
                        <div className="flex items-center gap-2">
  <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide leading-none">
    Severity
  </p>
  <span
    className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${
      (row.severity || '').toLowerCase() === 'low'
        ? 'text-green-700 bg-green-100'
        : (row.severity || '').toLowerCase() === 'moderate'
        ? 'text-yellow-700 bg-yellow-100'
        : (row.severity || '').toLowerCase() === 'high'
        ? 'text-red-700 bg-red-100'
        : 'text-gray-500 bg-gray-100'
    }`}
  >
    {row.severity || '--'}
  </span>
</div>
                        <div>
                          <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide">Time of Incident</p>
                          <p className="text-xs text-[#333333]">
                            {row.createdAt && row.createdAt !== '--'
                              ? moment.utc(row.createdAt).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A')
                              : '--'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {!loading && rows.length > 0 && (
              <div className="mt-6 grid grid-cols-3 items-center gap-4">
                <div className="text-sm text-[#333333] bg-[#F5F5F5] px-3 py-1.5 font-[400] rounded-[5px] w-42 inline-flex items-center gap-2">
                  Total logs -{' '}
                  <span className="text-[#07486A] font-medium bg-[#E3F5FF] px-2.5 py-1 rounded-md">
                    {totalCount}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className={`flex items-center justify-center w-8 h-8 rounded ${
                      currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    &#8249;
                  </button>
                  {Array.from({ length: Math.max(1, Math.ceil(totalCount / limit)) }, (_, i) => i + 1)
                    .filter((p) => {
                      const total = Math.ceil(totalCount / limit);
                      return p === 1 || p === total || Math.abs(p - currentPage) <= 1;
                    })
                    .reduce((acc, page, idx, arr) => {
                      if (idx > 0 && page - arr[idx - 1] > 1) acc.push('...');
                      acc.push(page);
                      return acc;
                    }, [])
                    .map((page, idx) =>
                      page === '...' ? (
                        <span key={`e-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400">...</span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`flex items-center justify-center w-8 h-8 rounded text-sm font-medium ${
                            currentPage === page ? 'bg-[#07486A] text-white cursor-pointer' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(Math.ceil(totalCount / limit), p + 1))}
                    disabled={currentPage === Math.ceil(totalCount / limit)}
                    className={`flex items-center justify-center w-8 h-8 rounded ${
                      currentPage === Math.ceil(totalCount / limit) ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    &#8250;
                  </button>
                </div>
                <div />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CrusherLogs;
