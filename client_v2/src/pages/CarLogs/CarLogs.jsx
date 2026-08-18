import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { Filter, Image, RotateCcw } from 'lucide-react';
import getAccessToken from '@/utils/getAccessToken';
import { Button } from '@/components/ui/button';
import ReusableTablePage from '@/pages/AttendanceLogs/components/ReusableTablePage';
import ImageWithLoader from '@/pages/AttendanceLogs/components/ImageWithLoader';
import MultiSelect from '@/pages/AttendanceLogs/components/MultiSelect';
import { Popover, PopoverContent, PopoverTrigger } from '@/pages/AttendanceLogs/components/Popover';
import ImagePreviewModal from '@/pages/ANPRLogs/components/ImagePreviewModal';

const HOST = import.meta.env.VITE_BACKEND;

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

const fetchCarLogs = ({
  skip,
  limit,
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
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
        ...(search && { search }),
      },
      headers: getHeaders(),
    }
  );

const getNVRs = () => axios.post(`${HOST}/authorizedChannels/getNVRS`, {}, { headers: jsonHeaders() });
const getchannels = (data) =>
  axios.post(`${HOST}/authorizedChannels/getChannels`, data, { headers: jsonHeaders() });

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
  const [previewImage, setPreviewImage] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('v2_car_logs_view_mode');
    return saved === 'grid' || saved === 'table' ? saved : 'table';
  });

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
          year: getYear(item),
        }))
      );
      setTotalCount(data?.totalCount || 0);
    } catch (err) {
      console.log('Error fetching car logs:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [skip, limit, startDate, endDate, sortField, sortOrder, nvrIds, channelIds, searchInput]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
    setCurrentPage(1);
  }, [nvrIds, channelIds]);

  useEffect(() => {
    localStorage.setItem('v2_car_logs_view_mode', viewMode);
  }, [viewMode]);

  const toggleSort = (field) => {
    setSortField(field);
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const openPreview = (url) => {
    if (url) setPreviewImage(url);
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
    ],
    []
  );

  const nvrOptions = useMemo(
    () => nvrList.map((nvr) => ({ label: nvr.nvrName, id: nvr._id || nvr.id })),
    [nvrList]
  );

  const cameraOptions = useMemo(
    () => cameraList.map((cam) => ({ label: cam.customName || cam.name, id: cam._id || cam.id })),
    [cameraList]
  );

  const activeFiltersCount = [nvrIds.length > 0, channelIds.length > 0].filter(Boolean).length;

  const resetFilters = () => {
    setNvrIds([]);
    setChannelIds([]);
  };

  const gridCard = useCallback(
    (row) => (
      <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-[13px] overflow-hidden hover:border-[var(--bd2)] transition-colors h-full w-full min-w-0">
        <div className="relative bg-[#0a0e15] flex items-center justify-center" style={{ aspectRatio: '4 / 3' }}>
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
        <div className="p-[11px]">
          <div className="text-[12.5px] font-semibold text-[var(--tx)] truncate">{row.modelName}</div>
          <div className="text-[11px] text-[var(--tx3)] mt-[4px] truncate">{row.year}</div>
        </div>
      </div>
    ),
    []
  );

  return (
    <div className="p-3 sm:p-4 lg:p-[22px] flex flex-col gap-3 sm:gap-[18px] min-h-full">
      <ImagePreviewModal previewImage={previewImage} onClose={() => setPreviewImage(null)} />

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
        searchKeys={['modelName', 'year']}
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
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </ReusableTablePage>
    </div>
  );
};

export default CarLogs;
