export const UNIFORM_SETTING_TYPE = "uniformDetectionSettings";

export function validateUniformSettings(settingType, settings, requireZones = false) {
  if (settingType !== UNIFORM_SETTING_TYPE) return { error: null };
  try {
    if (requireZones && !settings?.referencePoints) throw new Error("Uniform Detection requires at least one polygon");
    if (settings?.referencePoints) {
      const entries = settings.referencePoints instanceof Map ? [...settings.referencePoints.values()] : Object.values(settings.referencePoints);
      if (!entries.length) throw new Error("Uniform Detection requires at least one polygon");
      for (const zones of entries) buildUniformDetector(zones, settings.zone_configs, settings.levelOfImportance ?? "moderate", settings, settings.videoResolution);
    }
    return { error: null };
  } catch (error) { return { error }; }
}

export function normalizeUniformIncident(body = {}) {
  if (!["uniformDetection", "uniformDetectionSettings", "uniform_detection"].includes(body.incidentType)) return;
  body.incidentType = "uniformDetection";
  body.Image = body.Image ?? body.image;
  body.timeOfIncident = body.timeOfIncident ?? body.incidentTime ?? body.incident_time;
  if (!body.timeOfIncident || !Number.isFinite(new Date(body.timeOfIncident).getTime())) {
    throw new Error("Uniform Detection requires a valid timeOfIncident");
  }
  if (typeof body.Image !== "string" || !body.Image.trim()) throw new Error("Uniform Detection requires an incident image");
  if (body.severity !== undefined && !["low", "moderate", "high"].includes(body.severity)) {
    throw new Error("Invalid Uniform Detection severity");
  }
  body.incidentName = body.incidentName || "Uniform Detection";
}

export function buildUniformDetector(zones = [], zoneConfigs = [], severity = "moderate", settings = {}, resolution = []) {
  if (!Array.isArray(zones) || !zones.length || !Array.isArray(zoneConfigs) || zones.length !== zoneConfigs.length) {
    throw new Error("Uniform Detection needs one named zone_config for each polygon");
  }
  const [width, height] = resolution;
  const normalized = zones.every(polygon => Array.isArray(polygon) && polygon.every(point =>
    Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1)));
  if (!normalized && !(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error("Uniform Detection needs videoResolution to normalize pixel coordinates");
  }
  const polygons = zones.map(polygon => {
    if (!Array.isArray(polygon) || polygon.length < 3) throw new Error("Uniform Detection polygons need at least three points");
    return polygon.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw new Error("Invalid Uniform Detection coordinate");
      const [x, y] = normalized ? point : [point[0] / width, point[1] / height];
      if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error("Uniform Detection coordinates must be inside the video frame");
      return [x, y];
    });
  });
  const configs = zoneConfigs.map(config => {
    const name = String(config?.name ?? "").trim();
    if (!name) throw new Error("Uniform Detection zone names are required");
    return { name };
  });
  const person_threshold = settings.person_threshold ?? 0.45;
  const uniform_confidence = settings.uniform_confidence ?? 0.60;
  for (const value of [person_threshold, uniform_confidence]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Uniform Detection confidence must be between 0 and 1");
  }
  if (!["low", "moderate", "high"].includes(severity)) throw new Error("Invalid Uniform Detection severity");
  return { name: UNIFORM_SETTING_TYPE, zones: polygons, zone_configs: configs, person_threshold, uniform_confidence, severity };
}
