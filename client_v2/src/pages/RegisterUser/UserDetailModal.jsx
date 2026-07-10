import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  User,
  Briefcase,
  MapPin,
  Home,
  UserCircle,
} from 'lucide-react';

const getInitialsPlaceholder = (firstName, lastName, size = 200) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  const colors = ['#3b82f6', '#22d3ee', '#a855f7'];
  const index = initials.charCodeAt(0) % colors.length;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="${colors[index]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.36}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const DetailItem = ({ icon: Icon, label, value }) => (
  <div className="flex flex-col gap-1 p-3 rounded-xl bg-[var(--bg2)] border border-[var(--bd)] transition-all">
    <div className="flex items-center gap-2 text-[var(--tx3)]">
      <Icon className="w-4 h-4" />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-sm font-semibold text-[var(--tx)] break-words line-clamp-2" title={value || 'N/A'}>
      {value || 'N/A'}
    </span>
  </div>
);

const UserDetailModal = ({ user, isOpen, onClose, nasUrl }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const profilePics = user?.profilePics || [];
  const hasImages = profilePics.length > 0;

  const next = () => profilePics.length > 1 && setCurrentImageIndex((p) => (p + 1) % profilePics.length);
  const prev = () =>
    profilePics.length > 1 &&
    setCurrentImageIndex((p) => (p - 1 + profilePics.length) % profilePics.length);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[95vw] md:max-w-4xl p-0 overflow-hidden bg-[var(--bg1solid)] border border-[var(--bd)] rounded-3xl shadow-2xl top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%]"
        closeBtn="text-[var(--tx2)] hover:text-[var(--tx)] top-4 right-4"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            User Details - {user?.firstName} {user?.lastName}
          </DialogTitle>
        </DialogHeader>

        {user ? (
          <div className="flex flex-col md:flex-row max-h-[85vh] overflow-y-auto md:overflow-hidden md:h-full">
            {/* Left: image carousel */}
            <div className="w-full md:w-1/2 bg-[var(--bg2)] flex flex-col items-center justify-center p-4 sm:p-6 relative group/images">
              <div className="relative w-full aspect-[4/3] sm:aspect-square max-h-[32vh] sm:max-h-none max-w-[260px] sm:max-w-sm rounded-2xl overflow-hidden shadow-xl bg-[var(--bg3)]">
                <img
                  src={
                    hasImages
                      ? `${nasUrl}/api/v1/uploads/${profilePics[currentImageIndex]}`
                      : getInitialsPlaceholder(user.firstName, user.lastName)
                  }
                  alt={`${user.firstName} ${user.lastName}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = getInitialsPlaceholder(user.firstName, user.lastName);
                  }}
                />
                {profilePics.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prev}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg1solid)]/90 text-[var(--tx)] shadow-lg hover:scale-110 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-[var(--bg1solid)]/90 text-[var(--tx)] shadow-lg hover:scale-110 transition-all cursor-pointer"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {profilePics.map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 rounded-full transition-all ${
                            idx === currentImageIndex ? 'w-6 bg-[var(--blue)]' : 'w-1.5 bg-[var(--bd2)]'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 sm:mt-6 text-center">
                <h2 className="text-lg sm:text-2xl font-bold text-[var(--tx)] break-words">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--tx3)] font-medium">@{user.userName || 'username'}</p>
                <div className="mt-2 sm:mt-3 inline-flex items-center px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold bg-[var(--blue)]/15 text-[var(--blue)]">
                  ID: {user.emp_id || 'N/A'}
                </div>
              </div>
            </div>

            {/* Right: details */}
            <div className="w-full md:w-1/2 p-4 sm:p-6 md:p-8 md:overflow-y-auto vq-scroll">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-[var(--tx)] flex items-center gap-2">
                  <UserCircle className="w-5 h-5 text-[var(--blue)]" />
                  User Profiles &amp; Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                <DetailItem icon={User} label="First Name" value={user.firstName} />
                <DetailItem icon={User} label="Last Name" value={user.lastName} />
                <DetailItem icon={Mail} label="Email" value={user.email} />
                <DetailItem icon={Briefcase} label="Designation" value={user.designation} />
                <DetailItem icon={MapPin} label="Location" value={user.location} />
                <DetailItem
                  icon={Briefcase}
                  label="Department"
                  value={user.departmentId?.departmentName}
                />
                <DetailItem icon={User} label="User Name" value={user.userName} />
                <DetailItem icon={Home} label="Address" value={user.address1} />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-12 h-12 border-4 border-[var(--bg3)] border-t-[var(--blue)] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[var(--tx3)]">Loading details...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export { UserDetailModal };
export default UserDetailModal;
