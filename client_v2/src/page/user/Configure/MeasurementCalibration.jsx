import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Undo2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import ConfirmationModal from '@/components/DeleteConfirmation';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/helpers/client';
import { getRaspberryPiDevices } from '@/helpers/raspberryPiDevices';
import { formatUtcInConfiguredTimezone } from '@/utils/timezone';
import {
  captureCalibrationFrame,
  getCalibrationFrame,
  getSavedCalibrationZone,
  getCalibrationStatus,
  runMeasurementCalibration,
  saveCalibrationZone,
} from '@/helpers/measurementCalibration';

const POLL_INTERVAL_MS = 1500;
const BUSY_STATUSES = new Set(['capturing', 'calibrating']);
const CALIBRATION_DRAFT_KEY = 'videoraiq:measurement-calibration:drafts:v1';
const RECTANGLE_MIN_MM = 300;
const RECTANGLE_MAX_MM = 6000;
const RECTANGLE_LABELS = ['P0 far-left', 'P1 far-right', 'P2 near-right', 'P3 near-left'];

function readCalibrationDrafts() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(CALIBRATION_DRAFT_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch {
    return {};
  }
}

function validDraftPoints(points, zoneType = 'polygon') {
  if (!Array.isArray(points)) return [];
  return points.slice(0, zoneType === 'rectangle' ? 4 : 32).filter((point) => (
    Number.isFinite(point?.x)
    && Number.isFinite(point?.y)
    && point.x >= 0
    && point.x <= 1
    && point.y >= 0
    && point.y <= 1
  ));
}

function storedDraft(deviceId) {
  const draft = readCalibrationDrafts().stations?.[deviceId];
  if (!draft || typeof draft !== 'object') return null;
  const savedFlatness = Number(draft.flatness);
  const savedTolerance = Number(draft.tolerance);
  const zoneType = draft.zoneType === 'rectangle' ? 'rectangle' : 'polygon';
  return {
    zoneType,
    points: validDraftPoints(draft.points, zoneType),
    zoneLengthMm: draft.zoneLengthMm ?? '',
    zoneBreadthMm: draft.zoneBreadthMm ?? '',
    flatness: savedFlatness >= 10 && savedFlatness <= 100 ? savedFlatness : 85,
    tolerance: savedTolerance >= 1 && savedTolerance <= 100 ? savedTolerance : 20,
  };
}

function cross(a, b, c) {
  return ((b.x - a.x) * (c.y - b.y)) - ((b.y - a.y) * (c.x - b.x));
}

function rectangleValidity(points, length, breadth) {
  const errors = [];
  const warnings = [];
  if (points.length !== 4) errors.push('Click exactly four corners in P0, P1, P2, P3 order.');

  if (points.length === 4) {
    const duplicate = points.some((point, index) => points.some((other, otherIndex) => (
      otherIndex > index && Math.hypot(point.x - other.x, point.y - other.y) < 0.001
    )));
    if (duplicate) errors.push('Rectangle corners must be unique.');

    const turns = points.map((point, index) => cross(point, points[(index + 1) % 4], points[(index + 2) % 4]));
    if (turns.some((value) => Math.abs(value) < 0.00001)
      || !(turns.every((value) => value > 0) || turns.every((value) => value < 0))) {
      errors.push('The four corners must form a convex rectangle without crossing sides.');
    }

    const area = Math.abs(points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + (point.x * next.y) - (next.x * point.y);
    }, 0) / 2);
    if (area < 0.02) errors.push('The rectangle must cover at least 2% of the captured frame.');

    if ((points[0].y + points[1].y) / 2 >= (points[2].y + points[3].y) / 2) {
      warnings.push('The far edge P0–P1 is not above the near edge P2–P3; confirm the physical corner order.');
    }
    if ((points[0].x + points[3].x) / 2 >= (points[1].x + points[2].x) / 2) {
      warnings.push('The left edge P0–P3 is not left of P1–P2; confirm the physical corner order.');
    }
  }

  const validDimension = (value) => Number.isFinite(Number(value))
    && Number(value) >= RECTANGLE_MIN_MM
    && Number(value) <= RECTANGLE_MAX_MM;
  if (!validDimension(breadth)) errors.push(`Breadth must be ${RECTANGLE_MIN_MM}–${RECTANGLE_MAX_MM} mm.`);
  if (!validDimension(length)) errors.push(`Length must be ${RECTANGLE_MIN_MM}–${RECTANGLE_MAX_MM} mm.`);
  return { errors: [...new Set(errors)], warnings };
}

function saveCalibrationDraft(deviceId, draft) {
  try {
    const stored = readCalibrationDrafts();
    window.sessionStorage.setItem(CALIBRATION_DRAFT_KEY, JSON.stringify({
      ...stored,
      selectedDeviceId: deviceId,
      stations: {
        ...(stored.stations || {}),
        [deviceId]: draft,
      },
    }));
  } catch {
    // Calibration remains usable when browser storage is unavailable.
  }
}

