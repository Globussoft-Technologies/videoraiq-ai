import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { User, Building2, MapPin, LogIn, LogOut, Mail } from 'lucide-react';
import moment from 'moment-timezone';
import ImageWithLoader from './ImageWithLoader';
import { avatarColor, initials } from './avatarUtils';

/**
 * Employee profile dialog for the log pages — shows the profile picture plus
 * key details. Theme-aware (dark/light) via CSS vars (portals to <body>, which
 * carries data-vq-theme).
 */
const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3.5 py-3">
    <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--bg2)] border border-[var(--bd)] flex items-center justify-center">
      <Icon className="w-[18px] h-[18px] text-[var(--tx3)]" />
    </span>
    <span className="text-xs font-medium uppercase tracking-wide text-[var(--tx3)] w-28 shrink-0">
      {label}
    </span>
    <span className="text-[15px] text-[var(--tx)] font-medium truncate flex-1 min-w-0" title={value}>
      {value || '--'}
    </span>
  </div>
);

const LogEmployeeProfileDialog = ({ open = false, onOpenChange, onClose, profile = null, module }) => {
  const [region] = useState(() => moment.tz.guess());

  const convertToRegionTime = (utcTime) => {
    if (!utcTime) return '--';
    const m = moment(utcTime);
    if (!m.isValid()) return '--';
    return m.tz(region).format('hh:mm A');
  };

  const handleOpenChange = (isOpen) => {
    if (typeof onOpenChange === 'function') onOpenChange(isOpen);
    if (!isOpen && typeof onClose === 'function') onClose();
  };

  const name = profile?.name || 'Unknown';
  const dept = profile?.department && profile.department !== 'Unknown' ? profile.department : '';
  const checkIn =
    module === 'accessLog' ? convertToRegionTime(profile?.enteredIn) : convertToRegionTime(profile?.login);
  const checkOut =
    module === 'accessLog' ? convertToRegionTime(profile?.exitTiming) : convertToRegionTime(profile?.logout);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[560px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full rounded-[18px] bg-[var(--bg1solid)] text-[var(--tx)] p-0 border border-[var(--bd)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-5 p-7 bg-[var(--bg2)] border-b border-[var(--bd)]">
          <div className="w-[120px] h-[120px] rounded-full overflow-hidden border-2 border-[var(--bg1solid)] shadow-md shrink-0">
            {profile?.image ? (
              <ImageWithLoader
                src={profile.image}
                alt={name}
                className="w-full h-full rounded-full"
                imgClassName="w-full h-full object-cover"
              />
            ) : (
              <span
                className="w-full h-full flex items-center justify-center text-3xl font-semibold text-white"
                style={{ background: avatarColor(name) }}
              >
                {initials(name)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-[var(--tx)] truncate">{name}</h3>
            {dept && <p className="text-sm text-[var(--tx2)] truncate mt-0.5">{dept}</p>}
          </div>
        </div>

        {/* Details */}
        <div className="px-7 py-4 divide-y divide-[var(--bd)]">
          <Row icon={User} label="Name" value={name} />
          {dept && <Row icon={Building2} label="Department" value={dept} />}
          {profile?.location && profile.location !== '--' && (
            <Row icon={MapPin} label="Location" value={profile.location} />
          )}
          <Row icon={LogIn} label="Check In" value={checkIn} />
          <Row icon={LogOut} label="Check Out" value={checkOut} />
          <Row icon={Mail} label="Email" value={profile?.email} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogEmployeeProfileDialog;
