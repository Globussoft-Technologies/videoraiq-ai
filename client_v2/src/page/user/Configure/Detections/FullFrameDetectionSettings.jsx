import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Flame,
  HeartPulse,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Bell,
  Layers,
  RotateCcw,
  Save,
  Loader2,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createDetectionSetting,
  updateDetectionSetting,
  toggleChannelDetection,
  getDetectionSettings,
} from '../../../../helpers/configure';

/**
 * Configuration definitions and schemas for full-frame detections.
 * Explicitly separates:
 * 1. Percentage/ratio fields: UI shows 0-100%, stored as 0.0-1.0
 * 2. Raw numeric fields: UI shows actual numbers (seconds, degrees, pixels), NO 100x conversion!
 */
export const FULL_FRAME_CONFIGS = {
  fireSmokeDetectionSettings: {
    title: 'Fire & Smoke Detection',
    subtitle: 'Full-frame detection for early warning of fire outbreaks and smoke dispersion',
    icon: Flame,
    iconColor: '#ff5b57',
    namePrefix: 'Fire & Smoke',
    incidentType: 'fireSmokeDetection',
    defaults: {
      fire_confidence: 0.25,
      smoke_confidence: 0.25,
      fire_smoke_iou: 0.3,
      fire_smoke_cooldown_sec: 60,
      trigger_notification: true,
      zone_name: 'Full Frame',
      levelOfImportance: 'moderate',
    },
    sections: [
      {
        title: 'Detection Thresholds',
        description: 'Confidence thresholds and intersection-over-union for fire and smoke recognition.',
        fields: [
          {
            key: 'fire_confidence',
            label: 'Fire Confidence',
            type: 'percent',
            min: 1,
            max: 100,
            step: 1,
            unit: '%',
            description: 'Minimum confidence score required to detect active fire/flames.',
          },
          {
            key: 'smoke_confidence',
            label: 'Smoke Confidence',
            type: 'percent',
            min: 1,
            max: 100,
            step: 1,
            unit: '%',
            description: 'Minimum confidence score required to detect smoke plumes.',
          },
          {
            key: 'fire_smoke_iou',
            label: 'Fire/Smoke Overlap (IoU)',
            type: 'percent',
            min: 5,
            max: 100,
            step: 1,
            unit: '%',
            description: 'Intersection over Union ratio threshold for bounding box grouping.',
          },
        ],
      },
      {
        title: 'Operational Parameters',
        description: 'Cooldown duration and alert triggering settings.',
        fields: [
          {
            key: 'fire_smoke_cooldown_sec',
            label: 'Alert Cooldown',
            type: 'raw_number',
            min: 5,
            max: 600,
            step: 5,
            unit: 'seconds',
            description: 'Cooldown period before re-triggering another fire/smoke incident.',
          },
        ],
      },
    ],
  },
  personFallSickDetectionSettings: {
    title: 'Person Fall/Sick Detection',
    subtitle: 'Full-frame postural and descent analysis for person fall, slip, and medical distress',
    icon: HeartPulse,
    iconColor: '#ec4899',
    namePrefix: 'Person Fall/Sick',
    incidentType: 'personFallSickDetection',
    defaults: {
      person_threshold: 0.65,
      fall_max_transition_sec: 2,
      fall_confirmation_sec: 2,
      fall_recovery_sec: 2,
      fall_min_descent_ratio: 0.25,
      fall_min_horizontal_bbox_ratio: 0.95,
      fall_min_torso_angle_deg: 55,
      fall_min_person_px_height: 80,
      trigger_notification: false,
      zone_name: 'Full Frame',
      levelOfImportance: 'high',
    },
    sections: [
      {
        title: 'Person & Descent Criteria',
        description: 'Key percentage thresholds for person confidence, descent speed, and aspect ratio.',
        fields: [
          {
            key: 'person_threshold',
            label: 'Person Confidence',
            type: 'percent',
            min: 1,
            max: 100,
            step: 1,
            unit: '%',
            description: 'Minimum detector confidence to track person posture.',
          },
          {
            key: 'fall_min_descent_ratio',
            label: 'Min Descent Ratio',
            type: 'percent',
            min: 5,
            max: 100,
            step: 1,
            unit: '%',
            description: 'Minimum vertical descent proportion relative to body height.',
          },
          {
            key: 'fall_min_horizontal_bbox_ratio',
            label: 'Horizontal Bounding Box Ratio',
            type: 'percent',
            min: 5,
            max: 200,
            step: 5,
            unit: '%',
            description: 'Ratio of bounding box width to height indicating a prone/fallen posture.',
          },
        ],
      },
      {
        title: 'Timing & Verification Windows',
        description: 'Duration thresholds for fall transition, confirmation, and recovery (in seconds).',
        fields: [
          {
            key: 'fall_max_transition_sec',
            label: 'Max Transition Window',
            type: 'raw_number',
            min: 1,
            max: 30,
            step: 1,
            unit: 'seconds',
            description: 'Maximum time allowed for transition from standing to ground position.',
          },
          {
            key: 'fall_confirmation_sec',
            label: 'Fall Confirmation Time',
            type: 'raw_number',
            min: 1,
            max: 60,
            step: 1,
            unit: 'seconds',
            description: 'Duration person must remain down before confirming an incident.',
          },
          {
            key: 'fall_recovery_sec',
            label: 'Recovery Time Window',
            type: 'raw_number',
            min: 1,
            max: 60,
            step: 1,
            unit: 'seconds',
            description: 'Window to detect recovery/standing before escalation.',
          },
        ],
      },
      {
        title: 'Posture & Dimensional Thresholds',
        description: 'Torso angle and pixel height constraints for accurate event filtering.',
        fields: [
          {
            key: 'fall_min_torso_angle_deg',
            label: 'Min Torso Angle',
            type: 'raw_number',
            min: 10,
            max: 90,
            step: 1,
            unit: 'degrees',
            description: 'Minimum inclination angle of torso from vertical to qualify as fallen.',
          },
          {
            key: 'fall_min_person_px_height',
            label: 'Min Person Pixel Height',
            type: 'raw_number',
            min: 20,
            max: 1000,
            step: 10,
            unit: 'pixels',
            description: 'Minimum pixel height of the detected person to eliminate distant artifacts.',
          },
        ],
      },
    ],
  },
};