const statusTone = {
  idle: ['var(--tx3)', 'var(--bg2)'],
  capturing: ['var(--blue)', 'rgba(59,130,246,.12)'],
  ready: ['var(--warn)', 'rgba(245,158,11,.12)'],
  calibrating: ['var(--violet)', 'rgba(139,92,246,.12)'],
  completed: ['var(--ok)', 'rgba(16,185,129,.12)'],
  failed: ['var(--crit)', 'rgba(239,68,68,.12)'],
};

function panelStyle(extra = {}) {
  return {
    background: 'var(--bg1)',
    border: '1px solid var(--bd)',
    borderRadius: 14,
    ...extra,
  };
}

function actionStyle(tone = 'secondary', disabled = false) {
  const palette = {
    primary: ['var(--blue)', '#fff', 'transparent'],
    success: ['var(--ok)', '#fff', 'transparent'],
    danger: ['rgba(239,68,68,.10)', 'var(--crit)', 'rgba(239,68,68,.35)'],
    secondary: ['var(--bg2)', 'var(--tx)', 'var(--bd2)'],
  }[tone];
  return {
    alignItems: 'center',
    background: palette[0],
    border: `1px solid ${palette[2]}`,
    borderRadius: 9,
    color: palette[1],
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    fontSize: 12,
    fontWeight: 700,
    gap: 7,
    justifyContent: 'center',
    opacity: disabled ? 0.48 : 1,
    padding: '9px 13px',
  };
}

function StatusBadge({ value }) {
  const [color, background] = statusTone[value] || statusTone.idle;
  return (
    <span style={{ background, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, borderRadius: 999, color, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 800, padding: '5px 9px', textTransform: 'uppercase' }}>
      {value || 'idle'}
    </span>
  );
}

function EmptyState({ error }) {
  return (
    <div style={{ color: error ? 'var(--crit)' : 'var(--tx3)', display: 'grid', minHeight: 380, padding: 28, placeItems: 'center', textAlign: 'center' }}>
      <div>
        {error ? <AlertTriangle size={30} style={{ margin: '0 auto 10px' }} /> : <Camera size={34} style={{ margin: '0 auto 10px' }} />}
        <strong style={{ color: 'var(--tx)', display: 'block', fontSize: 14 }}>{error ? 'Unable to load calibration frame' : 'Capture a frame to begin'}</strong>
        <span style={{ display: 'block', fontSize: 12, marginTop: 6 }}>{error || 'The RealSense preview will appear here for zone marking.'}</span>
      </div>
    </div>
  );
}

