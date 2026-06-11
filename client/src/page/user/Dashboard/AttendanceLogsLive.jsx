import React, { useEffect, useRef, useState } from 'react';
import moment from 'moment';
import { LogIn, LogOut, Clock, X, Mail, Building2, MapPin, Loader2, ImageOff } from 'lucide-react';
import { useAllDetections } from '@/context/Sockets/AllDetectionContext';

const IMAGE_URL = `${import.meta.env.VITE_BACKEND}/api/v1/uploads/`;
const USER_AVTAR_INITIALS = import.meta.env.VITE_INITIALS_URL;

const DEPARTMENT_PALETTE = [
  { bg: 'bg-[#EAF4FF]', border: 'border-[#BFDDF7]', badge: 'bg-[#1E6FBA] text-white' },
  { bg: 'bg-[#FFF3E6]', border: 'border-[#FFD6A8]', badge: 'bg-[#D17C13] text-white' },
  { bg: 'bg-[#EAF9EE]', border: 'border-[#BDE9CA]', badge: 'bg-[#2E8B47] text-white' },
  { bg: 'bg-[#FDE9EE]', border: 'border-[#F8C0CC]', badge: 'bg-[#C73958] text-white' },
  { bg: 'bg-[#F1ECFB]', border: 'border-[#D6C7F2]', badge: 'bg-[#6D43C9] text-white' },
  { bg: 'bg-[#FFF8DB]', border: 'border-[#F1E199]', badge: 'bg-[#A6841A] text-white' },
  { bg: 'bg-[#E6F7F8]', border: 'border-[#B9E3E6]', badge: 'bg-[#1B7F86] text-white' },
  { bg: 'bg-[#F5EBFF]', border: 'border-[#DDC2F2]', badge: 'bg-[#7E2BC9] text-white' },
];

const NEUTRAL_COLORS = {
  bg: 'bg-white',
  border: 'border-[#EEEEEE]',
  badge: 'bg-[#EEEEEE] text-[#595959]',
};

const makeDeptColorResolver = () => {
  const assigned = new Map();
  return (dept) => {
    const key = (dept || '').trim().toLowerCase();
    if (!key || key === '--') return NEUTRAL_COLORS;
    if (!assigned.has(key)) {
      assigned.set(key, DEPARTMENT_PALETTE[assigned.size % DEPARTMENT_PALETTE.length]);
    }
    return assigned.get(key);
  };
};

const resolveCapturedImage = (log) => {
  const candidates = [
    log?.attendance?.imageUrls?.[0]?.images?.person,
    log?.attendance?.imageUrls?.[0]?.images?.face,
    log?.attendance?.imageUrls?.[0]?.images?.frame,
    log?.attendance?.event?.images?.person,
    log?.attendance?.event?.images?.face,
    log?.attendance?.event?.images?.frame,
    log?.attendance?.event?.image,
    log?.imageUrls?.[0]?.images?.person,
    log?.imageUrls?.[0]?.images?.face,
    log?.imageUrls?.[0]?.images?.frame,
  ];
  const found = candidates.find((v) => typeof v === 'string' && v.length > 0);
  if (!found) return '';
  return /^https?:\/\//i.test(found) ? found : `${IMAGE_URL}${found}`;
};

const mapLog = (log) => {
  const employee = log?.attendance?.employee;
  const event = log?.attendance?.event;
  const firstName = employee?.firstName || '';
  const lastName = employee?.lastName || '';
  const name = employee
    ? `${firstName} ${lastName}`.trim() || 'Unknown'
    : 'Unauthorized person';
  const avatar =
    Array.isArray(employee?.profilePics) && employee.profilePics.length > 0
      ? `${IMAGE_URL}${employee.profilePics[0]}`
      : `${USER_AVTAR_INITIALS}=${encodeURIComponent(name)}`;
  const premise =
    log?.nvrData?.nvrName ||
    log?.attendance?.nvrData?.nvrName ||
    log?.attendance?.event?.nvrData?.nvrName ||
    employee?.locationId?.locationName ||
    employee?.locationId?.name ||
    'Golf Premise';
  return {
    id: `${employee?._id || 'unknown'}_${event?.cameraType || ''}_${event?.timestamp || ''}`,
    name,
    department: employee?.departmentId?.departmentName || '--',
    cameraType: event?.cameraType || '',
    timestamp: event?.timestamp,
    known: !!employee,
    avatar,
    premise,
    email: employee?.email || '',
    empId: employee?.employeeId || employee?.empId || '',
    designation: employee?.designation || employee?.role || '',
    capturedImage: resolveCapturedImage(log),
  };
};

