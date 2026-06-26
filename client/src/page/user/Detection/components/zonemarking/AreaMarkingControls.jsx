import React, { useState } from 'react';
import { BrushCleaning, SaveAll, TriangleAlert, ChevronDown, Undo2 } from 'lucide-react';
import { FaRegStopCircle } from 'react-icons/fa';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import ConfirmationModal from '../DeleteConfirmation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


// SVG constants for action buttons
const MaxAreaSVG = (
  <svg
    width="21"
    height="20"
    viewBox="0 0 21 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g clipPath="url(#clip0_1818_49334)">
      <path
        d="M0.5 5H1.75V13.75H0.5V5ZM20.5 5V13.75H19.25V5H20.5ZM15.3145 6.2793L18.4199 9.375L15.3145 12.4707L14.4355 11.5918L16.0176 10H5.13867L6.7207 11.5918L5.8418 12.4707L2.74609 9.375L5.8418 6.2793L6.7207 7.1582L5.13867 8.75H16.0176L14.4355 7.1582L15.3145 6.2793Z"
        fill="#595959"
        className="transition-colors group-hover:fill-[#07486A]"
      />
    </g>
    <defs>
      <clipPath id="clip0_1818_49334">
        <rect width="20" height="20" fill="white" transform="translate(0.5)" />
      </clipPath>
    </defs>
  </svg>
);

const MinAreaSVG = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 5H11.25V13.75H10V5ZM7.5 5H8.75V13.75H7.5V5ZM18.75 10H14.6387L16.2207 11.5918L15.3418 12.4707L12.2461 9.375L15.3418 6.2793L16.2207 7.1582L14.6387 8.75H18.75V10ZM3.4082 6.2793L6.50391 9.375L3.4082 12.4707L2.5293 11.5918L4.11133 10H0V8.75H4.11133L2.5293 7.1582L3.4082 6.2793Z"
      fill="#595959"
      className="transition-colors group-hover:fill-[#07486A]"
    />
  </svg>
);

