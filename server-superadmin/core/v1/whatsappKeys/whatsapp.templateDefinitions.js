// Versioned because Meta cannot replace an approved template's parameter layout in place.
export const LEGACY_TEMPLATE_NAME = 'videoraiq_incident_alert_v2';
export const DEFAULT_TEMPLATE_NAME = 'videoraiq_incident_alert_v3';
export const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';
export const LEGACY_TEMPLATE_BODY = [
  '🚨 *INCIDENT ALERT*',
  '*Type:* {{1}}', '*Name:* {{2}}', '*Day:* {{3}}', '*Time:* {{4}}',
  '*Severity:* {{5}}', '*Camera:* {{6}}', '*NVR:* {{7}}', '*Zone:* {{8}}',
  '*Image Link:* {{9}}', '*Description:* {{10}}',
  'Please review this incident in your VideoRAIQ dashboard.',
].join('\n');
export const DEFAULT_TEMPLATE_BODY = LEGACY_TEMPLATE_BODY.replace('*Image Link:* {{9}}\n', '').replace('{{10}}', '{{9}}');
export const DEFAULT_TEMPLATE_EXAMPLE = [
  'DESK ABSENCE DETECTION', 'DESK ABSENCE DETECTION FOR DMA-CABIN (CAM -02)',
  'TUESDAY', '9/22/2026, 8:00:30 PM', 'MODERATE', 'DMA-CABIN (CAM -02)',
  'NVR12', 'DA', '2 PERSON(S) MISSING FROM DA',
];
export const isDefaultTemplate = template => template?.name === DEFAULT_TEMPLATE_NAME && template?.language === DEFAULT_TEMPLATE_LANGUAGE;
export const FALLBACK_TEMPLATE_NAME = 'videoraiq_incident_text_v2';
export const FALLBACK_TEMPLATE_BODY = LEGACY_TEMPLATE_BODY.replace('*Image Link:* {{9}}', '*Snapshot:* Snapshot unavailable').replace('{{10}}', '{{9}}');
export const supportedFallbackTemplate = template => template?.name === FALLBACK_TEMPLATE_NAME
  && template.language === DEFAULT_TEMPLATE_LANGUAGE && template.status === 'APPROVED' && template.parameter_format !== 'NAMED'
  && template.components?.length === 1 && template.components[0].type === 'BODY' && template.components[0].text === FALLBACK_TEMPLATE_BODY;
export const supportedDefaultTemplate = template => {
  if (![DEFAULT_TEMPLATE_NAME, LEGACY_TEMPLATE_NAME].includes(template?.name) || template.language !== DEFAULT_TEMPLATE_LANGUAGE || template.status !== 'APPROVED' || template.parameter_format === 'NAMED') return false;
  const components = template.components || [];
  return components.length === 2 && components.filter(item => item.type === 'HEADER' && item.format === 'IMAGE').length === 1
    && components.filter(item => item.type === 'BODY' && item.text === (template.name === LEGACY_TEMPLATE_NAME ? LEGACY_TEMPLATE_BODY : DEFAULT_TEMPLATE_BODY)).length === 1;
};

export const preferredImageTemplate = templates => templates.find(item => item.name === DEFAULT_TEMPLATE_NAME && supportedDefaultTemplate(item))
  || templates.find(item => item.name === LEGACY_TEMPLATE_NAME && supportedDefaultTemplate(item));
