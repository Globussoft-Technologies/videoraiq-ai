const SESSION_KEY = 'videoraiq:station';
const COUNTS_KEY = 'videoraiq:measurement-counts';
const LOG_KEY = 'videoraiq:measurement-log';
const ERROR_LOG_KEY = 'videoraiq:station-errors';
const SUCCESS_LOG_KEY = 'videoraiq:station-successes';
const QR_SCAN_LOG_KEY = 'videoraiq:qr-scan-diagnostics';
let stationAudioContext = null;
let qrCodeReaderPromise = null;
let lastQrMissLoggedAt = 0;

async function getQrCodeReader() {
  if (!qrCodeReaderPromise) {
    qrCodeReaderPromise = import('@zxing/browser').then(({ BrowserQRCodeReader }) => {
      // DecodeHintType.TRY_HARDER is enum value 3. BrowserQRCodeReader already
      // limits decoding to QR, so this spends a little more effort locating a
      // small or perspective-distorted label without adding barcode formats.
      const hints = new Map([[3, true]]);
      return new BrowserQRCodeReader(hints);
    });
  }
  return qrCodeReaderPromise;
}

function cacheBustedUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.set('vqCapture', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    return url.toString();
  } catch {
    return value;
  }
}

function readJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readStationFromLocation(location = window.location) {
  const params = new URLSearchParams(location.search);
  const saved = readJson(sessionStorage.getItem(SESSION_KEY));
  const token = clean(params.get('token')) || clean(saved?.backend?.token);
  const piApi = clean(params.get('videoraiqPiApi')) || clean(saved?.pi?.api);
  const mac = clean(params.get('videoraiqStation')) || clean(saved?.pi?.device?.mac);
  const backendIp = clean(saved?.backend?.ip) || location.hostname;

  if (!token && !piApi && !mac) return saved;
  return {
    backend: { ...(saved?.backend || {}), ip: backendIp, token },
    pi: {
      ...(saved?.pi || {}),
      api: piApi,
      device: { ...(saved?.pi?.device || {}), mac },
      cameras: saved?.pi?.cameras || [],
    },
  };
}

export function mergeBootstrap(current, payload) {
  return {
    backend: { ...(current?.backend || {}), ...(payload?.backend || {}) },
    pi: {
      ...(current?.pi || {}),
      ...(payload?.pi || {}),
      device: { ...(current?.pi?.device || {}), ...(payload?.pi?.device || {}) },
      cameras: payload?.pi?.cameras || current?.pi?.cameras || [],
    },
  };
}

export function saveStation(station) {
  if (station) sessionStorage.setItem(SESSION_KEY, JSON.stringify(station));
}

export function readDecisionCounts() {
  return { accepted: 0, rejected: 0, ...(readJson(sessionStorage.getItem(COUNTS_KEY)) || {}) };
}

export function transitionDecisionCounts(previous, next) {
  const counts = readDecisionCounts();
  if (previous === next) return counts;
  if (previous === 'accepted') counts.accepted = Math.max(0, counts.accepted - 1);
  if (previous === 'rejected') counts.rejected = Math.max(0, counts.rejected - 1);
  if (next === 'accepted') counts.accepted += 1;
  if (next === 'rejected') counts.rejected += 1;
  sessionStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
  return counts;
}

export function readMeasurementLog() {
  const entries = readJson(localStorage.getItem(LOG_KEY));
  return Array.isArray(entries) ? entries : [];
}