const DeleteAreaSVG = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M16.875 13.8394V6.16191C17.3015 6.05261 17.6915 5.83241 18.0053 5.52365C18.3192 5.21489 18.5458 4.82858 18.6621 4.40393C18.7783 3.97928 18.7802 3.53143 18.6674 3.10584C18.5546 2.68026 18.3312 2.29209 18.0199 1.98077C17.7085 1.66944 17.3204 1.44605 16.8948 1.33326C16.4692 1.22047 16.0214 1.22231 15.5967 1.33858C15.1721 1.45486 14.7858 1.68144 14.477 1.99531C14.1682 2.30918 13.948 2.69916 13.8387 3.12566H6.16124C6.05194 2.69916 5.83174 2.30918 5.52298 1.99531C5.21422 1.68144 4.82791 1.45486 4.40326 1.33858C3.97861 1.22231 3.53076 1.22047 3.10517 1.33326C2.67958 1.44605 2.29142 1.66944 1.9801 1.98077C1.66877 2.29209 1.44537 2.68026 1.33259 3.10584C1.2198 3.53143 1.22164 3.97928 1.33791 4.40393C1.45419 4.82858 1.68077 5.21489 1.99464 5.52365C2.3085 5.83241 2.69849 6.05261 3.12499 6.16191V13.8394C2.69849 13.9487 2.3085 14.1689 1.99464 14.4777C1.68077 14.7864 1.45419 15.1727 1.33791 15.5974C1.22164 16.022 1.2198 16.4699 1.33259 16.8955C1.44537 17.3211 1.66877 17.7092 1.9801 18.0205C2.29142 18.3319 2.67958 18.5553 3.10517 18.6681C3.53076 18.7808 3.97861 18.779 4.40326 18.6627C4.82791 18.5465 5.21422 18.3199 5.52298 18.006C5.83174 17.6921 6.05194 17.3022 6.16124 16.8757H13.8387C13.948 17.3022 14.1682 17.6921 14.477 18.006C14.7858 18.3199 15.1721 18.5465 15.5967 18.6627C16.0214 18.779 16.4692 18.7808 16.8948 18.6681C17.3204 18.5553 17.7085 18.3319 18.0199 18.0205C18.3312 17.7092 18.5546 17.3211 18.6674 16.8955C18.7802 16.4699 18.7783 16.022 18.6621 15.5974C18.5458 15.1727 18.3192 14.7864 18.0053 14.4777C17.6915 14.1689 17.3015 13.9487 16.875 13.8394ZM16.25 2.50066C16.4972 2.50066 16.7389 2.57397 16.9444 2.71132C17.15 2.84867 17.3102 3.04389 17.4048 3.2723C17.4994 3.50071 17.5242 3.75204 17.476 3.99452C17.4277 4.237 17.3087 4.45972 17.1339 4.63454C16.9591 4.80936 16.7363 4.92841 16.4938 4.97664C16.2514 5.02487 16 5.00012 15.7716 4.90551C15.5432 4.8109 15.348 4.65068 15.2106 4.44512C15.0733 4.23956 15 3.99788 15 3.75066C15 3.41914 15.1317 3.10119 15.3661 2.86677C15.6005 2.63235 15.9185 2.50066 16.25 2.50066ZM2.49999 3.75066C2.49999 3.50343 2.5733 3.26176 2.71065 3.05619C2.848 2.85063 3.04322 2.69042 3.27163 2.59581C3.50004 2.5012 3.75137 2.47644 3.99385 2.52468C4.23632 2.57291 4.45905 2.69196 4.63387 2.86677C4.80868 3.04159 4.92774 3.26432 4.97597 3.50679C5.0242 3.74927 4.99944 4.0006 4.90483 4.22901C4.81023 4.45742 4.65001 4.65264 4.44445 4.78999C4.23889 4.92735 3.99721 5.00066 3.74999 5.00066C3.41846 5.00066 3.10052 4.86896 2.8661 4.63454C2.63168 4.40012 2.49999 4.08218 2.49999 3.75066ZM3.74999 17.5007C3.50276 17.5007 3.26108 17.4273 3.05552 17.29C2.84996 17.1526 2.68975 16.9574 2.59514 16.729C2.50053 16.5006 2.47577 16.2493 2.524 16.0068C2.57224 15.7643 2.69129 15.5416 2.8661 15.3668C3.04092 15.192 3.26365 15.0729 3.50612 15.0247C3.7486 14.9764 3.99993 15.0012 4.22834 15.0958C4.45675 15.1904 4.65197 15.3506 4.78932 15.5562C4.92667 15.7618 4.99999 16.0034 4.99999 16.2507C4.99999 16.5822 4.86829 16.9001 4.63387 17.1345C4.39945 17.369 4.08151 17.5007 3.74999 17.5007ZM13.8387 15.6257H6.16124C6.04892 15.1961 5.82425 14.8043 5.51032 14.4903C5.19639 14.1764 4.80451 13.9517 4.37499 13.8394V6.16191C4.80451 6.04959 5.19639 5.82492 5.51032 5.51099C5.82425 5.19706 6.04892 4.80519 6.16124 4.37566H13.8387C13.951 4.80519 14.1757 5.19706 14.4897 5.51099C14.8036 5.82492 15.1955 6.04959 15.625 6.16191V13.8394C15.1952 13.9511 14.803 14.1756 14.4889 14.4896C14.1749 14.8036 13.9505 15.1958 13.8387 15.6257ZM16.25 17.5007C16.0028 17.5007 15.7611 17.4273 15.5555 17.29C15.35 17.1526 15.1897 16.9574 15.0951 16.729C15.0005 16.5006 14.9758 16.2493 15.024 16.0068C15.0722 15.7643 15.1913 15.5416 15.3661 15.3668C15.5409 15.192 15.7636 15.0729 16.0061 15.0247C16.2486 14.9764 16.4999 15.0012 16.7283 15.0958C16.9567 15.1904 17.152 15.3506 17.2893 15.5562C17.4267 15.7618 17.5 16.0034 17.5 16.2507C17.4995 16.582 17.3676 16.8997 17.1333 17.134C16.899 17.3683 16.5814 17.5002 16.25 17.5007Z"
      fill="#595959"
      className="transition-colors group-hover:fill-[#07486A]"
    />
    <path
      d="M10.9375 9.375V11.875M8.75 6.5625H11.25M6.25 7.8125H13.75M12.8125 7.8125V13.4375H7.1875V7.8125M9.0625 9.375V11.875"
      stroke="#595959"
      strokeWidth="0.8"
      strokeLinejoin="round"
      className="transition-colors group-hover:stroke-[#07486A]"
    />
  </svg>
);

// Add new SVG for single line drawing
const SingleLineSVG = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2 10L18 10"
      stroke="#595959"
      strokeWidth="2"
      className="transition-colors group-hover:stroke-[#07486A]"
    />
  </svg>
);

