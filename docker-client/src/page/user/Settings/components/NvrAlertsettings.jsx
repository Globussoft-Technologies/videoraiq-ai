import React, { useState } from 'react';
import { ChevronDown, ChevronUp, SquarePen } from 'lucide-react';
import NVRSettingsForm from './Nvralertsettingsform';
import NVRSettingsCard from './NvrSettingscard';
import { Button } from '@/components/ui/button';
import AddNVRForm from '../../Streams/Nvrform';


const NVRSettings = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const currentSettings = {
    _id: '1', // Added _id to ensure Edit NVR heading shows
    name: 'Office_NVR_01',
    ipAddress: '192.168.1.25',
    username: 'admin',
    password: '••••••••••••••••',
    rtspPort: '554',
    totalChannels: '16',
  };

  const previousSettings = [
    {
      name: 'Office_NVR_01',
      ipAddress: '192.168.1.25',
      username: 'admin',
      password: '••••••••••••••••',
      rtspPort: '554',
      totalChannels: '16',
    },
    {
      name: 'Office_NVR_01',
      ipAddress: '192.168.1.25',
      username: 'admin',
      password: '••••••••••••••••',
      rtspPort: '554',
      totalChannels: '16',
    },
    {
      name: 'Office_NVR_01',
      ipAddress: '192.168.1.25',
      username: 'admin',
      password: '••••••••••••••••',
      rtspPort: '554',
      totalChannels: '16',
    },
  ];

  const handleEdit = () => {
    setShowEditForm(true);
  };

  return (
    <div className="bg-[#FFFFFF] rounded-[10px]">
      <div
        className="flex items-center justify-between px-4 py-6 rounded-[10px] bg-[#FAFAFA] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="md:text-[20px] text-sm font-medium text-gray-900">
          NVR Settings
        </h2>
        {isExpanded ? (
          <ChevronUp className="w-8 h-8 text-[#333333]" />
        ) : (
          <ChevronDown className="w-8 h-8 text-[#333333]" />
        )}
      </div>

      {isExpanded && (
        <div className="py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <NVRSettingsForm settings={currentSettings} />
            </div>
            <span className="bg-[#FAFAFA] rounded-[10px] p-4">
              <div className="flex justify-end mb-4">
                <Button
                  variant="outline"
                  className="border-[#C9C9C9] bg-[#FAFAFA] hover:bg-[#0B1A6A] hover:text-white p-5 b right-4 flex items-center space-x-2 cursor-pointer text-[#333333] text-lg font-normal"
                  onClick={handleEdit}
                >
                  <SquarePen className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </div>
              <div className="space-y-4">
                {previousSettings.map((settings, index) => (
                  <NVRSettingsCard key={index} settings={settings} />
                ))}
              </div>
            </span>
          </div>
        </div>
      )}

      {showEditForm && (
        <AddNVRForm
          onClose={() => setShowEditForm(false)}
          isEdit={true}
          initialData={currentSettings}
          fetchNvrData={() => {
            // Add your fetch function here if needed
          }}
        />
      )}
    </div>
  );
};

export default NVRSettings;
