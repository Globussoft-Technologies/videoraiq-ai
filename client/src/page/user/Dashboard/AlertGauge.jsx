import { useEffect, useState, useRef, useContext } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import Incidentspng from '../../../assets/Incidentspng.png';
import UserContext from '@/context/UserContext/Context';
import { getCriticalityStats } from './Api/post'; // Corrected import path syntax
import { markAlertResolved } from './Api/put';
import { toast } from 'sonner';
import Skeleton from 'react-loading-skeleton'; // Import Skeleton
import 'react-loading-skeleton/dist/skeleton.css'; // Import skeleton CSS

// Import all three images for the carousel
import highalert from '@/assets/highalert.png';
import Mildalert from '@/assets/Mildalert.png';
import Safealert from '@/assets/safealert.png';
import { useAuth } from '@/context/AuthContext';
import { formatFromToTimestamps } from '@/utils/UtcConverter';
const AlertGauge = ({ employeeId, filter , nvrId, department, location }) => {
  const chartTaskStatusRef = useRef(null);
  const { sidebarShow, setSidebarShow, switchOn, setSwitchOn } =
    useContext(UserContext);

  const [chartData, setChartData] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [fwidth, setfwidth] = useState(window.innerWidth);
  const [incidentsData, setIncidentsData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { triggerUpdate } = useAuth();
  const carouselImages = [Mildalert, Safealert, highalert];
  const [limit, setLimit] = useState(5);
  const [skip, setSkip] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
 
  const handleWdSize = () => {
    setfwidth(window.innerWidth);
  };

  const fetchCriticalStats = async () => {
    try {
      setLoading(true);
      const result = await getCriticalityStats(skip, limit);

      if (result?.status === 'success') {
        const alerts = result?.data?.recentAlerts || [];
        setTotalAlerts(result?.data?.totalCount || alerts.length);
        setRecentAlerts(alerts);

        const data = result?.data?.chartData;
        if (Array.isArray(data)) {
          const allValuesZero = data.every((item) => item.value === 0);
          setIncidentsData(!allValuesZero);
          setChartData(data);
        }
      } else {
        toast.error(result?.message || 'Failed to load alerts');
      }
    } catch (error) {
      console.error('Error fetching critical stats:', error);
      toast.error('Something went wrong while fetching alerts');
    } finally {
      setLoading(false);
    }
  };

  const goToNextImage = () => {
    const nextIndex = currentImageIndex + 1;

    if (nextIndex < recentAlerts.length) {
      setCurrentImageIndex(nextIndex);
    } else if (skip + limit < totalAlerts) {
      setSkip(skip + limit);
      // `currentImageIndex` will reset via useEffect
    }
  };

  const goToPreviousImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    } else if (skip > 0) {
      const newSkip = Math.max(0, skip - limit);
      setSkip(newSkip);
      // We'll reset `currentImageIndex` to 0 in useEffect after data loads
    }
  };

  const goToImage = (index) => {
    setCurrentImageIndex(index);
  };

  const handleMarkResolved = async (id, incidentType) => {
  const data = {
    resolved: !resolved,
    incidentType,
  };
  const result = await markAlertResolved(id, data);

  if (result?.status === 'success') {
    setResolved(data.resolved); // safer than toggling blindly
    fetchCriticalStats();
    triggerUpdate(); 
    toast.success(result?.message || 'Incident updated successfully');
  } else {
    toast.error(result?.message || 'Something went wrong');
  }
};


  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCriticalStats();
      setCurrentImageIndex(0);
    }, 500); // wait 500ms before fetching

    return () => clearTimeout(handler); // cleanup
  }, [skip,nvrId, department, location]);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [recentAlerts]);

  //   useEffect(() => {
  //   setCurrentImageIndex(0); // reset index when new page is loaded
  // }, [recentAlerts]);

  useEffect(() => {
    window.addEventListener('resize', handleWdSize);
    return () => {
      window.removeEventListener('resize', handleWdSize);
    };
  }, []);

  const currentAlert = recentAlerts?.[currentImageIndex] || null;
  const getCurrentAlertStatus = () => {
    if (!currentAlert)
      return {
        text: 'Safe Zone',
        colorClass: 'bg-[#e8ffdb] text-[#338904]',
        heading: 'Safe',
        icon: Incidentspng,
      };

    const severity = currentAlert?.severity?.toLowerCase();

    switch (severity) {
      case 'moderate':
        return {
          text: 'Mild Zone',
          colorClass: 'bg-yellow-100 text-yellow-600',
          heading: 'Medium',
          icon: null,
        };
      case 'low':
        return {
          text: 'Safe Zone',
          colorClass: 'bg-[#e8ffdb] text-[#338904]',
          heading: 'Safe',
          icon: Incidentspng,
        };
      case 'high':
        return {
          text: 'Notified Manager',
          colorClass: 'bg-red-100 text-red-600',
          heading: 'High Alert',
          icon: AlertTriangle,
        };
      default:
        return {
          text: 'Safe Zone', // Fallback to Safe Zone for unknown or no alert
          colorClass: 'bg-[#e8ffdb] text-[#338904]',
          heading: 'Safe',
          icon: Incidentspng,
        };
    }
  };
  const currentAlertStatus = getCurrentAlertStatus();
  useEffect(() => {
    if (currentAlert) {
      setResolved(currentAlert.resolved);
    }
  }, [currentAlert]);

  return (
    <div className="flex flex-col col-span-12 md:col-span-6 bg-[#fafafa] py-3 md:py-5 rounded-[10px] w-full shadow-none border-none h-full relative">
      <div className="absolute top-2 md:top-3 left-2 md:left-3 flex flex-col space-y-0.5 md:space-y-1 p-0.5 md:p-1 min-h-[20px] md:min-h-[24px]">
        {loading ? (
          <Skeleton width={70} height={20} />
        ) : (
          <span className="text-[#7A7A7A] font-medium text-[11px] md:text-xs 2xl:text-sm">
            {currentAlert
              ? currentAlert.severity === 'low'
                ? 'Low Alert'
                : currentAlert.severity === 'high'
                  ? 'High Alert'
                  : 'Moderate Alert'
              : 'No Current Alerts'}
          </span>
        )}
      </div>
      <div className="absolute top-2 md:top-3 right-2 md:right-3 flex flex-col space-y-0.5 md:space-y-1 p-0.5 md:p-1 min-h-[20px] md:min-h-[24px]">
        {loading ? (
          <Skeleton width={70} height={20} />
        ) : currentAlert ? (
          <span className="text-[#595959] font-normal text-[9px] md:text-[10px] 2xl:text-xs">
            Last Alert : {currentAlert.timeAgo}
          </span>
        ) : (
          <span className="opacity-0 text-[9px] md:text-[10px] 2xl:text-xs">
            placeholder
          </span>
        )}
      </div>
      <div className="p-2 md:p-3 pl-0 h-[200px] md:h-[260px] flex xl:justify-center justify-start flex-col items-center relative">
        <div className="absolute flex justify-center items-center w-full h-full max-h-[200px] md:max-h-[260px] 2xl:max-h-[320px]">
          {loading ? (
            <div className="flex items-center justify-center w-full h-full">
              <Skeleton circle={true} height={150} width={150} />
            </div>
          ) : currentAlert ? (
            <img
              src={
                {
                  moderate: carouselImages[0],
                  low: carouselImages[1],
                  high: carouselImages[2],
                }[currentAlert?.severity?.toLowerCase()] || Safealert
              }
              alt="Alert"
              className="h-auto w-full max-w-[280px] md:max-w-[200px] xl:max-w-[250px] 2xl:max-w-[420px] object-contain"
            />
          ) : (
            <img
              src={Safealert}
              alt="Safe"
              className="h-auto w-full max-w-[180px] sm:max-w-[200px] xl:max-w-[250px] 2xl:max-w-[420px] object-contain"
            />
          )}
        </div>
        {!loading &&
          recentAlerts.length > 0 && ( // Only show navigation if more than one alert exists
            <>
              <button
                onClick={goToPreviousImage}
                className="absolute left-1 md:left-3 top-2/2 translate-y-[60%] md:translate-y-[80%] 2xl:translate-y-[55%]
                flex items-center justify-center
                bg-transparent text-[#5D5D5D]
                cursor-pointer z-1 focus:outline-none"
              >
                {!(skip === 0 && currentImageIndex === 0) && (
                  <ChevronLeft className="2xl:w-6 2xl:h-6 w-5 h-5" />
                )}
              </button>
              <button
                onClick={goToNextImage}
                className="absolute right-3 top-2/2 2xl:translate-y-[55%] xl:translate-y-[80%]
                flex items-center justify-center
                bg-transparent text-[#5D5D5D] rounded-md
                cursor-pointer z-1 focus:outline-none"
              >
                {currentImageIndex < recentAlerts.length - 1 ||
                skip + limit < totalAlerts ? (
                  <ChevronRight className="2xl:w-6 2xl:h-6 w-5 h-5" />
                ) : null}
              </button>
            </>
          )}
      </div>
      {loading ? (
        <div className="w-full bg-[#FAFAFA] rounded-xl px-6 py-4 text-center relative 2xl:min-h-[140px] xl:min-h-[120px]">
          <Skeleton height={24} width="60%" className="mx-auto" />
          <div className="mt-3">
            <Skeleton height={28} width="40%" className="mx-auto" />
          </div>
        </div>
      ) : (
        <div className="w-full bg-[#FAFAFA] rounded-lg md:rounded-xl px-3 md:px-6 py-3 md:py-4 text-center relative min-h-[100px] md:min-h-[120px] 2xl:min-h-[140px]">
          <div className="flex items-center justify-center gap-1.5 md:gap-2 min-h-[24px] md:min-h-[28px] 2xl:min-h-[32px]">
            {currentAlertStatus.icon && (
              <div className="flex-shrink-0 flex items-center justify-center 2xl:h-[32px] xl:h-[28px] 2xl:w-[32px] xl:w-[28px]">
                {currentAlertStatus.icon === Incidentspng ? (
                  <img
                    src={Incidentspng}
                    alt=""
                    className="2xl:h-6 select-none 2xl:w-6 xl:h-5 xl:w-5 text-green-500"
                  />
                ) : (
                  <currentAlertStatus.icon className="text-[#CE241C] select-none 2xl:w-6 2xl:h-6 xl:w-4 xl:h-4" />
                )}
              </div>
            )}
            <h2 className="text-xs select-none md:text-sm 2xl:text-2xl font-[500] text-gray-900">
              {currentAlertStatus.heading}
            </h2>
          </div>

          <div className="mt-3 ">
            <span
              className={`inline-block select-none text-[9px] md:text-[10px] 2xl:text-sm font-medium px-2 sm:px-3 2xl:px-4 py-0.5 sm:py-1 2xl:py-1.5 rounded-[8px] ${currentAlertStatus.colorClass}`}
            >
              {currentAlertStatus.text}
            </span>
          </div>
          <div className="border-t mt-4 border-[#e4e4e4]" />
        </div>
      )}{' '}
      {/* Conditional rendering for the footer content */}
      <div className="mt-2 md:mt-2.5 min-h-[100px] md:min-h-[120px] 2xl:min-h-[140px] px-3 md:px-6">
        {!loading && !currentAlert ? (
          <div className="2xl:text-[14px] xl:text-[10px] text-[9px] text-center text-[#333333] font-medium">
            Surveillance running smoothly with no suspicious behavior detected.
          </div>
        ) : !loading && currentAlert ? (
          <div className="font-size-[14px]">
            <div className="flex justify-between">
              <div className="flex flex-col 2xl:min-w-[120px] xl:min-w-[100px]">
                <strong className="2xl:text-[14px] xl:text-[10px] text-[9px] font-[400] text-[#7a7a7a]">
                  {loading ? <Skeleton width={50} /> : 'Area:'}
                </strong>
                <span className="2xl:text-[14px] xl:text-[10px] text-[9px] font-[500] text-[#333333]">
                  {loading ? (
                    <Skeleton width={100} />
                  ) : (
                    currentAlert?.zone || ''
                  )}
                </span>
              </div>
              <div className="flex flex-col 2xl:min-w-[120px] xl:min-w-[100px]">
                <strong className="2xl:text-[14px] xl:text-[10px] text-[9px] font-[400] text-[#7a7a7a]">
                  {loading ? <Skeleton width={60} /> : 'Camera:'}
                </strong>
                <span className="2xl:text-[14px] xl:text-[10px] text-[9px] font-[500] text-[#333333]">
                  {loading ? (
                    <Skeleton width={100} />
                  ) : (
                    currentAlert?.channelId?.name || ''
                  )}
                </span>
              </div>
            </div>

            <div className="mt-[5px] 2xl:min-h-[48px] min-h-[40px]">
              <strong className="2xl:text-[14px] xl:text-[10px] text-[9px] font-[400] text-[#7a7a7a]">
                {loading ? <Skeleton width={120} /> : 'Reason Detected:'}
              </strong>
              <div className="2xl:text-[14px] xl:text-[10px] text-[9px] font-[400] text-[#333333]">
                {loading ? (
                  <Skeleton count={2} />
                ) : currentAlert?.description ? (
                  formatFromToTimestamps(currentAlert.description)
                ) : (
                  'N/A'
                )}
              </div>
            </div>

            <div className="bg-[#e5f6ff] mb-5 mt-4 w-fit px-[12px] 2xl:px-[18px] h-[22px] 2xl:h-[35px] rounded-[5px] flex items-center">
              {loading ? (
                <Skeleton width={150} className="2xl:h-[24px] xl:h-[20px]" />
              ) : (
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="2xl:w-4 2xl:h-4 xl:w-2.5 xl:h-2.5 cursor-pointer accent-[#E5F6FF]"
                    checked={resolved}
                    onChange={() =>
                      handleMarkResolved(
                        currentAlert._id,
                        currentAlert.incidentType
                      )
                    }
                  />
                  <span className="2xl:text-[14px] cursor-pointer xl:text-[10px] text-[9px] font-[400] text-[#7a7a7a]">
                    Mark as resolved
                  </span>
                </label>
              )}
            </div>
          </div>
        ) : (
          <Skeleton count={4} />
        )}
      </div>
      {!loading && (
        <div className="absolute bottom-2 sm:bottom-3 left-0 right-0 flex justify-center">
          {recentAlerts.length > 0 ? (
            recentAlerts.map((_, index) => (
              <button
                key={index}
                className={`h-1.5 sm:h-2 w-1.5 sm:w-2 mx-[1.5px] sm:mx-[2px] rounded-full ${
                  index === currentImageIndex
                    ? 'px-[4px] sm:px-[5px] bg-[#07486a]'
                    : 'bg-[#D9D9D9]'
                }`}
                onClick={() => goToImage(index)}
                aria-label={`Go to slide ${index + 1}`}
              ></button>
            ))
          ) : (
            <button
              className="h-2 w-2 mx-[2px] rounded px-[5px] bg-[#07486A]"
              aria-label="No Alerts"
            ></button>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertGauge;
