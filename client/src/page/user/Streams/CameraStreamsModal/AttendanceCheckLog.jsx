import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Clock,
  Timer,
  User,
  X as XIcon,
  ChevronDown,
} from 'lucide-react';
import { IoIosCheckmarkCircle } from 'react-icons/io';
import { BiSolidXCircle } from 'react-icons/bi';
import moment from 'moment';
const AttendanceEntry = ({
  avatar,
  name,
  firstName,
  lastName,
  role,
  time,
  variant = 'known',
  onClick,
  action,
}) => {
  const known = variant === 'known';
  const image_url = `${import.meta.env.VITE_BACKEND}/api/v1/uploads/`;
  const USER_AVTAR_INITIALS = import.meta.env.VITE_INITIALS_URL;
  return (
    <div
      className="flex items-center gap-3 bg-[#3A3A3A]/80 backdrop-blur-sm rounded-xl p-3 border border-white/5 cursor-pointer hover:bg-[#3A3A3A]/90 hover:border-white/10 transition-all duration-200"
      onClick={onClick}
    >
      {avatar ? (
        <img
          src={`${image_url}${avatar}`}
          alt="avatar"
          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-[#4A4A4A] flex items-center justify-center flex-shrink-0">
          <img
            src={
              action != null
                ? `${image_url}${action}`
                : `${USER_AVTAR_INITIALS}=${encodeURIComponent(
                    `${variant === 'known' ? firstName || '' : 'Unauthorized'} ${variant === 'known' ? lastName || '' : 'Access'}`
                  )}`
            }
            alt="avatar"
            className="w-12 h-12 rounded-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white text-[15px] font-medium truncate">{name}</p>
          {known ? (
            <div className="w-2.5 h-2.5 rounded-full bg-[#00FF00] flex-shrink-0"></div>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF0000] flex-shrink-0"></div>
          )}
        </div>
        <p className="text-[#B0B0B0] text-xs mb-1">{role}</p>
        <div className="flex items-center gap-1.5 text-xs text-[#888888]">
          <Timer className="w-3.5 h-3.5" />
          <span>{moment(time).format('YYYY-MM-DD HH:mm:ss')}</span>
        </div>
      </div>
    </div>
  );
};

const AttendanceCheckLog = ({
  accessDetectionsForCamera,
  attendanceForCamera,
  onProfileClick,
}) => {
  const [attendanceOpen, setAttendanceOpen] = useState(true);
  const [accessOpen, setAccessOpen] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger fade in animation on mount
    setIsVisible(true);
  }, []);

  const handleProfileClick = (userData, isAccess = false) => {
    if (onProfileClick) {
      onProfileClick(userData, isAccess);
    }
  };
  // Process attendance items
  let attendanceItems = [];
  if (Array.isArray(attendanceForCamera) && attendanceForCamera.length > 0) {
    attendanceItems = attendanceForCamera
      .map((attendance) => ({
        name: attendance?.attendance?.employee
          ? `${attendance.attendance.employee.firstName || ''} ${attendance.attendance.employee.lastName || ''}`
          : 'Unauthorized person',
        role:
          attendance?.attendance?.employee?.departmentId?.departmentName || '',
        variant: attendance?.attendance?.employee ? 'known' : 'unknown',
        firstName: attendance?.attendance?.employee?.firstName,
        lastName: attendance?.attendance?.employee?.lastName,
        time: attendance?.attendance?.event?.timestamp || '',
        avatar:
          Array.isArray(attendance?.attendance?.employee?.profilePics) &&
          attendance?.attendance?.employee?.profilePics.length > 0
            ? attendance?.attendance?.employee?.profilePics[0]
            : '',
        employeeId: attendance?.attendance?.employee?.employeeId,
        joinDate: attendance?.attendance?.employee?.joinDate,
        onClick: () =>
          handleProfileClick(
            {
              name: attendance?.attendance?.employee
                ? `${attendance.attendance.employee.firstName || ''} ${attendance.attendance.employee.lastName || ''}`
                : 'Unauthorized person',
              role:
                attendance?.attendance?.employee?.departmentId
                  ?.departmentName || '',
              variant: attendance?.attendance?.employee ? 'known' : 'unknown',
              firstName: attendance?.attendance?.employee?.firstName,
              lastName: attendance?.attendance?.employee?.lastName,
              time: attendance?.attendance?.event?.timestamp,
              avatar:
                Array.isArray(attendance?.attendance?.employee?.profilePics) &&
                attendance?.attendance?.employee?.profilePics.length > 0
                  ? attendance?.attendance?.employee?.profilePics[0]
                  : '',
              employeeId: attendance?.attendance?.employee?.employeeId,
              joinDate: attendance?.attendance?.employee?.joinDate,
            },
            false
          ),
      }))
      .slice(0, 5);
  }

  // Process access items
  let accessItems = [];
  if (
    Array.isArray(accessDetectionsForCamera) &&
    accessDetectionsForCamera.length > 0
  ) {
    accessItems = accessDetectionsForCamera
      .map((item) => {
        const action = item.images
          ? item?.images?.face || item?.images?.person || item?.images?.frame
          : null;
        return {
          avatar: action || '',
          name: item.personName || '',
          role: item.department || '',
          time: moment(item.timestamp).format('YYYY-MM-DD HH:mm:ss') || '',
          variant:
            item.personName === 'Unauthorized person' ? 'unknown' : 'known',
          firstName: item.firstName || '',
          lastName: item.lastName || '',
          action: action,
          onClick: () =>
            handleProfileClick(
              {
                avatar: action || '',
                name: item.personName || '',
                role: item.department || '',
                time: moment(item.timestamp).format('YYYY-MM-DD HH:mm:ss') || '',
                variant:
                  item.personName === 'Unauthorized person' ? 'unknown' : 'known',
                firstName: item.firstName || '',
                lastName: item.lastName || '',
                action: action,
              },
              true
            ),
        };
      })
      .slice(0, 5);
  }

  // Don't render if no data
  if (attendanceItems.length === 0 && accessItems.length === 0) {
    return null;
  }

  return (
    <div
      className={`absolute left-6 top-24 z-30 transition-all duration-500 ease-in-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      {/* Big Glassmorphism Container */}
      <div className="w-[300px] rounded-3xl bg-[#86868633] backdrop-blur-2xl border border-white/20 shadow-2xl p-5">
        <div className="space-y-5">
          {/* Attendance Log Section */}
          {attendanceItems.length > 0 && (
            <div className="bg-transparent backdrop-blur-xl overflow-hidden rounded-2xl">
              <button
                onClick={() => setAttendanceOpen(!attendanceOpen)}
                className="flex items-center justify-between w-full text-white text-[15px] font-semibold px-4 py-3.5 cursor-pointer transition-colors bg-[#2D2C2C] rounded-[11.65px]"
              >
                <span className="select-none">Attendance Log</span>
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${attendanceOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {attendanceOpen && (
                <div className="space-y-3 max-h-[200px] bg-transparent overflow-y-auto px-3 pt-3 pb-3 hide-scrollbar animate-fadeIn">
                  {attendanceItems.map((it, idx) => (
                    <AttendanceEntry key={`attendance-${idx}`} {...it} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Access Log Section */}
          {accessItems.length > 0 && (
            <div className="bg-transparent backdrop-blur-xl overflow-hidden rounded-2xl">
              <button
                onClick={() => setAccessOpen(!accessOpen)}
                className="flex items-center justify-between w-full text-white text-[15px] font-semibold px-4 py-3.5  cursor-pointer transition-colors bg-[#2D2C2C] rounded-[11.65px]"
              >
                <span className="select-none">Access Log</span>
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${accessOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {accessOpen && (
                <div className="space-y-3 max-h-[200px] overflow-y-auto px-3 pt-3 pb-3 hide-scrollbar animate-fadeIn">
                  {accessItems.map((it, idx) => (
                    <AttendanceEntry key={`access-${idx}`} {...it} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceCheckLog;
