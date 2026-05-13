import FormField from '@/components/ui/Formfield';
import React, { useState } from 'react';
import { SquarePen, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddNVRForm from '../../Streams/Nvrform';

const NVRSettingsForm = ({ settings }) => {
  const [showEditForm, setShowEditForm] = useState(false);

  const handleEdit = () => {
    setShowEditForm(true);
  };

  return (
    <div className="bg-[#FAFAFA] py-10 px-6 space-x-2 rounded-[10px] relative">
      {/* Edit button top-right */}
      <Button
        onClick={handleEdit}
        className="absolute rounded-[5px] hover:bg-[#0B1A6A] hover:text-white top-4 border shadow-none p-5 border-[#C9C9C9] bg-[#FAFAFA] right-4 flex items-center space-x-2 cursor-pointer text-[#333333] text-lg font-normal"
      >
        <SquarePen className="w-4 h-4" />
        <span>Edit</span>
      </Button>

      <h3 className="text-sm font-medium text-gray-600 mb-4">
        Current NVR Settings
      </h3>
     <span className="bg-[#FFDBD9] text-[#CE241C] px-3 py-2 mb-5 hidden md:inline-flex rounded-[8px] items-center whitespace-nowrap font-normal text-[10px]">
  <TriangleAlert className="w-4 h-4 mr-1.5 shrink-0 text-[#CE241C]" />
  Password change detected. Please update your password.
</span>


      <div className="space-y-4 rounded-4xl">
        <FormField
          label="Name"
          id={`name-${settings.ipAddress}`}
          type="text"
          value={settings.name}
        />
        <FormField
          label="Ip Address"
          id={`ip-${settings.ipAddress}`}
          type="text"
          value={settings.ipAddress}
        />
        <FormField
          label="Username"
          id={`username-${settings.ipAddress}`}
          type="text"
          value={settings.username}
        />
        <FormField
          label="Password"
          id={`password-${settings.ipAddress}`}
          type="password"
          value={settings.password}
          showAlert={true}
        />
        <FormField
          label="RTSP Port"
          id={`rtsp-${settings.ipAddress}`}
          type="text"
          value={settings.rtspPort}
        />
        <FormField
          label="Total Channels"
          id={`channels-${settings.ipAddress}`}
          type="text"
          value={settings.totalChannels}
        />
      </div>

      {showEditForm && (
        <AddNVRForm
          onClose={() => setShowEditForm(false)}
          isEdit={true}
          initialData={{
            _id: '1',
            ...settings,
          }}
          fetchNvrData={() => {
            // Add your fetch function here if needed
          }}
        />
      )}
    </div>
  );
};

export default NVRSettingsForm;
