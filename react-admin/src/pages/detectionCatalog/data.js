import {
  Accessibility,
  Anvil,
  ArrowLeftRight,
  ArrowUpFromLine,
  BetweenHorizontalStart,
  BriefcaseConveyorBelt,
  BrushCleaning,
  Car,
  CarFront,
  ChefHat,
  CircleParkingOff,
  CloudFog,
  Crosshair,
  Cylinder,
  DoorOpen,
  Droplet,
  Droplets,
  Flame,
  FlameKindling,
  HardHat,
  HeartPulse,
  LampDesk,
  Lightbulb,
  ListOrdered,
  Luggage,
  MapPin,
  MoonStar,
  Package,
  PackageX,
  PawPrint,
  ScanEye,
  ScanFace,
  ShieldX,
  Smartphone,
  Stethoscope,
  TableProperties,
  Timer,
  TimerReset,
  Trash2,
  Truck,
  UserRound,
  UserRoundX,
  Users,
  UsersRound,
  Activity,
  createLucideIcon,
} from 'lucide-react'

const AnprRecognition = createLucideIcon('AnprRecognition', [
  ['path', { d: 'M4 7V4h3', key: 'scan-top-left' }],
  ['path', { d: 'M17 4h3v3', key: 'scan-top-right' }],
  ['path', { d: 'M4 17v3h3', key: 'scan-bottom-left' }],
  ['path', { d: 'M20 17v3h-3', key: 'scan-bottom-right' }],
  ['path', { d: 'm6 11 1.3-3.3A2 2 0 0 1 9.2 6.5h5.6a2 2 0 0 1 1.9 1.2L18 11', key: 'car-roof' }],
  ['rect', { x: '6', y: '11', width: '12', height: '7', rx: '2', key: 'car-body' }],
  ['path', { d: 'M8.5 14h.01M15.5 14h.01', key: 'headlights' }],
  ['path', { d: 'M10 16h4', key: 'number-plate' }],
])

// Icon + tint for each detection, keyed by the API's `settingType`.
// The API supplies name / description / clientCount; this only adds the visual.
// Covers every known detection type returned by /detection-settings/types.
// Any settingType not listed here falls back to FALLBACK_META.
export const DETECTION_META = {
  faceAuthenticationSettings: {
    Icon: ScanFace,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  personalProtectiveEquipmentSettings: {
    Icon: HardHat,
    tint: 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300',
  },
  vehicleDetectionSettings: {
    Icon: AnprRecognition,
    tint: 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-300',
  },
  unauthorizedAccessSettings: {
    Icon: ShieldX,
    tint: 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-300',
  },
  crowdDetectionSettings: {
    Icon: Users,
    tint: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  lineCrossingSettings: {
    Icon: BetweenHorizontalStart,
    tint: 'bg-teal-50 text-teal-500 dark:bg-teal-500/10 dark:text-teal-300',
  },
  countVehiclesSettings: {
    Icon: ListOrdered,
    tint: 'bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-300',
  },
  conveyorDetectionSettings: {
    Icon: BriefcaseConveyorBelt,
    tint: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-300',
  },
  crusherDetectionSettings: {
    Icon: Anvil,
    tint: 'bg-stone-100 text-stone-500 dark:bg-stone-500/15 dark:text-stone-300',
  },
  cylinderDetectionSettings: {
    Icon: Cylinder,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
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
    Icon: CircleParkingOff,
    tint: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
  },
  deskAbsenceSettings: {
    Icon: LampDesk,
    tint: 'bg-purple-50 text-purple-500 dark:bg-purple-500/10 dark:text-purple-300',
  },
  guardAbsenceSettings: {
    Icon: UserRoundX,
    tint: 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300',
  },
  guardSleepingDetectionSettings: {
    Icon: MoonStar,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
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
    Icon: TableProperties,
    tint: 'bg-lime-50 text-lime-600 dark:bg-lime-500/10 dark:text-lime-300',
  },
  foodServicePPEDetectionSettings: {
    Icon: ChefHat,
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
  personFallSickDetectionSettings: {
    Icon: HeartPulse,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  weaponDetectionSettings: {
    Icon: Crosshair,
    tint: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  },
  unattendedBaggageDetectionSettings: {
    Icon: Luggage,
    tint: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
  },
  workingAtHeightDetectionSettings: {
    Icon: ArrowUpFromLine,
    tint: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  },
  oilLeakageDetectionSettings: {
    Icon: Droplet,
    tint: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300',
  },
  equipmentOilLeakageDetectionSettings: {
    Icon: Droplet,
    tint: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  },
  vehicleFuelOilLeakageDetectionSettings: {
    Icon: Droplets,
    tint: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  },
  gunnyBagsMaterialsWrongLocationDetectionSettings: {
    Icon: PackageX,
    tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  },
  sandDustWasteScrapDisposalDetectionSettings: {
    Icon: Trash2,
    tint: 'bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300',
  },
  unauthorizedAnimalEntryDetectionSettings: {
    Icon: PawPrint,
    tint: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300',
  },
  spillsDirtyMessyAreasDetectionSettings: {
    Icon: BrushCleaning,
    tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  carModelDetectionSettings: {
    Icon: Car,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  vehicleCheckInOutSettings: {
    Icon: ArrowLeftRight,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },

  // Semantic aliases used by deployments that expose these detections as
  // separate catalog entries instead of combined settings.
  personDetectionSettings: {
    Icon: UserRound,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  genericVehicleDetectionSettings: {
    Icon: Truck,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  fireDetectionSettings: {
    Icon: FlameKindling,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  smokeDetectionSettings: {
    Icon: CloudFog,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  personFallDetectionSettings: {
    Icon: Accessibility,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
  personSickDetectionSettings: {
    Icon: Stethoscope,
    tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
  },
}

// Used for any settingType the frontend doesn't have an icon for yet.
export const FALLBACK_META = {
  Icon: ScanEye,
  tint: 'bg-gray-100 text-gray-500 dark:bg-white/8 dark:text-gray-400',
}