const IMPORTANCE_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

/**
 * Deserializes backend values into UI form values.
 * Strictly respects field types:
 * - 'percent': 0.25 -> 25
 * - 'raw_number': 60 -> 60 (NO division by 100)
 */
function deserializeSettings(config, rawSettings = {}) {
  const result = {};
  const defaults = config.defaults;

  // Flatten all declared fields
  const declaredFields = {};
  config.sections.forEach((sec) => {
    sec.fields.forEach((f) => {
      declaredFields[f.key] = f;
    });
  });

  Object.entries(declaredFields).forEach(([key, field]) => {
    const rawVal = rawSettings[key];
    const defVal = defaults[key];

    if (field.type === 'percent') {
      if (rawVal != null && Number.isFinite(Number(rawVal))) {
        const num = Number(rawVal);
        result[key] = num > 0 && num <= 1 ? Math.round(num * 100) : Math.round(num);
      } else {
        const defNum = Number(defVal);
        result[key] = defNum > 0 && defNum <= 1 ? Math.round(defNum * 100) : Math.round(defNum);
      }
    } else {
      // Raw numeric field: keep exactly as raw number
      if (rawVal != null && Number.isFinite(Number(rawVal))) {
        result[key] = Number(rawVal);
      } else {
        result[key] = Number(defVal);
      }
    }
  });

  // Boolean and string fields
  result.trigger_notification = typeof rawSettings.trigger_notification === 'boolean'
    ? rawSettings.trigger_notification
    : Boolean(defaults.trigger_notification);

  result.levelOfImportance = rawSettings.levelOfImportance || defaults.levelOfImportance || 'moderate';
  result.zone_name = 'Full Frame';

  return result;
}

