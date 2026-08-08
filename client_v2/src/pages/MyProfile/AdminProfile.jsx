import moment from 'moment';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { getChannels, getDetectionSettings } from '@/helpers/configure';
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

function channelIdOf(camera, fallback) {
  return String(camera?._id || camera?.id || camera?.channelId || camera?.name || fallback);
}

function cameraNameOf(camera) {
  return camera?.customName || camera?.name || camera?.channelName || camera?.channelId || 'Camera';
}

function nvrNameOf(camera) {
  return camera?.nvrId?.nvrName || camera?.nvr?.nvrName || camera?.nvrName || camera?.nvrId?.name || camera?.nvr?.name || '';
}

function enabledDetectionEntries(camera) {
  return Object.entries(camera?.detections || {}).filter(([, entry]) => entry?.enabled === true);
}

function normalizeProfileData(items, channelsData) {
  const settings = Array.isArray(items) ? items : [];
  const channels = Array.isArray(channelsData) ? channelsData : [];
  const cameraMap = new Map();

  channels.forEach((camera, index) => {
    const id = channelIdOf(camera, index);
    cameraMap.set(id, {
      cameraId: id,
      name: cameraNameOf(camera),
      nvrName: nvrNameOf(camera),
      channelId: camera?.channelId,
      detections: Object.fromEntries(enabledDetectionEntries(camera).map(([key]) => [key, true])),
    });
  });

  const detections = settings.map((item) => {
    const setting = settingOf(item);
    const settingType = setting.settingType || 'detection';
    const uiData = item?.uiData || setting?.uiData || {};
    const linkedCameras = Array.isArray(item?.linkedCameras) ? item.linkedCameras : [];
    const activeCameras = channels.filter((camera) => camera?.detections?.[settingType]?.enabled === true).length
      || linkedCameras.filter((camera) => camera?.detections?.[settingType]?.enabled === true).length
      || Number(uiData.activeCameras)
      || 0;
    const cameraAllocation = channels.filter((camera) => camera?.detections?.[settingType]).length
      || Number(uiData.appliedCameras)
      || linkedCameras.length;

    linkedCameras.forEach((camera) => {
      const id = channelIdOf(camera, cameraMap.size);
      const current = cameraMap.get(id) || {
        cameraId: id,
        name: cameraNameOf(camera),
        nvrName: nvrNameOf(camera),
        channelId: camera?.channelId,
        detections: {},
      };
      if (camera?.detections?.[settingType]?.enabled === true) current.detections[settingType] = true;
      cameraMap.set(id, current);
    });

    return {
      settingType,
      name: setting.detectionName || uiData.detectionName || setting.name || settingType || 'Detection',
      enabled: activeCameras > 0,
      cameraAllocation,
    };
  });

  const cameras = [...cameraMap.values()];
  const totalCameras = channels.length || cameras.length;
  const nvrCount = new Set(cameras.map((camera) => camera.nvrName).filter(Boolean)).size;
  const detectionTypeCount = new Set(detections.map((detection) => detection.settingType).filter(Boolean)).size;
  const detectionsEnabled = cameras.reduce((sum, camera) => sum + Object.values(camera.detections || {}).filter(Boolean).length, 0);

  return {
    detections,
    cameras,
    stats: {
      totalCameras,
      nvrCount,
      detectionTypes: detectionTypeCount,
      detectionsEnabled,
    },
  };
}

/** Admin profile backed by GET /detection-settings/. */
export default function AdminProfile() {
  const { user } = useAuth();
  const detectionSettingsApi = useApi(() => getDetectionSettings({ skip: 0, limit: 500 }), []);
  const channelsApi = useApi(() => getChannels({ skip: 0, limit: 1000 }), []);
  const profile = normalizeProfileData(detectionSettingsApi.data?.settings, channelsApi.data?.channels);

  const email = user?.user_email || user?.email || '';
  const fullName = [user?.name_f, user?.name_l].filter(Boolean).join(' ');
  const name = fullName || user?.user_name || user?.name || email.split('@')[0] || 'Admin';
  const status = user?.active === false ? 'Inactive' : 'Active';
  const role=user?.roleId?.roleName || user?.roleIds?.roleName || user?.role || 'Admin';
  const value = (number) => (detectionSettingsApi.loading || channelsApi.loading ? '...' : number);
  const accessSince = user?.createdAt || (user?.iat ? moment.unix(user.iat).toISOString() : '');
  const location = user?.location || user?.orgId || user?.created_from ;
  return <div className="flex flex-col gap-5 p-5">
    <ProfileHeader initials={initialsOf(name)} name={name} role={role} status={status} email={email} subtitle="profile" totalCameras={value(profile.stats.totalCameras)} stat2Label="NVRs" stat2Value={value(profile.stats.nvrCount)} stat2Color="ok" stat3Label="Detection Types" stat3Value={value(profile.stats.detectionTypes)} stat3Color="warn" detectionsEnabled={value(profile.stats.detectionsEnabled)} />
    <AccountDetails fullName={name} email={email} role={role} status={status} showTenantFields={false} accessLevel={role} showLocation={false} memberSince={accessSince ? moment(accessSince).format('MMM D, YYYY') : '—'} adminId={user?.adminId} />
    <DetectionAllocation detections={profile.detections} />
    <CamerasList cameras={profile.cameras} stats={profile.stats} />
    {(detectionSettingsApi.error || channelsApi.error) && <div className="text-xs" style={{ color: 'var(--crit)' }}>Unable to load complete profile data.</div>}
  </div>;
}