function calibrationFlatnessSummary(message) {
  const value = String(message || '');
  const detected = [...value.matchAll(/zone only\s+(\d+(?:\.\d+)?)%\s+flat/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const required = [...value.matchAll(/need\s*>=\s*(\d+(?:\.\d+)?)%/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);

  if (!detected.length) return '';

  const format = (number) => Number(number.toFixed(2)).toString();
  const bestDetected = format(Math.max(...detected));
  const requiredText = required.length ? `; ${format(required.at(-1))}% required` : '';
  return ` Best detected flatness: ${bestDetected}%${requiredText}.`;
}

function friendlyCalibrationFailure(message) {
  const value = String(message || '').toLowerCase();
  const flatnessSummary = calibrationFlatnessSummary(message);
  if (value.includes('camera is busy') || value.includes('resource temporarily unavailable') || value.includes('opening the realsense')) {
    return `The RealSense camera is busy.${flatnessSummary} Wait for the active measurement to finish, then capture a fresh frame and try again.`;
  }
  if (value.includes('dominant plane') || value.includes('flat') || value.includes('inlier')) {
    return `A stable flat surface could not be detected.${flatnessSummary} Keep the table empty, draw the zone slightly inside its edges, and try again. If needed, increase the tolerance slightly.`;
  }
  if (value.includes('timed out') || value.includes('timeout')) {
    return 'Calibration took longer than expected. Check that the station is online and try again.';
  }
  return 'Calibration could not be completed. Capture a fresh frame, verify the selected zone, and try again.';
}

function friendlyRequestError(error, fallback) {
  const raw = getApiErrorMessage(error, fallback);
  const value = String(raw || '').toLowerCase();
  if (value.includes('unable to reach') || value.includes('network error') || value.includes('econnrefused')) {
    return 'Cannot connect to the calibration service on this station. Check that the Pi is online and the DS service is running.';
  }
  if (value.includes('camera') || value.includes('plane') || value.includes('flat') || value.includes('inlier') || value.includes('timeout')) {
    return friendlyCalibrationFailure(raw);
  }
  return String(raw || '').length > 220
    ? 'The calibration service returned an unexpected error. Capture a fresh frame and try again.'
    : raw;
}

export default function MeasurementCalibration() {
  const { user } = useAuth();
  const isAdmin = !user?.memberId;
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [status, setStatus] = useState(null);
  const [points, setPoints] = useState([]);
  const [frameUrl, setFrameUrl] = useState('');
  const [frameError, setFrameError] = useState('');
  const [pageError, setPageError] = useState('');
  const [operation, setOperation] = useState('');
  const [confirmCalibration, setConfirmCalibration] = useState(false);
  const [zoneType, setZoneType] = useState('polygon');
  const [zoneLengthMm, setZoneLengthMm] = useState('');
  const [zoneBreadthMm, setZoneBreadthMm] = useState('');
  const [flatness, setFlatness] = useState(85);
  const [tolerance, setTolerance] = useState(20);
  const [draftReady, setDraftReady] = useState(false);
  const statusRequestsRef = useRef(new Set());
  const frameVersionRef = useRef('');
  const hydratingDraftRef = useRef('');
  const calibrationStartedHereRef = useRef(false);
  const draftSaveErrorShownRef = useRef(false);
  const activeDeviceRef = useRef(deviceId);
  activeDeviceRef.current = deviceId;

  const selectedDevice = useMemo(
    () => devices.find((device) => String(device.id) === String(deviceId)),
    [deviceId, devices],
  );
  const busy = Boolean(operation) || BUSY_STATUSES.has(status?.status);
  const flatnessValue = Number(flatness);
  const toleranceValue = Number(tolerance);
  const settingsValid = Number.isFinite(flatnessValue)
    && flatnessValue >= 10
    && flatnessValue <= 100
    && Number.isFinite(toleranceValue)
    && toleranceValue >= 1
    && toleranceValue <= 100;
  const zoneValidity = useMemo(() => {
    if (zoneType === 'rectangle') return rectangleValidity(points, zoneLengthMm, zoneBreadthMm);
    return {
      errors: points.length >= 3 ? [] : ['Click at least three points around the usable surface.'],
      warnings: [],
    };
  }, [points, zoneBreadthMm, zoneLengthMm, zoneType]);
  const maxPoints = zoneType === 'rectangle' ? 4 : 32;
  const canCalibrate = !zoneValidity.errors.length && !busy && Boolean(deviceId) && settingsValid;

  const loadFrame = useCallback(async (selectedId, version = '') => {
    try {
      const blob = await getCalibrationFrame(selectedId);
      if (activeDeviceRef.current !== selectedId) return;
      const nextUrl = URL.createObjectURL(blob);
      setFrameUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setFrameError('');
      frameVersionRef.current = version;
    } catch (error) {
      setFrameError(friendlyRequestError(error, 'Failed to load the calibration frame'));
    }
  }, []);

  const refreshStatus = useCallback(async (selectedId, { loadAvailableFrame = false } = {}) => {
    if (!selectedId || statusRequestsRef.current.has(selectedId)) return null;
    statusRequestsRef.current.add(selectedId);
    try {
      const nextStatus = await getCalibrationStatus(selectedId);
      if (activeDeviceRef.current !== selectedId) return nextStatus;
      setStatus(nextStatus);
      setPageError('');
      const frameChanged = nextStatus?.status === 'ready'
        && nextStatus?.updated_at
        && nextStatus.updated_at !== frameVersionRef.current;
      if (nextStatus?.frame_available && (loadAvailableFrame || frameChanged)) {
        await loadFrame(selectedId, nextStatus.updated_at || '');
      }
      return nextStatus;
    } catch (error) {
      if (activeDeviceRef.current !== selectedId) return null;
      const message = friendlyRequestError(error, 'Failed to fetch calibration status');
      setPageError(message);
      return null;
    } finally {
      statusRequestsRef.current.delete(selectedId);
    }
  }, [loadFrame]);

  const loadDevices = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingDevices(true);
    try {
      const allDevices = await getRaspberryPiDevices();
      const approved = allDevices.filter((device) => device.approvalStatus === 'approved');
      const savedDeviceId = String(readCalibrationDrafts().selectedDeviceId || '');
      setDevices(approved);
      setDeviceId((current) => (
        approved.some((device) => String(device.id) === String(current))
          ? current
          : approved.some((device) => String(device.id) === savedDeviceId)
            ? savedDeviceId
            : String(approved[0]?.id || '')
      ));
      setPageError(approved.length ? '' : 'No approved Raspberry Pi stations are available.');
    } catch (error) {
      setPageError(friendlyRequestError(error, 'Failed to load Raspberry Pi stations'));
    } finally {
      setLoadingDevices(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    const draft = deviceId ? storedDraft(deviceId) : null;
    hydratingDraftRef.current = deviceId;
    calibrationStartedHereRef.current = false;
    setDraftReady(false);
    setStatus(null);
    setZoneType(draft?.zoneType || 'polygon');
    setPoints(draft?.points || []);
    setZoneLengthMm(draft?.zoneLengthMm ?? '');
    setZoneBreadthMm(draft?.zoneBreadthMm ?? '');
    setFlatness(draft?.flatness ?? 85);
    setTolerance(draft?.tolerance ?? 20);
    setFrameError('');
    frameVersionRef.current = '';
    setFrameUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return '';
    });
    if (!deviceId) return undefined;

    let cancelled = false;
    refreshStatus(deviceId, { loadAvailableFrame: true });
    getSavedCalibrationZone(deviceId)
      .then((saved) => {
        if (cancelled || activeDeviceRef.current !== deviceId || !saved) return;
        const savedZoneType = saved.zone_type === 'rectangle' ? 'rectangle' : 'polygon';
        const savedPoints = validDraftPoints(saved.points, savedZoneType);
        setZoneType(savedZoneType);
        setPoints(savedPoints);
        setZoneLengthMm(saved.zone_length_mm ?? '');
        setZoneBreadthMm(saved.zone_breadth_mm ?? '');
        setFlatness(Math.round(Number(saved.min_zone_flat_ratio) * 100));
        setTolerance(Number(saved.inlier_tolerance_mm));
        saveCalibrationDraft(deviceId, {
          zoneType: savedZoneType,
          points: savedPoints,
          zoneLengthMm: saved.zone_length_mm ?? '',
          zoneBreadthMm: saved.zone_breadth_mm ?? '',
          flatness: Math.round(Number(saved.min_zone_flat_ratio) * 100),
          tolerance: Number(saved.inlier_tolerance_mm),
        });
      })
      .catch(() => {
        // The session draft remains available if database restoration fails.
      })
      .finally(() => {
        if (!cancelled && activeDeviceRef.current === deviceId) {
          hydratingDraftRef.current = '';
          setDraftReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId, refreshStatus]);

  useEffect(() => {
    if (!deviceId || !draftReady) return undefined;
    if (hydratingDraftRef.current === deviceId) {
      hydratingDraftRef.current = '';
      return undefined;
    }
    const draft = {
      zoneType,
      points: validDraftPoints(points, zoneType),
      zoneLengthMm,
      zoneBreadthMm,
      flatness: Number(flatness),
      tolerance: Number(tolerance),
    };
    saveCalibrationDraft(deviceId, draft);
    const timer = window.setTimeout(() => {
      const serverDraft = {
        zone_type: zoneType,
        points: draft.points,
        min_zone_flat_ratio: draft.flatness / 100,
        inlier_tolerance_mm: draft.tolerance,
      };
      if (zoneType === 'rectangle') {
        const length = Number(zoneLengthMm);
        const breadth = Number(zoneBreadthMm);
        if (length >= RECTANGLE_MIN_MM && length <= RECTANGLE_MAX_MM) serverDraft.zone_length_mm = length;
        if (breadth >= RECTANGLE_MIN_MM && breadth <= RECTANGLE_MAX_MM) serverDraft.zone_breadth_mm = breadth;
      }
      saveCalibrationZone(deviceId, serverDraft)
        .then(() => {
          draftSaveErrorShownRef.current = false;
        })
        .catch(() => {
          if (draftSaveErrorShownRef.current) return;
          draftSaveErrorShownRef.current = true;
          toast.error('The zone is saved in this browser, but it could not be synced to the server.');
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [deviceId, draftReady, flatness, points, tolerance, zoneBreadthMm, zoneLengthMm, zoneType]);

  useEffect(() => {
    if (!deviceId) return undefined;
    // Match the DS reference UI: status is refreshed automatically in every
    // lifecycle state, including ready/completed/failed.
    const timer = window.setInterval(() => refreshStatus(deviceId), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [deviceId, refreshStatus]);

  useEffect(() => () => {
    if (frameUrl) URL.revokeObjectURL(frameUrl);
  }, [frameUrl]);

  useEffect(() => {
    if (!calibrationStartedHereRef.current) return;
    if (status?.status === 'completed') {
      calibrationStartedHereRef.current = false;
      toast.success('Measurement calibration completed successfully.');
    }
    if (status?.status === 'failed') {
      calibrationStartedHereRef.current = false;
      toast.error(friendlyCalibrationFailure(status.message));
    }
  }, [status?.message, status?.status]);

  const capture = async () => {
    if (!deviceId || busy) return;
    setOperation('capture');
    setPoints([]);
    setFrameError('');
    try {
      const nextStatus = await captureCalibrationFrame(deviceId);
      setStatus(nextStatus);
      await loadFrame(deviceId, nextStatus?.updated_at || '');
      toast.success('Fresh RealSense frame captured');
    } catch (error) {
      const message = friendlyRequestError(error, 'Failed to capture calibration frame');
      setPageError(message);
      toast.error(message);
      await refreshStatus(deviceId);
    } finally {
      setOperation('');
    }
  };

  const calibrate = async () => {
    if (!canCalibrate) return;
    calibrationStartedHereRef.current = true;
    setOperation('calibrate');
    try {
      const nextStatus = await runMeasurementCalibration(deviceId, {
        zone_type: zoneType,
        points,
        min_zone_flat_ratio: flatnessValue / 100,
        inlier_tolerance_mm: toleranceValue,
        ...(zoneType === 'rectangle' ? {
          zone_length_mm: Number(zoneLengthMm),
          zone_breadth_mm: Number(zoneBreadthMm),
        } : {}),
      });
      setStatus(nextStatus);
      setPageError('');
      toast.success('Calibration started');
    } catch (error) {
      calibrationStartedHereRef.current = false;
      const message = friendlyRequestError(error, 'Failed to start calibration');
      setPageError(message);
      toast.error(message);
      await refreshStatus(deviceId);
    } finally {
      setOperation('');
      setConfirmCalibration(false);
    }
  };

  const addPoint = (event) => {
    // Only the empty SVG drawing surface may add a point. Without this guard,
    // clicks on an existing marker (or a child element) bubble to the SVG and
    // create an unexpected extra vertex.
    if (event.target !== event.currentTarget || !frameUrl || busy || points.length >= maxPoints) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    setPoints((current) => [...current, { x, y }]);
  };

  const changeZoneType = (nextType) => {
    if (nextType === zoneType || busy) return;
    setZoneType(nextType);
    setPoints([]);
    setPageError('');
  };

  if (!isAdmin) {
    return (
      <div style={{ ...panelStyle(), color: 'var(--tx2)', margin: 22, padding: 24 }}>
        <ShieldAlert size={25} style={{ color: 'var(--crit)', marginBottom: 10 }} />
        <strong style={{ color: 'var(--tx)', display: 'block' }}>Administrator access required</strong>
        Measurement calibration changes the reference plane used for every measurement on the selected station.
      </div>
    );
  }

  const polygon = points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
  const rectangleEdges = zoneType === 'rectangle' && points.length === 4
    ? [
      { from: points[0], to: points[1], label: `${zoneBreadthMm || '?'} mm breadth` },
      { from: points[1], to: points[2], label: `${zoneLengthMm || '?'} mm length` },
      { from: points[2], to: points[3], label: `${zoneBreadthMm || '?'} mm breadth` },
      { from: points[3], to: points[0], label: `${zoneLengthMm || '?'} mm length` },
    ]
    : [];
  const visibleZoneMessage = zoneValidity.errors[0]
    || zoneValidity.warnings[0]
    || (zoneType === 'rectangle' ? 'Rectangle is valid and ready to calibrate.' : 'Polygon is valid and ready to calibrate.');
  const visibleZoneTone = zoneValidity.errors.length
    ? 'var(--crit)'
    : zoneValidity.warnings.length
      ? 'var(--warn)'
      : 'var(--ok)';
  const activeMetricSolveRecorded = [
    status?.active_zone?.planar_scale_x,
    status?.active_zone?.planar_scale_y,
    status?.active_zone?.rectangle_rms_mm,
  ].every((value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 22 }}>
      <section style={panelStyle({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 14, padding: 16 })}>
        <div style={{ background: 'rgba(59,130,246,.12)', borderRadius: 10, color: 'var(--blue)', display: 'grid', height: 40, placeItems: 'center', width: 40 }}>
          <Crosshair size={20} />
        </div>
        <div style={{ minWidth: 230 }}>
          <strong style={{ color: 'var(--tx)', display: 'block', fontSize: 14 }}>Select a measurement station</strong>
          <span style={{ color: 'var(--tx3)', fontSize: 11.5 }}>Only approved Raspberry Pi stations can be calibrated.</span>
        </div>
        <select
          aria-label="Measurement station"
          disabled={loadingDevices || busy || !devices.length}
          onChange={(event) => setDeviceId(event.target.value)}
          value={deviceId}
          style={{ background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 9, color: 'var(--tx)', flex: '1 1 260px', fontSize: 12.5, minHeight: 39, padding: '0 11px' }}
        >
          {!devices.length && <option value="">No approved station</option>}
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.station?.name || device.station?.id || 'Measurement station'} - {device.mac} ({device.ip})
            </option>
          ))}
        </select>
        <span style={{ alignItems: 'center', color: selectedDevice?.connectivityStatus === 'connected' ? 'var(--ok)' : 'var(--tx3)', display: 'inline-flex', fontSize: 11.5, gap: 6 }}>
          {selectedDevice?.connectivityStatus === 'connected' ? <Wifi size={15} /> : <WifiOff size={15} />}
          {selectedDevice?.connectivityStatus === 'connected' ? 'Connected' : 'Offline'}
        </span>
        <button disabled={loadingDevices || busy} onClick={loadDevices} style={actionStyle('secondary', loadingDevices || busy)} type="button">
          {loadingDevices ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Refresh stations
        </button>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
        <section style={panelStyle({ overflow: 'hidden' })}>
          <div style={{ alignItems: 'center', borderBottom: '1px solid var(--bd)', display: 'flex', flexWrap: 'wrap', gap: 9, padding: '13px 15px' }}>
            <Camera size={17} style={{ color: 'var(--blue)' }} />
            <strong style={{ color: 'var(--tx)', fontSize: 13.5 }}>RealSense calibration frame</strong>
            <span style={{ color: 'var(--tx3)', fontSize: 11 }}>
              {zoneType === 'rectangle'
                ? 'Click P0 far-left, P1 far-right, P2 near-right, then P3 near-left.'
                : 'Click around the usable empty surface in order.'}
            </span>
            <span style={{ marginLeft: 'auto' }}><StatusBadge value={status?.status} /></span>
          </div>

          <div role={zoneValidity.errors.length ? 'alert' : 'status'} style={{ alignItems: 'center', background: `color-mix(in srgb, ${visibleZoneTone} 8%, var(--bg1))`, borderBottom: '1px solid var(--bd)', color: visibleZoneTone, display: 'flex', fontSize: 11.5, gap: 7, minHeight: 34, padding: '7px 15px' }}>
            {zoneValidity.errors.length || zoneValidity.warnings.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {visibleZoneMessage}
          </div>

          <div style={{ background: '#07111f', minHeight: 380, position: 'relative' }}>
            {frameUrl ? (
              <div style={{ lineHeight: 0, overflow: 'hidden', position: 'relative', width: '100%' }}>
                <img alt="RealSense calibration preview" draggable={false} src={frameUrl} style={{ display: 'block', height: 'auto', userSelect: 'none', width: '100%' }} />
                <svg
                  aria-label="Calibration zone editor"
                  onClick={addPoint}
                  preserveAspectRatio="none"
                  role="application"
                  style={{ cursor: busy ? 'wait' : points.length >= maxPoints ? 'not-allowed' : 'crosshair', display: 'block', height: '100%', inset: 0, overflow: 'hidden', position: 'absolute', touchAction: 'none', width: '100%', zIndex: 1 }}
                  viewBox="0 0 1000 1000"
                >
                  {points.length >= 3 && <polygon fill="rgba(34,197,94,.18)" pointerEvents="none" points={polygon} stroke="#22c55e" strokeWidth="4" vectorEffect="non-scaling-stroke" />}
                  {points.length === 2 && <polyline fill="none" pointerEvents="none" points={polygon} stroke="#facc15" strokeWidth="4" vectorEffect="non-scaling-stroke" />}
                  {points.map((point, index) => (
                    <g key={`${point.x}-${point.y}-${index}`} pointerEvents="none">
                      <circle cx={point.x * 1000} cy={point.y * 1000} fill="#fff" r="10" stroke="#22c55e" strokeWidth="5" vectorEffect="non-scaling-stroke" />
                      <text fill="#07111f" fontSize={zoneType === 'rectangle' ? 15 : 18} fontWeight="800" paintOrder="stroke" stroke="#fff" strokeWidth="3" textAnchor="middle" x={point.x * 1000} y={(point.y * 1000) - 16}>
                        {zoneType === 'rectangle' ? RECTANGLE_LABELS[index] : index + 1}
                      </text>
                    </g>
                  ))}
                  {rectangleEdges.map((edge, index) => (
                    <text
                      fill="#fff"
                      fontSize="15"
                      fontWeight="800"
                      key={`${edge.label}-${index}`}
                      paintOrder="stroke"
                      pointerEvents="none"
                      stroke="#07111f"
                      strokeWidth="5"
                      textAnchor="middle"
                      x={((edge.from.x + edge.to.x) / 2) * 1000}
                      y={(((edge.from.y + edge.to.y) / 2) * 1000) - 9}
                    >
                      {edge.label}
                    </text>
                  ))}
                </svg>
                {busy && (
                  <div style={{ alignItems: 'center', background: 'rgba(3,7,18,.58)', color: '#fff', display: 'flex', fontSize: 13, fontWeight: 700, gap: 9, inset: 0, justifyContent: 'center', lineHeight: 1.4, padding: 20, position: 'absolute', textAlign: 'center', zIndex: 2 }}>
                    <Loader2 className="animate-spin" size={20} />
                    {operation === 'capture' || status?.status === 'capturing'
                      ? 'Capturing a fresh RealSense frame...'
                      : 'Calibrating the selected surface...'}
                  </div>
                )}
              </div>
            ) : <EmptyState error={frameError} />}
          </div>

          <div onClick={(event) => event.stopPropagation()} style={{ alignItems: 'center', background: 'var(--bg1)', borderTop: '1px solid var(--bd)', display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12, position: 'relative', zIndex: 2 }}>
            <button disabled={!deviceId || busy} onClick={capture} style={actionStyle('primary', !deviceId || busy)} type="button">
              {operation === 'capture' ? <Loader2 className="animate-spin" size={15} /> : <Camera size={15} />} Capture / refresh frame
            </button>
            <button disabled={!points.length || busy} onClick={() => setPoints((current) => current.slice(0, -1))} style={actionStyle('secondary', !points.length || busy)} type="button"><Undo2 size={15} /> Undo point</button>
            <button disabled={!points.length || busy} onClick={() => setPoints([])} style={actionStyle('danger', !points.length || busy)} type="button"><RotateCcw size={15} /> Clear zone</button>
            <span style={{ color: zoneValidity.errors.length ? 'var(--tx3)' : 'var(--ok)', fontFamily: 'var(--mono)', fontSize: 10.5, marginLeft: 'auto' }}>{points.length} / {maxPoints} points</span>
          </div>
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={panelStyle({ padding: 16 })}>
            <strong style={{ color: 'var(--tx)', display: 'block', fontSize: 13.5 }}>Calibration controls</strong>
            <p style={{ color: 'var(--tx3)', fontSize: 11.5, lineHeight: 1.55, margin: '5px 0 16px' }}>
              {zoneType === 'rectangle'
                ? 'Mark the four physical corners in the required order and enter the real dimensions.'
                : 'Keep the polygon slightly inside the physical surface edges.'}
            </p>

            <div aria-label="Calibration zone mode" style={{ background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 9, display: 'grid', gap: 4, gridTemplateColumns: '1fr 1fr', marginBottom: 16, padding: 4 }}>
              {['polygon', 'rectangle'].map((mode) => (
                <button
                  disabled={busy}
                  key={mode}
                  onClick={() => changeZoneType(mode)}
                  style={{ background: zoneType === mode ? 'var(--blue)' : 'transparent', border: 0, borderRadius: 7, color: zoneType === mode ? '#fff' : 'var(--tx2)', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 11.5, fontWeight: 750, padding: '8px 10px', textTransform: 'capitalize' }}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>

            {zoneType === 'rectangle' && (
              <div style={{ display: 'grid', gap: 11, gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
                <label style={{ color: 'var(--tx2)', fontSize: 11.5, fontWeight: 650 }}>
                  Length (P0-P3)
                  <input disabled={busy} max={RECTANGLE_MAX_MM} min={RECTANGLE_MIN_MM} onChange={(event) => setZoneLengthMm(event.target.value)} placeholder="e.g. 2000" style={{ background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 7, color: 'var(--tx)', marginTop: 6, padding: '8px', width: '100%' }} type="number" value={zoneLengthMm} />
                </label>
                <label style={{ color: 'var(--tx2)', fontSize: 11.5, fontWeight: 650 }}>
                  Breadth (P0-P1)
                  <input disabled={busy} max={RECTANGLE_MAX_MM} min={RECTANGLE_MIN_MM} onChange={(event) => setZoneBreadthMm(event.target.value)} placeholder="e.g. 1800" style={{ background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 7, color: 'var(--tx)', marginTop: 6, padding: '8px', width: '100%' }} type="number" value={zoneBreadthMm} />
                </label>
                <div style={{ color: 'var(--tx3)', fontSize: 10.5, gridColumn: '1 / -1', lineHeight: 1.5 }}>
                  Required range: {RECTANGLE_MIN_MM}-{RECTANGLE_MAX_MM} mm. Corner order: P0 far-left, P1 far-right, P2 near-right, P3 near-left.
                </div>
              </div>
            )}

            <label style={{ color: 'var(--tx2)', display: 'block', fontSize: 11.5, fontWeight: 650 }}>
              Minimum flatness
              <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginTop: 7 }}>
                <input disabled={busy} max="100" min="10" onChange={(event) => setFlatness(event.target.value)} step="1" style={{ accentColor: 'var(--blue)', flex: 1 }} type="range" value={flatness} />
                <input disabled={busy} max="100" min="10" onChange={(event) => setFlatness(event.target.value)} style={{ background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 7, color: 'var(--tx)', padding: '6px', width: 58 }} type="number" value={flatness} />
                <span>%</span>
              </div>
            </label>

            <label style={{ color: 'var(--tx2)', display: 'block', fontSize: 11.5, fontWeight: 650, marginTop: 16 }}>
              Inlier tolerance
              <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginTop: 7 }}>
                <input disabled={busy} max="100" min="1" onChange={(event) => setTolerance(event.target.value)} step="1" style={{ accentColor: 'var(--blue)', flex: 1 }} type="range" value={tolerance} />
                <input disabled={busy} max="100" min="1" onChange={(event) => setTolerance(event.target.value)} style={{ background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 7, color: 'var(--tx)', padding: '6px', width: 58 }} type="number" value={tolerance} />
                <span>mm</span>
              </div>
            </label>

            {!settingsValid && <p role="alert" style={{ color: 'var(--crit)', fontSize: 11, margin: '12px 0 0' }}>Flatness must be 10–100% and tolerance must be 1–100 mm.</p>}
            <button disabled={!canCalibrate} onClick={() => setConfirmCalibration(true)} style={{ ...actionStyle('success', !canCalibrate), marginTop: 20, width: '100%' }} type="button">
              {operation === 'calibrate' || status?.status === 'calibrating' ? <Loader2 className="animate-spin" size={16} /> : <Crosshair size={16} />}
              Calibrate selected zone
            </button>
          </section>

          <section style={panelStyle({ padding: 16 })}>
            <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
              {status?.status === 'completed' ? <CheckCircle2 size={18} style={{ color: 'var(--ok)' }} /> : <AlertTriangle size={18} style={{ color: status?.status === 'failed' ? 'var(--crit)' : 'var(--warn)' }} />}
              <strong style={{ color: 'var(--tx)', fontSize: 13 }}>DS calibration status</strong>
              <span style={{ marginLeft: 'auto' }}><StatusBadge value={status?.status} /></span>
            </div>
            <p style={{ color: 'var(--tx2)', fontSize: 12, lineHeight: 1.55, margin: '12px 0 0', overflowWrap: 'anywhere' }}>
              {status?.status === 'failed'
                ? friendlyCalibrationFailure(status.message)
                : status?.message || pageError || 'Select a station to fetch its calibration status.'}
            </p>
            {pageError && status?.message && <p role="alert" style={{ color: 'var(--crit)', fontSize: 11.5, margin: '9px 0 0' }}>{pageError}</p>}
            {Array.isArray(status?.warnings) && status.warnings.map((warning) => (
              <p key={warning} role="status" style={{ color: 'var(--warn)', fontSize: 11.5, margin: '9px 0 0' }}>Warning: {warning}</p>
            ))}
            {status?.camera_owner && <div style={{ background: 'var(--bg2)', borderRadius: 8, color: 'var(--tx3)', fontFamily: 'var(--mono)', fontSize: 10, marginTop: 11, padding: 9 }}>Camera owner: {status.camera_owner}</div>}
            {typeof status?.baseline_available === 'boolean' && (
              <div style={{ color: status.baseline_available ? 'var(--ok)' : 'var(--warn)', fontSize: 11, lineHeight: 1.5, marginTop: 10 }}>
                {status.baseline_available
                  ? 'Empty-surface depth baseline is active.'
                  : 'No depth baseline is recorded. Measurements use the fitted plane and may be noisier near the surface.'}
              </div>
            )}
            {status?.updated_at && <div style={{ color: 'var(--tx3)', fontSize: 10.5, marginTop: 10 }}>Updated {formatUtcInConfiguredTimezone(status.updated_at, 'DD MMM YYYY, hh:mm A')}</div>}
            <div style={{ alignItems: 'center', color: 'var(--tx3)', display: 'flex', fontSize: 10.5, gap: 6, marginTop: 12 }}>
              <RefreshCw className={BUSY_STATUSES.has(status?.status) ? 'animate-spin' : ''} size={12} />
              Status updates automatically
            </div>

            {status?.active_zone && (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 9, marginTop: 14, padding: 11 }}>
                <strong style={{ color: 'var(--tx)', display: 'block', fontSize: 11.5, marginBottom: 8 }}>Active measurement zone</strong>
                {status.active_zone.error ? (
                  <div role="alert" style={{ color: 'var(--crit)', fontSize: 11, overflowWrap: 'anywhere' }}>{status.active_zone.error}</div>
                ) : (
                  <div style={{ color: 'var(--tx2)', display: 'grid', fontSize: 10.5, gap: 6, gridTemplateColumns: '1fr auto' }}>
                    <span>Type</span><strong style={{ color: 'var(--tx)', textTransform: 'capitalize' }}>{status.active_zone.zone_type || 'unknown'}</strong>
                    <span>Points</span><strong style={{ color: 'var(--tx)' }}>{status.active_zone.point_count ?? '-'}</strong>
                    {status.active_zone.zone_type === 'rectangle' && (
                      <>
                        <span>Declared breadth x length</span>
                        <strong style={{ color: 'var(--tx)' }}>{status.active_zone.zone_breadth_mm ?? '-'} x {status.active_zone.zone_length_mm ?? '-'} mm</strong>
                        {activeMetricSolveRecorded ? (
                            <>
                              <span>Planar scale X / Y</span>
                              <strong style={{ color: 'var(--tx)' }}>{Number(status.active_zone.planar_scale_x).toFixed(4)} / {Number(status.active_zone.planar_scale_y).toFixed(4)}</strong>
                              <span>Corner RMS</span>
                              <strong style={{ color: 'var(--tx)' }}>{Number(status.active_zone.rectangle_rms_mm).toFixed(2)} mm</strong>
                            </>
                          ) : (
                            <div style={{ color: 'var(--tx3)', gridColumn: '1 / -1', marginTop: 2 }}>Metric solve: not recorded for this calibration.</div>
                          )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section style={panelStyle({ background: 'rgba(245,158,11,.07)', borderColor: 'rgba(245,158,11,.28)', color: 'var(--tx2)', fontSize: 11.5, lineHeight: 1.55, padding: 14 })}>
            <strong style={{ color: 'var(--warn)', display: 'block', marginBottom: 4 }}>Surface must be completely empty</strong>
            Any mattress or object inside the selected zone will corrupt the reference plane used by future measurements.
          </section>
        </aside>
      </div>

      <ConfirmationModal
        cancelLabel="Go back"
        confirmClass="bg-[var(--ok)] text-white hover:opacity-90 shadow-sm shadow-[var(--ok)]/20"
        confirmLabel="Start calibration"
        icon={<AlertTriangle className="h-7 w-7 text-[var(--warn)]" />}
        loading={operation === 'calibrate'}
        message={(
          <div className="space-y-2">
            <p>The selected measurement surface must be completely empty.</p>
            {zoneType === 'rectangle' && (
              <p>Please confirm the declared {zoneBreadthMm} mm breadth and {zoneLengthMm} mm length were physically tape-measured.</p>
            )}
            <p className="font-medium text-[var(--tx)]">Objects inside the zone will corrupt the reference plane used by future measurements.</p>
          </div>
        )}
        onClose={() => {
          if (operation !== 'calibrate') setConfirmCalibration(false);
        }}
        onConfirm={calibrate}
        open={confirmCalibration}
        title="Start measurement calibration?"
      />
    </div>
  );
}