export async function fetchMeasurementIncidentLog(station, signal, { page = 1, limit = 80, status = '' } = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  const stationId = clean(station?.pi?.device?.mac);
  if (stationId) query.set('stationId', stationId);
  if (status) query.set('status', status);
  const response = await fetch(
    `${backendOrigin(station?.backend?.ip)}/api/v2/measurement-incidents?${query.toString()}`,
    {
      signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${station?.backend?.token || ''}` },
    },
  );
  const payload = await responseJson(response, 'Measurement log fetch failed');
  const result = payload?.body?.data || payload?.body || payload?.data || payload;
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    pagination: result?.pagination || {},
  };
}

export function recordMeasurementDecision(incident) {
  if (!incident?._id || !['accepted', 'rejected'].includes(incident.status)) return readMeasurementLog();
  const entry = {
    id: incident._id,
    status: incident.status,
    decidedAt: new Date().toISOString(),
    qrMetadata: incident.qrMetadata || {},
    measuredData: incident.measuredData || {},
  };
  const entries = [entry, ...readMeasurementLog().filter((item) => item.id !== entry.id)].slice(0, 80);
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent('videoraiq:measurement-log', { detail: entries }));
  return entries;
}

export function clearMeasurementLog() {
  localStorage.setItem(LOG_KEY, '[]');
  window.dispatchEvent(new CustomEvent('videoraiq:measurement-log', { detail: [] }));
}

export function logStationError(error, context = {}) {
  const diagnostic = {
    timestamp: new Date().toISOString(),
    stage: error?.stage || context.stage || 'measurement',
    message: error?.message || 'Unknown measurement error',
    endpoint: error?.endpoint || context.endpoint || '',
    status: error?.status || null,
    cameraId: context.cameraId || '',
    piApi: context.piApi || '',
    errorType: error?.errorType || '',
    failureReason: error?.failureReason || '',
    serviceMessage: error?.serviceMessage || '',
    response: error?.response || null,
  };
  const existing = readJson(localStorage.getItem(ERROR_LOG_KEY));
  const entries = [diagnostic, ...(Array.isArray(existing) ? existing : [])].slice(0, 50);
  localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(entries));
  window.videoraiqStationErrors = entries;
  console.error('[VideoraIQ measurement error]', diagnostic, error);
  return diagnostic;
}

export function logStationSuccess(stage, context = {}) {
  const diagnostic = {
    timestamp: new Date().toISOString(),
    stage,
    incidentId: context.incidentId || '',
    sku: clean(context.sku).toUpperCase(),
    stationId: clean(context.stationId).toLowerCase(),
    source: context.source || '',
    message: context.message || 'Measurement step completed successfully',
    details: context.details || null,
  };
  const existing = readJson(localStorage.getItem(SUCCESS_LOG_KEY));
  const entries = [diagnostic, ...(Array.isArray(existing) ? existing : [])].slice(0, 50);
  localStorage.setItem(SUCCESS_LOG_KEY, JSON.stringify(entries));
  window.videoraiqStationSuccesses = entries;
  console.info('[VideoraIQ measurement success]', diagnostic);
  window.dispatchEvent(new CustomEvent('videoraiq:measurement-success', { detail: diagnostic }));
  return diagnostic;
}

export function readQrScanDiagnostics() {
  const entries = readJson(localStorage.getItem(QR_SCAN_LOG_KEY));
  return Array.isArray(entries) ? entries : [];
}

export function clearQrScanDiagnostics() {
  localStorage.setItem(QR_SCAN_LOG_KEY, '[]');
  window.videoraiqQrScanDiagnostics = [];
  window.dispatchEvent(new CustomEvent('videoraiq:qr-scan-diagnostic', { detail: [] }));
}

function logQrScanMiss(jpegBlob, attempts, decodeStatus) {
  const now = Date.now();
  // No QR is the normal idle state, so retain a useful sample without writing
  // to localStorage on every automatic scan.
  if (now - lastQrMissLoggedAt < 5000) return;
  lastQrMissLoggedAt = now;
  const diagnostic = {
    timestamp: new Date(now).toISOString(),
    result: decodeStatus,
    imageBytes: jpegBlob.size,
    imageType: jpegBlob.type || 'unknown',
    attempts,
  };
  console.info('[VideoraIQ QR scan]', diagnostic);
  try {
    const entries = [diagnostic, ...readQrScanDiagnostics()].slice(0, 30);
    localStorage.setItem(QR_SCAN_LOG_KEY, JSON.stringify(entries));
    window.videoraiqQrScanDiagnostics = entries;
    window.dispatchEvent(new CustomEvent('videoraiq:qr-scan-diagnostic', { detail: entries }));
  } catch {
    // Diagnostics must never interrupt the automatic scanner.
  }
}

export function prepareStationAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!stationAudioContext) stationAudioContext = new AudioContextClass();
    if (stationAudioContext.state === 'suspended') stationAudioContext.resume().catch(() => {});
    return stationAudioContext;
  } catch {
    return null;
  }
}

export function playStationSound(cue) {
  const context = prepareStationAudio();
  if (!context) return;
  const cues = {
    // A longer, lower rising chime remains audible on small kiosk/monitor
    // speakers. The former short 880/1320 Hz sine cue was easily missed.
    accept: [
      { frequency: 520, duration: 0.16, at: 0, type: 'triangle' },
      { frequency: 700, duration: 0.18, at: 0.13, type: 'triangle' },
      { frequency: 920, duration: 0.24, at: 0.28, type: 'triangle' },
    ],
    reject: [
      { frequency: 300, to: 150, duration: 0.2, at: 0, type: 'square' },
      { frequency: 220, to: 120, duration: 0.26, at: 0.2, type: 'square' },
    ],
    reset: [{ frequency: 620, to: 420, duration: 0.14, at: 0 }, { frequency: 390, duration: 0.1, at: 0.12 }],
  };
  const notes = cues[cue];
  if (!notes) return;
  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);
  notes.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + note.at;
    oscillator.type = note.type || 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, start + note.duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(1, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.02);
  });
}

export async function toggleStationFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen?.();
    return;
  }
  await document.documentElement.requestFullscreen?.();
}

export function isEditableShortcutTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function matchesStationShortcut(event, shortcut) {
  const expected = String(shortcut || '').trim().toLowerCase();
  if (!expected) return false;
  const key = String(event?.key || '').toLowerCase();
  const code = String(event?.code || '').toLowerCase();
  return key === expected || code === `key${expected}`;
}

export function matchesEscapeShortcut(event) {
  const key = String(event?.key || '').toLowerCase();
  const code = String(event?.code || '').toLowerCase();
  return key === 'escape' || key === 'esc' || code === 'escape'
    || event?.keyCode === 27 || event?.which === 27;
}

export function cameraList(payload) {
  const values = Array.isArray(payload) ? payload : payload?.cameras;
  return Array.isArray(values) ? values : [];
}

export function cameraId(camera) {
  return clean(camera?.id) || clean(camera?.camera_id) || clean(camera?._id);
}

export function isCameraOnline(camera) {
  return camera?.online === true || camera?.online === 1 || clean(camera?.status).toLowerCase() === 'online';
}

export function isDepthCamera(camera) {
  return clean(camera?.kind).toLowerCase() === 'depth';
}

export function selectMeasurementCamera(payload) {
  const onlineCameras = cameraList(payload).filter(
    (camera) => isCameraOnline(camera) && !isDepthCamera(camera),
  );
  return onlineCameras.find(
    (camera) => clean(camera?.transport).toLowerCase() === 'usb',
  ) || onlineCameras[0] || null;
}

export function resolvePiUrl(piApi, value, fallbackPath) {
  const target = clean(value) || fallbackPath;
  if (!target) return '';
  try {
    return new URL(target, `${clean(piApi).replace(/\/$/, '')}/`).toString();
  } catch {
    return '';
  }
}

export function backendCaptureUrl(ip, pageProtocol = window.location.protocol) {
  const raw = clean(ip);
  if (!raw) throw new Error('Backend IP is missing');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `${pageProtocol === 'https:' ? 'https' : 'http'}://${raw}`;
  const url = new URL(withProtocol);
  if (!url.port) url.port = '5055';
  url.pathname = '/api/v2/measurements/captures';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function backendOrigin(ip, pageProtocol = window.location.protocol) {
  return new URL(backendCaptureUrl(ip, pageProtocol)).origin;
}

export function relativeCapturePath(uploaded) {
  const explicitPath = clean(uploaded?.path);
  if (explicitPath) return explicitPath.startsWith('/') ? explicitPath : `/${explicitPath}`;

  const legacyValue = clean(uploaded?.url) || clean(uploaded?.storagePath);
  if (legacyValue) {
    try {
      const parsed = new URL(legacyValue, window.location.origin);
      if (parsed.pathname.startsWith('/api/v2/measurements/captures/')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // Fall through to the filename-based route below.
    }
  }

  const filename = clean(uploaded?.filename);
  return filename ? `/api/v2/measurements/captures/${encodeURIComponent(filename)}` : '';
}

export function resolveBackendImageUrl(image, backendIp, pageProtocol = window.location.protocol) {
  const source = clean(typeof image === 'string' ? image : image?.url || image?.path || image?.storagePath);
  if (!source) return '';
  if (/^(?:https?:|blob:|data:)/i.test(source)) return source;
  if (source.startsWith('//')) return `${pageProtocol}${source}`;
  try {
    const publicPath = source.startsWith('/api/')
      ? source
      : `/api/v1/uploads/${source.replace(/^\/+/, '')}`;
    return new URL(publicPath, `${backendOrigin(backendIp, pageProtocol)}/`).toString();
  } catch {
    return '';
  }
}

export function measurementStartUrl(piApi, deviceIp = '') {
  const source = clean(piApi);
  const url = new URL(source);
  const registeredIp = clean(deviceIp);
  // The camera bridge may advertise 127.0.0.1 for software running locally
  // on the Pi. The station page can run on another machine, where loopback
  // points to that machine instead. Prefer the IP saved during Pi pairing.
  if (registeredIp) url.hostname = registeredIp;
  // Camera discovery runs on :8080, while measurement runs on :8000
  // on the same Raspberry Pi.
  url.port = '8000';
  url.pathname = '/v1/dimensions/measure';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function qrExtractionUrl(piApi, deviceIp = '') {
  const url = new URL(measurementStartUrl(piApi, deviceIp));
  url.pathname = '/v1/qr/extract-dimensions';
  return url.toString();
}

export function hasMeasuredData(incident) {
  const data = incident?.measuredData;
  return Boolean(data && typeof data === 'object' && Object.keys(data).length);
}

export function estimatedMeasurementSeconds(qrResponse) {
  const value = Number(qrResponse?.estimated_measurement_seconds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(3600, Math.ceil(value));
}

async function responseJson(response, fallbackMessage) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.body?.message || payload?.message || `${fallbackMessage} (${response.status})`);
  }
  return payload;
}

export function dimensionsFromSku(value) {
  const sku = clean(value).toUpperCase();
  const encodedDimensions = /(\d{2})(\d{2})(?:-(\d+(?:\.\d+)?))?$/.exec(sku);
  if (!encodedDimensions) return {};
  return {
    length: Number(encodedDimensions[1]),
    breadth: Number(encodedDimensions[2]),
    height: encodedDimensions[3] ? Number(encodedDimensions[3]) : 6,
  };
}

export function dimensionsFromCustomSize(value) {
  const customSize = clean(value);
  if (!customSize || /^n\/?a$/i.test(customSize)) return {};

  const labeledValue = (label) => {
    // Flo custom labels are emitted in both "Length: 73" and
    // "Length Size: 73 inch" forms. Treat the optional "Size" word and unit
    // as presentation text so the fifth QR value remains authoritative.
    const match = new RegExp(`\\b${label}\\b(?:\\s+size)?\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`, 'i').exec(customSize);
    return match ? Number(match[1]) : undefined;
  };
  const labeled = {
    length: labeledValue('(?:length|len|l)'),
    breadth: labeledValue('(?:breadth|width|b|w)'),
    height: labeledValue('(?:height|h)'),
  };
  if (Object.values(labeled).every(Number.isFinite)) return labeled;

  const triple = /(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)/i.exec(customSize);
  if (!triple) return {};
  return {
    length: Number(triple[1]),
    breadth: Number(triple[2]),
    height: Number(triple[3]),
  };
}

export function parseQrPayload(value) {
  const raw = clean(value);
  const segments = raw.split('*');
  // The first four asterisks delimit the fixed QR fields. The fifth field is
  // free-form and may itself contain asterisks (for example "73 * 36 * 8"),
  // so preserve everything after the fourth delimiter as one value.
  const parts = [
    ...segments.slice(0, 4),
    segments.slice(4).join('*'),
  ].map((part) => clean(part));
  if (segments.length < 5 || parts.some((part) => !part)) {
    const error = new Error('The QR code must contain five values separated by * characters.');
    error.stage = 'local-qr-parse';
    error.qrRaw = raw;
    throw error;
  }

  const sku = parts[3].toUpperCase();
  const metadata = {
    ref_no: parts[0],
    sales_order: parts[1],
    order_item: parts[2],
    sku,
    size_type: parts[4],
    raw,
  };

  // Custom-size QR labels put their requested measurements in the fifth
  // segment, for example: "Length: 73, Breadth: 36, Height: 8". Preserve that
  // segment verbatim and keep its dimensions separate from the dimensions
  // encoded in the SKU.
  const customDimensions = dimensionsFromCustomSize(parts[4]);
  if (Object.keys(customDimensions).length) metadata.custom_dimensions = customDimensions;

  // Mattress SKUs end with their base length and breadth as two two-digit
  // values, with an optional explicit height. A missing height means 6 in.
  // Examples: G_OS7242-5 => 72x42x5, CUS_AGS7536-8 => 75x36x8.
  Object.assign(metadata, dimensionsFromSku(sku), customDimensions);
  return metadata;
}

function isRecoverableQrDecodeError(error) {
  return ['NotFoundException', 'ChecksumException', 'FormatException'].includes(error?.name)
    || /no multiformat readers/i.test(error?.message || '');
}

function indicatesLocatedQr(error) {
  return ['ChecksumException', 'FormatException'].includes(error?.name);
}

async function decodeQrBlob(reader, blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await reader.decodeFromImageUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function decodeWithNativeBarcodeDetector(sourceBlob) {
  if (typeof window.BarcodeDetector !== 'function' || typeof createImageBitmap !== 'function') return '';
  let formats;
  try {
    formats = await window.BarcodeDetector.getSupportedFormats?.();
  } catch {
    formats = null;
  }
  if (Array.isArray(formats) && !formats.includes('qr_code')) return '';
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const results = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
    return clean(results?.[0]?.rawValue);
  } catch {
    return '';
  } finally {
    bitmap.close?.();
  }
}

async function enhancedQrBlob(sourceBlob, {
  cropRatio = 1,
  cropX = 0.5,
  cropY = 0.5,
  mode = 'none',
  channel = 'gray',
  upscale = 1,
} = {}) {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const sourceSide = Math.min(bitmap.width, bitmap.height);
    const useCrop = cropRatio > 0 && cropRatio < 1;
    const cropWidth = useCrop ? Math.round(sourceSide * cropRatio) : bitmap.width;
    const cropHeight = useCrop ? Math.round(sourceSide * cropRatio) : bitmap.height;
    const sourceX = Math.round((bitmap.width - cropWidth) * cropX);
    const sourceY = Math.round((bitmap.height - cropHeight) * cropY);
    const scale = Math.min(upscale, 1800 / Math.max(cropWidth, cropHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    // Nearest-neighbour keeps QR module edges crisp. Soft interpolation before
    // thresholding can merge adjacent black and white modules.
    if (upscale > 1) context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    if (mode === 'none') {
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const grayValues = mode === 'adaptive' ? new Uint8Array(canvas.width * canvas.height) : null;
    for (let index = 0; index < image.data.length; index += 4) {
      const gray = channel === 'red'
        ? image.data[index]
        : (image.data[index] * 0.299) + (image.data[index + 1] * 0.587) + (image.data[index + 2] * 0.114);
      if (grayValues) grayValues[index / 4] = gray;
      const value = mode === 'binary'
        ? (gray >= 145 ? 255 : 0)
        : Math.max(0, Math.min(255, ((gray - 128) * 1.9) + 128));
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
    }
    if (grayValues) {
      const width = canvas.width;
      const height = canvas.height;
      const integral = new Uint32Array((width + 1) * (height + 1));
      for (let y = 1; y <= height; y += 1) {
        let rowSum = 0;
        for (let x = 1; x <= width; x += 1) {
          rowSum += grayValues[((y - 1) * width) + x - 1];
          integral[(y * (width + 1)) + x] = integral[((y - 1) * (width + 1)) + x] + rowSum;
        }
      }
      const radius = Math.max(8, Math.round(Math.min(width, height) / 45));
      for (let y = 0; y < height; y += 1) {
        const top = Math.max(0, y - radius);
        const bottom = Math.min(height - 1, y + radius);
        for (let x = 0; x < width; x += 1) {
          const left = Math.max(0, x - radius);
          const right = Math.min(width - 1, x + radius);
          const area = (right - left + 1) * (bottom - top + 1);
          const sum = integral[((bottom + 1) * (width + 1)) + right + 1]
            - integral[(top * (width + 1)) + right + 1]
            - integral[((bottom + 1) * (width + 1)) + left]
            + integral[(top * (width + 1)) + left];
          const value = grayValues[(y * width) + x] < (sum / area) - 7 ? 0 : 255;
          const index = ((y * width) + x) * 4;
          image.data[index] = value;
          image.data[index + 1] = value;
          image.data[index + 2] = value;
        }
      }
    }
    context.putImageData(image, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    bitmap.close?.();
  }
}

export async function decodeQrImage(jpegBlob, { required = true } = {}) {
  if (!(jpegBlob instanceof Blob) || !jpegBlob.size) throw new Error('Camera returned an empty image');
  const reader = await getQrCodeReader();
  let lastDecodeError;
  let locatedButUndecodable = false;
  try {
    const result = await decodeQrBlob(reader, jpegBlob);
    const dimensions = parseQrPayload(result.getText());
    return { found: true, dimensions, raw: dimensions.raw, source: 'zxing-browser' };
  } catch (error) {
    if (error?.stage === 'local-qr-parse') throw error;
    if (!isRecoverableQrDecodeError(error)) throw error;
    locatedButUndecodable ||= indicatesLocatedQr(error);
    lastDecodeError = error;
  }

  const nativeRaw = await decodeWithNativeBarcodeDetector(jpegBlob);
  if (nativeRaw) {
    const dimensions = parseQrPayload(nativeRaw);
    return { found: true, dimensions, raw: dimensions.raw, source: 'native-barcode-detector' };
  }

  // @zxing/browser does not expose QRCodeDetector.detect() separately. Its
  // documented fallback is a coarse-to-fine tile search. A 3x3 set of 62%
  // crops overlaps enough to retain roughly 20-30% quiet-zone padding when a
  // QR falls on a tile boundary.
  const positions = [0, 0.5, 1];
  const candidateConfigs = [];
  for (const cropY of positions) {
    for (const cropX of positions) {
      const tile = `${Math.round(cropX * 2)}-${Math.round(cropY * 2)}`;
      candidateConfigs.push(
        { name: `tile-${tile}-raw`, cropRatio: 0.62, cropX, cropY, mode: 'none', upscale: 1 },
        { name: `tile-${tile}-threshold`, cropRatio: 0.62, cropX, cropY, mode: 'adaptive', upscale: 1 },
        { name: `tile-${tile}-upscaled-threshold`, cropRatio: 0.62, cropX, cropY, mode: 'adaptive', upscale: 3 },
      );
    }
  }
  // Blue packaging sometimes compresses luminance contrast. Retain one
  // full-frame red-channel pass after the spatial search.
  candidateConfigs.push({ name: 'full-red-channel', mode: 'contrast', channel: 'red', upscale: 1 });
  const attemptedCandidates = [];
  for (const config of candidateConfigs) {
    let candidateBlob;
    try {
      candidateBlob = await enhancedQrBlob(jpegBlob, config);
    } catch {
      continue;
    }
    if (!candidateBlob) continue;
    attemptedCandidates.push(config.name);
    try {
      const result = await decodeQrBlob(reader, candidateBlob);
      const dimensions = parseQrPayload(result.getText());
      return { found: true, dimensions, raw: dimensions.raw, source: `zxing-${config.name}` };
    } catch (error) {
      if (error?.stage === 'local-qr-parse') throw error;
      if (!isRecoverableQrDecodeError(error)) throw error;
      locatedButUndecodable ||= indicatesLocatedQr(error);
      lastDecodeError = error;
    }
  }
  const decodeStatus = locatedButUndecodable ? 'QR_DECODE_ERROR' : 'NO_QR_DETECTED';
  if (!required) {
    logQrScanMiss(jpegBlob, ['zxing-raw', 'native-raw', ...attemptedCandidates.map((name) => `zxing-${name}`)], decodeStatus);
    return null;
  }
  const wrapped = new Error(locatedButUndecodable
    ? 'A QR region was located, but its payload could not be decoded. Hold the label steady, keep the full quiet border visible, and reduce glare.'
    : 'No QR region was detected in the captured image. Place the complete QR inside the guide and try again.');
  wrapped.stage = 'local-qr-decode';
  wrapped.errorType = decodeStatus;
  wrapped.serviceMessage = lastDecodeError?.name || '';
  throw wrapped;
}

export async function startDepthMeasurement(station, sku, signal) {
  const endpoint = measurementStartUrl(station?.pi?.api, station?.pi?.device?.ip);
  const normalizedSku = clean(sku).toUpperCase();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: normalizedSku }),
    });
    let payload;
    try {
      payload = await responseJson(response, 'Measurement start failed');
    } catch (error) {
      error.status = response.status;
      throw error;
    }
    const result = payload?.body?.data || payload?.body || payload?.data || payload;
    logStationSuccess('measurement-start-response', {
      sku: normalizedSku,
      stationId: station?.pi?.device?.mac,
      source: 'raspberry-pi-measurement-api',
      message: 'Depth measurement API accepted the decoded SKU',
      details: result,
    });
    return result && typeof result === 'object' ? result : {};
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const networkFailure = error instanceof TypeError || /failed to fetch/i.test(error.message);
    const wrapped = new Error(networkFailure
      ? `Unable to reach the measurement API at ${endpoint}. Check port 8000 and browser CORS access.`
      : error.message);
    wrapped.stage = 'measurement-start';
    wrapped.endpoint = endpoint;
    wrapped.status = error.status || null;
    wrapped.errorType = networkFailure ? 'network-or-cors' : 'service-response';
    throw wrapped;
  }
}

export async function extractQrWithDs(station, jpegBlob, signal, { automatic = false } = {}) {
  const endpoint = qrExtractionUrl(station?.pi?.api, station?.pi?.device?.ip);
  const form = new FormData();
  form.append('image', jpegBlob, 'qr_code.jpg');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal,
      cache: 'no-store',
      body: form,
    });
    let payload;
    try {
      payload = await responseJson(response, 'DS QR extraction failed');
    } catch (error) {
      error.status = response.status;
      throw error;
    }
    const result = payload?.body?.data || payload?.body || payload?.data || payload;
    if (!result?.found || !result?.dimensions?.sku) {
      const error = new Error(result?.error_message || result?.failure_reason || 'The DS service did not find a readable QR code');
      error.failureReason = result?.failure_reason || '';
      error.serviceMessage = result?.error_message || '';
      throw error;
    }
    const rawPayload = [
      result.raw,
      result.raw_payload,
      result.rawPayload,
      result.qr_payload,
      result.qrPayload,
      result.decoded_text,
      result.decodedText,
      result.dimensions?.raw,
      result.dimensions?.raw_payload,
      result.dimensions?.rawPayload,
    ].map(clean).find(Boolean) || '';
    let parsedMetadata = {};
    if (rawPayload) {
      try {
        parsedMetadata = parseQrPayload(rawPayload);
      } catch {
        // Keep a successful DS result usable if a future service returns a
        // diagnostic string here instead of the five-part QR payload.
      }
    }
    const dsDimensions = result.dimensions || {};
    const skuVariant = clean(dsDimensions.sku_variant) || clean(dsDimensions.skuVariant)
      || clean(result.sku_variant) || clean(result.skuVariant) || parsedMetadata.sku;
    const skuDimensions = dimensionsFromSku(skuVariant);
    const normalizedSizeType = clean(dsDimensions.size_type) || clean(dsDimensions.sizeType)
      || clean(result.size_type) || clean(result.sizeType) || parsedMetadata.size_type;
    const customDimensions = dimensionsFromCustomSize(normalizedSizeType);
    const numericDimension = (...values) => {
      const value = values.find((candidate) => candidate != null
        && candidate !== '' && Number.isFinite(Number(candidate)));
      return value == null ? undefined : Number(value);
    };
    const normalizedDimensions = {
      ...parsedMetadata,
      ...dsDimensions,
      ref_no: clean(dsDimensions.ref_no) || clean(dsDimensions.refNo)
        || clean(result.ref_no) || clean(result.refNo) || parsedMetadata.ref_no,
      sales_order: clean(dsDimensions.sales_order) || clean(dsDimensions.salesOrder)
        || clean(result.sales_order) || clean(result.salesOrder) || parsedMetadata.sales_order,
      order_item: clean(dsDimensions.order_item) || clean(dsDimensions.orderItem)
        || clean(result.order_item) || clean(result.orderItem) || parsedMetadata.order_item,
      sku: (clean(dsDimensions.sku) || clean(result.sku) || parsedMetadata.sku).toUpperCase(),
      ...(skuVariant ? { sku_variant: skuVariant.toUpperCase() } : {}),
      size_type: normalizedSizeType,
      ...(Object.keys(customDimensions).length ? { custom_dimensions: customDimensions } : {}),
      length: numericDimension(customDimensions.length, skuDimensions.length, parsedMetadata.length, dsDimensions.length, result.length),
      breadth: numericDimension(
        customDimensions.breadth,
        skuDimensions.breadth,
        parsedMetadata.breadth,
        dsDimensions.breadth,
        dsDimensions.width,
        result.breadth,
        result.width,
      ),
      height: numericDimension(customDimensions.height, skuDimensions.height, parsedMetadata.height, dsDimensions.height, result.height),
    };
    if (rawPayload) normalizedDimensions.raw = rawPayload;
    const normalized = {
      ...result,
      ...(rawPayload ? { raw: rawPayload } : {}),
      dimensions: normalizedDimensions,
      source: automatic ? 'ds-qr-extraction-auto-fallback' : 'ds-qr-extraction-fallback',
    };
    logStationSuccess('ds-qr-fallback-response', {
      sku: normalized.dimensions.sku,
      stationId: station?.pi?.device?.mac,
      source: 'raspberry-pi-qr-api',
      message: automatic
        ? 'Automatic scan was decoded by the DS QR fallback API after local decoding missed'
        : 'Manual S capture was decoded by the DS QR fallback API',
      details: normalized,
    });
    return normalized;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const networkFailure = error instanceof TypeError || /failed to fetch/i.test(error.message);
    const wrapped = new Error(networkFailure
      ? `Unable to reach the DS QR fallback API at ${endpoint}.`
      : error.message);
    wrapped.stage = 'ds-qr-extraction-fallback';
    wrapped.endpoint = endpoint;
    wrapped.status = error.status || null;
    wrapped.errorType = networkFailure ? 'network-or-cors' : 'service-response';
    wrapped.failureReason = error.failureReason || '';
    wrapped.serviceMessage = error.serviceMessage || '';
    throw wrapped;
  }
}