const IS_DUBAI = import.meta.env.VITE_ORGANISATION_ID === 'dubai';

const buildMessage = (it) => {
  const action = it.cameraType === 'checkin' ? 'Entered' : 'Exited';
  const time = it.timestamp ? moment(it.timestamp).format('HH:mm:ss') : '';
  if (IS_DUBAI) {
    return `${it.name} ${action} golf premise${time ? ` at ${time}` : ''}`;
  }
  return `${it.name} ${action} premise${time ? ` at ${time}` : ''}`;
};

const speak = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;
    utter.lang = 'en-US';
    window.speechSynthesis.speak(utter);
  } catch (e) {
    // ignore
  }
};

const DetailModal = ({ item, dept, onClose }) => {
  const [capState, setCapState] = useState(item.capturedImage ? 'loading' : 'empty');
  const [profState, setProfState] = useState('loading');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setCapState(item.capturedImage ? 'loading' : 'empty');
  }, [item.capturedImage]);
  useEffect(() => {
    setProfState('loading');
  }, [item.avatar]);

  const isCheckIn = item.cameraType === 'checkin';
  const time = item.timestamp ? moment(item.timestamp).format('DD MMM YYYY, HH:mm:ss') : '--';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={`${dept.bg} border ${dept.border} shadow-2xl flex flex-col w-full sm:max-w-[860px] h-[92vh] sm:h-auto sm:max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-black/5 flex-shrink-0">
          <h4 className="text-sm sm:text-base font-semibold text-[#333333]">
            {IS_DUBAI ? 'Details' : 'Attendance Details'} 
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-[#595959]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 sm:gap-5">
            <div className="order-1 md:order-1 relative w-full bg-black/85 rounded-[10px] sm:rounded-[12px] overflow-hidden border border-black/10 flex items-center justify-center aspect-[4/5] sm:aspect-[3/4] md:aspect-auto md:h-full md:max-h-[70vh] md:min-h-[320px]">
              {item.capturedImage ? (
                <>
                  {capState === 'loading' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 bg-black/40">
                      <Loader2 className="w-7 h-7 animate-spin" />
                      <span className="text-[11px]">Loading image…</span>
                    </div>
                  )}
                  {capState === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                      <ImageOff className="w-7 h-7" />
                      <span className="text-[11px]">Image unavailable</span>
                    </div>
                  )}
                  <img
                    src={item.capturedImage}
                    alt={`${item.name} last captured`}
                    className={`w-full h-full object-contain transition-opacity duration-200 ${
                      capState === 'loaded' ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setCapState('loaded')}
                    onError={() => setCapState('error')}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-white/70">
                  <ImageOff className="w-7 h-7" />
                  <span className="text-[11px]">No captured image</span>
                </div>
              )}
            </div>

            <div className="order-2 md:order-2 flex flex-col gap-3 sm:gap-4 min-w-0">
              <div className="flex flex-col items-center gap-2 bg-white/50 rounded-[10px] p-3 border border-white/70">
                <div className="relative h-40 sm:h-48 aspect-[35/45] bg-white rounded-md shadow-md border border-black/10 p-1 flex items-center justify-center">
                  {profState === 'loading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-sm">
                      <Loader2 className="w-5 h-5 animate-spin text-[#595959]" />
                    </div>
                  )}
                  {profState === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#7a7a7a] bg-white rounded-sm">
                      <ImageOff className="w-5 h-5" />
                    </div>
                  )}
                  <img
                    src={item.avatar}
                    alt={item.name}
                    className={`w-full h-full object-cover rounded-sm transition-opacity duration-200 ${
                      profState === 'loaded' ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setProfState('loaded')}
                    onError={() => setProfState('error')}
                  />
                </div>
                <p
                  className="text-sm sm:text-[15px] font-semibold text-[#333333] text-center truncate max-w-full"
                  title={item.name}
                >
                  {item.name}
                </p>
                <span
                  className={`inline-block px-2 py-0.5 rounded-[5px] text-[10px] font-medium max-w-full truncate ${dept.badge}`}
                  title={item.department}
                >
                  {item.department}
                </span>
              </div>

              <ul className="flex flex-col gap-2 sm:gap-2.5 text-xs sm:text-[13px] text-[#333333]">
                <li className="flex items-start gap-2.5">
                  {isCheckIn ? (
                    <LogIn className="w-4 h-4 text-[#338904] mt-0.5 flex-shrink-0" />
                  ) : (
                    <LogOut className="w-4 h-4 text-[#EF8000] mt-0.5 flex-shrink-0" />
                  )}
                  {IS_DUBAI ? (
                    <span className="min-w-0 break-words">
                      {isCheckIn ? 'entered' : 'exited'} golf premise
                    </span>
                  ) : (
                  <span className="min-w-0 break-words">
                     {isCheckIn ? 'Entered' : 'Exited'} Premise 
                  </span>
                  )}
                  </li>

                <li className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#595959] mt-0.5 flex-shrink-0" />
                  <span className="min-w-0 break-words">{time}</span>
                </li>
                {IS_DUBAI ? (
                   <li className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#595959] mt-0.5 flex-shrink-0" />
                  <span className="min-w-0 break-words">{item.premise}</span>
                </li>
                ):null}
               
                {item.designation && (
                  <li className="flex items-start gap-2.5">
                    <Building2 className="w-4 h-4 text-[#595959] mt-0.5 flex-shrink-0" />
                    <span className="min-w-0 break-words">{item.designation}</span>
                  </li>
                )}
                {item.email && (
                  <li className="flex items-start gap-2.5">
                    <Mail className="w-4 h-4 text-[#595959] mt-0.5 flex-shrink-0" />
                    <span className="min-w-0 break-all">{item.email}</span>
                  </li>
                )}
                {item.empId && (
                  <li className="flex items-start gap-2.5 text-[#595959]">
                    <span className="font-medium flex-shrink-0">Employee ID:</span>
                    <span className="min-w-0 break-words">{item.empId}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AttendanceLogsLive = () => {
  const { attendanceLogs, isMuted } = useAllDetections();
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [isMuted]);

  const items = (Array.isArray(attendanceLogs) ? attendanceLogs : [])
    .map(mapLog)
    .slice(0, 12);

  const seenIdsRef = useRef(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (seenIdsRef.current === null) {
      // Skip announcing existing logs on first mount
      seenIdsRef.current = new Set(items.map((i) => i.id));
      return;
    }
    const seen = seenIdsRef.current;
    // Announce newest first
    const newOnes = items.filter((i) => !seen.has(i.id));
    newOnes.reverse().forEach((it) => {
      const dept =
        it.department && it.department !== '--' ? it.department : 'Employee';
      const action = it.cameraType === 'checkin' ? 'entered' : 'exit';
      if (!isMutedRef.current) {
        speak(`${dept} ${action}`);
      }
      seen.add(it.id);
    });
  }, [items]);

  return (
    <div className="bg-[#fafafa] rounded-[10px] p-4 w-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs 2xl:text-sm font-[550] text-[#333333]">
          {IS_DUBAI ? 'Live Notifications' : 'Live Attendance'}
        </h3>
        <span className="text-[10px] text-[#7a7a7a]">
          {items.length} recent
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center justify-center h-24 text-[#7a7a7a] text-xs">
          No attendance events yet
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-auto pr-[4px] pb-1 h-[500px]">
          {(() => {
            const resolveDept = makeDeptColorResolver();
            return items.map((it) => {
              const isCheckIn = it.cameraType === 'checkin';
              const dept = resolveDept(it.department);
              return (
                <div
                  key={it.id}
                  className={`${dept.bg} border ${dept.border} rounded-[10px] p-3 flex items-center gap-3 hover:shadow-sm transition-shadow flex-shrink-0`}
                >
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelected({ item: it, dept })}
                      className="block focus:outline-none focus:ring-2 focus:ring-[#1E6FBA] rounded-full"
                      title="View details"
                    >
                      <img
                        src={it.avatar}
                        alt={it.name}
                        className="w-14 h-14 rounded-full object-cover border border-[#E6E6E6] cursor-pointer hover:opacity-90"
                      />
                    </button>
                    <span
                      className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white pointer-events-none ${
                        isCheckIn ? 'bg-[#E8FFDB]' : 'bg-[#FFE4C5]'
                      }`}
                      title={isCheckIn ? 'Check In' : 'Check Out'}
                    >
                      {isCheckIn ? (
                        <LogIn className="w-2.5 h-2.5 text-[#338904]" />
                      ) : (
                        <LogOut className="w-2.5 h-2.5 text-[#EF8000]" />
                      )}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[#333333] text-xs font-medium truncate"
                      title={it.name}
                    >
                      {it.name}
                    </p>
                    <span
                      className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-[5px] text-[9px] font-medium max-w-full truncate ${dept.badge}`}
                      title={it.department}
                    >
                      {it.department}
                    </span>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-[#595959]">
                      <Clock className="w-3 h-3" />
                      <span className="truncate" title={buildMessage(it)}>
                        {buildMessage(it)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {selected && (
        <DetailModal
          item={selected.item}
          dept={selected.dept}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

export default AttendanceLogsLive;



