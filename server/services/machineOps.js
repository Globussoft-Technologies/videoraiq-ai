import Joi from 'joi';

export const isMachinePolygon = value => Array.isArray(value) && value.length >= 3
  && value.every(point => Array.isArray(point) && point.length === 2
    && point.every(axis => typeof axis === 'number' && Number.isFinite(axis) && axis >= 0 && axis <= 1))
  && Math.abs(value.reduce((area, point, i) => {
    const next = value[(i + 1) % value.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0)) > 1e-10;

const polygon = Joi.array().custom((value, helpers) => isMachinePolygon(value) ? value : helpers.message('Zone must be a non-empty polygon with normalized coordinates between 0 and 1'));
export const machineOpsSettingsSchema = Joi.object({
  machines: Joi.array().min(1).unique('machine_id').items(Joi.object({
    machine_id: Joi.string().trim().required(), name: Joi.string().trim().required(),
    machine_zone: polygon.required(), indicator_zone: polygon.required(),
  })).required(),
}).unknown(true);

export const machineOpsIncidentSchema = Joi.object({
  eventId: Joi.string().trim().required(), machineId: Joi.string().trim().required(),
  machineName: Joi.string().trim().required(), machineState: Joi.string().valid('ON', 'OFF').required(),
  timeOfIncident: Joi.string().isoDate().required(), incidentName: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
}).unknown(true);
