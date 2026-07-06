import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle} from 'react';
import { toast } from 'sonner';
import MiniCameraPreview from '@/page/user/Detection/components/MiniCameraPreview';
import Delete from '@/assets/Delete.svg';
import { CirclePlay, BrushCleaning, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import save from '@/assets/Save.svg';
import ConfirmationModal from './DeleteConfirmation';
import { getNvrNames, getCamerasBasedOnNvr } from '../../Dashboard/Api/get';
import { useDetection } from '@/context/Sockets/DetectionContext';
import CameraStreamWithArea from './CameraStreamWithArea';
import { updateDetectionSettings } from '../Api/put';
import Skeleton from 'react-loading-skeleton';
import DetectionPreviewModal from './DetectionPreviewModal';
import { callMarkPointsApi } from '@/utils/callMarkPointsApi';
import { getStreamBaseUrl } from '@/utils/resolveStreamUrl';
import Maximum from '@/assets/Maximum.svg';
import Minimum from '@/assets/Minimum.svg';
import AreaMarkingControls from './zonemarking/AreaMarkingControls';
import useAreaMarking from '@/hooks/useAreaMarking';
import { addNewDetectionConfiguration } from '../Api/post';
import { usePermissions } from '@/context/Permission/PermissionContext';

const AreaSettingsPreview = forwardRef(({setIsEditing, selectedType, activeCamera, cameraList, selectedChannelIds, isModal, onAreaSettingsChange, onDetectionSaved, initialReferencePoints = {}, detectionSettingName,zoneEnabled,zoneName, detectionSetting = null, detectionOptions = [],selectedsettingType,appliedDetection,currentNvr, onClearZoneConfigs }, ref) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIcon, setModalIcon] = useState(null);
  const [modalType, setModalType] = useState('');
  const controlSocketRef = useRef(null);
  const [nvrList, setNvrList] = useState([]);
  const [selectedNvrId, setSelectedNvrId] = useState('');
  const [cameraChannels, setCameraChannels] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [selectedNvrDetails, setSelectedNvrDetails] = useState(null);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [nvrNameLoading, setNvrNameLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const cameraStreamRef = useRef(null);
  const { permissions } = usePermissions();
  
  const createPermission = permissions?.detectionSettings?.create
  const editPermission = permissions?.detectionSettings?.edit
  const viewPermission = permissions?.detectionSettings?.view
  const deletePermission = permissions?.detectionSettings?.delete
  // Normalize detectionSetting prop: some callers pass a wrapper { detectionSetting, linkedCameras }
  // Defensive normalization: support arrays, wrappers, and ensure we prefer object shape
  let ds = detectionSetting;
  if (Array.isArray(ds)) {
    ds = ds.length > 0 ? ds[0] : null;
  }
  if (ds && ds.detectionSetting) ds = ds.detectionSetting;

  // Ensure _id consistency if API sometimes returns `id` or `detectionId`
  if (ds && !ds._id) {
    if (ds.id) ds._id = ds.id;
    else if (ds.detectionId) ds._id = ds.detectionId;
  }

  // Keep a local copy so parent prop changes to empty/null don't wipe local edits
  // const [localDetection, setLocalDetection] = useState(ds || null);
  const localDetection =ds
  // useEffect(() => {
  //   if (ds) setLocalDetection(ds);
  // }, [ds]);

  

  // active detection used throughout the component: prefer prop `ds` but fall back to last known localDetection
  const activeDs = ds ;

  // Flag to indicate whether we're editing an existing detection (used for UI/logic)
  const [isEditMode, setIsEditMode] = useState(!!(activeDs && (activeDs._id || activeDs.id)));

  // Keep debug log
  // Track if initial points have been loaded for selected camera
  const [initialPointsLoaded, setInitialPointsLoaded] = useState(false);
  // Set when the user explicitly clears all areas, so the ds-sync effect does
  // not restore the saved reference points on subsequent re-renders. Reset only
  // when a genuinely different detection is selected.
  const manuallyClearedRef = useRef(false);
  const [processedImage, setProcessedImage] = useState(null);
  const [loadingPreviewImg, setLoadingPreviewImg] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [channelPoints, setChannelPoints] = useState({});
  // Local editable fields (prepopulate from detectionSetting when available)
  const [localSelectedType, setLocalSelectedType] = useState(selectedType || ds?.detectionType || ds?.settingType || '');
  const [localZoneName, setLocalZoneName] = useState(zoneName || ds?.name || ds?.detectionName || '');
  const [localZoneEnabled, setLocalZoneEnabled] = useState(typeof zoneEnabled === 'boolean' ? zoneEnabled : (activeDs?.enabled ?? true));
  
  // Track if user has manually edited local fields (so sync effect doesn't overwrite edits)
  const [hasUserEditedLocally, setHasUserEditedLocally] = useState(false);
      const [hasError, setHasError] = useState(false);
          const [isLoading, setIsLoading] = useState(true);
  
  
  // When zoneName or zoneEnabled change from outside (parent), mark as hasUserEditedLocally so we preserve changes
  useEffect(() => {
    if (zoneName !== undefined && zoneName !== null) {
      setLocalZoneName(zoneName);
      setHasUserEditedLocally(true);
    }
  }, [zoneName]);

  useEffect(() => {
    if (typeof zoneEnabled === 'boolean') {
      setLocalZoneEnabled(zoneEnabled);
      setHasUserEditedLocally(true);
    }
  }, [zoneEnabled]);
  
  // Helper to get detection type label from ID
  const getDetectionTypeLabel = (typeId) => {
    if (!typeId) return typeId;
    const option = detectionOptions.find(opt => opt.id === typeId);
    return option?.label || typeId;
  };
  // Effective initial reference points: prefer explicit prop, otherwise use detectionSetting
  const effectiveInitialReferencePoints =
    Object.keys(initialReferencePoints || {}).length > 0
      ? initialReferencePoints
      : (activeDs?.settings?.referencePoints || {});

  // When a genuinely different detection is selected, allow the saved points
  // to load again (undo the manual-clear lock).
  useEffect(() => {
    manuallyClearedRef.current = false;
  }, [activeDs?._id]);

  // Sync local editable fields and channelPoints when detectionSetting prop changes
  // BUT: skip syncing zoneName and zoneEnabled if user has edited them locally (to preserve edits after save)
  useEffect(() => {
    if (!activeDs) return;

    // Sync simple fields - use label instead of ID for detection type
    const detectionTypeLabel = getDetectionTypeLabel(activeDs.detectionType || activeDs.settingType);
    setLocalSelectedType(detectionTypeLabel || selectedType || '');
    
    // Only sync zoneName and zoneEnabled if user hasn't edited them locally
    if (!hasUserEditedLocally) {
      setLocalZoneName(activeDs.name || activeDs.detectionName || zoneName || '');
      setLocalZoneEnabled(typeof activeDs.enabled === 'boolean' ? activeDs.enabled : (typeof zoneEnabled === 'boolean' ? zoneEnabled : true));
    }

    // Sync reference points into channelPoints state so camera initialPoints can pick them up.
    // Skip this if the user just cleared all areas, so the cleared canvas isn't
    // overwritten by the saved reference points on a re-render.
    const refPoints = activeDs?.settings?.referencePoints || {};
    if (!manuallyClearedRef.current && refPoints && Object.keys(refPoints).length > 0) {
      setChannelPoints(refPoints);
      // allow the camera stream to pick up new initial points
      setInitialPointsLoaded(false);
    }

    // If detectionSetting provides linkedCameras, try to auto-select the first one
    const linked = ds?.linkedCameras || [];
    if (linked?.length > 0 && cameraChannels?.length > 0) {
      const firstLinked = linked[0];
      const channelObj = cameraChannels?.find((c) => c._id === (firstLinked?._id || firstLinked));
      if (channelObj) {
        handleCameraClick(channelObj);
      }
    }
  }, [ds, hasUserEditedLocally]);
  
  // const [drawingMode, setDrawingMode] = useState(false);
  // const [moveMode, setMoveMode] = useState(false);
  // Area marking hook (controls drawing, min/max, delete etc.)
  const {
    drawingMode,
    moveMode,
    handleToggleDrawing,
    handleDeleteArea,
    handleMinArea,
    handleMaxArea,
    handleSingleLinePlacement,
    handleEnableEdit,
    setDrawingMode,
    setMoveMode
  } = useAreaMarking(cameraStreamRef);

  // Helper to open modal with icon (only for delete and clear)
  const handleOpenModal = (iconType) => {
    let icon = null;
    if (iconType === 'delete') {
      icon = <img src={Delete} alt="delete icon" className="w-8 h-8" />;
    } else if (iconType === 'clear') {
      icon = <BrushCleaning className="w-8 h-8 text-[#595959]" />;
    } else {
      return; // Do nothing for other actions
    }
    setModalIcon(icon);
    setModalType(iconType);
    setModalOpen(true);
  };

  // Helper to get RTSP substream or mainstream
  const getRtspChannel = (channel) => {
    const rtspChannels = channel.rtspChannels || [];

    if (rtspChannels.length === 2) {
      return rtspChannels[1]?.id || null; // Prefer substream
    }

    if (rtspChannels.length === 1) {
      return rtspChannels[0]?.id || null; // Use main stream if substream not available
    }

    return null;
  };

  // Get camera config with correct NVR details
  const getConfig = (channel) => {
    if (!selectedNvrDetails) return null;
    const streamBaseUrl = getStreamBaseUrl();
    const local_status = import.meta.env.VITE_LOCAL_SETUP;

    // Build streaming URL with base URL if not in local setup
    let streamUrl = channel?.streamingUrl || '';
    // if (streamUrl && local_status !== 'true') {
    //   streamUrl = streamBaseUrl + streamUrl;
    // }

    return {
      IP: selectedNvrDetails.ip,
      Port: selectedNvrDetails.rtspPort,
      Username: selectedNvrDetails.username,
      Password: selectedNvrDetails.password,
      ChannelId: channel.channelId,
      RtspChannel: getRtspChannel(channel),
      Resolution: '1280x720',
      streamUrl: streamUrl,
    };
  };

  // Initialize WebSocket connection

  // getting nvr names

  useEffect(() => {
    const fetchNvrNames = async () => {
      setNvrNameLoading(true);
      try {
        const response = await getNvrNames();
        if (response.statusCode === 200) {
          const nvrs = response.body.data.nvrs;
          setNvrList(nvrs);
          if (nvrs.length > 0) {
            const firstNvrId = nvrs[0]._id;
            setSelectedNvrId(firstNvrId);
            await getCamerasBasedOnNvrData(currentNvr && currentNvr?._id  );
          }
        } else {
          console.log('No NVRs found');
        }
      } catch (error) {
        console.error('Error fetching NVR names:', error);
      } finally {
        setNvrNameLoading(false);
      }
    };

    fetchNvrNames();
  }, []);

  const handleNvrChange = async (event) => {
    const selectedId = event.target.value;
    setSelectedNvrId(selectedId);
    getCamerasBasedOnNvrData(selectedId);
  };
useEffect(() => {
  if (!currentNvr || !currentNvr._id) return;

  getCamerasBasedOnNvrData(currentNvr._id);
}, [currentNvr && currentNvr._id]);


  // getting cameras based on nvr

 const getCamerasBasedOnNvrData = async (nvrId) => {
    const response = await getCamerasBasedOnNvr(nvrId);
    if (response && response.statusCode === 200) {
      const { channels} = response.body.data;
      const nvrData = response.body.data.channels?.[0]?.nvrId;
      setCameraChannels(channels);
      setSelectedNvrDetails(nvrData);
    }
  };

  // Auto-select first camera when cameraChannels change 
  // useEffect(() => {
  //   if (cameraChannels.length > 0) {
  //     handleCameraClick(cameraChannels[0]);
  //   }
  // }, [cameraChannels]);

  const handleCameraClick = (channel) => {
    const config = getConfig(channel);
    if (!config) return;
    setSelectedCamera(channel._id);
    setSelectedConfig(config); 
  };

  useEffect(() => {
    if (
      selectedChannelIds?.length > 0 &&
      cameraChannels.length > 0 &&
      !selectedCamera // only auto-select if nothing is selected yet
    ) {
      const firstMatchedCamera = cameraChannels.find((channel) =>
        selectedChannelIds.includes(channel._id)
      );
      if (firstMatchedCamera) {
        handleCameraClick(firstMatchedCamera);
      }
    }
  }, [selectedChannelIds, cameraChannels]);

  // Pass initial reference points to CameraStreamWithArea when selectedCamera changes
  useEffect(() => {
    if (!selectedCamera || !cameraChannels.length) return;
    const channelObj = cameraChannels.find(c => c._id === selectedCamera);
    if (!channelObj) return;
    const cameraId = channelObj._id;
    let pointsArr = undefined;
    // Support both new and old structure for effectiveInitialReferencePoints
    if (effectiveInitialReferencePoints?.[cameraId]) {
      if (Array.isArray(effectiveInitialReferencePoints[cameraId])) {
        pointsArr = effectiveInitialReferencePoints[cameraId];
      } else if (Array.isArray(effectiveInitialReferencePoints[cameraId].points)) {
        pointsArr = effectiveInitialReferencePoints[cameraId].points;
      }
    }
    if (Array.isArray(pointsArr) && cameraStreamRef.current && !initialPointsLoaded) {
      // Pass raw array (flat single polygon or nested multi-zone);
      // CameraStreamWithArea normalizes it internally.
      if (cameraStreamRef.current.setPoints) {
        cameraStreamRef.current.setPoints(pointsArr);
        setInitialPointsLoaded(true);
      }
    }
  }, [selectedCamera, cameraChannels, effectiveInitialReferencePoints, initialPointsLoaded]);


  // Save Settings handler
  const handleSaveSettings = () => {
    if (cameraStreamRef.current && selectedCamera) {
      const resolution = cameraStreamRef.current.getResolution();
      const zones = cameraStreamRef.current.getZones?.() || [];

      const channelObj = cameraChannels.find(c => c._id === selectedCamera);
      if (!channelObj) return null;

    const cameraId = channelObj._id;
    // const zoneName =  detectionSettingName || "Zone";

      const updated = {
        [cameraId]: zones,
        zone_name: zoneName,
      };

      const merged = { ...channelPoints, ...updated };

      setChannelPoints(merged);

      if (onAreaSettingsChange) {
        onAreaSettingsChange(resolution, merged);
      }

      // toast.success("Changes saved");

      return { resolution, referencePoints: merged };
    }
    return null;
  };

  // Expose helpers to the parent (LiveFeedSection / Zone Settings panel).
  useImperativeHandle(ref, () => ({
    saveSettings: handleSaveSettings,
    setChannelPoints: (pointsObj) => {
      if (!pointsObj || typeof pointsObj !== 'object') return;
      setChannelPoints(pointsObj);
      try {
        const channelIds = Object.keys(pointsObj);
        if (channelIds.length === 0) return;
        const firstCam = channelIds[0];
        const pts = pointsObj[firstCam];
        if (Array.isArray(pts) && cameraStreamRef.current && cameraStreamRef.current.setPoints) {
          // Pass raw array (flat or nested); CameraStreamWithArea normalizes it.
          cameraStreamRef.current.setPoints(pts);
          if (cameraStreamRef.current.setMoveMode) {
            cameraStreamRef.current.setMoveMode(true);
          }
        }
      } catch (e) {
        console.debug('[AreaSettingsPreview.setChannelPoints] error:', e);
      }
    },
    // Save edited zone_configs through the SAME save-area flow (same API/payload).
    saveZoneConfigs: (zoneConfigs) =>
      handleSaveAreaWithDetection({
        zoneName: appliedDetection?.settings?.referencePoints?.zone_name || '',
        detectionName: appliedDetection?.name || detectionSettingName || '',
        detectionEnabled: appliedDetection?.enabled || false,
        priority: appliedDetection?.settings?.levelOfImportance || 'moderate',
        zone_configs: zoneConfigs,
      }),
    // Delete one zone: drop its polygon from the canvas AND its zone_config,
    // then persist via the SAME save-area flow.
    deleteZone: (index, zoneConfigs) => {
      const ref = cameraStreamRef.current;
      const currentZones = ref?.getZones?.() || [];
      const nextZones = currentZones.filter((_, i) => i !== index);
      // Remove the polygon from the stream immediately.
      if (ref?.setZones) {
        ref.setZones(nextZones);
      } else if (ref?.setPoints) {
        ref.setPoints(nextZones);
      }
      const nextConfigs = (zoneConfigs || []).filter((_, i) => i !== index);
      return handleSaveAreaWithDetection({
        zoneName: appliedDetection?.settings?.referencePoints?.zone_name || '',
        detectionName: appliedDetection?.name || detectionSettingName || '',
        detectionEnabled: appliedDetection?.enabled || false,
        priority: appliedDetection?.settings?.levelOfImportance || 'moderate',
        zone_configs: nextConfigs,
        zonesOverride: nextZones,
        // Allow deleting the LAST zone — the empty state must still persist,
        // otherwise the canvas clears but the zone_config stays on the server.
        allowEmpty: true,
      });
    },
  }));

  // Save area with detection settings
  const handleSaveAreaWithDetection = async ({
    zoneName,
    detectionName,
    detectionEnabled,
    priority,obstruction_threshold_sec,
    zone_configs,
    // Optional explicit polygons (used by delete, which has already computed the
    // spliced zones and can't rely on getZones() before the canvas re-renders).
    zonesOverride,
    // Allow persisting an empty area (used by Clear All to wipe zones on server).
    allowEmpty = false
  }) => {
    setIsSaving(true);
    if (!selectedCamera || !cameraStreamRef.current) {
      toast.error('Please select a camera first');
      setIsSaving(false);
      return;
    }

    // Validate required fields: detection type and zone name
    if (!selectedsettingType) {
      toast.error('Please select a detection type');
      return;
    }


    const zone = (localZoneName || detectionSettingName || '').toString();
    // if (!zone || zone.trim() === '') {
    //   toast.error('Please enter a zone name');
    //   return;
    // }

    // Multi-zone: nested array of polygons [[ [x,y], ... ], ...]
    const zones = Array.isArray(zonesOverride)
      ? zonesOverride
      : (cameraStreamRef.current.getZones?.() || []);
    const points = zones.flat();
    if (!allowEmpty && (!zones.length || !points.length)) {
      toast.error('Please draw an area first');
      setIsSaving(false);
      return;
    }

    try {
      const channelObj = cameraChannels?.find(c => c?._id === selectedCamera);
      if (!channelObj) {
        toast.error('Camera not found');
        return;
      }

      const cameraId = channelObj?._id;
      // const zoneName = detectionSettingName || "Zone";

 // Get resolution from camera stream
    const resolution = cameraStreamRef.current.getResolution?.() || '1280x720'; 
      const pay = {
        "name": detectionName,
        "enabled": false,
        "settingType": selectedsettingType,
        NVRId: currentNvr._id,
        "channelId": [
          cameraId
        ],
        "settings": {
          levelOfImportance:priority,
          referencePoints: {
            // nested array of zones: [[ [x,y], ... ], [ [x,y], ... ]]
            [cameraId]: zones,
            zone_name: zoneName,
          },
          obstruction_threshold_sec: obstruction_threshold_sec,
          videoResolution: resolution
        }

      }
      // Desk Absence only: attach per-zone config inside settings.
      if (selectedsettingType === 'deskAbsenceSettings' && Array.isArray(zone_configs)) {
        pay.settings.zone_configs = zone_configs;
      }
      // Build an edited detection object for logging / editing flows
      const editedDetection = {
        ...detectionSetting,
        name: zone,
        enabled: localZoneEnabled,
        detectionType: selectedsettingType || localSelectedType,
        settings: {
          ...(detectionSetting?.settings || {}),
          referencePoints: {
            ...(detectionSetting?.settings?.referencePoints || {}),
            [cameraId]: zones,
          },
          videoResolution: resolution,
        },
      };
      // TEMP: inspect the exact payload (zones per camera) being sent
      console.log('[detection-settings] payload =>', JSON.stringify(pay, null, 2));
      try {
        let resp;
        let success = false;
        const detectionId =localDetection?._id || localDetection?.id;
        if (detectionId) {
          resp = await updateDetectionSettings(detectionId, pay);
          if (resp?.data?.statusCode === 200 || resp?.status === 200 || resp?.status === 201) {
             toast.success(resp?.data?.body?.message);
            success = true;
          } else {
            toast.error('Failed to update detection');
          }
        } else {
          // Create new detection setting
          resp = await addNewDetectionConfiguration(pay);
          if (resp?.data?.statusCode == 200 || resp?.status === 200 || resp?.status === 201 || resp?.data?.status === 'success') {
          toast.success(resp?.data?.body?.message);
            success = true;
          } else {
            toast.error('Failed to save area: ' + (resp?.message || 'Unknown error'));
          }
        }

        if (success) {
          // Update local UI state so the edited detection appears immediately
          setLocalSelectedType(localSelectedType);
          setLocalZoneName(zone);
          setLocalZoneEnabled(localZoneEnabled);

          // savedZones: nested array of polygons for this channel
          const savedZones = zones;
          setChannelPoints(prev => ({ ...prev, [cameraId]: savedZones }));

          // Also push zones into the camera stream component so it reflects changes
          if (cameraStreamRef.current?.setPoints) {
            cameraStreamRef.current.setPoints(savedZones);
          }

          // mark initial points as loaded so we don't override user edits
          setInitialPointsLoaded(true);

          // Build updated detection object to pass back to parent
          const updatedDetection = {
            ...(activeDs || detectionSetting || {}),
            name: zone,
            enabled: localZoneEnabled,
            settings: {
              ...((activeDs || detectionSetting)?.settings || {}),
              referencePoints: {
                ...((activeDs || detectionSetting)?.settings?.referencePoints || {}),
                [cameraId]: savedZones,
              },
              videoResolution: resolution,
            },
          };

          // Notify parent with updated detection so it doesn't have to refetch
          // if (typeof onDetectionSaved === 'function') {
          //   try {
          //     onDetectionSaved(updatedDetection);
          //   } catch (e) {
          //     console.debug('[AreaSettingsPreview] onDetectionSaved callback threw:', e);
          //   }
          // }

          // Keep localDetection and edit-mode in sync so parent prop changes won't wipe local UI
          // try {
          //   setLocalDetection(updatedDetection);
          //   setIsEditMode(true);
          //   // Reset the flag so that if user selects a NEW detection, sync effect can load its values fresh
          //   setHasUserEditedLocally(false);
          // } catch (e) {
          //   console.debug('[AreaSettingsPreview] setLocalDetection/setIsEditMode threw:', e);
          // }

            // Notify parent area change if provided
            if (onAreaSettingsChange) {
              const resolutionArr = Array.isArray(resolution) ? resolution : (Array.isArray(cameraStreamRef.current?.getResolution?.()) ? cameraStreamRef.current.getResolution() : [1280,720]);
              onAreaSettingsChange(resolutionArr, { ...channelPoints, [cameraId]: savedZones });
            }
        }
      } catch (err) {
        const message = err?.response?.data?.body?.message || err?.message || 'Server error';
        toast.error(message);
      }

  // if(){

  // }
  // else{

  // }

      // If this is an update (editing existing), use updateDetectionSettings with id
      // For now, just show the payload and toast success
      // toast.success('Area marked and saved successfully');

      // Optional: Call API if you have a detection setting ID
      // const response = await updateDetectionSettings(settingId, payload);
      // if (response?.data?.statusCode === 200) {
      //   toast.success('Detection settings updated');
      // }
    } catch (err) {
      console.error('Error saving area:', err);
      toast.error(err?.message || 'Failed to save area');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
  if (!activeCamera || !cameraChannels.length) return;

  const channelObj = cameraChannels.find(c => c._id === activeCamera);
  if (!channelObj) return;

  handleCameraClick(channelObj);
}, [activeCamera, cameraChannels]);

  // Area marking controls (moved to separate component)

  return (
    <div className="w-full rounded-[10px] px-2 sm:px-4 md:px-5 py-2">
{/* 
      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white p-4 rounded shadow flex items-center gap-3">
            <div className="loader" style={{width:24,height:24,border:'3px solid #ddd',borderTop:'3px solid #07486A',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
            <div className="text-sm font-medium">Saving detection...</div>
          </div>
        </div>
      )} */}

      {/* Prefill / Edit controls for detection setting */}
      {/* <div className="w-full flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-600">Detection Type</label>
          <input
            type="text"
            value={localSelectedType}
            onChange={(e) => setLocalSelectedType(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded text-sm"
            placeholder="e.g. fireSmokeDetection"
          />
        </div>

        <div className="flex-1 min-w-0">
          <label className="text-xs text-gray-600">Zone Name</label>
          <input
            type="text"
            value={localZoneName}
            onChange={(e) => setLocalZoneName(e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded text-sm"
            placeholder="Enter zone name"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Enabled</label>
          <input
            type="checkbox"
            checked={!!localZoneEnabled}
            onChange={(e) => setLocalZoneEnabled(e.target.checked)}
            className="w-4 h-4"
          />
        </div>
      </div> */}
      {/* Responsive Camera Preview */}
      <div className="w-full">
        <div className="relative aspect-video overflow-hidden ">
          {selectedConfig ? (
            <CameraStreamWithArea
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            hasError={hasError}
            setHasError={setHasError}
              ref={cameraStreamRef}
              key={selectedCamera}
              config={selectedConfig}
              hlsUrl={selectedConfig?.streamUrl ?? ' '}
              maxminBtnclass="absolute top-[12px] right-2 bg-[#3f3f3f80] backdrop-blur-[106.64466094970703px] text-white w-[29px] h-[29px] rounded-full flex justify-center items-center"
              maxsize="2xl:text-[18px] text-sm"
              minsize="2xl:text-[18px] text-sm"
              selectedVideo={selectedVideo}
              setSelectedVideo={setSelectedVideo}
             initialPoints={(() => {
               const channelObj = cameraChannels.find(c => c._id === selectedCamera);
               if (!channelObj) return [];

               const cameraId = channelObj._id;
               let pointsArr = [];

               //  Prefer saved channelPoints
               const pointsData = channelPoints[cameraId];
               if (Array.isArray(pointsData)) {
                 pointsArr = pointsData;
               } else if (Array.isArray(pointsData?.points)) {
                 pointsArr = pointsData.points;
               }
               //  Only fallback to effectiveInitialReferencePoints if not yet deleted/cleared
               else if (!initialPointsLoaded && effectiveInitialReferencePoints?.[cameraId]) {
                 if (Array.isArray(effectiveInitialReferencePoints[cameraId])) {
                   pointsArr = effectiveInitialReferencePoints[cameraId];
                 } else if (Array.isArray(effectiveInitialReferencePoints[cameraId]?.points)) {
                   pointsArr = effectiveInitialReferencePoints[cameraId].points;
                 }
               }

               // Pass raw array (flat single polygon or nested multi-zone);
               // CameraStreamWithArea normalizes it into zones internally.
               return pointsArr;
           })()}
              // Desk Absence: label each polygon with its saved zone name.
              zoneNames={
                selectedsettingType === 'deskAbsenceSettings'
                  ? (appliedDetection?.settings?.zone_configs || []).map(
                      (z) => z?.name || ''
                    )
                  : []
              }
              drawingMode={drawingMode}
              moveMode={moveMode}
            />
          ) : (
            <Skeleton className="w-full h-full" />
          )}
          {/* Timestamp */}
          {/* <div className="absolute top-3 right-12 text-white text-xs md:text-sm bg-black/50 px-2 py-1 rounded">
          <DynamicDateTime className="!text-white" />
        </div> */}
          {/* Label */}
          {/* <div className="absolute bottom-2 left-2 text-white text-xs md:text-sm font-medium shadow">
          Front Gate 1
        </div> */}
        </div>
        {/* Action Buttons - moved to `AreaMarkingControls` for clarity */}
       {(editPermission == true || createPermission == true )&& <AreaMarkingControls
        setMoveMode={setMoveMode}
        setDrawingMode={setDrawingMode}
             hasError={hasError}
            // setHasError={setHasError}
            isLoading={isLoading}
          appliedDetection={appliedDetection }
          selectedType={localSelectedType}
          selectedsettingType={selectedsettingType}
          cameraStreamRef={cameraStreamRef}
          handleOpenModal={handleOpenModal}
          nvrNameLoading={nvrNameLoading}
          drawingMode={drawingMode}
          moveMode={moveMode}
          setIsEditing={setIsEditing}
          handleToggleDrawing={handleToggleDrawing}
          handleDeleteArea={handleDeleteArea}
          handleMinArea={handleMinArea}
          handleMaxArea={handleMaxArea}
          handleSingleLinePlacement={handleSingleLinePlacement}
          handleEnableEdit={handleEnableEdit}
          onEnableEdit={() => setInitialPointsLoaded(true)}
          handleSaveAreaWithDetection={handleSaveAreaWithDetection}
          onClearZoneConfigs={onClearZoneConfigs}
          onClearAll={() => {
            // Clear the parent-held points for ALL detection types so the
            // canvas stays empty and the saved reference points are not
            // re-applied after a local canvas clear.
            manuallyClearedRef.current = true;
            setChannelPoints({});
            setInitialPointsLoaded(true);
          }}
          onClearAllPersist={() => {
            // Desk Absence with a saved detection: persist the cleared (empty)
            // state so re-selecting the detection doesn't restore the zones.
            const detectionId = localDetection?._id || localDetection?.id;
            if (selectedsettingType === 'deskAbsenceSettings' && detectionId) {
              return handleSaveAreaWithDetection({
                zoneName: '',
                detectionName: appliedDetection?.name || detectionSettingName || '',
                detectionEnabled: appliedDetection?.enabled || false,
                priority: appliedDetection?.settings?.levelOfImportance || 'moderate',
                zone_configs: [],
                zonesOverride: [],
                allowEmpty: true,
              });
            }
          }}
        />}
      </div>
      {/* Footer CTA - responsive */}
      {/* <div className="flex flex-wrap items-center justify-start gap-4 mt-6">
        {nvrNameLoading ? (
          Array.from({ length: 1 }).map((_, idx) => (
            <Skeleton key={idx} width={130} height={40} borderRadius={16} />
          ))
        ) : (
          <>
            <button
              type="button"
              disabled={loadingPreviewImg}
              className={`flex items-center gap-1 sm:gap-2 text-[#07486A] border border-[#07486A] px-3 sm:px-5 py-1.5 sm:py-2 rounded-[20px] sm:rounded-[24px] text-xs sm:text-sm transition hover:bg-[#07486A]/10 ${loadingPreviewImg ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={async () => {
                setModalType('preview');
                setProcessedImage(null);
                setLoadingPreviewImg(true);
                if (cameraStreamRef.current?.captureScreenshot) {
                  try {
                    const imgData = await cameraStreamRef.current.captureScreenshot({ base64Only: true, noOverlay: true });
                    if (!imgData) {
                      console.error('Failed to capture screenshot');
                      return;
                    }
                    const points = cameraStreamRef.current.getPoints();
                    const resolution = [1280, 720];
                    const base64Data = imgData.replace(/^data:image\/jpeg;base64,/, '');

                    const response = await callMarkPointsApi(base64Data, resolution, points);
                    if (response?.status === 200 && response.data?.processed_image) {
                      setProcessedImage(response.data.processed_image);
                    }
                  } catch (err) {
                    console.error('Error processing screenshot:', err);
                  } finally {
                    setLoadingPreviewImg(false);
                  }
                } else {
                  setLoadingPreviewImg(false);
                }
              }}
            >
              <CirclePlay className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Preview
            </button> */}
            {/* MiniCameraPreview Modal for Preview */}
            {/* {modalType === 'preview' && (
              <DetectionPreviewModal isOpen={true} onClose={() => setModalType('')}>
                <MiniCameraPreview processedImage={processedImage} loadingPreviewImg={loadingPreviewImg} />
              </DetectionPreviewModal>
            )} */}
            {/* <button
              type="button"
              className="bg-[#07486A] cursor-pointer text-white px-4 sm:px-6 py-1.5 sm:py-2.5 rounded-[20px] sm:rounded-[32px] text-xs sm:text-sm font-[400] hover:bg-[#07486A]/90 flex items-center gap-1 sm:gap-2"
              onClick={handleSaveAreaWithDetection}
            >
              <img src={save} alt="save button" className="w-4 h-4 sm:w-5 sm:h-5" />
              Save Area
            </button> */}
          {/* </>
        )}
      </div> */}
      <ConfirmationModal
        open={modalOpen}
        message={modalType === 'clear' ? 'Are you sure you want to clear all areas?' : 'Are you sure you want to delete this area?'}
        icon={modalIcon}
        onClose={() => setModalOpen(false)}
        onConfirm={() => {
          setModalOpen(false);
          if (!cameraStreamRef.current || !selectedCamera) return;

          if (modalType === 'delete') {
            // 1. Delete the active area from canvas
            handleDeleteArea();

            // 2. Remove points of current camera from state
            setChannelPoints(prev => {
              const updated = { ...prev };
              delete updated[selectedCamera];
              return updated;
            });

            // 3. Reset initialPointsLoaded so deleted state persists
            setInitialPointsLoaded(true);

            toast.success("Area deleted");
          }

          if (modalType === 'clear') {
            // 1. Clear all points from canvas
            if (cameraStreamRef.current.setPoints) cameraStreamRef.current.setPoints([]);

            // 2. Clear all saved points
            setChannelPoints({});

            // 3. Prevent reapplying initialReferencePoints
            setInitialPointsLoaded(true);

            toast.success("All areas cleared");
          }
        }}
        confirmLabel={modalType === 'clear' ? 'Clear' : 'Delete'}
        cancelLabel="Cancel"
        confirmClass={modalType === 'clear' ? 'bg-[#07486A] text-white hover:bg-[#07486A]/90' : 'bg-[#07486A] text-white hover:bg-[#07486A]/90'}
      />
    </div>
  );
});

export default AreaSettingsPreview;
