// Styling helpers for the per-camera detection pills. The detection types are
// read straight off each camera's `detections` object, so this file only
// provides pill colours + short labels — no hardcoded type list, no API call.

// Rotating "enabled" pill colours, assigned by index so all detection types
// get a distinct-ish tint even as the backend adds more.
export const PILL_ON_COLORS = [
  'border-blue-400/50 bg-blue-50 text-blue-600 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-300',
  'border-amber-400/50 bg-amber-50 text-amber-600 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-300',
  'border-red-400/50 bg-red-50 text-red-600 dark:border-red-400/40 dark:bg-red-500/15 dark:text-red-300',
  'border-purple-400/50 bg-purple-50 text-purple-600 dark:border-purple-400/40 dark:bg-purple-500/15 dark:text-purple-300',
  'border-teal-400/50 bg-teal-50 text-teal-600 dark:border-teal-400/40 dark:bg-teal-500/15 dark:text-teal-300',
  'border-emerald-400/50 bg-emerald-50 text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-300',
  'border-indigo-400/50 bg-indigo-50 text-indigo-600 dark:border-indigo-400/40 dark:bg-indigo-500/15 dark:text-indigo-300',
  'border-pink-400/50 bg-pink-50 text-pink-600 dark:border-pink-400/40 dark:bg-pink-500/15 dark:text-pink-300',
  'border-orange-400/50 bg-orange-50 text-orange-600 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-300',
  'border-cyan-400/50 bg-cyan-50 text-cyan-600 dark:border-cyan-400/40 dark:bg-cyan-500/15 dark:text-cyan-300',
]

export const pillColor = (index) => PILL_ON_COLORS[index % PILL_ON_COLORS.length]

// Neutral (off / not configured) pill style.
export const PILL_OFF =
  'border-gray-200 bg-transparent text-gray-400 dark:border-white/10 dark:text-gray-500'

// Turn a detection settingType key into a compact pill label.
// Known types get a curated short label; anything else is derived from the key
// by stripping the trailing "Settings"/"Detection" and spacing out camelCase.
const SHORT_OVERRIDES = {
  personalProtectiveEquipmentSettings: 'PPE',
  vehicleDetectionSettings: 'ANPR',
  unauthorizedAccessSettings: 'Intrusion',
  foodServicePPEDetectionSettings: 'Food PPE',
  vehicleObstructionSettings: 'Vehicle/Obstruction',
}

export const shortLabel = (settingType = '') => {
  if (SHORT_OVERRIDES[settingType]) return SHORT_OVERRIDES[settingType]
  const words = settingType
    .replace(/Settings$/i, '')
    .replace(/Detection$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → spaced
    .trim()
  // Title-case the first letter so "unauthorizedAccess" → "Unauthorized Access".
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : settingType
}
