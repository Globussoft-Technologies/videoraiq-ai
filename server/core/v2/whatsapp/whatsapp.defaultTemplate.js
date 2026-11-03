import { friendlyType, formatIncidentTime, formatIncidentDay, buildIncidentImageUrl } from '../../../messagingService/message.helper.js';

// Versioned because Meta cannot replace an approved template's parameter layout in place.
export const DEFAULT_TEMPLATE_NAME = 'videoraiq_incident_alert_v2';
export const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';
export const DEFAULT_TEMPLATE_BODY = [
  '🚨 *INCIDENT ALERT*',
  '*Type:* {{1}}', '*Name:* {{2}}', '*Day:* {{3}}', '*Time:* {{4}}',
  '*Severity:* {{5}}', '*Camera:* {{6}}', '*NVR:* {{7}}', '*Zone:* {{8}}',
  '*Image Link:* {{9}}', '*Description:* {{10}}',
  'Please review this incident in your VideoRAIQ dashboard.',
].join('\n');
export const DEFAULT_TEMPLATE_EXAMPLE = [
  'DESK ABSENCE DETECTION', 'DESK ABSENCE DETECTION FOR DMA-CABIN (CAM -02)',
  'TUESDAY', '9/22/2026, 8:00:30 PM', 'MODERATE', 'DMA-CABIN (CAM -02)',
  'NVR12', 'DA', 'https://example.com/incident.jpg', '2 PERSON(S) MISSING FROM DA',
];
export const isDefaultTemplate = template => template?.name === DEFAULT_TEMPLATE_NAME && template?.language === DEFAULT_TEMPLATE_LANGUAGE;
export const FALLBACK_TEMPLATE_NAME = 'videoraiq_incident_text_v2';
export const FALLBACK_TEMPLATE_BODY = DEFAULT_TEMPLATE_BODY.replace('*Image Link:* {{9}}', '*Snapshot:* Snapshot unavailable').replace('{{10}}', '{{9}}');
export const supportedFallbackTemplate = template => template?.name === FALLBACK_TEMPLATE_NAME
  && template.language === DEFAULT_TEMPLATE_LANGUAGE && template.status === 'APPROVED' && template.parameter_format !== 'NAMED'
  && template.components?.length === 1 && template.components[0].type === 'BODY' && template.components[0].text === FALLBACK_TEMPLATE_BODY;
export const supportedDefaultTemplate = template => {
  if (!isDefaultTemplate(template) || template.status !== 'APPROVED' || template.parameter_format === 'NAMED') return false;
  const components = template.components || [];
  return components.length === 2 && components.filter(item => item.type === 'HEADER' && item.format === 'IMAGE').length === 1
    && components.filter(item => item.type === 'BODY' && item.text === DEFAULT_TEMPLATE_BODY).length === 1;
};
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
  const renderedLength = () => DEFAULT_TEMPLATE_BODY.replace(/\{\{(\d+)\}\}/g, (_, index) => values[Number(index) - 1]).length;
  for (const index of [9, 1, 0, 5, 6, 7]) {
    const excess = renderedLength() - 1024;
    if (excess <= 0) break;
    values[index] = values[index].slice(0, Math.max(3, values[index].length - excess));
  }
  if (renderedLength() > 1024) throw new Error('Incident details exceed the WhatsApp template message limit');
  return values;
}
