import React, { useState, useEffect, useRef } from 'react';
import moment from 'moment';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { updateCameraSettingById } from '../../Streams/Api/patch';
import { getAppliedProfile } from '../Api/get';

import { InnerSettingsProvider } from './InnerSettingsContext';
import Header from './Header';
import LiveFeedSection from './LiveFeedSection';
import DeviceDetail from './DeviceDetail';
import SettingsCard from './SettingsCard';
import ZoneSettingsPanel from './zonemarking/ZoneSettingsPanel';
import ProfileSelectionDialog from './ProfileSelectionDialog';
import ResetConfirmationDialog from '@/components/ui/ResetConfirmationDialog';
import { deleteDetectionSettings } from '../Api/delete';

const Innersettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { rowData, channelData ,currentNvr} = location.state || {};

  const selectedChannelIds = (channelData?.linkedCameras || []).map((c) => c._id);
  const channelId = selectedChannelIds[0] || null;

  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [appliedProfileData, setAppliedProfileData] = useState(null);
    const [appliedDetection, setAppliedDetection] = useState(null);
      const [selectedsettingType, setSelectedsettingType] = useState('');
  // Shared ref to AreaSettingsPreview so the right-side Zone Settings panel can
  // reuse the same save-area flow (save / delete a zone).
  const previewRef = useRef(null);
  

  const fetchAppliedProfile = async (id = channelId) => {
    if (!id) return;
    try {
      const res = await getAppliedProfile(id);
      if (res?.data?.body?.status === 'success') {
        const applied = res?.data?.body?.data?.channel;
        setAppliedProfileData(applied);
      }
    } catch (err) {
      console.error('Error fetching applied profile', err);
    }
  };

  const handleApplyProfile = async (selectedChannelIdsParam, cb,msg='') => {  
    if (!selectedChannelIdsParam || selectedChannelIdsParam.length === 0) return;
    try {
      const response = await updateCameraSettingById(selectedChannelIdsParam[0], { profile: null });
      if (response?.data?.statusCode === 200) {
             
        if(msg  !='no need') 
        {
       toast.success(response?.data?.body?.message);
        }
        cb && cb();
      } else {
        toast.error(response?.data?.body?.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error?.response?.data?.body?.message || 'Something went wrong');
    }
  };

  // Simple reset handler: apply profile reset, close dialog, log detection ids
const handleResetConfirm = async () => {
  try {

   
      const res = await getAppliedProfile(channelId);
      if (res?.data?.body?.status === 'success') {
        setAppliedProfileData(res.data.body.data.channel);
      }
      const detectionSettings = res.data.body.data.channel.detections || [];
      const detectionId = detectionSettings[selectedsettingType]?.id._id;
      if (detectionId) {
        await deleteDetectionSettings(detectionId);
        setSelectedsettingType('');
        setAppliedDetection(null);  
        setShowResetDialog(false);
        toast.success('Detection settings reset successfully.');
      } 
      else {
        if(res.data.body.data.channel?.profile?._id){
          toast.success('profile settings reset successfully.');
        }
        else{
        toast.error('No detection settings found to reset.');
        }
      } 
    const response = await handleApplyProfile(selectedChannelIds, () => fetchAppliedProfile(),'no need');
      if(!detectionId){
            setShowResetDialog(false);
                // toast.success('Detection settings reset successfully.');

      }
    
  } catch (err) {
    console.error('Error updating profile:', err);
  }
};


  useEffect(() => {
    if (channelId) fetchAppliedProfile(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const contextValue = {
    rowData,
    channelData,
    fetchAppliedProfile,
    appliedProfileData,
    setAppliedProfileData,
    onBack: () => navigate(-1),
    onReset: () => setShowResetDialog(true),
    onOpenProfileDialog: () => setShowProfileDialog(true),
  };

  return (
    <InnerSettingsProvider value={contextValue}>
      <div className="min-h-screen bg-[#F7F8F8]">
        <div className="w-full overflow-x-auto px-1 py-1 space-y-5 md:space-y-7 xl:space-y-8">
          <Header />
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            <div className="space-y-4">
              <LiveFeedSection previewRef={previewRef} currentNvr={currentNvr} setSelectedsettingType={setSelectedsettingType} selectedsettingType={selectedsettingType}  channelData={channelData} appliedDetection={appliedDetection} setAppliedDetection={setAppliedDetection} />
            </div>
            <div className="space-y-4">
              <DeviceDetail channelData={channelData} />
              <SettingsCard fetchAppliedProfile={fetchAppliedProfile} appliedProfile={appliedProfileData} channelData={channelData} onOpenProfileDialog={() => setShowProfileDialog(true)} />
              {selectedsettingType &&
                selectedsettingType !== 'lineCrossingSettings' &&
                selectedsettingType !== 'lineCrossing' &&
                appliedDetection?._id && (
                <ZoneSettingsPanel
                  appliedDetection={appliedDetection}
                  previewRef={previewRef}
                  settingType={selectedsettingType}
                />
              )}
            </div>
          </div>
        </div>

        <ProfileSelectionDialog fetchAppliedProfile={fetchAppliedProfile} open={showProfileDialog} onClose={() => setShowProfileDialog(false)} onSelectProfile={() => {}} selectedChannelIds={selectedChannelIds} />

        <ResetConfirmationDialog open={showResetDialog} onClose={() => setShowResetDialog(false)} onConfirm={handleResetConfirm} title="Reset Detection UI" message={<span><strong>Warning:</strong> This will reset all detection settings to their default values. This action cannot be undone.</span>} />
      </div>
    </InnerSettingsProvider>
  );
};

export default Innersettings;
