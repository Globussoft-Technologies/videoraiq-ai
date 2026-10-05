import moment from 'moment-timezone';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

let configuredTimezone = DEFAULT_TIMEZONE;

export function setConfiguredTimezone(value) {
  configuredTimezone = value && moment.tz.zone(value) ? value : DEFAULT_TIMEZONE;
  moment.tz.setDefault(configuredTimezone);
  return configuredTimezone;
}

export function getConfiguredTimezone() {
  return configuredTimezone;
}

export function nowInConfiguredTimezone() {
  return moment().tz(configuredTimezone);
}

// API timestamps are UTC instants. Parsing explicitly as UTC also keeps older
// values saved without a trailing `Z` from being interpreted as browser time.
export function utcToConfiguredTimezone(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = moment.utc(value);
  return parsed.isValid() ? parsed.tz(configuredTimezone) : null;
}

export function formatUtcInConfiguredTimezone(value, format, fallback = '--') {
  const parsed = utcToConfiguredTimezone(value);
  return parsed ? parsed.format(format) : fallback;
}

export function formatDateTime(value, options = {}, locale = undefined) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: configuredTimezone,
    ...options,
  }).format(date);
}
