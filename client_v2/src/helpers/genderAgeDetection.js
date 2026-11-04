export const GENDER_AGE_SETTING_TYPE = 'genderAgeDetectionSettings';
export const TARGET_GENDERS = Object.freeze(['Male', 'Female']);
export function genderAgeZoneSettings(zone = {}, shared = {}) {
  return { target_gender: zone.target_gender ?? shared.target_gender ?? 'Female' };
}
