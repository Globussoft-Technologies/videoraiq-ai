import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import moment from "moment-timezone";

/**
 * Reusable dialog to show an employee profile inside Attendance logs.
 * Props:
 * - open: boolean
 * - onOpenChange: fn(open:boolean) optional
 * - onClose: fn() optional
 * - profile: object with fields used in the dialog (image, name, department, id, designation, phone, email)
 */
const LogEmployeeProfileDialog = ({ open = false, onOpenChange, onClose, profile = null,module }) => {

    const [region, setRegion] = useState(() => moment.tz.guess());
 
        const convertToRegionTime = (utcTime, region) => {
        if (!utcTime) return "--";
        const m = moment(utcTime);
        if (!m.isValid()) return "--";
        return m.tz(region).format("hh:mm A");
      };
  const handleOpenChange = (isOpen) => {
    // Call onOpenChange if provided. Do not return early so onClose can also run when closing.
    if (typeof onOpenChange === 'function') {
      try {
        onOpenChange(isOpen);
      } catch (e) {
        // swallow errors from consumer callbacks but surface in dev console
        if (typeof console !== 'undefined' && console.error) console.error('onOpenChange callback error', e);
      }
    }

    // If the dialog was closed, call onClose if provided.
    if (!isOpen && typeof onClose === 'function') {
      try {
        onClose();
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) console.error('onClose callback error', e);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[680px] top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] w-full rounded-[12px] bg-white px-8 py-6 border border-[#EDEDED] shadow-lg">
        <div className="relative">
    

          <div className="flex items-center gap-6 pb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden border border-[#E8E8E8] flex-shrink-0">
              {profile && profile.image ? (
                <img src={profile.image} alt={profile.name || 'Profile'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#F3F3F3] flex items-center justify-center text-lg text-[#555]">{profile?.name?.charAt(0) || '?'}</div>
              )}
            </div>

         { profile?.department =='Unknown'?'':  <div className="flex-col">
              <h3 className="text-lg font-[400] text-[#1F2937]">{profile?.name || ''}</h3>
              <p className="text-sm font-[400] text-[#6B7280]">{profile?.department || ''}</p>
            </div>}
          </div>
          <div className="mt-6 border-t border-[#EFEFEF]"></div>

          <div className="mt-6 grid grid-cols-[140px_1fr] gap-y-4 items-start text-sm">
            <div className="text-sm text-[#1F2937] font-[400]">Name</div>
            <div className="text-sm text-[#4B5563] font-[400]">{profile?.name || ''}</div>

            {/* <div className="text-sm text-[#1F2937] font-[400]">Emp ID</div>
            <div className="text-sm text-[#4B5563] font-[400]">{module=="accessLog" ? profile?.emp_id : profile?.id || profile?._id || ''}</div> */}

            <div className="text-sm text-[#1F2937] font-[400]">Check In</div>
            <div className="text-sm text-[#4B5563] font-[400]">
              {module=="accessLog" ? convertToRegionTime(profile?.enteredIn, region):convertToRegionTime(profile?.login, region)}
            </div>

            <div className="text-sm text-[#1F2937] font-[400]">Check out </div>
            <div className="text-sm text-[#4B5563] font-[400]"> 
             { module=="accessLog" ? convertToRegionTime(profile?.exitTiming, region):convertToRegionTime(profile?.logout, region) }
              </div>

          <div className="text-sm text-[#1F2937] font-[400]">Email account</div>
            <div className="text-sm text-[#4B5563] font-[400]">{profile?.email || '--'}</div>
          </div>

          <div className="mt-6 border-t border-[#EFEFEF]"></div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogEmployeeProfileDialog;