const AreaMarkingControls = ({
  setDrawingMode,
  appliedDetection,
  selectedType,
  cameraStreamRef,
  handleOpenModal,
  selectedsettingType,
  // passed in from parent
  drawingMode,
  moveMode,
  setMoveMode,
  setIsEditing,
  // handleToggleDrawing,
  // handleDeleteArea,
  // handleMinArea,
  // handleMaxArea,
  // handleSingleLinePlacement,
  handleEnableEdit,
  onEnableEdit,
  handleSaveAreaWithDetection,
  hasError,
  isLoading,
  // Clear the right-side Zone Settings panel when "Clear All" is confirmed.
  onClearZoneConfigs,
  // Forget parent-held points so cleared zones don't reappear (all types).
  onClearAll,
  // Persist the cleared (empty) state for a saved Desk Absence detection.
  onClearAllPersist
}) => {
  console.log(selectedType ,'selectedType in AreaMarkingControls');
  const validateDetectionType = () => {
  if (!selectedType) {
    toast.error("Please select Detection Type");
    return false;
  }
  return true;
};
const [obstructionThreshold, setObstructionThreshold] = useState(10);
  const showObstructionThreshold =
    selectedsettingType === 'vehicleDetectionSettings' ||
    selectedType === 'vehicleDetectionSettings' ||
    appliedDetection?.settings?.obstruction_threshold_sec !== undefined;

  // Per-zone capacity/threshold config is only for Desk Absence Detection.
  // `selectedsettingType` is the setting key (e.g. 'deskAbsenceSettings');
  // `selectedType` may arrive as the human label ('Desk Absence Detection').
  const showZoneConfigs =
    selectedsettingType === 'deskAbsenceSettings' ||
    selectedType === 'deskAbsenceSettings' ||
    selectedType === 'Desk Absence Detection';

  const   handleToggleDrawing = (selectedType) => {
    console.log("selectedType", selectedType);
      if (!validateDetectionType()) return;

 if((selectedType == 'lineCrossingSettings' || selectedType == 'lineCrossing' )){
return;
 } else{
     if (drawingMode) {
      // Stop drawing and switch to move mode so the drawn zones stay editable
      setDrawingMode(false);
      setMoveMode(true);
      if (cameraStreamRef.current && cameraStreamRef.current.setDrawingMode) {
        cameraStreamRef.current.setDrawingMode(false);
      }
      if (cameraStreamRef.current && cameraStreamRef.current.setMoveMode) {
        cameraStreamRef.current.setMoveMode(true);
      }
    } else {
      setDrawingMode(true);
      setMoveMode(false);
      if (cameraStreamRef.current && cameraStreamRef.current.setDrawingMode) {
        cameraStreamRef.current.setDrawingMode(true);
      }
      if (cameraStreamRef.current && cameraStreamRef.current.setMoveMode) {
        cameraStreamRef.current.setMoveMode(false);
      }
      // If there are no existing points, ensure the canvas and internal state are cleared
      // so the user can start drawing fresh points.
      try {
        if (cameraStreamRef.current) {
          const pts = cameraStreamRef.current.getPoints && cameraStreamRef.current.getPoints();
          if (!pts || pts.length === 0) {
            if (cameraStreamRef.current.clearPoints) {
              cameraStreamRef.current.clearPoints();
            } else if (cameraStreamRef.current.setPoints) {
              cameraStreamRef.current.setPoints([]);
            }
          }
        }
      } catch (err) {
        // swallow errors from optional methods
      }
    }
 }
  };

  // Limit for names
  const MAX_NAME_LENGTH = 50;

    const handleSingleLinePlacement = () => {
    if (cameraStreamRef.current && cameraStreamRef.current.setPoints) {
      const singleLine = [
        { x: 100, y: 100 },
        { x: 300, y: 300 },
      ];
      cameraStreamRef.current.setPoints(singleLine);
      setMoveMode(true);
      if (cameraStreamRef.current.setMoveMode) {
        cameraStreamRef.current.setMoveMode(true);
      }
    }
  };
  const handleSingleLineDrawing = () => {
      if (!validateDetectionType()) return;

    try {
      console.debug('[AreaMarkingControls] handleSingleLineDrawing invoked', { hasRef: !!cameraStreamRef?.current });
      if (cameraStreamRef?.current && typeof handleSingleLinePlacement === 'function') {
        handleSingleLinePlacement();
      }
      if (typeof setIsEditing === 'function') setIsEditing(true);
      // Ensure move/draw modes are correctly set on placement
      if (cameraStreamRef?.current?.setDrawingMode) cameraStreamRef.current.setDrawingMode(false);
      if (cameraStreamRef?.current?.setMoveMode) cameraStreamRef.current.setMoveMode(true);
      setMoveMode(true);
    } catch (e) {
      console.debug('[AreaMarkingControls] handleSingleLineDrawing error', e);
    }
  };

  //   const handleDeleteArea = () => {
  //   if (cameraStreamRef.current) {
  //     // If currently in drawing mode, clear and restart drawing to ensure
  //     // the child's internal handlers/reset are refreshed so the user can
  //     // continue drawing without manually toggling Stop/Start.
  //     if (cameraStreamRef.current.clearPoints) {
  //       cameraStreamRef.current.clearPoints();
  //       // Temporarily turn off drawing mode then turn it back on to force a re-render
  //       // setDrawingMode(false);
  //       // if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(false);
  //       // Small timeout allows the child to process the cleared state before re-enabling
  //       // setTimeout(() => {
  //       //   setDrawingMode(true);
  //       //   setMoveMode(false);
  //       //   if (cameraStreamRef.current) {
  //       //     if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(true);
  //       //     if (cameraStreamRef.current.setMoveMode) cameraStreamRef.current.setMoveMode(false);
  //       //   }
  //       // }, 0);
  //       return;
  //     }

  //     // Always clear points for delete action (including prepopulated/closed rects)
  //     if (cameraStreamRef.current.clearPoints) {
  //       cameraStreamRef.current.clearPoints();
  //     } else if (cameraStreamRef.current.setPoints) {
  //       cameraStreamRef.current.setPoints([]);
  //     }

  //     // Ensure move/draw modes are reset
  //     // setDrawingMode(false);
  //     // setMoveMode(false);
  //     // if (cameraStreamRef.current) {
  //     //   if (cameraStreamRef.current.setDrawingMode) cameraStreamRef.current.setDrawingMode(false);
  //     //   if (cameraStreamRef.current.setMoveMode) cameraStreamRef.current.setMoveMode(false);
  //     // }
  //   }
  // };

  // Determine if the camera stream currently has points to edit.
 
  const handleDeleteArea = () => {
      if (!validateDetectionType()) return;

  const ref = cameraStreamRef.current;
  if (!ref) return;

  // Clear points
  if (ref.clearPoints) {
    ref.clearPoints();
  } else if (ref.setPoints) {
    ref.setPoints([]);
  }

  // Leave BOTH drawing and move modes OFF, on the parent state and the canvas,
  // so they stay in sync. The user must click "Start Drawing" to draw again —
  // clearing must never silently leave the canvas in drawing mode.
  setDrawingMode(false);
  setMoveMode(false);
  if (ref.setDrawingMode) ref.setDrawingMode(false);
  if (ref.setMoveMode) ref.setMoveMode(false);
};

  const hasPoints = !!(
    cameraStreamRef?.current &&
    typeof cameraStreamRef.current.getPoints === 'function' &&
    (cameraStreamRef.current.getPoints() || []).length > 0
  );

  const [showClearModal, setShowClearModal] = useState(false);
  const [priority, setPriority] = useState("moderate");
  const [showSaveModal, setShowSaveModal] = useState(false);
  // Per-zone UI config: one entry per zone the user drew on the stream.
  // Shape: { name, capacity, threshold }. UI-only for now (not persisted).
  const [zoneConfigs, setZoneConfigs] = useState([]);
  // Index of the currently expanded zone section (first one open by default).
  const [expandedZoneIndex, setExpandedZoneIndex] = useState(0);
  const [zoneName, setZoneName] = useState(
    appliedDetection?.settings?.referencePoints?.zone_name || ''
  );
  const [detectionName, setDetectionName] = useState(
    appliedDetection?.name || ''
  );
  const [detectionEnabled, setDetectionEnabled] = useState(
    appliedDetection?.enabled || false
  );
  const handleSubmitSaveArea = () => {
      if (!validateDetectionType()) return;

    const currentPoints = cameraStreamRef?.current?.getPoints() || [];

    if (currentPoints.length === 0) {
      toast.error('Please draw an area before saving.');
      return;
    } else {
      // Validate the detection type is selected before opening save modal
      // `selectedsettingType` is passed from parent (AreaSettingsPreview)
      if (!selectedsettingType) {
        toast.error('Please select a detection type before saving');
        return;
      }
console.log('appliedDetection', appliedDetection);
      // Reset input fields to the applied detection values when opening the modal
      setZoneName(appliedDetection?.settings?.referencePoints?.zone_name || '');
      setDetectionName(appliedDetection?.name || '');
      setDetectionEnabled(appliedDetection?.enabled || false);
      setObstructionThreshold(appliedDetection?.settings?.obstruction_threshold_sec || 10);

      // Build one zone-config block per drawn zone. getZones() returns a nested
      // array of polygons: [[ [x,y], ... ], ...] => zones.length === zone count.
      // Pre-fill each block from the saved zone_configs (index-aligned with the
      // polygons), so edits/deletes made in the side panel are reflected here.
      // Only for Desk Absence Detection; other types keep the original modal.
      if (showZoneConfigs) {
        const drawnZones = cameraStreamRef?.current?.getZones?.() || [];
        const savedConfigs = appliedDetection?.settings?.zone_configs || [];
        setZoneConfigs(
          drawnZones.map((_, i) => {
            const saved = savedConfigs[i] || {};
            return {
              name: saved.name ?? '',
              capacity: saved.capacity != null ? String(saved.capacity) : '',
              threshold:
                saved.threshold_sec != null ? String(saved.threshold_sec) : '',
            };
          })
        );
        // First zone expanded, rest collapsed.
        setExpandedZoneIndex(0);
      } else {
        setZoneConfigs([]);
      }

      setErrors({ zoneName: false, detectionName: false });
      setShowSaveModal(true);
    }
  };

  // Update a single field of one zone config (UI-only).
  const handleZoneConfigChange = (index, field, value) => {
    setZoneConfigs((prev) =>
      prev.map((zone, i) => (i === index ? { ...zone, [field]: value } : zone))
    );
  };

  // Toggle which zone section is expanded (collapse if already open).
  const handleToggleZone = (index) => {
    setExpandedZoneIndex((prev) => (prev === index ? -1 : index));
  };

  // Accept only positive integers (or empty) for capacity/threshold inputs.
  const handlePositiveIntChange = (index, field, raw) => {
    if (raw === '') {
      handleZoneConfigChange(index, field, '');
      return;
    }
    // Strip anything that isn't a digit (blocks '-', '.', 'e', etc.)
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    if (digitsOnly === '') {
      handleZoneConfigChange(index, field, '');
      return;
    }
    // Drop leading zeros so "0" / "01" can't sneak through as non-positive.
    const normalized = String(parseInt(digitsOnly, 10));
    handleZoneConfigChange(index, field, normalized);
  };

const handleMaxArea = () => {
    if (!validateDetectionType()) return;

  if (!cameraStreamRef.current) {
    console.warn("cameraStreamRef.current is not ready");
    return;
  }

  // Try to get resolution
  const resolution = cameraStreamRef.current.getResolution?.();
  if (!resolution || resolution.length !== 2) {
    console.warn("Invalid resolution from cameraStreamRef:", resolution);
    return;
  }

  const [width, height] = resolution;

  // Create full-screen rectangle
  const fullScreenRect = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
    { x: 0, y: 0 },
  ];

  // Set points and update modes
  cameraStreamRef.current.setPoints?.(fullScreenRect);
  cameraStreamRef.current.setDrawingMode?.(false);
  cameraStreamRef.current.setMoveMode?.(true);

  // Update React state to trigger any dependent re-render
  // setMoveMode(true);
  // setIsEditing(true);
};