export async function createMeasurementIncident(station, { qrMetadata, qrResponse, qrImagePath, qrImage, signal }) {
  const response = await fetch(`${backendOrigin(station.backend.ip)}/api/v2/measurement-incidents`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${station.backend.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stationId: station.pi.device.mac,
      qrImagePath,
      qrImage,
      operatorId: station.operatorId || undefined,
      qrMetadata,
      qrResponse,
    }),
  });
  const payload = await responseJson(response, 'Measurement incident creation failed');
  return payload?.body?.data || payload?.body || payload;
}

async function deleteUploadedCapture(station, uploaded) {
  const filename = clean(uploaded?.filename);
  if (!filename) return;
  const response = await fetch(
    `${backendOrigin(station.backend.ip)}/api/v2/measurements/captures/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${station.backend.token}` },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Capture cleanup failed (${response.status})`);
  }
}

export async function fetchMeasurementIncident(station, incidentId, signal) {
  if (!incidentId) return null;
  const response = await fetch(
    `${backendOrigin(station.backend.ip)}/api/v2/measurement-incidents/${encodeURIComponent(incidentId)}`,
    {
      signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${station.backend.token}` },
    },
  );
  const payload = await responseJson(response, 'Measurement incident fetch failed');
  return payload?.body?.data || payload?.body || payload;
}

