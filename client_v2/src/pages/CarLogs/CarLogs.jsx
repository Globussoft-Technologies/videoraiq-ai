import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { Building2, Calendar, Car, CarFront, Clock, Filter, Hash, Image, Loader2, Palette, Pencil, RotateCcw, Server, Video } from 'lucide-react';
import getAccessToken from '@/utils/getAccessToken';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/pages/AttendanceLogs/components/Popover';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';
import AutoRefreshComponent from '@/pages/AttendanceLogs/components/AutoRefreshComponent';
import ExportButton from '@/pages/AttendanceLogs/components/ExportButton';
import VehicleNumberSelect from '@/pages/ANPRLogs/components/VehicleNumberSelect';
import { handleCarExport } from './carExport';

const HOST = import.meta.env.VITE_BACKEND;
const HONDA_MODEL_OPTIONS = [
  'Amaze',
  'Amaze 2nd Gen',
  'City',
  'City Hybrid',
  'Elevate',
  'ZR-V',
  'Brio',
  'Jazz',
  'WR-V',
  'Mobilio',
  'BR-V',
  'Civic',
  'Accord',
  'CR-V',
];

const getHeaders = () => ({
  Accept: 'application/json',
  'x-access-token': getAccessToken(),
});

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

const getCarImageUrl = (item) => {
  const path = item.Image || item.image || item.imageUrl || item.carImage || item.carImageUrl || '';
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL || '';
  return `${INCIDENT_URL}${path}`;
};

const getModelName = (item) =>
  item.modelName ||
  item.modelname ||
  item.model_name ||
  item.carModelName ||
  item.carModel ||
  item.model ||
  '--';

const getYear = (item) => item.year || item.modelYear || item.carYear || '--';

const getColor = (item) => item.color || item.colour || item.carColor || '--';

const getCompany = (item) => item.company || item.make || item.carCompany || '--';

const formatIncidentTime = (value) =>
  value ? moment.utc(value).tz(moment.tz.guess()).format('DD/MM/YYYY hh:mm A') : '--';

const optionKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeHondaModel = (value) =>
  HONDA_MODEL_OPTIONS.find((model) => optionKey(model) === optionKey(value)) || '';

const updateCarModelDetails = (incidentId, payload) =>
  axios.patch(`${HOST}/incidents/logs/car-model-detection/${incidentId}`, payload, {
    headers: jsonHeaders(),
  });

function EditCarModelModal({ row, saving, onClose, onSave }) {
  const [model, setModel] = useState(() => normalizeHondaModel(row?.modelName));
  const [company, setCompany] = useState(() => (row?.company && row.company !== '--' ? row.company : ''));
  const [year, setYear] = useState(() => (row?.year && row.year !== '--' ? String(row.year) : ''));

  useEffect(() => {
    setModel(normalizeHondaModel(row?.modelName));
    setCompany(row?.company && row.company !== '--' ? row.company : '');
    setYear(row?.year && row.year !== '--' ? String(row.year) : '');
  }, [row]);

  if (!row) return null;

  const originalModel = normalizeHondaModel(row.modelName);
  const originalCompany = row.company && row.company !== '--' ? row.company : '';
  const originalYear = row.year && row.year !== '--' ? String(row.year) : '';
  const hasChanges =
    (model && model !== originalModel) ||
    company.trim() !== originalCompany ||
    year.trim() !== originalYear;

  const submit = (e) => {
    e.preventDefault();
    onSave({
      model,
      company: company.trim(),
      year: year.trim(),
      originalModel,
      originalCompany,
      originalYear,
    });
  };

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="left-1/2 top-1/2 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 border border-[var(--bd)] bg-[var(--bg1solid)] p-0 text-[var(--tx)]">
        <form onSubmit={submit}>
          <DialogHeader className="border-b border-[var(--bd)] px-5 py-4">
            <DialogTitle className="text-[18px] text-[var(--tx)]">Edit Car Details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--tx3)]">Model Name</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 text-sm text-[var(--tx)] outline-none focus:border-[var(--brand)]"
              >
                <option value="">Select model</option>
                {HONDA_MODEL_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--tx3)]">Company</span>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company"
                className="h-10 rounded-lg bg-[var(--bg2)]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--tx3)]">Year</span>
              <Input
                type="number"
                min="1900"
                max="2100"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Year"
                className="h-10 rounded-lg bg-[var(--bg2)]"
              />
            </label>
          </div>

          <DialogFooter className="border-t border-[var(--bd)] px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] hover:bg-[var(--bg2)]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !hasChanges}
              className="bg-[var(--brand)] text-white hover:opacity-90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const REFRESH_KEY = 'v2_car_logs_auto_refresh_enabled';