/**
 * Serializes UI form values into exact backend contract format.
 * - 'percent': 25 -> 0.25
 * - 'raw_number': 60 -> 60
 */
export function serializeSettings(config, formValues) {
  const result = {};
  const declaredFields = {};
  config.sections.forEach((sec) => {
    sec.fields.forEach((f) => {
      declaredFields[f.key] = f;
    });
  });

  Object.entries(declaredFields).forEach(([key, field]) => {
    // Note: Backend validateConfidenceThresholds does not allow person_threshold for personFallSickDetectionSettings,
    // so we omit it; Mongoose model applies default 0.65 safely.
    if (key === 'person_threshold') {
      return;
    }
    const val = formValues[key];
    if (field.type === 'percent') {
      const num = Number(val);
      // Round to 4 decimal places for clean floats (e.g. 0.25)
      result[key] = Number.isFinite(num) ? Math.round((num / 100) * 10000) / 10000 : 0;
    } else {
      const num = Number(val);
      result[key] = Number.isFinite(num) ? num : 0;
    }
  });

  result.trigger_notification = Boolean(formValues.trigger_notification);
  result.levelOfImportance = formValues.levelOfImportance || config.defaults?.levelOfImportance || 'moderate';
  result.zone_name = 'Full Frame';
  result.alertThreshold = 1;
  result.metricType = 'gauge';
  result.referencePoints = {};
  result.zone_configs = [];

  return result;
}

export function buildFullFrameDefaultPayload(settingType, camera) {
  const config = FULL_FRAME_CONFIGS[settingType];
  if (!config) return null;
  const cameraName = camera?.customName || camera?.name || 'Camera';
  const nvrId = camera?.nvrId?._id || (typeof camera?.nvrId === 'string' ? camera.nvrId : null) || camera?.NVRId || camera?.nvr?._id || camera?.nvr;
  const serialized = serializeSettings(config, config.defaults);
  return {
    name: `${config.namePrefix} - ${cameraName}`,
    settingType,
    NVRId: nvrId,
    channelId: [camera?._id],
    enabled: true,
    alerts: [],
    settings: serialized,
  };
}