export async function fetchMeasurementIncidentBySku(station, sku, signal) {
  const normalizedSku = clean(sku).toUpperCase();
  if (!normalizedSku) return null;
  const query = new URLSearchParams();
  const stationId = clean(station?.pi?.device?.mac);
  if (stationId) query.set('stationId', stationId);
  const suffix = query.size ? `?${query.toString()}` : '';
  const response = await fetch(
    `${backendOrigin(station.backend.ip)}/api/v2/measurement-incidents/by-sku/${encodeURIComponent(normalizedSku)}${suffix}`,
    {
      signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${station.backend.token}` },
    },
  );
  const payload = await responseJson(response, 'Measurement incident SKU lookup failed');
  return payload?.body?.data || payload?.body || payload;
}

export async function updateMeasurementIncident(station, incidentId, method, body) {
  if (!incidentId) throw new Error('Measurement incident is not available yet');
  const suffix = method === 'PATCH' ? '/status' : '';
  const response = await fetch(
    `${backendOrigin(station.backend.ip)}/api/v2/measurement-incidents/${encodeURIComponent(incidentId)}${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${station.backend.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(payload?.body?.message || payload?.message || `Request failed (${response.status})`);
  return payload?.body?.data || payload?.body || payload;
}

export function stationConfigurationError(station) {
  if (!clean(station?.backend?.token)) return 'Approved station token is missing.';
  if (!clean(station?.backend?.ip)) return 'Backend IP is missing.';
  if (!clean(station?.pi?.api)) return 'Pi camera API is missing.';
  if (!clean(station?.pi?.device?.mac)) return 'Station MAC address is missing.';
  return '';
}

export async function captureCameraImage(station, camera, signal) {
  const id = cameraId(camera);
  if (!id) throw new Error('Selected camera has no ID');
  if (isDepthCamera(camera)) throw new Error('Depth cameras cannot be used for measurement capture');
  if (!isCameraOnline(camera)) throw new Error('Selected camera is offline');

  const captureUrl = cacheBustedUrl(resolvePiUrl(station.pi.api, camera.capture_url, `/api/cameras/${encodeURIComponent(id)}/capture`));
  let captureResponse = await fetch(captureUrl, { method: 'GET', signal, cache: 'no-store' });
  if (captureResponse.status === 405) {
    captureResponse = await fetch(captureUrl, { method: 'POST', signal, cache: 'no-store' });
  }
  if (!captureResponse.ok) throw new Error(`Camera capture failed (${captureResponse.status})`);

  const jpegBlob = await captureResponse.blob();
  if (!jpegBlob.size) throw new Error('Camera returned an empty image');
  return jpegBlob;
}

export async function scanCameraForQr(station, camera, signal, { useDsFallback = false } = {}) {
  const jpegBlob = await captureCameraImage(station, camera, signal);
  window.videoraiqLastQrScan = jpegBlob;
  // On scheduled fallback attempts, ask DS first. The difficult blue-plastic
  // labels are decoded there quickly, while the browser's multi-pass ZXing
  // retries can otherwise delay the DS request considerably.
  if (useDsFallback) {
    try {
      const dsQrResponse = await extractQrWithDs(station, jpegBlob, signal, { automatic: true });
      return { jpegBlob, qrResponse: dsQrResponse };
    } catch (error) {
      // A normal "not found / not decoded" result only means this frame has no
      // usable QR yet. Connectivity and HTTP failures must remain visible.
      if (!error.failureReason && !error.serviceMessage) throw error;
    }
  }
  const qrResponse = await decodeQrImage(jpegBlob, { required: false });
  return qrResponse ? { jpegBlob, qrResponse } : null;
}

async function deleteMeasurementIncident(station, incidentId) {
  if (!incidentId) return;
  const response = await fetch(
    `${backendOrigin(station.backend.ip)}/api/v2/measurement-incidents/${encodeURIComponent(incidentId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${station.backend.token}` } },
  );
  if (!response.ok && response.status !== 404) throw new Error(`Incident cleanup failed (${response.status})`);
}

export async function captureAndUpload({ station, camera, signal, progress = {}, jpegBlob: suppliedBlob, qrResponse: suppliedQrResponse, captureMode = 'manual' }) {
  const id = cameraId(camera);
  if (!id) throw new Error('Selected camera has no ID');
  if (isDepthCamera(camera)) throw new Error('Depth cameras cannot be used for measurement capture');
  if (!isCameraOnline(camera)) throw new Error('Selected camera is offline');
  const capturedAt = new Date().toISOString();
  const jpegBlob = suppliedBlob || await captureCameraImage(station, camera, signal);
  progress.captureCompleted = true;
  const qrResponse = suppliedQrResponse
    || (captureMode === 'manual'
      ? await extractQrWithDs(station, jpegBlob, signal)
      : await decodeQrImage(jpegBlob));

  window.videoraiqLastCapture = jpegBlob;
  progress.qrCompleted = true;
  progress.qrResponse = qrResponse;
  logStationSuccess('local-qr-decoded', {
    sku: qrResponse?.dimensions?.sku,
    stationId: station.pi.device.mac,
    source: qrResponse?.source || `zxing-browser-${captureMode}`,
    message: captureMode === 'manual'
      ? 'QR decoded through the manual DS extraction fallback'
      : 'QR decoded locally without the DS QR extraction API',
    details: qrResponse,
  });

  const uploadEndpoint = backendCaptureUrl(station.backend.ip);
  const uploadResponse = await fetch(uploadEndpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${station.backend.token}`,
        'Content-Type': 'image/jpeg',
        'X-Camera-Id': id,
        'X-Station-Id': station.pi.device.mac,
        // The existing capture contract accepts only "start". Automatic QR
        // detection changes how this flow begins, not the backend trigger type.
        'X-Capture-Trigger': 'start',
        'X-Captured-At': capturedAt,
      },
      body: jpegBlob,
    });
  progress.uploadCompleted = true;
  progress.uploadStatus = uploadResponse.status;
  let uploaded;
  try {
    uploaded = await uploadResponse.json();
  } catch {
    uploaded = null;
  }
  logStationSuccess('capture-upload-response', {
    stationId: station.pi.device.mac,
    source: 'backend-capture-api',
    message: `Capture upload API returned HTTP ${uploadResponse.status}`,
    details: uploaded,
  });
  if (!uploadResponse.ok) {
    const error = new Error(uploaded?.message || uploaded?.body?.message || `Capture upload failed (${uploadResponse.status})`);
    error.stage = 'capture-upload';
    error.endpoint = uploadEndpoint;
    error.status = uploadResponse.status;
    throw error;
  }

  const qrImagePath = relativeCapturePath(uploaded);
  if (!qrImagePath) {
    throw new Error('Capture upload response did not include an image path');
  }

  let incident;
  try {
    incident = await createMeasurementIncident(station, {
      qrMetadata: qrResponse.dimensions,
      qrResponse,
      qrImagePath,
      qrImage: {
        url: qrImagePath,
        filename: uploaded.filename,
      },
      signal,
    });
    progress.incidentCompleted = true;
  } catch (error) {
    await deleteUploadedCapture(station, uploaded).catch((cleanupError) => {
      console.error('[VideoraIQ capture cleanup error]', cleanupError);
    });
    throw error;
  }

  let measurementResponse;
  try {
    measurementResponse = await startDepthMeasurement(station, qrResponse.dimensions.sku, signal);
    progress.measurementStarted = true;
  } catch (error) {
    await deleteMeasurementIncident(station, incident?._id).catch((cleanupError) => {
      console.error('[VideoraIQ incident cleanup error]', cleanupError);
    });
    await deleteUploadedCapture(station, uploaded).catch((cleanupError) => {
      console.error('[VideoraIQ capture cleanup error]', cleanupError);
    });
    throw error;
  }

  const completeQrResponse = { ...qrResponse, ...measurementResponse };
  incident = {
    ...incident,
    requestPayload: {
      ...(incident?.requestPayload || {}),
      qrResponse: completeQrResponse,
    },
  };

  const result = { jpegBlob, uploaded, qrResponse: completeQrResponse, incident, capturedAt, camera, captureMode };
  logStationSuccess('qr-incident-created', {
    incidentId: incident?._id,
    sku: incident?.qrSku || incident?.qrMetadata?.sku,
    stationId: incident?.stationId,
    source: 'create-api',
    message: 'QR capture uploaded and Measurement Incident created',
  });
  window.dispatchEvent(new CustomEvent('videoraiq:measurement-capture', { detail: result }));
  return result;
}