const INTERVAL_KEY = 'v2_car_logs_auto_refresh_interval';

const fetchCarLogs = ({
  skip,
  limit,
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  vehicleNumber,
  search,
}) =>
  axios.post(
    `${HOST}/incidents/logs/car-model-detection`,
    {},
    {
      params: {
        skip,
        limit,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(sortField && { sortField }),
        ...(sortOrder && { sortOrder }),
        ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
        ...(channelIds?.length && { channelIds: channelIds.join(',') }),
        ...(vehicleNumber && { vehicleNumber }),
        ...(search && { search }),
      },
      headers: getHeaders(),
    }
  );

const getNVRs = () => axios.post(`${HOST}/authorizedChannels/getNVRS`, {}, { headers: jsonHeaders() });
const getchannels = (data) =>
  axios.post(`${HOST}/authorizedChannels/getChannels`, data, { headers: jsonHeaders() });
const getVehicleNumbers = (search) =>
  axios.get(`${HOST}/incidents/logs/car-model-detection/numbers`, {
    params: {
      ...(search && { search }),
    },
    headers: getHeaders(),
  });

const CarLogs = () => {
  const todayISO = moment().format('YYYY-MM-DD');
  const maxDateDefault = useMemo(() => moment().endOf('day').toDate(), []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState(todayISO);
  const [nvrList, setNvrList] = useState([]);
  const [cameraList, setCameraList] = useState([]);
  const [nvrIds, setNvrIds] = useState([]);
  const [channelIds, setChannelIds] = useState([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleNumberList, setVehicleNumberList] = useState([]);
  const [vehicleNumberSearch, setVehicleNumberSearch] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('v2_car_logs_view_mode');
    return saved === 'grid' || saved === 'table' ? saved : 'table';
  });
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const saved = localStorage.getItem(REFRESH_KEY);
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const parsed = parseInt(localStorage.getItem(INTERVAL_KEY), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);

  const skip = (currentPage - 1) * limit;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCarLogs({
        skip,
        limit,
        startDate,
        endDate,
        sortField,
        sortOrder,
        nvrIds,
        channelIds,
        vehicleNumber,
        search: searchInput,
      });
      const data = res?.data?.body?.data;
      const list = data?.data || [];
      setRows(
        list.map((item) => ({
          id: item._id,
          _id: item._id,
          imageUrl: getCarImageUrl(item),
          modelName: getModelName(item),
          vehicleNumber: item.vehicleNumber || '--',
          vehicleVisitCount: Number(item.vehicleLogCount || 0),
          color: getColor(item),
          company: getCompany(item),
          year: getYear(item),
          incidentTime: formatIncidentTime(item.timeOfIncident || item.createdAt),
          nvrName: item.nvrData?.nvrName || '--',
          channelName: item.channelData?.name || '--',
        }))
      );
      setTotalCount(data?.totalCount || 0);
    } catch (err) {
      console.log('Error fetching car logs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [skip, limit, startDate, endDate, sortField, sortOrder, nvrIds, channelIds, vehicleNumber, searchInput]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, manualTrigger]);

  useEffect(() => {
    localStorage.setItem(REFRESH_KEY, autoRefresh);
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem(INTERVAL_KEY, refreshInterval);
  }, [refreshInterval]);

  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(fetchLogs, refreshInterval * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, fetchLogs]);

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
        const res = await getchannels({ nvrIds });
        setCameraList(res?.data?.body?.data || []);
      } catch (err) {
        console.log('Error fetching channels:', err);
      }
    };
    fetchChannels();
  }, [nvrIds]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        const res = await getVehicleNumbers(vehicleNumberSearch);
        setVehicleNumberList(res?.data?.body?.data?.vehicleNumbers || []);
      } catch (err) {
        console.log('Error fetching vehicle numbers:', err);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [vehicleNumberSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [nvrIds, channelIds, vehicleNumber]);

  useEffect(() => {
    localStorage.setItem('v2_car_logs_view_mode', viewMode);
  }, [viewMode]);

  const toggleSort = (field) => {
    setSortField(field);
    // Toggle only when re-clicking the column that is already sorted. Clicking
    // a different header used to inherit the previous column's direction, so
    // the first click on Company could land on descending for no visible
    // reason -- invisible while the server ignored sortField, obvious now that
    // it honours it.
    setSortOrder((prev) => (field === sortField && prev === 'asc' ? 'desc' : 'asc'));
  };

  const openPreview = (url) => {
    if (url) setPreviewImage(url);
  };

  const openEdit = (row) => setEditRow(row);

  const handleSaveEdit = async ({ model, company, year, originalModel, originalCompany, originalYear }) => {
    if (!editRow) return;
    const payload = {};
    const updates = {};

    if (model && model !== originalModel) {
      payload.model_name = model;
      updates.modelName = model;
    }

    if (company !== originalCompany) {
      payload.company = company;
      updates.company = company || '--';
    }

    if (year !== originalYear) {
      const parsedYear = Number(year);
      if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
        toast.error('Enter a valid year');
        return;
      }
      payload.year = parsedYear;
      updates.year = parsedYear;
    }

    if (Object.keys(updates).length === 0) {
      toast.error('Change at least one value');
      return;
    }

    setEditSaving(true);
    try {
      const res = await updateCarModelDetails(editRow.id, payload);
      const catalogSync = res?.data?.body?.data?.catalogSync;
      setRows((current) =>
        current.map((row) =>
          row.id === editRow.id ? { ...row, ...updates } : row
        )
      );
      if (catalogSync?.success === false) {
        toast.warning('Car details updated, catalog sync failed');
      } else {
        toast.success('Car details updated');
      }
      setEditRow(null);
    } catch (err) {
      console.log('Failed to update car model reference:', err);
      const errorBody = err?.response?.data?.body;
      const errorDetail = errorBody?.error?.detail || errorBody?.error?.response?.detail;
      toast.error(errorDetail?.message || errorBody?.message || err?.response?.data?.message || 'Failed to update car details');
    } finally {
      setEditSaving(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: 'imageUrl',
        header: 'Image',
        cell: ({ row }) => {
          const imageUrl = row.original.imageUrl;
          return imageUrl ? (
            <button
              onClick={() => openPreview(imageUrl)}
              className="w-11 h-9 rounded-[6px] overflow-hidden border border-[var(--bd)] cursor-pointer hover:border-[var(--bd2)] transition-colors block"
              title="View car image"
              aria-label="View car image"
            >
              <ImageWithLoader
                src={imageUrl}
                alt={row.original.modelName}
                className="w-full h-full"
                imgClassName="w-full h-full object-cover"
              />
            </button>
          ) : (
            <span className="w-11 h-9 rounded-[6px] bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center">
              <Image className="w-4 h-4 text-[var(--tx3)]" />
            </span>
          );
        },
      },
      {
        accessorKey: 'modelName',
        header: () => (
          <button
            onClick={() => toggleSort('modelName')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Model Name
          </button>
        ),
        cell: ({ row }) => <span className="text-[13px] text-[var(--tx)]">{row.original.modelName}</span>,
      },
      {
        accessorKey: 'vehicleNumber',
        header: () => (
          <button
            onClick={() => toggleSort('vehicleNumber')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Vehicle Number
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-[13px] text-[var(--tx)] whitespace-nowrap">{row.original.vehicleNumber}</span>
        ),
      },
      {
        accessorKey: 'vehicleVisitCount',
        header: () => (
          <button
            onClick={() => toggleSort('vehicleLogCount')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Vehicle Visit Count
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-[13px] text-[var(--tx)] whitespace-nowrap">{row.original.vehicleVisitCount}</span>
        ),
      },
      {
        accessorKey: 'company',
        header: () => (
          <button
            onClick={() => toggleSort('company')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Company
          </button>
        ),
        cell: ({ row }) => <span className="text-[13px] text-[var(--tx)]">{row.original.company}</span>,
      },
      {
        accessorKey: 'color',
        header: () => (
          <button
            onClick={() => toggleSort('color')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Colour
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-[13px] text-[var(--tx)] capitalize">{row.original.color}</span>
        ),
      },
      {
        accessorKey: 'year',
        header: () => (
          <button
            onClick={() => toggleSort('year')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Year
          </button>
        ),
        cell: ({ row }) => <span className="text-[13px] text-[var(--tx)]">{row.original.year}</span>,
      },
      {
        accessorKey: 'nvrName',
        header: () => (
          <button
            onClick={() => toggleSort('nvrData.nvrName')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            NVR Name
          </button>
        ),
        cell: ({ row }) => <span className="text-[13px] text-[var(--tx)]">{row.original.nvrName}</span>,
      },
      {
        accessorKey: 'channelName',
        header: () => (
          <span className="uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] [font-family:var(--mono)]">
            Camera Name
          </span>
        ),
        cell: ({ row }) => <span className="text-[13px] text-[var(--tx)]">{row.original.channelName}</span>,
      },
      {
        accessorKey: 'incidentTime',
        header: () => (
          <button
            onClick={() => toggleSort('timeOfIncident')}
            className="cursor-pointer uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] hover:text-[var(--tx2)] [font-family:var(--mono)]"
          >
            Time
          </button>
        ),
        cell: ({ row }) => <span className="text-[13px] text-[var(--tx)] whitespace-nowrap">{row.original.incidentTime}</span>,
      },
      {
        accessorKey: 'actions',
        header: () => (
          <span className="uppercase tracking-[0.06em] text-[10px] text-[var(--tx3)] [font-family:var(--mono)]">
            Actions
          </span>
        ),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => openEdit(row.original)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
            title="Edit car details"
            aria-label="Edit car details"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [sortField]
  );

  const nvrOptions = useMemo(
    () => nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList]
  );

  const cameraOptions = useMemo(
    () => cameraList.map((cam) => ({ label: cam.customName || cam.name, id: cam._id || cam.id })),
    [cameraList]
  );

  const filteredVehicleNumberList = useMemo(() => {
    const query = vehicleNumberSearch.trim().toLowerCase();
    if (!query) return vehicleNumberList;
    return vehicleNumberList.filter((number) =>
      String(number).toLowerCase().includes(query)
    );
  }, [vehicleNumberList, vehicleNumberSearch]);

  const activeFiltersCount = [nvrIds.length > 0, channelIds.length > 0, !!vehicleNumber].filter(Boolean).length;

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
    setVehicleNumber('');
    setVehicleNumberSearch('');
  };

  const handleExport = (format) =>
    handleCarExport(format, {
      startDate,
      endDate,
      sortField,
      sortOrder,
      nvrIds,
      channelIds,
      vehicleNumber,
      searchInput,
    });

  const gridCard = useCallback(
    (row) => (
      <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
        <div className="relative bg-[#0a0e15] flex items-center justify-center" style={{ aspectRatio: '6 / 3' }}>
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-black/55 text-white shadow-sm transition-colors hover:bg-black/75"
            title="Edit car details"
            aria-label="Edit car details"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {row.imageUrl ? (
            <ImageWithLoader
              src={row.imageUrl}
              alt={row.modelName}
              className="absolute inset-0 cursor-pointer"
              imgClassName="w-full h-full object-cover"
              onClick={() => openPreview(row.imageUrl)}
              title="Click to enlarge"
            />
          ) : (
            <Image className="w-10 h-10 text-[var(--tx3)]" />
          )}
        </div>
        <div className="p-[11px] space-y-[9px]">
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Car className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Model
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.modelName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <CarFront className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Vehicle No.
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.vehicleNumber}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Hash className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Visit Count
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.vehicleVisitCount}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Building2 className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Company
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.company}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Palette className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Colour
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0 capitalize">
              {row.color}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Calendar className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Year
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.year}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Server className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              NVR
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.nvrName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Video className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Camera
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.channelName}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Clock className="w-4 h-4 text-[var(--tx2)] shrink-0" />
            <span className="font-semibold text-[var(--tx)] text-[9.5px] uppercase tracking-wider shrink-0">
              Time
            </span>
            <span className="text-[var(--tx2)] font-medium text-[11.5px] truncate flex-1 text-right min-w-0">
              {row.incidentTime}
            </span>
          </div>
        </div>
      </div>
    ),
    []
  );

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <ImagePreviewModal previewImage={previewImage} onClose={() => setPreviewImage(null)} />
      <EditCarModelModal
        row={editRow}
        saving={editSaving}
        onClose={() => setEditRow(null)}
        onSave={handleSaveEdit}
      />

      <ReusableTablePage
        loading={loading}
        error={error}
        data={rows}
        columns={columns}
        gridCard={gridCard}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        attendanceLogsCount={totalCount}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        onPageChange={setCurrentPage}
        limit={limit}
        onLimitChange={setLimit}
        searchKeys={['modelName', 'vehicleNumber', 'company', 'color', 'year', 'incidentTime', 'nvrName', 'channelName']}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? moment(d).format('YYYY-MM-DD') : d);
          let s = start ? toIso(start) : null;
          let e = end ? toIso(end) : null;
          if (s && !e) e = s;
          if (!s && e) s = e;
          if (!s && !e) {
            s = todayISO;
            e = todayISO;
          }
          if (moment(s).isAfter(moment(e))) {
            const tmp = s;
            s = e;
            e = tmp;
          }
          setStartDate(s);
          setEndDate(e);
        }}
      >
        <ExportButton onClick={() => handleExport('excel')}>Excel</ExportButton>
        <ExportButton onClick={() => handleExport('pdf')}>PDF</ExportButton>

        <Popover>
          <PopoverTrigger asChild>
            <Button className="flex bg-[var(--violet)]/10 border border-[var(--violet)]/30 rounded-lg text-[var(--violet)] font-semibold hover:bg-[var(--violet)]/15 cursor-pointer items-center gap-2 relative h-10">
              <Filter className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="bg-gradient-to-br from-[var(--blue)] to-[var(--violet)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] h-5 flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] rounded-xl p-4" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--bd)] pb-2">
                <h4 className="font-semibold text-base text-[var(--tx)]">Filters</h4>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1 cursor-pointer text-xs text-[var(--brand)] hover:underline"
                  >
                    <RotateCcw className="w-3 h-3 cursor-pointer" /> Reset all
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <MultiSelect
                  options={nvrOptions}
                  value={nvrIds}
                  onChange={(value) => {
                    setNvrIds(value);
                    if (value.length === 0) setChannelIds([]);
                  }}
                  placeholder="Select NVR"
                  searchable
                  className="w-full"
                  maxHeight="max-h-40"
                  msg="No NVR Found"
                />
                <MultiSelect
                  options={cameraOptions}
                  value={channelIds}
                  onChange={setChannelIds}
                  placeholder="Select Camera"
                  searchable
                  className="w-full"
                  maxHeight="max-h-40"
                  msg="No Camera Found"
                />
                <VehicleNumberSelect
                  vehicleNumber={vehicleNumber}
                  setVehicleNumber={setVehicleNumber}
                  vehicleNumberList={filteredVehicleNumberList}
                  vehicleNumberSearch={vehicleNumberSearch}
                  setVehicleNumberSearch={setVehicleNumberSearch}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <AutoRefreshComponent
          isActive={autoRefresh}
          onActiveChange={setAutoRefresh}
          refreshInterval={refreshInterval}
          onIntervalChange={setRefreshInterval}
          onManualRefresh={() => setManualTrigger((prev) => prev + 1)}
        />
      </ReusableTablePage>
    </div>
  );
};

export default CarLogs;
