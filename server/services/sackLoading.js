import Joi from "joi";

export const SACK_SETTING = "sackLoadingUnloadingSettings";
export const SACK_INCIDENT = "sackLoadingUnloadingDetection";
export const SACK_COUNTS = ["sackCount", "whiteSackCount", "brownSackCount", "otherSackCount", "cottonBoxCount", "totalCount"];
const count = Joi.number().integer().min(0).required();
export const sackIncidentSchema = Joi.object({
  eventId: Joi.string().trim().required(), vehicleSessionId: Joi.string().trim().required(),
  direction: Joi.string().valid("loading", "unloading").required(),
  timeOfIncident: Joi.string().isoDate().required(), incidentName: Joi.string().trim().required(),
  description: Joi.string().allow(""), vehicleNumber: Joi.string().allow("", null),
  truckPresent: Joi.boolean(), triggerNotification: Joi.boolean(),
  ...Object.fromEntries(SACK_COUNTS.map(key => [key, count])),
}).unknown(true).custom((value, helpers) => {
  if (value.sackCount !== value.whiteSackCount + value.brownSackCount + value.otherSackCount) return helpers.message("sackCount must equal whiteSackCount + brownSackCount + otherSackCount");
  if (value.totalCount !== value.sackCount + value.cottonBoxCount) return helpers.message("totalCount must equal sackCount + cottonBoxCount");
  return value;
});
export const sackSettingsSchema = Joi.object({
  mode: Joi.string().valid("loading", "unloading", "both"),
  zone_configs: Joi.array().min(1).items(Joi.object({
    name: Joi.string().trim().required(), activity_mode: Joi.string().valid("loading", "unloading", "both").required(),
  }).unknown(true)).required(),
}).unknown(true);

export function sackDetector({ zones, zone_configs, settings = {} }) {
  const polygons = Array.isArray(zones) && zones.length && !Array.isArray(zones[0]?.[0]) ? [zones] : zones || [];
  const modes = ["loading", "unloading", "both"];
  const mode = modes.includes(settings.mode) ? settings.mode : "both";
  return { name: SACK_SETTING, mode, trigger_notification: settings.trigger_notification ?? true, zones: polygons,
    zone_configs: polygons.map((_, index) => {
      const input = zone_configs?.[index];
      const zone = input?.toObject ? input.toObject() : input?._doc || input || {};
      return { name: zone.name || `Zone ${index + 1}`, activity_mode: modes.includes(zone.activity_mode) ? zone.activity_mode : mode };
    }),
  };
}
