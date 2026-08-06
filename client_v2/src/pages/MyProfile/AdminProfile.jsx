import moment from 'moment';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { getDetectionSettings } from '@/helpers/configure';
import ProfileHeader from './components/ProfileHeader';
import AccountDetails from './components/AccountDetails';
import DetectionAllocation from './components/DetectionAllocation';
import CamerasList from './components/CamerasList';

function initialsOf(name) {
  if (!name) return 'U';
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function settingOf(item) {
  return item?.detectionSetting || item?.setting || item || {};
}

function normalizeProfileData(items) {
  const settings = Array.isArray(items) ? items : [];
  const cameraMap = new Map();
  const detections = settings.map((item) => {
    const setting = settingOf(item);
    const uiData = item?.uiData || setting?.uiData || {};
    const linkedCameras = Array.isArray(item?.linkedCameras) ? item.linkedCameras : [];
    const activeCameras = Number(uiData.activeCameras) || linkedCameras.filter((camera) => camera?.detections?.[setting.settingType]?.enabled).length;
    linkedCameras.forEach((camera) => {
      const id = String(camera?._id || camera?.channelId || camera?.name || cameraMap.size);
      const current = cameraMap.get(id) || { cameraId: id, name: camera?.customName || camera?.name || camera?.channelId || 'Camera', nvrName: camera?.nvrId?.nvrName || camera?.nvrName, detections: {} };
      current.detections[setting.settingType] = !!camera?.detections?.[setting.settingType]?.enabled;
      cameraMap.set(id, current);
    });
    return { settingType: setting.settingType || 'detection', name: setting.detectionName || uiData.detectionName || setting.name || setting.settingType || 'Detection', enabled: activeCameras > 0, cameraAllocation: Number(uiData.appliedCameras) || linkedCameras.length };
  });
  const cameras = [...cameraMap.values()];
  const configuredCameras = cameras.filter((camera) => Object.values(camera.detections).some(Boolean)).length;
  return { detections, cameras, stats: { totalCameras: cameras.length, configured: configuredCameras, nonConfigured: Math.max(0, cameras.length - configuredCameras), detectionsEnabled: detections.filter((detection) => detection.enabled).length } };
}

/** Admin profile backed by GET /detection-settings/. */
export default function AdminProfile() {
  const { user } = useAuth();
  const detectionSettingsApi = useApi(() => getDetectionSettings({ skip: 0, limit: 500 }), []);
  const profile = normalizeProfileData(detectionSettingsApi.data?.settings);

  const email = user?.user_email || user?.email || '';
  const fullName = [user?.name_f, user?.name_l].filter(Boolean).join(' ');
  const name = fullName || user?.user_name || user?.name || email.split('@')[0] || 'Admin';
  const status = user?.active === false ? 'Inactive' : 'Active';
  const role=user?.roleId?.roleName || user?.roleIds?.roleName || user?.role || 'Admin';
  const value = (number) => (detectionSettingsApi.loading ? '...' : number);
  const accessSince = user?.createdAt || (user?.iat ? moment.unix(user.iat).toISOString() : '');
  const location = user?.location || user?.orgId || user?.created_from ;
  return <div className="flex flex-col gap-5 p-5">
    <ProfileHeader initials={initialsOf(name)} name={name} role={role} status={status} email={email} subtitle="profile" totalCameras={value(profile.stats.totalCameras)} configured={value(profile.stats.configured)} nonConfigured={value(profile.stats.nonConfigured)} detectionsEnabled={value(profile.stats.detectionsEnabled)} />
    <AccountDetails fullName={name} email={email} role={role} status={status} showTenantFields={false} accessLevel={role} showLocation={false} memberSince={accessSince ? moment(accessSince).format('MMM D, YYYY') : '—'} adminId={user?.adminId} />
    <DetectionAllocation detections={profile.detections} />
    <CamerasList cameras={profile.cameras} stats={profile.stats} />
    {detectionSettingsApi.error && <div className="text-xs" style={{ color: 'var(--crit)' }}>Unable to load detection settings.</div>}
  </div>;
}