export default function FullFrameDetectionSettings({
  camera,
  settingType,
  settingId: initialSettingId,
  onSaved,
  canEdit = true,
}) {
  const config = FULL_FRAME_CONFIGS[settingType];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [formState, setFormState] = useState({});
  const [activeSettingDoc, setActiveSettingDoc] = useState(null);
  const [isEnabledOnChannel, setIsEnabledOnChannel] = useState(false);

  const cameraId = camera?._id;
  const cameraName = camera?.customName || camera?.name || 'Camera';
  const nvrId = camera?.nvrId?._id || (typeof camera?.nvrId === 'string' ? camera.nvrId : null) || camera?.NVRId || camera?.nvr?._id || camera?.nvr;

  // Resolve existing setting document and camera link
  const loadExistingSetting = useCallback(async () => {
    if (!cameraId || !settingType) return;
    setLoading(true);
    try {
      // 1. Check if camera already has populated detection entry
      const channelDetectionEntry = camera?.detections?.[settingType];
      const isChannelEnabled = typeof channelDetectionEntry === 'object'
        ? channelDetectionEntry?.enabled === true
        : channelDetectionEntry === true;

      setIsEnabledOnChannel(isChannelEnabled);

      let foundDoc = null;
      if (channelDetectionEntry?.id && typeof channelDetectionEntry.id === 'object' && channelDetectionEntry.id._id) {
        foundDoc = channelDetectionEntry.id;
      }

      // 2. Query backend for the detection setting document to ensure latest values
      const res = await getDetectionSettings({
        settingType,
        channelIds: cameraId,
        nvrIds: nvrId || '',
        limit: 10,
      });

      const list = res?.settings || res || [];
      if (Array.isArray(list) && list.length > 0) {
        const match = list.find((item) => {
          const channels = Array.isArray(item.channelId) ? item.channelId : [];
          return channels.some((c) => String(c?._id || c) === String(cameraId));
        }) || list[0];

        if (match) {
          foundDoc = match;
        }
      }

      setActiveSettingDoc(foundDoc);

      if (foundDoc && foundDoc.settings) {
        // Edit mode with actual backend values
        setFormState(deserializeSettings(config, foundDoc.settings));
      } else {
        // Create mode with defaults
        setFormState(deserializeSettings(config, config.defaults));
      }
    } catch (err) {
      console.error('Failed to load full-frame detection settings:', err);
      toast.error('Failed to load existing detection settings.');
      setFormState(deserializeSettings(config, config.defaults));
    } finally {
      setLoading(false);
    }
  }, [cameraId, settingType, camera, nvrId, config]);

  useEffect(() => {
    loadExistingSetting();
  }, [loadExistingSetting]);

  const handleFieldChange = (key, value) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetToDefaults = () => {
    if (!config) return;
    setFormState(deserializeSettings(config, config.defaults));
    toast.info('Form reset to recommended default values. Click Save to persist.');
  };

  // Toggle channel detection link (enable / disable)
  const handleToggleChannelDetection = async () => {
    if (!canEdit || toggling || !cameraId || !settingType) return;
    const targetState = !isEnabledOnChannel;
    setToggling(true);

    try {
      await toggleChannelDetection({
        channelId: cameraId,
        detectionType: settingType,
        enable: targetState,
      });
      setIsEnabledOnChannel(targetState);
      toast.success(
        `${config.title} ${targetState ? 'enabled' : 'disabled'} for ${cameraName}.`
      );
      if (onSaved) onSaved();
    } catch (err) {
      console.error('Failed to toggle detection:', err);
      toast.error(err?.response?.data?.body?.message || err?.message || 'Failed to update detection status.');
    } finally {
      setToggling(false);
    }
  };

  // Save changes (Create or Update)
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!canEdit || saving || !cameraId || !settingType) return;

    setSaving(true);
    const serialized = serializeSettings(config, formState);

    try {
      const existingId = activeSettingDoc?._id || initialSettingId;

      if (existingId) {
        // ── EDIT FLOW ──
        const updatePayload = {
          settings: {
            ...serialized,
            referencePoints: activeSettingDoc?.settings?.referencePoints || {},
            zone_configs: activeSettingDoc?.settings?.zone_configs || [],
          },
        };

        await updateDetectionSetting(existingId, updatePayload);
        toast.success(`${config.title} settings updated successfully.`);
      } else {
        // ── CREATE FLOW ──
        const createPayload = {
          name: `${config.namePrefix} - ${cameraName}`,
          settingType,
          NVRId: nvrId,
          channelId: [cameraId],
          enabled: true,
          alerts: [],
          settings: {
            ...serialized,
            referencePoints: {},
            zone_configs: [],
          },
        };

        const createRes = await createDetectionSetting(createPayload);
        const createdDoc =
          createRes?.savedDetectionSettings?.saved?.[0]?.detection ||
          createRes?.saved?.[0]?.detection ||
          createRes?.data?.body?.data?.savedDetectionSettings?.saved?.[0]?.detection ||
          createRes?.detectionSetting ||
          createRes?.data?.body ||
          createRes;

        if (createdDoc?._id) {
          setActiveSettingDoc(createdDoc);
        }

        // Mandatory create -> toggle sequence:
        // After creating a detection setting, activate the camera-level link
        await toggleChannelDetection({
          channelId: cameraId,
          detectionType: settingType,
          enable: true,
        });

        setIsEnabledOnChannel(true);
        toast.success(`${config.title} configured and activated successfully.`);
      }

      if (onSaved) onSaved();
    } catch (err) {
      console.error('Failed to save full-frame detection setting:', err);
      toast.error(
        err?.response?.data?.body?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save detection settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--tx3)' }}>
        Unknown full-frame detection type: {settingType}
      </div>
    );
  }

  const Icon = config.icon;
  const isEditMode = Boolean(activeSettingDoc?._id || initialSettingId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        color: 'var(--tx)',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          padding: '16px 18px',
          borderRadius: 12,
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: `color-mix(in srgb, ${config.iconColor} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${config.iconColor} 30%, var(--bd))`,
              display: 'grid',
              placeItems: 'center',
              color: config.iconColor,
              flexShrink: 0,
            }}
          >
            <Icon size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                {config.title}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  fontFamily: 'var(--mono)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--blue) 15%, transparent)',
                  color: 'var(--blue)',
                  border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)',
                  letterSpacing: '.04em',
                }}
              >
                FULL-FRAME DETECTION
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 3 }}>
              {config.subtitle}
            </div>
          </div>
        </div>

        {/* Toggle Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isEnabledOnChannel ? 'var(--ok)' : 'var(--tx3)',
            }}
          >
            {isEnabledOnChannel ? 'Active on Camera' : 'Disabled'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabledOnChannel}
            disabled={!canEdit || toggling || loading}
            onClick={handleToggleChannelDetection}
            style={{
              width: 42,
              height: 24,
              borderRadius: 12,
              background: isEnabledOnChannel ? 'var(--ok)' : 'var(--toggleoff, #475569)',
              position: 'relative',
              cursor: canEdit && !toggling && !loading ? 'pointer' : 'not-allowed',
              border: 'none',
              padding: 0,
              transition: 'background .2s',
              opacity: canEdit ? 1 : 0.6,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: isEnabledOnChannel ? 20 : 2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transition: 'left .2s',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {toggling && <Loader2 size={12} className="animate-spin text-slate-700" />}
            </span>
          </button>
        </div>
      </div>

      {/* Info notice explaining full-frame behavior */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'color-mix(in srgb, var(--blue) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--blue) 20%, var(--bd))',
          fontSize: 12,
          color: 'var(--tx2)',
        }}
      >
        <Info size={16} color="var(--blue)" style={{ flexShrink: 0 }} />
        <span>
          This detection evaluates the <strong>entire camera field of view</strong>. No polygon zones, boundary lines, or canvas markings are required.
        </span>
      </div>

      {loading ? (
        <div
          style={{
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--tx2)',
          }}
        >
          <Loader2 size={26} className="animate-spin text-blue-500" />
          <span style={{ fontSize: 13 }}>Loading detection parameters...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Render Configuration Sections */}
          {config.sections.map((section, idx) => (
            <div
              key={section.title || idx}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                borderRadius: 10,
                padding: '16px 18px',
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>
                  {section.title}
                </div>
                {section.description && (
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 2 }}>
                    {section.description}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 14,
                }}
              >
                {section.fields.map((field) => {
                  const val = formState[field.key] ?? (field.type === 'percent' ? 70 : field.min);
                  return (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        background: 'var(--bg1)',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label
                          htmlFor={field.key}
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: 'var(--tx)',
                            cursor: 'pointer',
                          }}
                        >
                          {field.label}
                        </label>
                        <span
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--blue)',
                            background: 'color-mix(in srgb, var(--blue) 12%, transparent)',
                            padding: '2px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {val} {field.unit}
                        </span>
                      </div>

                      {/* Slider + Input Control */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <input
                          id={field.key}
                          type="range"
                          min={field.min}
                          max={field.max}
                          step={field.step || 1}
                          value={val}
                          disabled={!canEdit || saving}
                          onChange={(e) => handleFieldChange(field.key, Number(e.target.value))}
                          style={{
                            flex: 1,
                            accentColor: 'var(--blue)',
                            cursor: canEdit && !saving ? 'pointer' : 'not-allowed',
                          }}
                        />
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step || 1}
                          value={val}
                          disabled={!canEdit || saving}
                          onChange={(e) => {
                            const num = Number(e.target.value);
                            if (Number.isFinite(num)) {
                              handleFieldChange(field.key, Math.max(field.min, Math.min(field.max, num)));
                            }
                          }}
                          style={{
                            width: 68,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--bd2)',
                            background: 'var(--bg2)',
                            color: 'var(--tx)',
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            fontWeight: 600,
                            textAlign: 'right',
                            padding: '0 6px',
                          }}
                        />
                      </div>

                      {field.description && (
                        <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                          {field.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Alerting & Priority Section */}
          <div
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--bd)',
              borderRadius: 10,
              padding: '16px 18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 14,
            }}
          >
            {/* Importance level dropdown */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                background: 'var(--bg1)',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid var(--bd2)',
              }}
            >
              <label
                htmlFor="levelOfImportance"
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}
              >
                Level of Importance
              </label>
              <select
                id="levelOfImportance"
                value={formState.levelOfImportance || 'moderate'}
                disabled={!canEdit || saving}
                onChange={(e) => handleFieldChange('levelOfImportance', e.target.value)}
                style={{
                  height: 34,
                  borderRadius: 6,
                  border: '1px solid var(--bd2)',
                  background: 'var(--bg2)',
                  color: 'var(--tx)',
                  padding: '0 10px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: canEdit && !saving ? 'pointer' : 'not-allowed',
                }}
              >
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} Priority
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                Severity classification attached to incidents generated by this detector.
              </div>
            </div>

            {/* Notification trigger toggle */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 6,
                background: 'var(--bg1)',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid var(--bd2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>
                  Trigger Real-time Notification
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(formState.trigger_notification)}
                  disabled={!canEdit || saving}
                  onClick={() =>
                    handleFieldChange('trigger_notification', !formState.trigger_notification)
                  }
                  style={{
                    width: 38,
                    height: 22,
                    borderRadius: 11,
                    background: formState.trigger_notification ? 'var(--blue)' : 'var(--toggleoff, #475569)',
                    position: 'relative',
                    cursor: canEdit && !saving ? 'pointer' : 'not-allowed',
                    border: 'none',
                    padding: 0,
                    transition: 'background .2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: formState.trigger_notification ? 18 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left .2s',
                    }}
                  />
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                Emit instant desktop toasts and sound alerts upon confirmed detection.
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 8,
            }}
          >
            <button
              type="button"
              disabled={!canEdit || saving}
              onClick={handleResetToDefaults}
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 8,
                border: '1px solid var(--bd)',
                background: 'var(--bg2)',
                color: 'var(--tx2)',
                fontSize: 12.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: canEdit && !saving ? 'pointer' : 'not-allowed',
                transition: 'all .15s',
              }}
            >
              <RotateCcw size={14} />
              Reset to Recommended Defaults
            </button>

            <button
              type="submit"
              disabled={!canEdit || saving}
              style={{
                height: 38,
                padding: '0 24px',
                borderRadius: 8,
                border: 'none',
                background: isEditMode
                  ? 'linear-gradient(135deg, var(--blue), var(--brand, #3b82f6))'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: canEdit && !saving ? 'pointer' : 'not-allowed',
                boxShadow: isEditMode
                  ? '0 4px 14px rgba(59,130,246,0.3)'
                  : '0 4px 14px rgba(16,185,129,0.3)',
                opacity: canEdit && !saving ? 1 : 0.65,
                transition: 'all .15s',
              }}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isEditMode ? 'Saving Changes...' : 'Configuring...'}
                </>
              ) : (
                <>
                  <Save size={16} />
                  {isEditMode ? 'Save Detection Settings' : 'Configure & Enable Detection'}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
