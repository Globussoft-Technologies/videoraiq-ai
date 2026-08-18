import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { Filter, Image, RotateCcw, X } from 'lucide-react';
import getAccessToken from '@/utils/getAccessToken';
import ReusableTablePage from './ReusableTablePage';
import { Button } from '@/components/ui/button';
import MultiSelect from '@/components/ui/multiselect';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getNVRs, getchannels } from './Api/post';

const HOST = import.meta.env.VITE_BACKEND;

const getCarImageUrl = (item) => {
  const path =
    item.Image ||
    item.image ||
    item.imageUrl ||
    item.carImage ||
    item.carImageUrl ||
    '';
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

const fetchCarLogs = async ({
  skip,
  limit,
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  search,
}) => {
  const token = getAccessToken();
  return axios.post(
    `${HOST}/api/v1/incidents/logs/car-model-detection`,
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
      headers: {
        Accept: 'application/json',
        'x-access-token': token,
      },
    }
  );
};

const CarLogs = () => {
  const todayISO = moment().format('YYYY-MM-DD');
  const maxDateDefault = moment().endOf('day').toDate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
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
  const [previewImageLoading, setPreviewImageLoading] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('car_logs_view_mode');
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
    localStorage.setItem('car_logs_view_mode', viewMode);
  }, [viewMode]);

  const toggleSort = (field) => {
    setSortField(field);
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
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
              onClick={() => {
                setPreviewImageLoading(true);
                setPreviewImage(imageUrl);
              }}
              className="w-14 h-10 rounded-lg overflow-hidden border border-[#E5E5E5] bg-white cursor-pointer"
              title="View car image"
              aria-label="View car image"
            >
              <img
                src={imageUrl}
                alt={row.original.modelName}
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <span className="w-14 h-10 rounded-lg border border-[#E5E5E5] bg-[#F3F3F3] flex items-center justify-center">
              <Image className="w-5 h-5 text-[#696969]" />
            </span>
          );
        },
      },
      {
        accessorKey: 'modelName',
        header: () => (
          <button onClick={() => toggleSort('modelName')} className="cursor-pointer">
            Model Name
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-[#333333] text-xs font-normal">{row.original.modelName}</span>
        ),
      },
      {
        accessorKey: 'year',
        header: () => (
          <button onClick={() => toggleSort('year')} className="cursor-pointer">
            Year
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-[#333333] text-xs font-normal">{row.original.year}</span>
        ),
      },
    ],
    [sortField, sortOrder]
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

  const filterPopover = (
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
                className="flex items-center gap-1 cursor-pointer text-xs text-[#07486A] hover:underline"
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
  );

  const renderCarCard = useCallback((row) => (
    <div className="bg-white border border-[#E5E5E5] rounded-[12px] overflow-hidden shadow-sm hover:shadow-md transition-shadow h-full min-w-0">
      <div className="relative w-full h-40 bg-[#F0F0F0] flex items-center justify-center">
        {row.imageUrl ? (
          <img
            src={row.imageUrl}
            alt={row.modelName}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => {
              setPreviewImageLoading(true);
              setPreviewImage(row.imageUrl);
            }}
          />
        ) : (
          <Image className="w-10 h-10 text-[#C7C7C7]" />
        )}
      </div>
      <div className="p-3 space-y-2">
        <div>
          <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide">Model Name</p>
          <p className="text-xs font-semibold text-[#07486A] truncate">{row.modelName}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-[#888] uppercase tracking-wide">Year</p>
          <p className="text-xs text-[#333333] truncate">{row.year}</p>
        </div>
      </div>
    </div>
  ), []);

  return (
    <>
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => {
            setPreviewImage(null);
            setPreviewImageLoading(false);
          }}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setPreviewImage(null);
                setPreviewImageLoading(false);
              }}
              className="absolute -top-3 -right-3 z-10 bg-white rounded-full p-1 cursor-pointer shadow-lg hover:bg-gray-100"
              title="Close"
              aria-label="Close preview"
            >
              <X className="w-5 h-5 text-[#333333]" />
            </button>
            {previewImageLoading && (
              <div className="flex items-center justify-center w-[320px] h-[220px] rounded-lg bg-black/40 text-white text-sm">
                Loading..
              </div>
            )}
            <img
              src={previewImage}
              alt="Car preview"
              className={`max-w-[90vw] max-h-[85vh] rounded-lg shadow-xl border border-white transition-opacity duration-300 ${
                previewImageLoading ? 'opacity-0 w-0 h-0' : 'opacity-100'
              }`}
              onLoadStart={() => setPreviewImageLoading(true)}
              onLoad={() => setPreviewImageLoading(false)}
              onError={() => setPreviewImageLoading(false)}
            />
          </div>
        </div>
      )}

      <ReusableTablePage
        title="Car Logs"
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        attendanceLogsCount={totalCount}
        limit={limit}
        onLimitChange={setLimit}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridCard={renderCarCard}
        searchKeys={['modelName', 'year']}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        startDate={startDate}
        endDate={endDate}
        maxDate={maxDateDefault}
        onDateRangeChange={({ start, end }) => {
          const toIso = (d) => (d instanceof Date ? moment(d).format('YYYY-MM-DD') : d);
          setStartDate(start ? toIso(start) : '');
          setEndDate(end ? toIso(end) : '');
        }}
      >
        {filterPopover}
      </ReusableTablePage>
    </>
  );
};

export default CarLogs;
