import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import moment from 'moment-timezone';

/**
 * Employee profile dialog for the log pages. Theme-aware (dark/light) via CSS
 * vars (the dialog portals to <body>, which carries data-vq-theme).
 */
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[680px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full rounded-[12px] bg-[var(--bg1solid)] text-[var(--tx)] px-8 py-6 border border-[var(--bd)] shadow-lg">
        <div className="relative">
          <div className="flex items-center gap-6 pb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden border border-[var(--bd2)] flex-shrink-0">
              {profile && profile.image ? (
                <img src={profile.image} alt={profile.name || 'Profile'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[var(--bg2)] flex items-center justify-center text-lg text-[var(--tx2)]">
                  {profile?.name?.charAt(0) || '?'}
                </div>
              )}
            </div>

            {profile?.department === 'Unknown' ? null : (
              <div className="flex-col">
                <h3 className="text-lg font-normal text-[var(--tx)]">{profile?.name || ''}</h3>
                <p className="text-sm font-normal text-[var(--tx2)]">{profile?.department || ''}</p>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-[var(--bd)]" />

          <div className="mt-6 grid grid-cols-[140px_1fr] gap-y-4 items-start text-sm">
            <div className="text-sm text-[var(--tx)] font-normal">Name</div>
            <div className="text-sm text-[var(--tx2)] font-normal">{profile?.name || ''}</div>

            <div className="text-sm text-[var(--tx)] font-normal">Check In</div>
            <div className="text-sm text-[var(--tx2)] font-normal">
              {module === 'accessLog'
                ? convertToRegionTime(profile?.enteredIn)
                : convertToRegionTime(profile?.login)}
            </div>

            <div className="text-sm text-[var(--tx)] font-normal">Check out</div>
            <div className="text-sm text-[var(--tx2)] font-normal">
              {module === 'accessLog'
                ? convertToRegionTime(profile?.exitTiming)
                : convertToRegionTime(profile?.logout)}
            </div>

            <div className="text-sm text-[var(--tx)] font-normal">Email account</div>
            <div className="text-sm text-[var(--tx2)] font-normal">{profile?.email || '--'}</div>
          </div>

          <div className="mt-6 border-t border-[var(--bd)]" />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogEmployeeProfileDialog;
