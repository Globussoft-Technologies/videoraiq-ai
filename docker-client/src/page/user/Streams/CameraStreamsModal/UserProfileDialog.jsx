import React, { useState } from 'react';
import {
  X,
  Building,
  Clock,
  User as UserIcon,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import moment from 'moment';

// --- Sub-components (Best Practices: Extraction for Modularity) ---

const StatusBadge = ({ isKnown }) => (
  <span
    className={`text-[9px] px-2 py-0.5 rounded-[4px] font-bold border tracking-wide uppercase ${
      isKnown
        ? 'bg-[#143314] text-[#32CD32] border-[#32CD32]/10'
        : 'bg-red-500/10 text-red-500 border-red-500/10'
    }`}
  >
    {isKnown ? 'AUTHORIZED' : 'UNAUTHORIZED'}
  </span>
);

const InfoCard = ({
  icon: Icon,
  label,
  value,
  iconBg,
  iconColor,
  isDenied = false,
}) => (
  <div className="bg-[#414141] rounded-md p-2.5 flex gap-3 shadow-sm hover:bg-[#252525] transition-colors group">
    <div
      className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform ${iconBg}`}
    >
      <Icon className={`w-4 h-4 ${iconColor}`} />
    </div>
    <div className="flex flex-col justify-center min-w-0">
      <p className="text-[#B5B5B5] text-[8px] font-extrabold uppercase tracking-widest leading-none mb-1">
        {label}
      </p>
      <p
        className={`text-[14px] font-bold leading-none truncate ${isDenied ? 'text-red-400' : 'text-white'}`}
      >
        {value}
      </p>
    </div>
  </div>
);

const AvatarCarousel = ({
  isKnown,
  avatars,
  currentIndex,
  onNext,
  onPrev,
  getAvatarSrc,
}) => (
  <div className="relative shrink-0 group">
    <div
      className={`w-[210px] h-[210px] rounded-[10px] overflow-hidden border-[2px] shadow-2xl transition-colors duration-500 ${
        isKnown ? 'border-[#32CD32]' : 'border-red-500'
      }`}
    >
      <img
        src={
          avatars.length > 0
            ? getAvatarSrc(avatars[currentIndex])
            : getAvatarSrc(null)
        }
        alt="Profile"
        className="w-full h-full object-cover select-none"
      />
    </div>

    {/* Carousel Arrows (Hover visible) */}
    {avatars.length > 1 && (
      <>
        <button
          onClick={onPrev}
          className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
          aria-label="Previous image"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
          aria-label="Next image"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-md text-[7px] text-white/70 font-mono">
          {currentIndex + 1} / {avatars.length}
        </div>
      </>
    )}
  </div>
);

// --- Main Component ---

const UserProfileDialog = ({
  isOpen,
  onClose,
  userData,
  isAccessLog = false,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!isOpen || !userData) return null;

  const image_url = `${import.meta.env.VITE_BACKEND}/api/v1/uploads/`;
  const USER_AVTAR_INITIALS = import.meta.env.VITE_INITIALS_URL;
  const isKnown = userData.variant === 'known';

  const avatarsList =
    userData.avatars || (userData.avatar ? [userData.avatar] : []);

  const getAvatarSrc = (avatar) => {
    return avatar
      ? `${image_url}${avatar}`
      : `${USER_AVTAR_INITIALS}?name=${encodeURIComponent(
          isKnown
            ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
            : 'Unauthorized Access'
        )}`;
  };

  const nextImage = () =>
    setCurrentImageIndex((p) => (p + 1) % avatarsList.length);
  const prevImage = () =>
    setCurrentImageIndex(
      (p) => (p - 1 + avatarsList.length) % avatarsList.length
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60  p-4">
      {/* Outer Premium Border (Thick Gradient) */}
      <div className="relative w-full max-w-xl rounded-[28px] p-[1px] bg-gradient-to-br from-[#A0A0A0] via-[#505050] to-[#202020] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Inner Glossy Effect Layer */}
        <div className="rounded-[27px] p-[8px] bg-gradient-to-b from-white/10 to-transparent">
          {/* Main Dark Body */}
          <div className="relative bg-[#1a1a1a]/95 backdrop-blur-xl rounded-[20px] overflow-hidden p-6 pb-7">
            <button
              onClick={onClose}
              className="absolute cursor-pointer top-3 right-3 text-[#888] hover:text-white transition-all hover:scale-110 z-20 p-1 rounded-full border border-white/5 bg-white/5"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-row gap-8 items-start">
              <AvatarCarousel
                isKnown={isKnown}
                avatars={avatarsList}
                currentIndex={currentImageIndex}
                onNext={nextImage}
                onPrev={prevImage}
                getAvatarSrc={getAvatarSrc}
              />

              <div className="flex flex-col flex-1 min-w-0 pt-0.5 pr-8">
                {/* Name & Glowing Dot */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-bold text-white tracking-tight leading-none truncate">
                    {userData.name || 'Unknown User'}
                  </h2>
                  <div
                    className={`w-[12px] h-[12px] rounded-full shrink-0  border border-white/10 ${
                      isKnown ? 'bg-[#32CD32]' : 'bg-red-500'
                    }`}
                  ></div>
                </div>

                {/* Role & Auth Status */}
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[#888] text-[12px] font-medium truncate">
                    {userData.role || 'No Department'}
                  </span>
                  <div className="h-0.5 w-0.5 rounded-full bg-[#444]"></div>
                  <StatusBadge isKnown={isKnown} />
                </div>

                <div className="space-y-2.5">
                  {/* Department Field */}
                  {((isKnown && userData.role) || !isAccessLog) && (
                    <InfoCard
                      icon={Building}
                      label="Department"
                      value={userData.role || 'No Department'}
                      iconBg="bg-[#2B3A55]"
                      iconColor="text-blue-400"
                    />
                  )}

                  {/* Activity/Time Field */}
                  <InfoCard
                    icon={Clock}
                    label={isAccessLog ? 'Access Time' : 'Last Activity'}
                    value={
                      isAccessLog
                        ? userData.time || 'N/A'
                        : userData.time
                          ? moment(userData.time).format('YYYY-MM-DD HH:mm')
                          : 'N/A'
                    }
                    iconBg="bg-[#1A3C2A]"
                    iconColor="text-green-400"
                  />

                  {/* ID/Status Field */}
                  {isKnown && !isAccessLog && userData.employeeId ? (
                    <InfoCard
                      icon={UserIcon}
                      label="Employee ID"
                      value={userData.employeeId}
                      iconBg="bg-[#3B1E4A]"
                      iconColor="text-purple-400"
                    />
                  ) : isAccessLog ? (
                    <InfoCard
                      icon={isKnown ? Shield : X}
                      label="Access Status"
                      value={isKnown ? 'Granted' : 'Denied'}
                      iconBg={isKnown ? 'bg-blue-500/20' : 'bg-red-500/20'}
                      iconColor={isKnown ? 'text-blue-400' : 'text-red-400'}
                      isDenied={!isKnown}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileDialog;
