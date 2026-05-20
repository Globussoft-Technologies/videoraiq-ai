import { Button } from '@/components/ui/button';
import AlertPreferences from './components/AlertPreferences';
import NVRSettings from './components/NvrAlertsettings';
import Reports from './components/Reports';
import React from 'react';

const Settings = () => {
  return (
    <div className="min-h-screen rounded-[18px] bg-gray-50">
      <main className="container mx-auto max-w-full">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              {/* <div>
                <p className="text-sm mb-4 text-[#696969] font-normal md:text-[16px]">Alert Settings</p>
                <h1 className="font-medium text-[#333333] md:text-[28px] text-xl">
                  Alert & Notification Controls
                </h1>
              </div> */}
            </div>
            {/* <Button className="bg-[#0C2159] text-[#FFFFFF] cursor-pointer px-6 py-6 rounded-[32px] md:text-[16px] text-sm font-normal transition-colors">
              <span className='mt-0.5'>Save Changes</span>
            </Button> */}
          </div>

          <div className="space-y-4">
            <AlertPreferences />
            {/* <NVRSettings /> */}
            {/* <NotificationRecipients /> */}
            <Reports />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
