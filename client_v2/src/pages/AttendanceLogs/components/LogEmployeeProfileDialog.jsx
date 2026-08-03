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

const Row = ({ icon: Icon, label, value, color = 'var(--blue)' }) => (
  <div className="flex items-center gap-3.5 py-3.5 group/row">
    <span
      className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon className="w-[18px] h-[18px]" style={{ color }} />
    </span>
    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tx3)] w-20 sm:w-28 shrink-0">
      {label}
    </span>
    <span className="text-[15px] text-[var(--tx)] font-medium truncate flex-1 min-w-0" title={value || '--'}>
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

  const accentColor = avatarColor(name);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[520px] max-h-[90vh] overflow-y-auto top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--bg1solid)] text-[var(--tx)] p-0 border border-[var(--bd)] shadow-2xl">
        {/* Header — gradient accent band + avatar + name */}
        <div className="relative overflow-hidden">
          {/* Subtle gradient accent strip at the top */}
          <div
            className="absolute inset-x-0 top-0 h-1.5 z-10"
            style={{
              background: `linear-gradient(90deg, ${accentColor}, var(--blue), var(--violet))`,
            }}
          />

          <div className="flex items-center gap-4 sm:gap-5 px-5 sm:px-7 pt-7 pb-5 bg-[var(--bg2)]">
            {/* Avatar ring with accent border */}
            <div
              className="w-[76px] h-[76px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden shrink-0 shadow-lg ring-[3px] ring-offset-2 ring-offset-[var(--bg2)]"
              style={{ '--tw-ring-color': accentColor }}
            >
              {profile?.image ? (
                <ImageWithLoader
                  src={profile.image}
                  alt={name}
                  className="w-full h-full rounded-full"
                  imgClassName="w-full h-full object-cover object-top"
                />
              ) : (
                <span
                  className="w-full h-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-white"
                  style={{ background: accentColor }}
                >
                  {initials(name)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-lg sm:text-xl font-bold text-[var(--tx)] truncate leading-tight">
                {name}
              </h3>
              {dept && (
                <p className="text-sm text-[var(--tx2)] truncate mt-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  {dept}
                </p>
              )}
              <div
                className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                style={{ background: accentColor }}
              >
                Employee
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-5 sm:px-7 py-4 sm:py-5">
          <div className="divide-y divide-[var(--bd)]">
            <Row icon={User} label="Name" value={name} color="#3b82f6" />
            {dept && <Row icon={Building2} label="Department" value={dept} color="#a855f7" />}
            {profile?.location && profile.location !== '--' && (
              <Row icon={MapPin} label="Location" value={profile.location} color="#f59e0b" />
            )}
            <Row icon={LogIn} label="Check In" value={checkIn} color="#22c55e" />
            <Row icon={LogOut} label="Check Out" value={checkOut} color="#ef4444" />
            <Row icon={Mail} label="Email" value={profile?.email} color="#06b6d4" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogEmployeeProfileDialog;