const handleMinArea = () => {
    if (!validateDetectionType()) return;

  if (!cameraStreamRef.current) {
    console.warn("cameraStreamRef.current is not ready");
    return;
  }

  // Define a small default rectangle
  const minRect = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 300 },
    { x: 100, y: 300 },
    { x: 100, y: 100 },
  ];

  // Set points and update modes
  cameraStreamRef.current.setPoints?.(minRect);
  cameraStreamRef.current.setDrawingMode?.(false);
  cameraStreamRef.current.setMoveMode?.(true);

  // setMoveMode(true);
  // setIsEditing(true);
};


  const [errors, setErrors] = useState({
    zoneName: false,
    detectionName: false,
  });

  const handleSubmit = () => {
    let hasErrorLocal = false;

    const newErrors = { zoneName: false, detectionName: false };

    // Standalone Zone Name is hidden for Desk Absence (per-zone names used instead),
    // so only require it for other detection types.
    if (!showZoneConfigs && (!zoneName || !zoneName.trim())) {
      newErrors.zoneName = true;
      hasErrorLocal = true;
    }

    if (!detectionName || !detectionName.trim()) {
      newErrors.detectionName = true;
      hasErrorLocal = true;
    }

    // Validate max length
    if (zoneName && zoneName.length > MAX_NAME_LENGTH) {
      newErrors.zoneName = true;
      hasErrorLocal = true;
    }

    if (detectionName && detectionName.length > MAX_NAME_LENGTH) {
      newErrors.detectionName = true;
      hasErrorLocal = true;
    }

    setErrors(newErrors);

    if (hasErrorLocal) return;

    // For Desk Absence: every zone needs a name, a positive capacity and threshold.
    if (showZoneConfigs) {
      const invalid = zoneConfigs.some(
        (z) =>
          !z.name.trim() ||
          !z.capacity ||
          Number(z.capacity) <= 0 ||
          !z.threshold ||
          Number(z.threshold) <= 0
      );
      if (invalid) {
        toast.error('Please fill name, capacity and threshold for every zone.');
        return;
      }
    }

    // If valid, save
    const saveData = {
      zoneName,
      detectionName,
      detectionEnabled,
      priority
    };
    if (showObstructionThreshold) {
      saveData.obstruction_threshold_sec = obstructionThreshold;
    }
    // Desk Absence only: per-zone config sent inside settings.zone_configs.
    if (showZoneConfigs) {
      saveData.zone_configs = zoneConfigs.map((z) => ({
        name: z.name.trim(),
        capacity: Number(z.capacity),
        threshold_sec: Number(z.threshold),
      }));
    }
    handleSaveAreaWithDetection(saveData);

    setShowSaveModal(false);
  };

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4 justify-start">
      {isLoading == false && (
        <>
          {' '}
          {(selectedType == 'lineCrossingSettings' || selectedType == 'lineCrossing' )&& (
            <button
              type="button"
              className="group flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSingleLineDrawing();
              }}
              onClick={handleSingleLineDrawing}
            >
              {SingleLineSVG}
              <span className="whitespace-nowrap">Draw Line</span>
            </button>
          )}
         {selectedType != 'lineCrossingSettings' &&
            selectedType != 'lineCrossing' && (
            <>
              <button
                type="button"
                className="group flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
                onClick={() => {
                  handleMaxArea();
                }}
              >
                {MaxAreaSVG}
                <span className="whitespace-nowrap">Max Area</span>
              </button>
              <button
                type="button"
                className="group flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
                onClick={() => {
                  handleMinArea();
                }}
              >
                {MinAreaSVG}
                <span className="whitespace-nowrap">Min Area</span>
              </button>

              {/* {!hasPoints && !moveMode && ( */}
              <button
                type="button"
                className="flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
                onClick={() => {
                  handleToggleDrawing(selectedType), setIsEditing(true);
                }}
              >
                {drawingMode ? (
                  <FaRegStopCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : null}
                <span className="whitespace-nowrap">
                  {drawingMode ? 'Stop Drawing' : 'Start Drawing'}
                </span>
              </button>
            </>
          )}
          {/* {hasPoints &&( */}
          {/* <button
        type="button"
        className="group flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
        onClick={handleDeleteArea}
      >
        {DeleteAreaSVG}
        <span className="whitespace-nowrap">Delete Area</span>
      </button> */}
          {/* {hasPoints && !drawingMode && !moveMode && (
        <button
          type="button"
          className="group flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
          onClick={() => {
            if (typeof onEnableEdit === 'function') onEnableEdit();
            if (typeof handleEnableEdit === 'function') handleEnableEdit();
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 14.5V17h2.5L14.87 7.62l-2.5-2.5L3 14.5zM17.71 6.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="#595959" className="transition-colors group-hover:fill-[#07486A]" />
          </svg>
          <span className="whitespace-nowrap">Edit Area</span>
        </button>
      )} */}
          <button
            type="button"
            disabled={!drawingMode}
            className={`flex items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] text-gray-700 border-gray-300 ${
              drawingMode
                ? 'cursor-pointer hover:text-[#07486A] hover:border-[#07486A] hover:bg-gray-100'
                : 'opacity-50 cursor-not-allowed'
            }`}
            onClick={() => {
              if (!drawingMode) return;
              if (cameraStreamRef?.current?.undoLastPoint) {
                cameraStreamRef.current.undoLastPoint();
              }
            }}
          >
            <Undo2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap">Undo</span>
          </button>
          <button
            type="button"
            className="flex hover:text-[#07486A] hover:border-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-100 text-gray-700 border-gray-300"
        onClick={() => setShowClearModal(true)}
          >
            <BrushCleaning className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap">Clear All</span>
          </button>
          <button
            type="button"
            className="group flex bg-[#07486A] cursor-pointer items-center gap-1 sm:gap-2 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-[6px] text-[11px] sm:text-[13px] hover:bg-gray-400 text-gray-700 border-gray-300"
            // onClick={() => {
            //   // Add save area logic here
            //   handleSaveAreaWithDetection()
            // }}
            onClick={() => handleSubmitSaveArea()}
          >
            <SaveAll className="h-3.5 w-3.5 sm:h-4 sm:w-4 transition-colors  text-white" />
            <span className="whitespace-nowrap text-white">Save Area</span>
          </button>
          {showSaveModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg w-[380px] p-6 shadow-lg">
                <h3 className="text-base text-center font-semibold mb-6 border-b border-gray-200 text-gray-800">
                  Save Detection Area
                </h3>
                {/* Detection Name */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Detection Name
                  </label>
                  <input
                    type="text"
                    value={detectionName}
                    onChange={(e) => {
                      const val = e.target.value || '';
                      setDetectionName(val);
                      if (val.length > MAX_NAME_LENGTH) {
                        setErrors((prev) => ({ ...prev, detectionName: `Detection Name must be at most ${MAX_NAME_LENGTH} characters` }));
                      } else {
                        setErrors((prev) => ({ ...prev, detectionName: false }));
                      }
                    }}
                    className={`w-full border rounded-md px-3 py-2 text-sm
            ${errors.detectionName ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder="Enter detection name"
                  />
                  {errors.detectionName && (
                    <p className="text-xs text-red-500 mt-1">
                      {typeof errors.detectionName === 'string' ? errors.detectionName : 'Detection Name is required'}
                    </p>
                  )}
                </div>

                {/* Zone Name (hidden for Desk Absence — each zone has its own name field) */}
                {!showZoneConfigs && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zone Name
                    </label>
                    <input
                      type="text"
                      value={zoneName}
                      onChange={(e) => {
                        const val = e.target.value || '';
                        setZoneName(val);
                        if (val.length > MAX_NAME_LENGTH) {
                          setErrors((prev) => ({ ...prev, zoneName: `Zone Name must be at most ${MAX_NAME_LENGTH} characters` }));
                        } else {
                          setErrors((prev) => ({ ...prev, zoneName: false }));
                        }
                      }}
                      className={`w-full border rounded-md px-3 py-2 text-sm
            ${errors.zoneName ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="Enter zone name"
                    />
                    {errors.zoneName && (
                      <p className="text-xs text-red-500 mt-1">
                        {typeof errors.zoneName === 'string' ? errors.zoneName : 'Zone Name is required'}
                      </p>
                    )}
                  </div>
                )}
                {/* Priority */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>

                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="w-full border border-gray-300 cursor-pointer rounded-md h-9 px-3 text-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#07486A] focus:ring-offset-0">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>

                    <SelectContent className="bg-white border border-gray-300 rounded-md shadow-lg z-50">
                      <SelectItem value="high" className="text-sm cursor-pointer">
                        High
                      </SelectItem>
                      <SelectItem value="moderate" className="text-sm cursor-pointer">
                        Moderate
                      </SelectItem>
                      <SelectItem value="low" className="text-sm cursor-pointer">
                        Low
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Per-zone config (Desk Absence only): one collapsible section per drawn zone */}
                {showZoneConfigs && zoneConfigs.length > 0 && (
                  <div className="mb-4 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {zoneConfigs.map((zone, index) => {
                      const isOpen = expandedZoneIndex === index;
                      return (
                        <div
                          key={index}
                          className="border border-gray-200 rounded-md overflow-hidden"
                        >
                          {/* Header: plain "Zone N" label + expand/collapse toggle.
                              Clicking anywhere on the row toggles the whole box. */}
                          <button
                            type="button"
                            onClick={() => handleToggleZone(index)}
                            className="w-full flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Collapse zone' : 'Expand zone'}
                          >
                            <span className="text-sm font-medium text-gray-700">
                              Zone {index + 1}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-gray-600 transition-transform ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {/* Body: Zone name + Capacity + Threshold (all collapse together) */}
                          {isOpen && (
                            <div className="px-3 py-3 space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Zone Name
                                </label>
                                <input
                                  type="text"
                                  value={zone.name}
                                  onChange={(e) =>
                                    handleZoneConfigChange(index, 'name', e.target.value)
                                  }
                                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A]"
                                  placeholder={`Zone ${index + 1} name`}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Capacity
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  inputMode="numeric"
                                  value={zone.capacity}
                                  onChange={(e) =>
                                    handlePositiveIntChange(index, 'capacity', e.target.value)
                                  }
                                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A]"
                                  placeholder="Enter capacity"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Threshold (sec)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  inputMode="numeric"
                                  value={zone.threshold}
                                  onChange={(e) =>
                                    handlePositiveIntChange(index, 'threshold', e.target.value)
                                  }
                                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A]"
                                  placeholder="Enter threshold"
                                />
                              </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {showObstructionThreshold && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Obstruction Threshold (sec)
                    </label>

                    <div className="flex items-center border rounded-md overflow-hidden w-full">

                      {/* Decrement Button */}
                      <button
                        type="button"
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-lg"
                        onClick={() => {
                          if (obstructionThreshold > 10) {
                            const newVal = obstructionThreshold - 1;
                            setObstructionThreshold(newVal);
                            setErrors((prev) => ({ ...prev, obstructionThreshold: false }));
                          }
                        }}
                      >
                        -
                      </button>

                      {/* Input */}
                      <input
                        type="number"
                        min={10}
                        required
                        value={obstructionThreshold}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setObstructionThreshold(10);
                            setErrors((prev) => ({ ...prev, obstructionThreshold: false }));
                          } else {
                            const numVal = Number(val);
                            if (numVal >= 10) {
                              setObstructionThreshold(numVal);
                              setErrors((prev) => ({ ...prev, obstructionThreshold: false }));
                            } else {
                              setObstructionThreshold(numVal);
                              setErrors((prev) => ({
                                ...prev,
                                obstructionThreshold: "Minimum value is 10 seconds",
                              }));
                            }
                          }
                        }}
                        className={`w-full text-center outline-none px-2 text-sm
          ${errors.obstructionThreshold ? "text-red-500" : "text-gray-800"}`}
                      />

                      {/* Increment Button */}
                      <button
                        type="button"
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-lg"
                        onClick={() => {
                          const newVal = obstructionThreshold + 1;
                          setObstructionThreshold(newVal);
                          setErrors((prev) => ({ ...prev, obstructionThreshold: false }));
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Error */}
                    {errors.obstructionThreshold && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.obstructionThreshold}
                      </p>
                    )}
                  </div>
                )}

                {/* Enable Detection */}
                {/* <div className="mb-5 flex items-center justify-start gap-5">
                  <label className="text-sm text-gray-700">
                    Enable Detection Area
                  </label>
                  <Switch
                    checked={detectionEnabled}
                    onCheckedChange={setDetectionEnabled}
                    className="data-[state=checked]:bg-[#07486A]"
                  />
                </div> */}

                {/* Buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    className="text-sm px-4 py-2 border cursor-pointer border-gray-200 rounded-md hover:bg-gray-100"
                    onClick={() => setShowSaveModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="text-sm px-4 py-2 bg-[#07486A] cursor-pointer text-white rounded-md hover:bg-[#0a5a81]"
                    onClick={handleSubmit}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <ConfirmationModal
        open={showClearModal}
        title="Clear Detection Area"
        message={
          <span>
            Are you sure you want to clear all marked points?
            <br />
            <strong>This will remove the entire detection area.</strong>
          </span>
        }
        confirmLabel="Clear Area"
        cancelLabel="Cancel"
        onClose={() => setShowClearModal(false)}
        onConfirm={() => {
          handleDeleteArea(); // actual clear logic (clears the canvas)
          // Forget parent-held points so they don't reappear (all types).
          if (typeof onClearAll === 'function') onClearAll();
          // Also clear the right-side Zone Settings panel (Desk Absence).
          if (typeof onClearZoneConfigs === 'function') onClearZoneConfigs();
          // Persist the empty state so re-selecting the detection doesn't
          // restore the zones from the server (Desk Absence, saved detection).
          if (typeof onClearAllPersist === 'function') onClearAllPersist();
          // setIsEditing(true);
          setShowClearModal(false);
        }}
        icon={<TriangleAlert className="w-6 h-6 " />}
      />

    </div>
  );
};

export default AreaMarkingControls;
