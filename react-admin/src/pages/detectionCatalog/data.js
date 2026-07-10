import {
  HardHat,
  CreditCard,
  ShieldAlert,
  Users,
  UsersRound,
  MoveHorizontal,
  Car,
  CarFront,
  Cog,
  Hammer,
  Droplets,
  DoorOpen,
  Lightbulb,
  TrafficCone,
  Armchair,
  UserX,
  Timer,
  TimerReset,
  Grid3x3,
  Utensils,
  Smartphone,
  Activity,
  Package,
  MapPin,
  Flame,
  Crosshair,
  Luggage,
  ScanEye,
} from 'lucide-react'

// Icon + tint for each detection, keyed by the API's `settingType`.
// The API supplies name / description / clientCount; this only adds the visual.
// Covers all 20 detection types returned by /detection-settings/types.
// Any settingType not listed here falls back to FALLBACK_META.
export const DETECTION_META = {
  personalProtectiveEquipmentSettings: {
    Icon: HardHat,
    tint: 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300',
  },
  vehicleDetectionSettings: {
    Icon: CreditCard,
    tint: 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300',
  },
  unauthorizedAccessSettings: {
    Icon: ShieldAlert,
    tint: 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300',
  },
  crowdDetectionSettings: {
    Icon: Users,
    tint: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  lineCrossingSettings: {
    Icon: MoveHorizontal,
    tint: 'bg-teal-50 text-teal-500 dark:bg-teal-500/10 dark:text-teal-300',
  },
  countVehiclesSettings: {
    Icon: Car,
    tint: 'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
  },
  conveyorDetectionSettings: {
    Icon: Cog,
    tint: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300',
  },
  crusherDetectionSettings: {
    Icon: Hammer,
    tint: 'bg-stone-100 text-stone-500 dark:bg-stone-500/15 dark:text-stone-300',
  },
  waterSpillageDetectionSettings: {
    Icon: Droplets,
    tint: 'bg-cyan-50 text-cyan-500 dark:bg-cyan-500/10 dark:text-cyan-300',
  },
  doorDetectionSettings: {
    Icon: DoorOpen,
    tint: 'bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300',
  },
  lightDetectionSettings: {
    Icon: Lightbulb,
    tint: 'bg-yellow-50 text-yellow-500 dark:bg-yellow-500/10 dark:text-yellow-300',
  },
  vehicleObstructionSettings: {
    Icon: TrafficCone,
    tint: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  },
  deskAbsenceSettings: {
    Icon: Armchair,
    tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
  },
  guardAbsenceSettings: {
    Icon: UserX,
    tint: 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300',
  },
  countPersonsSettings: {
    Icon: UsersRound,
    tint: 'bg-green-50 text-green-500 dark:bg-green-500/10 dark:text-green-300',
  },
  vehicleTypeDetectionSettings: {
    Icon: CarFront,
    tint: 'bg-violet-50 text-violet-500 dark:bg-violet-500/10 dark:text-violet-300',
  },
  loiteringDetectionSettings: {
    Icon: Timer,
    tint: 'bg-fuchsia-50 text-fuchsia-500 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
  },
  tableOccupancyDetectionSettings: {
    Icon: Grid3x3,
    tint: 'bg-lime-50 text-lime-600 dark:bg-lime-500/10 dark:text-lime-300',
  },
  foodServicePPEDetectionSettings: {
    Icon: Utensils,
    tint: 'bg-pink-50 text-pink-500 dark:bg-pink-500/10 dark:text-pink-300',
  },
  mobilePhoneDetectionSettings: {
    Icon: Smartphone,
    tint: 'bg-sky-50 text-sky-500 dark:bg-sky-500/10 dark:text-sky-300',
  },
  motionDetectionSettings: {
    Icon: Activity,
    tint: 'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
  },
  genericObjectDetectionSettings: {
    Icon: Package,
    tint: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  },
  loiteringWithoutAuthSettings: {
    Icon: MapPin,
    tint: 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300',
  },
  loiteringWithAuthSettings: {
    Icon: TimerReset,
    tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
  },
  fireSmokeDetectionSettings: {
    Icon: Flame,
    tint: 'bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-300',
  },
  weaponDetectionSettings: {
    Icon: Crosshair,
    tint: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  },
  unattendedBaggageDetectionSettings: {
    Icon: Luggage,
    tint: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  },
}

// Used for any settingType the frontend doesn't have an icon for yet.
export const FALLBACK_META = {
  Icon: ScanEye,
  tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
}
