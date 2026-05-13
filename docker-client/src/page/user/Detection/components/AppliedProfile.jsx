import React from 'react';
import moment from 'moment';
import { useInnerSettings } from './InnerSettingsContext';
import { usePermissions } from '@/context/Permission/PermissionContext';

const AppliedProfile = () => {
  const { appliedProfileData, onOpenProfileDialog } = useInnerSettings();
  const { permissions } = usePermissions();

  const createPermission = permissions?.detectionSettings?.create
  const editPermission = permissions?.detectionSettings?.edit
  const viewPermission = permissions?.detectionSettings?.view
  const deletePermission = permissions?.detectionSettings?.delete






  const appliedProfile = appliedProfileData;

  if (!appliedProfile || appliedProfile?.profile == undefined) {
    return (
      <div className="text-center py-6 md:py-5 2xl:py-6">
        <p className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] mb-4 md:mb-3 2xl:mb-4">The detection profile applied to this setting</p>
        <button onClick={onOpenProfileDialog} className="px-4 py-2.5 md:px-3 md:py-2 2xl:px-4 2xl:py-2.5 bg-[#07486A] cursor-pointer text-white rounded-[7px] text-xs md:text-[11px] 2xl:text-xs hover:bg-[#05374F]">Apply a Profile</button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 md:mb-3 2xl:mb-4">
        <h3 className="text-sm md:text-xs 2xl:text-sm font-semibold text-[#333333]">Applied Profile</h3>
        {editPermission == true && <button onClick={onOpenProfileDialog} className="px-4 py-2.5 md:px-3 md:py-2 2xl:px-4 2xl:py-2.5 bg-[#07486A] cursor-pointer text-white rounded-[7px] text-xs md:text-[11px] 2xl:text-xs hover:bg-[#05374F]">Apply New</button>}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-2 2xl:grid-cols-3 gap-x-4 md:gap-x-3 2xl:gap-x-4 gap-y-4 md:gap-y-3 2xl:gap-y-4 text-xs md:text-[11px] 2xl:text-xs">
        <div>
          <p className="text-[#878787] mb-1">Name</p>
          <p className="text-[#333333] font-medium">{appliedProfile?.profile?.basics?.profileName || ''}</p>
        </div>
        <div>
          <p className="text-[#878787] mb-1">Created by</p>
          <p className="text-[#333333] text-xs md:text-[11px] 2xl:text-xs break-words">{appliedProfile?.profile?.createdBy?.email || ''}</p>
        </div>
        <div>
          <p className="text-[#878787] mb-1">Created At</p>
          <p className="text-[#333333] text-xs md:text-[11px] 2xl:text-xs">{moment(appliedProfile?.profile?.createdAt).format('L') || ' '}</p>
        </div>
        <div>
          <p className="text-[#878787] mb-1">Status</p>
          <span className="inline-block px-2 py-1 md:px-1.5 md:py-0.5 2xl:px-2 2xl:py-1 bg-[#E8FFDB] text-[#338904] rounded-md text-xs md:text-[11px] 2xl:text-xs">{appliedProfile?.profile?.status || ''}</span>
        </div>
        <div>
          <p className="text-[#878787] mb-1">Last Modified</p>
          <p className="text-[#333333] text-xs md:text-[11px] 2xl:text-xs">{moment(appliedProfile?.profile?.updatedAt).format('L') || ''}</p>
        </div>
      </div>
    </>
  );
};

export default AppliedProfile;
