import React from 'react';
import { useInnerSettings } from './InnerSettingsContext';

const EvidenceSeverity = () => {
  const { appliedProfileData } = useInnerSettings();
  const appliedProfile = appliedProfileData;

  return (
    <div>
      <h3 className="text-sm md:text-xs 2xl:text-sm font-semibold text-[#333333] mb-4 md:mb-3 2xl:mb-4">Evidence & Severity</h3>
      <div className="space-y-2 md:space-y-1.5 2xl:space-y-2">
        <div className="flex flex-col justify-start gap-1">
          <span className="text-xs md:text-[11px] 2xl:text-xs text-[#878787]">Evidence</span>
          <span className="text-xs md:text-[11px] 2xl:text-xs text-[#333333] font-medium">{appliedProfile?.profile?.evidenceSeverity?.evidenceType}</span>
        </div>
      </div>
    </div>
  );
};

export default EvidenceSeverity;
