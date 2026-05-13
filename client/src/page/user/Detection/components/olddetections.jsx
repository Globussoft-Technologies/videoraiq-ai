import React, { useState } from 'react';
import AddNewConfiguration from './AddNewConfiguration';
import SavedConfiguration from './SavedConfiguration';

const DetectionSetting = () => {
  const [addedDetection,setAddedDetection]=useState(false);

  return (
    <div className="min-h-screen rounded-[18px] bg-gray-50 overflow-hidden">
      <main className="container mx-auto max-w-full">
        <div className="bg-white rounded-[18px] p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm mb-4 text-[#696969] font-normal md:text-[16px]">Detection Settings</p>
                <h1 className="font-medium text-[#333333] md:text-[28px] text-xl">
                  Configure Detection Settings
                </h1>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <AddNewConfiguration setAddedDetection={setAddedDetection}/>
            <SavedConfiguration setAddedDetection={setAddedDetection} addedDetection={addedDetection}/>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DetectionSetting;
