export function postureDetectorPayload({ zones, zoneConfigs, settings, severity }) {
  return {
    name: 'personPostureDetectionSettings',
    trigger_on: settings?.trigger_on || 'both',
    zones: zones || [],
    zone_configs: (zoneConfigs || []).map(zone => ({ name: zone.name, trigger_on: zone.trigger_on || settings?.trigger_on || 'both' })),
    zone_name: settings?.zone_name || zoneConfigs?.[0]?.name || 'Work Area',
    severity,
    trigger_notification: settings?.trigger_notification !== false,
  };
}

export function cansStackDetectorPayload({ zoneConfigs, settings, severity }) {
  return {
    name: 'cansStackDetectionSettings',
    layers: settings?.layers ?? 3,
    zone_name: settings?.zone_name || zoneConfigs?.[0]?.name || 'Can Storage Area',
    severity,
    trigger_notification: settings?.trigger_notification !== false,
  };
}
