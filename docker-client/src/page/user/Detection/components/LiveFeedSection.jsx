import React, { useState, useRef, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getAllDetectionTypes, getAppliedProfile, getDetectionSettingType } from '../Api/get'; // Re-hook API calls
import AreaSettingsPreview from './AreaSettingsPreview';
import { toast } from 'sonner';
import { Edit } from 'lucide-react';

const LiveFeedSection = ({
  channelData,
  setAppliedDetection,
  appliedDetection,
  selectedsettingType,
  setSelectedsettingType,
  currentNvr

}) => {
  const channelId = channelData?.linkedCameras[0]?._id || null;
  const previewRef = useRef();

  const [detectionOptions, setDetectionOptions] = useState([]);
  const [selectedDetection, setSelectedDetection] = useState('');

  const [zoneName, setZoneName] = useState('');
  const [zoneEnabled, setZoneEnabled] = useState(false);
  const [areaResult, setAreaResult] = useState(null);
  const [latestPreviewPoints, setLatestPreviewPoints] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [createdDetectionSet, setCreatedDetectionSet] = useState(new Set());

  const fetchAppliedProfile = async (id = channelId) => {
    if (!id) return;

    try {
      const res = await getAppliedProfile(id);

      if (res?.data?.body?.status === "success") {
        const detectionSettingObj =
          res?.data?.body?.data?.channel?.detections|| {};
        const keys = Object.keys(detectionSettingObj)
        setCreatedDetectionSet(detectionSettingObj); // 🔥 important
      }
    } catch (err) {
      console.error("Error fetching applied profile", err);
    }
  }; 

  // Fetch detection types once
  useEffect(() => {
    const fetchDetectionTypes = async () => {
      try {
        const res = await getAllDetectionTypes();
        if (res?.data?.body?.status === 'success') {
          const options = Object.entries(res.data.body.data.detectionTypes).map(
            ([key, label]) => ({ id: key, label })
          );
          setDetectionOptions(options);
        }
      } catch (err) {
        console.error('Failed to fetch detection types:', err);
      }
    };
    fetchDetectionTypes();
  }, []);

  const getEnabledDetections = (options, settings) => {

    const result = options.filter((opt) => {
      const setting = settings?.[opt.id];
 

      return setting?.enabled === true;
    });

    return result;
  };

  useEffect(() => {
  fetchAppliedProfile(channelId);
  }, [selectedsettingType]);

const enableDetectionOptions = getEnabledDetections(detectionOptions, createdDetectionSet);

  const selectedChannelIds = (channelData?.linkedCameras || []).map(
    (c) => c._id
  );
  const defaultActiveCamera =
    selectedChannelIds.length > 0 ? selectedChannelIds[0] : null;

  // Normalize reference points safely
  const normalizedReferencePoints = (() => {
    const refPoints = appliedDetection?.settings?.referencePoints;
    if (!refPoints || typeof refPoints !== 'object') return {};
    return refPoints;
  })();

  // Find active camera based on reference points or fallback to default
  const derivedActiveCamera = (() => {
    const keys = Object.keys(normalizedReferencePoints || {});
    if (keys.length > 0) {
      const matched = keys.find((k) => selectedChannelIds.includes(k));
      if (matched) return matched;
      return keys[0];
    }
    return defaultActiveCamera;
  })();

  // Handle selection and load detection setting
//   const handlesettingType = async (type) => {
//     try {
//       if (!type) {
//         setAppliedDetection(null);
//         return;
//       }

//       const resp = await getDetectionSettingType(type, channelId);
//       let ds = resp?.data?.body?.data?.detectionSettings;
// console.log('Fetched detection setting:', ds);


//       if (!ds || (Array.isArray(ds) && ds.length === 0)) {
//         setAppliedDetection(null);
//         return;
//       }

//       if (Array.isArray(ds)) ds = ds[0];
//       if (ds?.detectionSetting) ds = ds.detectionSetting;
//       if (ds && !ds._id) ds._id = ds.id || ds.detectionId || null;

//       const rp = ds?.settings?.referencePoints;
//       let refObj = {};
//       if (Array.isArray(rp)) {
//         const camId =
//           ds?.linkedCameras?.[0]?._id || defaultActiveCamera || null;
//         if (camId) refObj = { [camId]: rp };
//       } else if (rp && typeof rp === 'object') {
//         refObj = rp;
//       }

//       ds.settings = { ...ds.settings, referencePoints: refObj ,linkedCameras:ds[0]?.linkedCameras};
//       setAppliedDetection(ds);
//       setIsEditing(false);
//       setLatestPreviewPoints(null);
//     } catch (err) {
//       console.error('Error in detection loading:', err);
//       setAppliedDetection(null);
//       setIsEditing(false);
//     }
//   };
const handlesettingType = async (type) => {
  try {
    if (!type) {
      setAppliedDetection(null);
      return;
    }

    const resp = await getDetectionSettingType(type, channelId);
    let ds = resp?.data?.body?.data?.detectionSettings;

    console.log('Fetched detection setting:', ds);

    if (!ds || (Array.isArray(ds) && ds.length === 0)) {
      setAppliedDetection(null);
      return;
    }

    // If array → take first object
    if (Array.isArray(ds)) ds = ds[0];

    // 🔥 Preserve linkedCameras BEFORE overriding ds
    const linkedCameras = ds?.linkedCameras || [];

    // If nested detectionSetting exists → merge safely
    if (ds?.detectionSetting) {
      ds = {
        ...ds.detectionSetting,
        linkedCameras, // restore cameras
      };
    }

    // Normalize _id
    if (ds && !ds._id) {
      ds._id = ds.id || ds.detectionId || null;
    }

    // 🔥 Handle referencePoints conversion
    const rp = ds?.settings?.referencePoints;
    let refObj = {};

    if (Array.isArray(rp)) {
      const camId =
        linkedCameras?.[0]?._id || defaultActiveCamera || null;

      if (camId) {
        refObj = { [camId]: rp };
      }
    } else if (rp && typeof rp === 'object') {
      refObj = rp;
    }

    ds.settings = {
      ...ds.settings,
      referencePoints: refObj,
    };

    setAppliedDetection(ds);
    setIsEditing(false);
    setLatestPreviewPoints(null);

  } catch (err) {
    console.error('Error in detection loading:', err);
    setAppliedDetection(null);
    setIsEditing(false);
  }
};


  useEffect(() => {
    if (selectedDetection) handlesettingType(selectedDetection);
    else {
      setAppliedDetection(null);
      setZoneName('');
      setZoneEnabled(false);
      setIsEditing(false);
      setLatestPreviewPoints(null);
    }
  }, [selectedDetection]);

  useEffect(() => {
    if (!areaResult || !selectedDetection) return;
    handlesettingType(selectedDetection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaResult]);


  useEffect(() => {
    if (!appliedDetection) {
      setZoneName('');
      setZoneEnabled(false);
      return;
    }
    const name =
      appliedDetection?.name || appliedDetection?.detectionName || '';
    setZoneName(name);
    if (typeof appliedDetection?.enabled === 'boolean')
      // setZoneEnabled(appliedDetection.enabled);  
      setZoneEnabled(appliedDetection?.linkedCameras[0].detections[selectedsettingType]?.enabled);

  }, [appliedDetection]);

  // Preview points change handler
  const handlePreviewPointsChange = (refPoints) =>
    setLatestPreviewPoints(refPoints);

  // Apply current points to preview
  const applyPointsToPreview = () => {
    const points = normalizedReferencePoints || {};
    if (
      previewRef.current &&
      typeof previewRef.current.setChannelPoints === 'function'
    ) {
      previewRef.current.setChannelPoints(points);
      setIsEditing(true);
      setLatestPreviewPoints(points);
    } else {
      console.warn("Preview ref doesn't expose setChannelPoints");
    }
  };

  // Save edited points locally
  const saveEditedPoints = () => {
    if (!latestPreviewPoints) {
      toast.error('No edited points available to save.');
      return;
    }
    const updated = {
      ...(appliedDetection || {}),
      settings: {
        ...(appliedDetection?.settings || {}),
        referencePoints: latestPreviewPoints,
      },
    };
    setAppliedDetection(updated);
    setAreaResult({ resolution: null, merged: updated });
    toast.success(
      'Points updated locally. Click Save inside detection dialog to persist to server if required.'
    );
    setIsEditing(false);
  };

  // Component to render label with optional green dot
  const DetectionLabel = ({ label, isCreated }) => (
    <div className="flex items-center gap-1">
      {isCreated && (
        <span className="text-green-500 text-xs leading-none">●</span>
      )}
      <span className="text-xs leading-tight">{label}</span>
    </div>
  );  

  return (
    <>
      {/* Section Title - Moved Outside */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <Edit className="w-4 h-4 text-[#07486A]" strokeWidth={2.5} />
        <h2 className="text-sm font-bold text-[#334155] uppercase tracking-wider">
          Zone Marking
        </h2>
      </div>

      <div className="bg-white border border-[#E6E6E6] rounded-[15px] overflow-hidden shadow-sm">
        {/* Zone Marking Controls Header */}
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-5 py-3.5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:flex items-center gap-3">
            {/* Detection Type Select */}
            <div className="flex flex-col gap-1 lg:flex-1 min-w-[200px]">
              <label className="text-[10px] font-semibold text-[#64748B] uppercase px-1">
                Detection Type
              </label>
              <Select
                value={selectedsettingType}
                onOpenChange={(open) => {
                  if (open) fetchAppliedProfile(channelId);
                }}
                onValueChange={(value) => {
                  setSelectedDetection(value);
                  setSelectedsettingType(value);
                }}
              >
                <SelectTrigger className="w-full border-[#CBD5E1] cursor-pointer rounded-lg h-9 px-3 text-xs bg-white hover:border-[#94A3B8] focus:ring-2 focus:ring-[#07486A]/20 focus:border-[#07486A] transition-all">
                  <SelectValue placeholder="Select Detection Type" />
                </SelectTrigger>
                <SelectContent
                  className="bg-white border border-[#CBD5E1] rounded-lg shadow-xl z-50"
                  side="bottom"
                  align="start"
                >
                  {detectionOptions.map((opt) => {
                    const isCreated = enableDetectionOptions?.some(
                      (item) => item.id === opt.id
                    );
                    return (
                      <SelectItem
                        key={opt.id}
                        value={opt.id}
                        className="cursor-pointer text-xs py-2"
                      >
                        <DetectionLabel
                          label={opt.label}
                          isCreated={isCreated}
                        />
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Detection Name Input */}
            {appliedDetection !== null && (
              <div className="flex flex-col gap-1 lg:flex-1 min-w-[150px]">
                <label className="text-[10px] font-semibold text-[#64748B] uppercase px-1">
                  Detection Name
                </label>
                <input
                  className="w-full h-9 px-3 text-xs rounded-lg border border-[#CBD5E1] bg-[#F1F5F9] text-[#475569] font-medium placeholder:italic"
                  placeholder="Detection Name"
                  title="Detection Name"
                  value={appliedDetection?.name || ''}
                  readOnly
                />
              </div>
            )}

            {/* Zone Name Input */}
            {appliedDetection !== null && (
              <div className="flex flex-col gap-1 lg:flex-1 min-w-[150px]">
                <label className="text-[10px] font-semibold text-[#64748B] uppercase px-1">
                  Zone Name
                </label>
                <input
                  className="w-full h-9 px-3 text-xs rounded-lg border border-[#CBD5E1] bg-[#F1F5F9] text-[#475569] font-medium placeholder:italic"
                  placeholder="Zone Name"
                  title="Zone Name"
                  value={
                    appliedDetection?.settings?.referencePoints?.zone_name || ''
                  }
                  readOnly
                />
              </div>
            )}

            {/* Enable Switch & Edit Button */}
            <div className="flex items-end gap-2 lg:ml-auto pt-4">
              {/* {appliedDetection !== null && (
                <div className="flex items-center h-9 px-2 border border-[#CBD5E1] bg-white rounded-lg shadow-sm">
                  <Switch
                    disabled
                    checked={zoneEnabled}
                    onCheckedChange={setZoneEnabled}
                    className="data-[state=checked]:bg-[#07486A] scale-[0.8]"
                  />
                </div>
              )} */}

              {appliedDetection !== null && (
                <div className="flex items-center">
                  {!isEditing && (
                    <Button
                      size="sm"
                      onClick={applyPointsToPreview}
                      className="h-9 px-3 bg-[#07486A] hover:bg-[#063b57] text-white rounded-lg text-xs font-semibold shadow-md transition-all active:scale-95"
                    >
                      Edit
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4">
          <AreaSettingsPreview
            ref={previewRef}
            currentNvr={currentNvr}
            key={selectedDetection + (appliedDetection?._id || '')}
            selectedType={selectedDetection}
            activeCamera={derivedActiveCamera}
            selectedsettingType={selectedsettingType}
            cameraList={channelData?.linkedCameras || []}
            selectedChannelIds={selectedChannelIds}
            isModal={false}
            onAreaSettingsChange={(resolution, merged) => {
              setAreaResult({ resolution, merged });
              if (merged) setAppliedDetection(merged);
            }}
            onDetectionSaved={(savedDetection) => {
              if (savedDetection) setAppliedDetection(savedDetection);
            }}
            detectionSetting={appliedDetection}
            appliedDetection={appliedDetection}
            initialReferencePoints={normalizedReferencePoints}
            zoneEnabled={zoneEnabled}
            zoneName={zoneName}
            detectionOptions={detectionOptions}
            onPointsChange={(refPoints) => handlePreviewPointsChange(refPoints)}
            editable={isEditing}
          />
        </div>
      </div>
    </>
  );
};

export default LiveFeedSection;
