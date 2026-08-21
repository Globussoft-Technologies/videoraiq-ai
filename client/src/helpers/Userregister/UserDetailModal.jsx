import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { displayEmail } from '@/utils/displayEmail';
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  User,
  Briefcase,
  MapPin,
  Phone,
  Tag,
  Home,
  X,
  UserCircle,
} from 'lucide-react';

const UserDetailModalContent = ({ user, nasUrl, onClose }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const profilePics = user?.profilePics || [];
  const hasImages = profilePics.length > 0;

  const handleNextImage = () => {
    if (profilePics.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % profilePics.length);
    }
  };

  const handlePrevImage = () => {
    if (profilePics.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + profilePics.length) % profilePics.length);
    }
  };

  const getInitialsPlaceholder = (firstName, lastName) => {
    const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
    const colors = ['#07486A', '#CFEFFF', '#E3F5FF'];
    const textColors = ['#FFFFFF', '#07486A', '#07486A'];
    const index = initials.charCodeAt(0) % colors.length;
    const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200" fill="${colors[index]}"/><text x="50%" y="50%" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="${textColors[index]}" text-anchor="middle" dominant-baseline="central">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const DetailItem = ({ icon: Icon, label, value }) => (
    <div className="flex flex-col gap-1 p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-[#CFEFFF] hover:bg-[#F8FDFF] transition-all group">
      <div className="flex items-center gap-2 text-[#07486A]/60">
        <Icon className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-sm font-semibold text-gray-900 break-words line-clamp-2" title={value || 'N/A'}>
        {value || 'N/A'}
      </span>
    </div>
  );

  return (
    <DialogContent className="max-w-[95vw] md:max-w-4xl p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%]">
      <DialogHeader className="sr-only">
        <DialogTitle>User Details - {user?.firstName} {user?.lastName}</DialogTitle>
      </DialogHeader>
      
      {user ? (
        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
          {/* Left: Image Carousel */}
          <div className="w-full md:w-1/2 bg-[#07486A]/5 flex flex-col items-center justify-center p-6 relative group/images">
            <div className="relative w-full aspect-square max-w-sm rounded-2xl overflow-hidden shadow-xl bg-white ring-8 ring-white/50 transition-all duration-500 hover:ring-white">
              <img
                src={
                  hasImages
                    ? `${nasUrl}/api/v1/uploads/${profilePics[currentImageIndex]}`
                    : getInitialsPlaceholder(user.firstName, user.lastName)
                }
                alt={`${user.firstName} ${user.lastName}`}
                className="w-full h-full object-cover object-top transition-transform duration-700 hover:scale-110"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = getInitialsPlaceholder(user.firstName, user.lastName);
                }}
              />
              
              {profilePics.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 text-[#07486A] shadow-lg hover:bg-white hover:scale-110 transition-all cursor-pointer opacity-0 group-hover/images:opacity-100 z-10"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 text-[#07486A] shadow-lg hover:bg-white hover:scale-110 transition-all cursor-pointer opacity-0 group-hover/images:opacity-100 z-10"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {profilePics.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          idx === currentImageIndex ? 'w-6 bg-[#07486A]' : 'w-1.5 bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
            
            <div className="mt-6 text-center">
              <h2 className="text-2xl font-bold text-[#07486A]">
                {user.firstName} {user.lastName}
              </h2>
              <p className="text-sm text-[#07486A]/60 font-medium">@{user.userName || 'username'}</p>
              <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-[#CFEFFF] text-[#07486A] shadow-sm">
                ID: {user.emp_id || 'N/A'}
              </div>
            </div>
          </div>

          {/* Right: Details */}
          <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserCircle className="w-5 h-5 text-[#07486A]" />
                User Profiles & Details
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors md:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailItem icon={User} label="First Name" value={user.firstName} />
              <DetailItem icon={User} label="Last Name" value={user.lastName} />
              <DetailItem icon={Mail} label="Email" value={displayEmail(user.email)} />
              <DetailItem icon={Briefcase} label="Designation" value={user.designation} />
              <DetailItem icon={MapPin} label="Location" value={user.location} />
              <DetailItem icon={Briefcase} label="Department" value={user.departmentId?.departmentName} />
              <DetailItem icon={User} label="User Name" value={user.userName} />
              <DetailItem icon={Phone} label="Phone Number" value={user.phoneNumber} />
              <DetailItem icon={Tag} label="Vehicle Number" value={user.vehicleNumber} />
              <DetailItem icon={Home} label="Address" value={user.address1} />
            </div>

            {/* <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#07486A] text-white font-bold hover:bg-[#063a55] transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Done
              </button>
            </div> */}
          </div>
        </div>
      ) : (
        <div className="p-12 text-center">
           <div className="w-12 h-12 border-4 border-[#CFEFFF] border-t-[#07486A] rounded-full animate-spin mx-auto mb-4"></div>
           <p className="text-gray-500">Loading details...</p>
        </div>
      )}
    </DialogContent>
  );
};

const UserDetailModal = ({ user, isOpen, onClose, nasUrl }) => {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <UserDetailModalContent user={user} nasUrl={nasUrl} onClose={onClose} />
    </Dialog>
  );
};

export { UserDetailModal, UserDetailModalContent };
export default UserDetailModal;
