import { friendlyType, formatIncidentTime, formatIncidentDay, buildIncidentImageUrl } from '../../../messagingService/message.helper.js';

import { LEGACY_TEMPLATE_BODY } from './whatsapp.templateDefinitions.js';
export * from './whatsapp.templateDefinitions.js';

const clean = (value, uppercase = true) => {
  const text = String(value ?? 'N/A').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim() || 'N/A';
  return uppercase ? text.toUpperCase() : text;
};
export function buildDefaultTemplateValues(incident = {}, nvr = {}, camera = {}, timezone) {
  const values = [
    clean(friendlyType(incident.incidentType)), clean(incident.incidentName),
    clean(formatIncidentDay(incident.timeOfIncident, timezone)), clean(formatIncidentTime(incident.timeOfIncident, timezone), false),
    clean(incident.severity), clean(camera.customName || camera.name || incident.cameraId), clean(nvr.nvrName),
    clean(incident.zone || incident.zoneName), clean(buildIncidentImageUrl(incident) || 'Unavailable', false), clean(incident.description),
  ];
  // Bound the rendered media-template body, keeping the snapshot URL intact.
  const renderedLength = () => LEGACY_TEMPLATE_BODY.replace(/\{\{(\d+)\}\}/g, (_, index) => values[Number(index) - 1]).length;
  for (const index of [9, 1, 0, 5, 6, 7]) {
    const excess = renderedLength() - 1024;
    if (excess <= 0) break;
    values[index] = values[index].slice(0, Math.max(3, values[index].length - excess));
  }
  if (renderedLength() > 1024) throw new Error('Incident details exceed the WhatsApp template message limit');
  return values;
}
