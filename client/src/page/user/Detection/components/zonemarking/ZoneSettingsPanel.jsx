import React, { useEffect, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmationModal from '../DeleteConfirmation';

// Right-side panel (all non-line-crossing types) that pre-fills from the saved
// `zone_configs` and lets the user edit / delete each zone. Saving and
// deleting both go through the SAME save-area flow exposed on `previewRef`
// (previewRef.current.saveZoneConfigs / deleteZone) — same API, same payload.
const ZoneSettingsPanel = ({ appliedDetection, previewRef, canEdit = true, settingType }) => {
  const savedConfigs = appliedDetection?.settings?.zone_configs;

  // Per-zone field visibility (Zone Name always shows). Keyed by setting key.
  //   - Threshold: Vehicle&Obstruction, Guard Absence, Loitering, Table Occupancy, Desk Absence.
  //   - Capacity:  Desk Absence, Crowd.
  // Fall back to the saved detection's own settingType if not passed in.
  const type = settingType || appliedDetection?.settingType;
  const THRESHOLD_TYPES = [
    'vehicleObstructionSettings',
    'guardAbsenceSettings',
    'loiteringDetectionSettings',
    'tableOccupancyDetectionSettings',
    'deskAbsenceSettings',
  ];
  const CAPACITY_TYPES = ['deskAbsenceSettings', 'crowdDetectionSettings'];
  const showThreshold = THRESHOLD_TYPES.includes(type);
  const showCapacity = CAPACITY_TYPES.includes(type);

  const [zones, setZones] = useState([]);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [savingIndex, setSavingIndex] = useState(-1);
  const [deleteIndex, setDeleteIndex] = useState(-1);

  // Re-seed local state whenever the saved detection changes.
  useEffect(() => {
    const next = Array.isArray(savedConfigs)
      ? savedConfigs.map((z) => ({
          name: z?.name ?? '',
          capacity: z?.capacity != null ? String(z.capacity) : '',
          threshold: z?.threshold_sec != null ? String(z.threshold_sec) : '',
        }))
      : [];
    setZones(next);
    setExpandedIndex(next.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedDetection?._id, JSON.stringify(savedConfigs)]);

  if (!Array.isArray(savedConfigs) || savedConfigs.length === 0) return null;

  const updateField = (index, field, value) => {
    setZones((prev) =>
      prev.map((z, i) => (i === index ? { ...z, [field]: value } : z))
    );
  };

  // Positive integers only (blocks '-', '.', 'e', leading zeros).
  const handlePositiveIntChange = (index, field, raw) => {
    if (raw === '') return updateField(index, field, '');
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits === '') return updateField(index, field, '');
    updateField(index, field, String(parseInt(digits, 10)));
  };

  const toggle = (index) =>
    setExpandedIndex((prev) => (prev === index ? -1 : index));

  // Build the full zone_configs array (all zones) in the API shape.
  // Include capacity/threshold only for the types that use those fields.
  const buildConfigs = () =>
    zones.map((z) => {
      const cfg = { name: z.name.trim() };
      if (showCapacity) cfg.capacity = Number(z.capacity);
      if (showThreshold) cfg.threshold_sec = Number(z.threshold);
      return cfg;
    });

  const isZoneValid = (z) =>
    z.name.trim() &&
    (!showCapacity || (z.capacity && Number(z.capacity) > 0)) &&
    (!showThreshold || (z.threshold && Number(z.threshold) > 0));

  const handleSave = async (index) => {
    if (!isZoneValid(zones[index])) {
      const fields = ['name'];
      if (showCapacity) fields.push('capacity');
      if (showThreshold) fields.push('threshold');
      toast.error(`Please fill ${fields.join(', ')} (positive numbers).`);
      return;
    }
    if (!previewRef?.current?.saveZoneConfigs) {
      toast.error('Unable to save right now. Please reload and try again.');
      return;
    }
    try {
      setSavingIndex(index);
      await previewRef.current.saveZoneConfigs(buildConfigs());
    } finally {
      setSavingIndex(-1);
    }
  };

  const handleDeleteConfirm = async () => {
    const index = deleteIndex;
    setDeleteIndex(-1);
    if (index < 0) return;
    if (!previewRef?.current?.deleteZone) {
      toast.error('Unable to delete right now. Please reload and try again.');
      return;
    }
    try {
      setSavingIndex(index);
      // Pass the CURRENT config array; AreaSettingsPreview removes index `index`
      // from both the canvas polygons and zone_configs, then saves.
      await previewRef.current.deleteZone(index, buildConfigs());
    } finally {
      setSavingIndex(-1);
    }
  };

  return (
    <div className="bg-white border border-[#E6E6E6] rounded-[15px] shadow-sm p-4">
      <h3 className="text-sm font-bold text-[#334155] uppercase tracking-wider mb-3">
        Zone Settings
      </h3>

      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {zones.map((zone, index) => {
          const isOpen = expandedIndex === index;
          const busy = savingIndex === index;
          return (
            <div
              key={index}
              className="border border-gray-200 rounded-md overflow-hidden"
            >
              {/* Header: zone label + delete + expand/collapse */}
              <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="flex-1 flex items-center gap-2 text-left cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {zone.name?.trim() || `Zone ${index + 1}`}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-600 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setDeleteIndex(index)}
                    disabled={busy}
                    className="shrink-0 p-1 rounded hover:bg-red-50 text-red-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Delete zone"
                    title="Delete zone"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Body: editable Name + Capacity + Threshold + Save */}
              {isOpen && (
                <div className="px-3 py-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Zone Name
                    </label>
                    <input
                      type="text"
                      value={zone.name}
                      disabled={!canEdit}
                      onChange={(e) => updateField(index, 'name', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A] disabled:bg-gray-100"
                      placeholder={`Zone ${index + 1} name`}
                    />
                  </div>
                  {(showCapacity || showThreshold) && (
                  <div className="grid grid-cols-2 gap-3">
                    {showCapacity && (
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
                        disabled={!canEdit}
                        onChange={(e) =>
                          handlePositiveIntChange(index, 'capacity', e.target.value)
                        }
                        className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A] disabled:bg-gray-100"
                        placeholder="Enter capacity"
                      />
                    </div>
                    )}
                    {showThreshold && (
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
                        disabled={!canEdit}
                        onChange={(e) =>
                          handlePositiveIntChange(index, 'threshold', e.target.value)
                        }
                        className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#07486A] disabled:bg-gray-100"
                        placeholder="Enter threshold"
                      />
                    </div>
                    )}
                  </div>
                  )}
                  {canEdit && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSave(index)}
                        disabled={busy}
                        className="text-sm px-4 py-1.5 bg-[#07486A] cursor-pointer text-white rounded-md hover:bg-[#0a5a81] disabled:opacity-60"
                      >
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        open={deleteIndex >= 0}
        title="Delete Zone"
        message={
          <span>
            Are you sure you want to delete this zone? This will also remove its
            marked area from the stream.
          </span>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onClose={() => setDeleteIndex(-1)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

export default ZoneSettingsPanel;
