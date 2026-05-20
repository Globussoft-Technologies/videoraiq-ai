import React, { useEffect, useState } from 'react';
import Camera from '../../../assets/Camera.svg';
import AddNVRForm from './Nvrform';
import StreamHeader from '@/components/StreamHeader';
import Nvrsettings from './Nvrsettings';
import { getAllNvrDetails } from './Api/get';
import { usePermissions } from '@/context/Permission/PermissionContext';
import AccessDenied from '@/components/AccessDenied';
import PageLoader from '@/components/PageLoader';
import { toast } from 'sonner';
import { deleteNVR } from './Api/delete';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import NvrLocalsettings from './NvrLocalsettings';

const Streams = () => {
  const { permissions, loading: permissionsLoading } = usePermissions();
  const canView = permissions?.NVR?.view;
  const canCreate = permissions?.NVR?.create;

  const [showModal, setShowModal] = useState(false);
  const [showNVRSettings, setShowNVRSettings] = useState(false);
  const [nvrDetails, setNvrDetails] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleFormSubmit = () => {
    setShowModal(false);
    setShowNVRSettings(true);
  };

  const handleNvrDelete = async (nvrId) => {
    try {
      const response = await deleteNVR(nvrId);
      if (response?.data?.body?.status === 'success') {
        setNvrDetails(prev => prev.filter(nvr => nvr._id !== nvrId));
        toast.success(response?.data?.body?.message || '');
        await fetchNvrData();
        return true;
      } else {
        toast.error(response?.data?.body?.message || 'Failed to delete NVR.');
        return false;
      }
    } catch (err) {
      console.error('Failed to delete NVR:', err);
      return false;
    }
  };

  const fetchNvrData = async () => {
    try {
      setIsLoading(true);
      const response = await getAllNvrDetails();
      const nvrs = response.data?.body?.data?.nvrs;

      if (Array.isArray(nvrs)) {
        setNvrDetails(nvrs);
        setShowNVRSettings(nvrs.length > 0);
      }
    } catch (err) {
      console.error('Error fetching NVRs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNvrData();
  }, []);

  if (permissionsLoading) return <PageLoader />;
  if (!canView) {
    return <AccessDenied message="You don't have permission to view NVR settings." />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen rounded-[10px] bg-white p-3 md:p-5 2xl:rounded-[18px] 2xl:md:p-8">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6 md:mb-6 2xl:mb-12">
          <Skeleton width={180} height={32} className="2xl:w-[250px] 2xl:h-[42px]" />
          <Skeleton width={200} height={32} borderRadius={32} className="2xl:w-[280px] 2xl:h-[44px]" />
        </div>

        {/* NVR Cards Skeleton */}
        <div className="space-y-6 md:space-y-6 2xl:space-y-12">
          {[1, 2].map((item) => (
            <div 
              key={item}
              className="rounded-md pb-3 px-3 pt-4 bg-[#FAFAFA] md:pb-[12px] md:px-[10px] md:pt-[16px] 2xl:rounded-[9px] 2xl:pb-[18px] 2xl:px-[14px] 2xl:pt-[24px]"
            >
              {/* Card Header */}
              <div className="flex justify-between items-start border-b border-[#D8D8D8] pb-[8px] mb-[12px] md:pb-[8px] md:mb-[14px] 2xl:pb-[15px] 2xl:mb-[22px]">
                <Skeleton width={120} height={20} className="2xl:w-[180px] 2xl:h-[24px]" />
                <div className="flex gap-2">
                  <Skeleton width={140} height={28} borderRadius={8} className="2xl:w-[180px] 2xl:h-[36px]" />
                  <Skeleton width={70} height={28} borderRadius={8} className="2xl:w-[90px] 2xl:h-[36px]" />
                  <Skeleton width={80} height={28} borderRadius={8} className="2xl:w-[100px] 2xl:h-[36px]" />
                </div>
              </div>

              {/* Grid Form Skeleton */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-3 2xl:gap-8">
                {[1, 2, 3, 4, 5].map((field) => (
                  <div key={field}>
                    <Skeleton width={80} height={12} className="mb-1 2xl:mb-2" />
                    <Skeleton height={36} borderRadius={6} className="2xl:h-[52px] 2xl:rounded-[10px]" />
                  </div>
                ))}
              </div>

              {/* Bottom Button Skeleton */}
              <div className="mt-3 md:mt-3 2xl:mt-6">
                <Skeleton width={160} height={28} borderRadius={32} className="2xl:w-[200px] 2xl:h-[36px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  const isLocalSetup = import.meta.env.VITE_LOCAL_SETUP === 'true';
  if (showNVRSettings) {
    return (
      <>
        {isLocalSetup ? (
          <NvrLocalsettings
            onBack={() => setShowNVRSettings(false)}
            nvrDetails={nvrDetails}
            fetchNvrData={fetchNvrData}
            onDeleteNvr={handleNvrDelete}
          />
        ) : (
          <Nvrsettings
            onBack={() => setShowNVRSettings(false)}
            nvrDetails={nvrDetails}
            fetchNvrData={fetchNvrData}
            onDeleteNvr={handleNvrDelete}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen rounded-[10px] bg-white p-3 md:p-5 2xl:rounded-[18px] 2xl:md:p-8">
      {showModal && (
        <AddNVRForm
          onClose={() => setShowModal(false)}
          onSubmit={handleFormSubmit}
          fetchNvrData={fetchNvrData}
        />
      )}

      <StreamHeader
        title="NVR Settings"
        onConfigClick={() => setShowModal(true)}
        buttonText="CCTV Configurations"
        showConfigButton={canCreate}
      />

      <div className="flex flex-col items-center justify-center mt-16 px-4 text-center md:mt-40">
        <img
          src={Camera}
          alt="CCTV Camera"
          className="w-48 h-48 md:w-72 md:h-72"
        />
        <p className="text-sm text-[#5D5D5D] font-normal max-w-xs mt-6 md:text-[20px] md:max-w-xl">
          CCTV stream access is not configured. Please enter the configuration
          details to enable streaming.
        </p>
      </div>
    </div>
  );
};

export default Streams;
