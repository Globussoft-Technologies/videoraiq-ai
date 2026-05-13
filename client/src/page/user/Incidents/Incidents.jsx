import React, { useEffect, useState, useCallback } from 'react';
import StatCards from '../Dashboard/StatCards'; // Assuming StatCards can accept skeleton props or render its own
import Skeleton from 'react-loading-skeleton'; // Import Skeleton
import 'react-loading-skeleton/dist/skeleton.css'; // Import Skeleton CSS

import Month from '@/assets/Calendar.svg';
import {
  ArrowLeft,
  CctvIcon,
  Search,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import VideoModal from '@/components/VideoModal';
import IncidentCard from './components/IncidentCard';
import IncidentPagination from './components/IncidentPagination';
import ReportIncidentModal from './components/ReportIncidentModal';
import { Button } from '@/components/ui/button';
import { fetchAllIncidents, fetchIncidentsStats } from './Api/post';
import { useAuth } from '@/context/AuthContext';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import { formatDateRange } from '@/utils/formatDateRange';
import fallbackThumbnail from '@/assets/CounterImg2.png';
import { markAlertResolved } from '../Dashboard/Api/put';
import { toast } from 'sonner';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { usePermissions } from '@/context/Permission/PermissionContext';
import { useDashboardFiltersContext } from '@/context/UserContext/DashboardFiltersContext';
import MultiSelect from '@/components/ui/multiselect';
import { Switch } from '@/components/ui/switch';
import AutoRefreshComponent from '../EmployeeLogs/components/AutoRefreshComponent';
import { getObjectDetectionList } from '../Profile/Api/get';
import { getAllDetectionsList } from './Api/get';

// import { getNvrNames } from '../Cameras/Api/get';
const PAGE_SIZE = 9;

const Incidents = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.incidents?.view;
  const canEdit = permissions?.incidents?.edit;

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return (
      <AccessDenied message="You don't have permission to view Incidents." />
    );
  }

  const userDetails = useAuth();

  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);

  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [stats, setStats] = useState(null); // Keep stats as null initially
  const [resolved, setResolved] = useState(false);
  const [nvrList, setNvrList] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const savedInterval = localStorage.getItem('incidents_refresh_interval');
    const parsedInterval = parseInt(savedInterval, 10);
    const effectiveInterval =
      Number.isFinite(parsedInterval) && parsedInterval >= 0
        ? parsedInterval
        : 30;

    if (effectiveInterval === 0) {
      return false;
    }

    const saved = localStorage.getItem('incidents_auto_refresh');
    return saved !== null ? saved === 'true' : true;
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    const saved = localStorage.getItem('incidents_refresh_interval');
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
  });
  const [manualTrigger, setManualTrigger] = useState(0);
  const [selectedIncidentType, setSelectedIncidentType] = useState([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingIncidentId, setReportingIncidentId] = useState(null);
  const [options, setOptions] = useState([]);
  const [isIncidentsFullscreen, setIsIncidentsFullscreen] = useState(false);

  // const incidentTypeOptions = [
  //   { id: 'Check -In', label: 'Check -In' },
  //   { id: 'Check -Out', label: 'Check -Out' },
  //   { id: 'Crowd', label: 'Crowd' },
  //   { id: 'Helmet', label: 'Helmet' },
  //   { id: 'Report Incidents', label: 'Report Incidents' },
  //   { id: 'Vest', label: 'Vest' },

  // ];

  const handleGetObjectDetails = async () => {
    const response = await getAllDetectionsList(0, 100); // Fetch all options
    const formattedOptions = response?.data?.body?.data?.result;
    const incidentTypeOptions = formattedOptions?.map(item => ({
      id: item._id,
      label: item.formattedIncidentType
    }));

    setOptions(incidentTypeOptions);
  };

  console.log(options, 'options');
  // const incidentTypeOptions = options
  //   .flatMap((s) => s.objects) // get all objects in one array
  //   .filter(Boolean) // remove null/empty
  //   .map((obj) => ({
  //     id: obj.charAt(0).toUpperCase() + obj.slice(1), // capitalize first letter
  //     label: obj.charAt(0).toUpperCase() + obj.slice(1),
  //   }));

  useEffect(() => {
    handleGetObjectDetails();
  }, []);

  useEffect(() => {
    localStorage.setItem('incidents_auto_refresh', autoRefresh);
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem('incidents_refresh_interval', refreshInterval);
  }, [refreshInterval]);

  // Enforce: If interval is 0, auto-refresh must be disabled
  useEffect(() => {
    if (refreshInterval === 0 && autoRefresh) {
      setAutoRefresh(false);
    }
  }, [refreshInterval, autoRefresh]);

  const {
    selectedDepartment,
    setSelectedDepartment,
    departments,
    setDepartments,
    selectedLocation,
    setSelectedLocation,
    locations,
    setLocations,
  } = useDashboardFiltersContext();

  useEffect(() => {
    setSelectedDepartment([]);
    setSelectedLocation([]);
  }, []);

  const fetchIncidentData = async (
    skip = 0,
    limit = PAGE_SIZE,
    filterData = undefined
  ) => {
    setLoading(true); // Start loading when fetching incidents
    const finalFilterData = {
      ...filterData,
      department: selectedDepartment,
      location: selectedLocation,
    };
    try {
      const response = await fetchAllIncidents(skip, limit, finalFilterData);
      if (response?.status === 200 && Array.isArray(response?.data?.data)) {
        setIncidents(response?.data?.data);
        setTotalEntries(response?.data?.totalCount);
      } else {
        setIncidents([]); // Clear incidents on error or no data
        setTotalEntries(0);
      }
    } catch (err) {
      console.error('Error fetching Incidents:', err);
      setIncidents([]);
      setTotalEntries(0);
    } finally {
      // Set loading to false after both fetches are complete
      // This will be handled by a single loading state at the end of the useEffect
    }
  };

  const buildIncidentPayload = (selectedOptions) => {
    const MIN = 1;
    const MAX = 100000000000;

      const payload = {};
      if (selectedOptions.includes('Report Incidents')) {
        payload.reportStatus = true;
      }
      if (
        selectedOptions.includes('Check -In') &&
        selectedOptions.includes('Check -Out')
      ) {
        payload.checkInOrCheckOutCamera = 'both';
      } else if (selectedOptions.includes('Check -In')) {
        payload.checkInOrCheckOutCamera = 'checkin';
      } else if (selectedOptions.includes('Check -Out')) {
        payload.checkInOrCheckOutCamera = 'checkout';
      }

      // Crowd Detection
      if (selectedOptions.includes('Crowd')) {
        payload.incidentCrowdDetectionFilters = {
          incidentType: 'crowdDetection',
          count: {
            min: 2,
            max: 1000000,
          },
        };
      }

      // PPE Filters
      if (
        selectedOptions.includes('Helmet') ||
        selectedOptions.includes('Vest')
      ) {
        payload.incidentpersonalProtectiveEquipmentFilters = {
          incidentType: 'personProtectiveEquipment',
        };

        // Helmet only if selected
        if (selectedOptions.includes('Helmet')) {
          payload.incidentpersonalProtectiveEquipmentFilters.helmet = {
            yes: { min: MIN, max: MAX },
          };
        }

        // Vest only if selected
        if (selectedOptions.includes('Vest')) {
          payload.incidentpersonalProtectiveEquipmentFilters.safety_jacket = {
            yes: { min: MIN, max: MAX },
          };
        }
      }

    return payload;
  };

  const fetchStatsData = async (filterData) => {
    let currentFilter = filterData;

    
    if (!currentFilter) {
      // const payload = buildIncidentPayload(selectedIncidentType);
          const payload = { incidentTypeFilter:selectedIncidentType };
      let dateFilter = {};
      if (dateRange.start && dateRange.end) {
        const startDate = new Date(dateRange.start);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        dateFilter = {
          startDate: `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`,
          endDate: `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`,
        };
      }
      currentFilter = { ...payload, ...dateFilter };
    }

    const finalFilterData = {
      ...currentFilter,
      department: selectedDepartment,
      location: selectedLocation,
    };
    try {
      const response = await fetchIncidentsStats(finalFilterData);
      if (response?.data?.body?.status === 'success') {
        setStats(response?.data?.body?.data);
      } else {
        setStats(null); 
      }
    } catch (err) {
      console.error('Error fetching Stats:', err);
      setStats(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);

    // const payload = buildIncidentPayload(selectedIncidentType);
    const payload = { incidentTypeFilter:selectedIncidentType };

    let filter = undefined;
    if (dateRange.start && dateRange.end) {
      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      filter = {
        startDate: `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`,
        endDate: `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`,
      };
    }
    filter = { ...filter, ...payload };

    await Promise.all([
      fetchIncidentData((currentPage - 1) * PAGE_SIZE, PAGE_SIZE, filter),
      fetchStatsData(filter),
    ]);
    setLoading(false);
  }, [
    dateRange,
    currentPage,
    selectedLocation,
    selectedDepartment,
    selectedIncidentType,
  ]);

  // Effect 1: Manual/Filter trigger
  useEffect(() => {
    loadData();
  }, [loadData, manualTrigger]);

  // Effect 2: Auto Refresh timer
  useEffect(() => {
    let intervalId;
    if (autoRefresh && refreshInterval > 0) {
      intervalId = setInterval(() => {
        loadData();
      }, refreshInterval * 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedIncidentType]);
  // Map API data to IncidentCard/VideoModal expected props
  const mappedIncidents = incidents.map((item) => ({
    id: item._id,
    resolved: item.resolved || false,
    videoSrc: item.Image,
    thumbnailSrc: item.Image, // Always provide a fallback thumbnail
    timestamp: new Date(item.timeOfIncident).toLocaleString(),
    title: item.incidentName,
    alertText: item.description,
    // Assuming item.severity can determine if it's an alert (e.g., 'High' severity)
    alert: item.severity === 'High', // Or a more complex logic
    ...item,
  }));

  const handleMarkResolved = async (id, incidentType, newResolved) => {
    const data = {
      resolved: newResolved,
      incidentType,
    };
    const result = await markAlertResolved(id, data);
    if (result?.status === 'success') {
      setIncidents((prevIncidents) =>
        prevIncidents.map((incident) =>
          incident._id === id
            ? { ...incident, resolved: newResolved }
            : incident
        )
      );

      
      if (newResolved) {
        setTimeout(() => {
          setIncidents((prevIncidents) =>
            prevIncidents.filter((incident) => incident._id !== id)
          );
          setTotalEntries((prev) => Math.max(0, prev - 1));
        }, 500); 
      } else {
       
        setResolved(newResolved);
      }
      
      fetchStatsData();

      toast.success(result?.message || '');
    } else {
      toast.error(result?.message || 'Something went wrong');
    }
  };

  
  useEffect(() => {
    if (!loading && incidents.length === 0 && totalEntries > 0) {
      const maxPage = Math.ceil(totalEntries / PAGE_SIZE);
      if (currentPage > maxPage && maxPage > 0) {
       
        setCurrentPage(maxPage);
      } else {
       
        setManualTrigger((prev) => prev + 1);
      }
    }
  }, [incidents.length, totalEntries, loading, currentPage]);

  const handleReportIncident = (incidentId) => {
    setReportingIncidentId(incidentId);
    setReportModalOpen(true);
  };

  // useEffect(() => {
  //     const fetchNvrNames = async () => {
  //       setNvrNameLoading(true);
  //       try {
  //         const response = await getNvrNames();
  //         if (response.statusCode === 200) {
  //           const nvrs = response.body.data.nvrs;
  //           let formattedNvrs = nvrs.map((nvr) => ({
  //             id: nvr._id,
  //             label: nvr.nvrName,
  //           }));
  //           setNvrList(formattedNvrs);
  //         //    if (formattedNvrs.length > 0) {
  //         //    const firstNvrId = formattedNvrs[0].id;
  //         //    setSelectedNvrId([firstNvrId]);
  //         //    await getCamerasBasedOnNvrData(firstNvrId);
  //         // }
  //         } else {
  //           console.log('No NVRs found');
  //         }
  //       } catch (error) {
  //         console.error('Error fetching NVR names:', error);
  //       } finally {
  //         setNvrNameLoading(false);
  //       }
  //     };

  //     fetchNvrNames();
  //   }, []);
  const handleNavigateByIndex = async (globalIndex) => {
    const page = Math.floor(globalIndex / PAGE_SIZE) + 1;
    const indexInPage = globalIndex % PAGE_SIZE;

    // If the page is different, load that page first
    if (page !== currentPage) {
      setCurrentPage(page);

      // wait for incidents to load
      const skip = (page - 1) * PAGE_SIZE;
      const filter = undefined; // or your current filter logic if needed
      const response = await fetchAllIncidents(skip, PAGE_SIZE, filter);

      if (response?.status === 200 && Array.isArray(response?.data?.data)) {
        const newIncidents = response.data.data.map((item) => ({
          id: item._id,
          resolved: item.resolved || false,
          videoSrc: item.Image,
          thumbnailSrc: item.Image,
          timestamp: new Date(item.timeOfIncident).toLocaleString(),
          title: item.incidentName,
          alertText: item.description,
          alert: item.severity === 'High',
          ...item,
        }));

        setIncidents(response.data.data);

        // open the exact incident
        setSelectedIncident(newIncidents[indexInPage]);
      }
    } else {
      // Same page, simple navigation
      setSelectedIncident(mappedIncidents[indexInPage]);
    }
  };

  const modalRef = React.useRef(null);

  const handleInspectFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsIncidentsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const header = document.querySelector('.headerContainer');
    const incidentCards = document.querySelector(
      '.incidentStateCardsContainer'
    );

    if (header && incidentCards) {
      if (isIncidentsFullscreen) {
        header.classList.add('hidden');
        incidentCards.classList.add('hidden');
      } else {
        header.classList.remove('hidden');
        incidentCards.classList.remove('hidden');
      }
    }
  }, [isIncidentsFullscreen]);

  return (
    <div
      ref={modalRef}
      className={`bg-white py-[16px] xl:py-[20px] 2xl:py-[24px] px-[18px] xl:px-[24px] 2xl:px-[32px] rounded-[18px] incidentContainer ${
        isIncidentsFullscreen ? 'overflow-auto rounded-none' : ''
      }`}
    >
      {/* Header */}
      {/* <p className="text-sm text-gray-500 font-normal 2xl:text-[17px]">
        Incidents
      </p> */}

      <div className="flex flex-col gap-4 mt-2 mb-5 md:flex-row md:justify-between md:items-center">
        <h1 className="text-lg font-medium text-gray-800 2xl:text-2xl">
          {/* {`Hey, ${
            userDetails?.user?.name_f
              ? userDetails.user.name_f.charAt(0).toUpperCase() +
                userDetails.user.name_f.slice(1)
              : 'User'
          }`} */}
        </h1>
        {/* <div className="flex flex-col rounded-[10px] w-full gap-3 md:flex-row md:space-x-4 md:w-auto">
          <MultiSelect
           options={departments||[]}
           value={selectedDepartment||[]}
           onChange={setSelectedDepartment}
           placeholder="Select Department"
           searchable={true}
           searchPlaceholder="Search departments..."
           className="w-full md:w-72"
           maxHeight="max-h-48"
          />
          <MultiSelect
              options={locations||[]}
              value={selectedLocation||[]}
              onChange={setSelectedLocation}
              placeholder="Select Location"
              searchable={true}
              searchPlaceholder="Search locations..."
              className="w-full md:w-72"
              maxHeight="max-h-48"
              type="location"
          />
        </div> */}

        {/* <MultiSelect
             options={nvrList}
             value={selectedNvrId}
             onChange={setSelectedNvrId}
             placeholder="Select NVR"
             searchable
             className="w-full md:w-72"
             maxHeight="max-h-48"
          /> */}        
        <div className="flex flex-col rounded-[10px] w-full gap-3 md:flex-row md:space-x-4 md:w-auto">
          <MultiSelect
            options={options||[]}
            value={selectedIncidentType}
            onChange={setSelectedIncidentType}
            placeholder="Select Incident"
            searchable={true}
            searchPlaceholder="Search incidents..."
            className="w-full md:w-56"
            maxHeight="max-h-48"
          />
          <DateRangePickerComponent
            startDate={dateRange.start}
            endDate={dateRange.end}
              maxDate={new Date()}
            onRangeChange={setDateRange}
            buttonClassName="py-2 transition-shadow duration-300 ease-in-out hover:shadow-sm text-[#5D5D5D] font-medium cursor-pointer px-3 bg-[#FFFFFF] rounded-lg text-xs border border-[#C7C7C7] flex items-center justify-between min-w-[180px] md:w-auto md:px-4 2xl:px-6 2xl:rounded-[10px] 2xl:text-[16px] 2xl:min-w-[200px]"
            buttonContent={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center overflow-hidden whitespace-nowrap">
                  <img
                    src={Month}
                    className="w-4 h-4 mr-1.5 shrink-0 2xl:w-5 2xl:h-5 2xl:mr-2 mt-0.5"
                    alt="Calendar Icon"
                  />
                  <span className="truncate block md:mt-0.5 min-w-[100px] text-xs text-[#333333] 2xl:w-[120px] flex-1 text-left">
                    {' '}
                    {dateRange.start && dateRange.end
                      ? formatDateRange(dateRange.start, dateRange.end)
                      : 'Select Date'}
                  </span>
                </div>
                <ChevronDown className="w-[14px] h-[14px] text-[#5D5D5D] ml-1.5 shrink-0 2xl:w-[15px] 2xl:h-[16px] 2xl:ml-2" />
              </div>
            }
            popoverClassName="mt-1 z-50 2xl:mt-2"
            calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8]"
          />

          <AutoRefreshComponent
            isActive={autoRefresh}
            onActiveChange={setAutoRefresh}
            refreshInterval={refreshInterval}
            onIntervalChange={setRefreshInterval}
            onManualRefresh={() => {
              setManualTrigger((prev) => prev + 1);
              setCurrentPage(1);
            }}
          />

          <Button
            variant="outline"
            onClick={handleInspectFullScreen}
            className="h-10 px-3 rounded-lg border border-[#C7C7C7] shadow-none flex items-center justify-center hover:bg-gray-50 ml-auto"
            title={isIncidentsFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isIncidentsFullscreen ? (
              <Minimize2 className="w-5 h-5 text-[#5D5D5D]" />
            ) : (
              <Maximize2 className="w-5 h-5 text-[#5D5D5D]" />
            )}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <StatCards stats={stats} date={dateRange} incidentsPage={true} />

      {/* Video Grid */}
      <div className="grid gap-4 mt-5 grid-cols-1 min-[835px]:grid-cols-2 min-[1119px]:grid-cols-3">
        {loading ? (
          // Skeleton for Incident Cards
          Array(PAGE_SIZE)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-lg overflow-hidden shadow-md"
              >
                <Skeleton height={290} />{' '}
                {/* Placeholder for video/thumbnail */}
                <div className="p-4">
                  <Skeleton width="30%" height={20} className="mb-2" />{' '}
                  {/* Incident Name */}
                  <Skeleton width="60%" height={15} className="mb-4" />{' '}
                  {/* Time of Incident */}
                </div>
              </div>
            ))
        ) : mappedIncidents.length === 0 ? (
          <div className="col-span-full text-center py-10 text-gray-500">
            No incidents found for the selected criteria.
          </div>
        ) : (
          mappedIncidents.map((item) => (
            <IncidentCard
              key={item.id}
              item={item}
              resolved={item.resolved}
              onMarkResolved={(newResolved) =>
                handleMarkResolved(item.id, item.incidentType, newResolved)
              }
              onClick={() => setSelectedIncident(item)}
              onReport={() => handleReportIncident(item.id)}
              canEdit={canEdit}
            />
          ))
        )}
      </div>

      {/* Video Modal (handles its own internal skeleton) */}
      <VideoModal
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        videoData={selectedIncident}
        allIncidents={mappedIncidents}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        totalIncidents={totalEntries}
        onNavigateByIndex={handleNavigateByIndex}
        resolved={selectedIncident?.resolved}
        onMarkResolved={async (newResolved) => {
          if (!selectedIncident) return;
          await handleMarkResolved(
            selectedIncident.id,
            selectedIncident.incidentType,
            newResolved
          );
          setSelectedIncident((prev) =>
            prev ? { ...prev, resolved: newResolved } : prev
          );
        }}
        onReport={() => {
          if (selectedIncident) {
            handleReportIncident(selectedIncident.id);
          }
        }}
        canEdit={canEdit}
      />

      {/* Report Incident Modal */}
      <ReportIncidentModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportingIncidentId(null);
        }}
        incidentId={reportingIncidentId}
        incidentData={incidents.find(
          (incident) => incident._id === reportingIncidentId
        )}
        onSuccess={() => {
          fetchStatsData();
          loadData();
        }}
      />

      {/* Pagination */}

      <IncidentPagination
        totalEntries={totalEntries}
        currentPage={currentPage}
        totalPages={Math.ceil(totalEntries / PAGE_SIZE)}
        onPageChange={(page) => {
          if (page >= 1 && page <= Math.ceil(totalEntries / PAGE_SIZE)) {
            setCurrentPage(page);
          }
        }}
        pageSize={PAGE_SIZE}
      />

      {/* <IncidentModal 
  isOpen={isIncidentModalOpen}
  onOpenChange={setIsIncidentModalOpen}
/> */}
    </div>
  );
};

export default Incidents;
