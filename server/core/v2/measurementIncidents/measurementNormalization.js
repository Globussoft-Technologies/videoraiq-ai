const CM_PER_INCH = 2.54;
const MM_PER_INCH = 25.4;
const SNAP_DISTANCE_INCHES = 1;

const SCALES = [1, CM_PER_INCH, MM_PER_INCH];

function numeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function axisValue(source, aliases) {
  for (const alias of aliases) {
    const candidate = source?.[alias];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = numeric(candidate.measured ?? candidate.actual ?? candidate.value);
      if (nested != null) return nested;
    } else {
      const scalar = numeric(candidate);
      if (scalar != null) return scalar;
    }
  }
  return null;
}

function declaredDimensions(qrMetadata = {}) {
  const custom = qrMetadata.custom_dimensions && typeof qrMetadata.custom_dimensions === "object"
    ? qrMetadata.custom_dimensions
    : {};
  return {
    length: numeric(custom.length) ?? numeric(qrMetadata.length),
    breadth: numeric(custom.breadth ?? custom.width) ?? numeric(qrMetadata.breadth ?? qrMetadata.width),
    height: numeric(custom.height) ?? numeric(qrMetadata.height),
  };
}

function detectedScale(raw, declared) {
  const axes = ["length", "breadth", "height"];
  let bestScale = 1;
  let bestError = Infinity;
  for (const scale of SCALES) {
    let error = 0;
    let compared = 0;
    for (const axis of axes) {
      if (raw[axis] == null || declared[axis] == null || declared[axis] <= 0) continue;
      error += Math.abs((raw[axis] / scale) - declared[axis]) / declared[axis];
      compared += 1;
    }
    if (compared && error / compared < bestError) {
      bestError = error / compared;
      bestScale = scale;
    }
  }
  return bestScale;
}

function snapped(value, declared) {
  if (value == null) return null;
  if (declared == null) return value;
  return Math.abs(value - declared) <= SNAP_DISTANCE_INCHES + Number.EPSILON
    ? declared
    : value;
}

export function normalizeMeasuredData(measuredData = {}, qrMetadata = {}) {
  if (!measuredData || typeof measuredData !== "object" || Array.isArray(measuredData)) return {};

  const raw = {
    length: axisValue(measuredData, ["length"]),
    breadth: axisValue(measuredData, ["breadth", "width"]),
    height: axisValue(measuredData, ["height"]),
  };
  const declared = declaredDimensions(qrMetadata);
  const scale = detectedScale(raw, declared);
  const normalized = { ...measuredData };

  if (raw.length != null) normalized.length = snapped(raw.length / scale, declared.length);
  if (raw.breadth != null) {
    normalized.breadth = snapped(raw.breadth / scale, declared.breadth);
    if (Object.prototype.hasOwnProperty.call(measuredData, "width")) normalized.width = normalized.breadth;
  }
  if (raw.height != null) normalized.height = snapped(raw.height / scale, declared.height);

  return normalized;
}

export { SNAP_DISTANCE_INCHES };
