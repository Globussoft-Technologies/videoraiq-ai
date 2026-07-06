import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  X,
  Play,
  Volume2,
  Maximize2,
  Settings,
  Check,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import useHlsPlayer from '@/hooks/useHlsPlayer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { createCameraAliasName } from '../Dashboard/Api/put';
import { getDepartmentList } from './Api/post';
import { usePermissions } from '@/context/Permission/PermissionContext';
import EditCameraInfo from './components/EditCameraInfo';
import { getStreamBaseUrl } from '@/utils/resolveStreamUrl';

const LiveViewModal = ({
  isOpen,
  onClose,
  camera,
  onUpdate,
  cameraList = [],
}) => {
  const { permissions } = usePermissions();
  const canEditChannels = permissions?.channels?.edit;

  const { streamingUrl } = camera || {};
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeCamera, setActiveCamera] = useState(camera);

  useEffect(() => {
    setActiveCamera(camera);
  }, [camera]);

  const currentIndex = useMemo(() => {
    if (!cameraList.length || !activeCamera) return -1;
    return cameraList.findIndex((c) => c.id === activeCamera.id);
  }, [cameraList, activeCamera]);

  const baseUrl = getStreamBaseUrl();
  const status = import.meta.env.VITE_LOCAL_SETUP;

  const memoizedUrl = useMemo(() => {
    const streamingUrl = activeCamera?.streamingUrl;
    if (!streamingUrl) return null;
    if (status === 'true') return streamingUrl;
    return baseUrl + streamingUrl;
  }, [status, baseUrl, activeCamera?.streamingUrl]);

  useEffect(() => {
    if (isOpen && memoizedUrl) {
      setIsLoading(true);
      setHasError(false);
      setErrorMsg('');
    }
  }, [isOpen, memoizedUrl]);

  useEffect(() => {
    if (isOpen) {
      fetchDepartmentList();
    }
    if (!isOpen) {
      setIsEditing(false);
    }
  }, [isOpen]);

  const fetchDepartmentList = async () => {
    try {
      const response = await getDepartmentList();
      const deptList = response?.data?.body?.data?.data || [];
      const formatted = deptList.map((d) => ({
        value: d._id,
        label: d.departmentName,
      }));
      setDepartmentOptions(formatted);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const handleEditClick = () => {
    setAliasInput(activeCamera?.aliasName || '');
    const currentDepts = departmentOptions.filter((opt) =>
      activeCamera?.departments?.includes(opt.value)
    );
    setSelectedDepartments(currentDepts);
    setIsEditing(true);
  };

  const handleNext = () => {
    if (currentIndex < cameraList.length - 1) {
      setActiveCamera(cameraList[currentIndex + 1]);
    } else {
      setActiveCamera(cameraList[0]); // Loop to start
    }
    setIsEditing(false); // Close edit mode when switching
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setActiveCamera(cameraList[currentIndex - 1]);
    } else {
      setActiveCamera(cameraList[cameraList.length - 1]); // Loop to end
    }
    setIsEditing(false); // Close edit mode when switching
  };

  const handleSave = async () => {
  setIsSaving(true);
  try {
    const deptIds = selectedDepartments.map((d) => d.value);

    const response = await createCameraAliasName(activeCamera.id, {
      customName: aliasInput.trim(),
      department: deptIds,
    });

    if (response?.body?.status === 'success') {
      toast.success(response.body.message || 'Camera settings updated');

      // UPDATE LOCAL CAMERA STATE
      setActiveCamera((prev) => ({
        ...prev,
        aliasName: aliasInput.trim(),
        departments: deptIds,
      }));

      setIsEditing(false);

      if (onUpdate) onUpdate(); // optional re-fetch
    } else {
      toast.error('Failed to update camera settings');
    }
  } catch (error) {
    console.error('Error saving camera settings:', error);
    toast.error('An error occurred while saving');
  } finally {
    setIsSaving(false);
  }
};


  useHlsPlayer(videoRef, memoizedUrl, {
    autoPlay: true,
    onError: (msg) => {
      setErrorMsg(msg);
      setIsLoading(false);
      setHasError(true);
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex flex-col animate-in fade-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-900/50 backdrop-blur-md absolute top-0 left-0 right-0 z-30">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
            <h3 className="text-lg font-medium text-white tracking-wide">
              {activeCamera?.cameraName || 'Camera Feed'}
            </h3>
            {!isEditing && (
              <span className="text-xs text-neutral-400 border border-white/10 px-2 py-0.5 rounded bg-white/5">
                {activeCamera?.aliasName || 'No Alias'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canEditChannels && !isEditing && (
              <button
                onClick={handleEditClick}
                className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all duration-200"
                title="Edit Camera Details"
              >
                <Settings size={20} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all duration-200"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Stream Area */}
        <div className="relative bg-black aspect-video w-full flex items-center justify-center group overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
              <div className="loader border-4 border-gray-300 border-t-blue-500 rounded-full w-10 h-10 animate-spin"></div>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 z-20 text-center">
              <p>Unable to load stream</p>
              <p className="text-xs opacity-70 mt-1">
                {errorMsg || 'Camera offline'}
              </p>
            </div>
          )}

          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            preload="metadata"
            controls={false}
            onCanPlay={() => {
              setIsLoading(false);
              setHasError(false);
            }}
            onPlaying={() => {
              setIsLoading(false);
              setHasError(false);
            }}
          />

          {/* Grid Lines */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/5"></div>
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/5"></div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <div className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-1 rounded border border-red-500/30 tracking-wider">
                  LIVE
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Arrows */}
          {!isEditing && cameraList.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all duration-200 backdrop-blur-sm opacity-0 group-hover:opacity-100"
                title="Previous Camera"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all duration-200 backdrop-blur-sm opacity-0 group-hover:opacity-100"
                title="Next Camera"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          {/* Edit Overlay */}
          {isEditing && (
            <EditCameraInfo
              aliasInput={aliasInput}
              setAliasInput={setAliasInput}
              selectedDepartments={selectedDepartments}
              setSelectedDepartments={setSelectedDepartments}
              departmentOptions={departmentOptions}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveViewModal;
