import {
  ScanFace,
  HardHat,
  ShieldAlert,
  Clock,
  MoveHorizontal,
  Users,
  CreditCard,
  Briefcase,
  Flame,
  ScanEye,
} from 'lucide-react'

// Icon + tint for each detection, keyed by the API's `settingType`.
// The API supplies name / description / clientCount; this only adds the visual.
// Any settingType not listed here falls back to FALLBACK_META.
export const DETECTION_META = {
  faceDetectionSettings: {
    Icon: ScanFace,
    tint: 'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
  },
  personalProtectiveEquipmentSettings: {
    Icon: HardHat,
    tint: 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300',
  },
  unauthorizedAccessSettings: {
    Icon: ShieldAlert,
    tint: 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300',
  },
  loiteringSettings: {
    Icon: Clock,
    tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
  },
  lineCrossingSettings: {
    Icon: MoveHorizontal,
    tint: 'bg-teal-50 text-teal-500 dark:bg-teal-500/10 dark:text-teal-300',
  },
  crowdDetectionSettings: {
    Icon: Users,
    tint: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  vehicleDetectionSettings: {
    Icon: CreditCard,
    tint: 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300',
  },
  objectLeftBehindSettings: {
    Icon: Briefcase,
    tint: 'bg-pink-50 text-pink-500 dark:bg-pink-500/10 dark:text-pink-300',
  },
  fireSmokeSettings: {
    Icon: Flame,
    tint: 'bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300',
  },
}

// Used for any settingType the frontend doesn't have an icon for yet.
export const FALLBACK_META = {
  Icon: ScanEye,
  tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
}
