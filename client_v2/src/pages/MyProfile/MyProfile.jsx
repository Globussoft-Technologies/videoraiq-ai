import moment from 'moment';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { fetchMyAccount, fetchClientConfig, fetchClientCameras, fetchAuthorizedUserById } from './Api';
import ProfileHeader from './components/ProfileHeader';
import AccountDetails from './components/AccountDetails';
import DetectionAllocation from './components/DetectionAllocation';
import CamerasList from './components/CamerasList';
import AccessScope from './components/AccessScope';

function initialsOf(name) {
  if (!name) return 'U';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function withCameraDetectionState(detections = [], cameras = []) {
  if (!Array.isArray(detections) || !Array.isArray(cameras) || cameras.length === 0) {
    return detections;
  }

  return detections.map((detection) => {
    const settingType = detection?.settingType;
    if (!settingType) return detection;

    const assignedCameras = cameras.filter((camera) => camera?.detections?.[settingType]);
    const enabledCameras = assignedCameras.filter((camera) => camera?.detections?.[settingType]?.enabled === true);

    if (assignedCameras.length === 0) return detection;

    return {
      ...detection,
      enabled: enabledCameras.length > 0,
      cameraAllocation: assignedCameras.length,
    };
  });
}

export default function MyProfile() {
  const { user } = useAuth();
  const email = user?.user_email || user?.email || '';
  const roleName = user?.roleId?.roleName || user?.roleIds?.roleName || user?.role || '';
  
  // memberId only shows up on a sub-user's token, never the tenant admin's
  // (same convention AddProfile.jsx already relies on for its own admin-only
  // gating) — a regular user has no client-wide camera/detection config to
  // show, so the stat rows and Detection Allocation/Cameras sections below
  // are admin-only.
  const isAdmin = !user?.memberId;

  // Self-service endpoints (server/core/v1/clientConfig) resolve the tenant
  // from the caller's own token — no id to pass, and they work for any
  // logged-in admin/member on this app's own login.
  const accountApi = useApi(() => fetchMyAccount(), [], { enabled: isAdmin });
  const configApi = useApi(() => fetchClientConfig(), [], { enabled: isAdmin });
  const camerasApi = useApi(() => fetchClientCameras(), [], { enabled: isAdmin });
  // Sub-users aren't in the client-config tenant summary — /users/fetch
  // (filtered to this user's own id) is the record that actually reflects
  // their assigned role/access, matching the Administer > Users edit form.
  const selfUserApi = useApi(
    () => fetchAuthorizedUserById(user?.memberId),
    [user?.memberId],
    { enabled: !isAdmin && !!user?.memberId },
  );

  const account = accountApi.data;
  const config = configApi.data;
  const cameras = camerasApi.data;
  const detections = withCameraDetectionState(config?.detections, cameras);
  const stats = config?.stats;
  const selfUser = selfUserApi.data;

  const fullNameFromParts = [user?.name_f, user?.name_l].filter(Boolean).join(' ');
  const selfUserFullName = [selfUser?.firstName, selfUser?.lastName].filter(Boolean).join(' ');
  const name = fullNameFromParts || selfUserFullName || user?.user_name || user?.name || account?.name || email.split('@')[0] || 'User';
  const role = selfUser?.roleIds?.roleName || roleName || 'User';
  const rawStatus = isAdmin
    ? (account?.status || 'active')
    : (selfUser?.active === false ? 'inactive' : 'active');
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
  const expireDate = account?.expireDate ? moment(account.expireDate).format('MMM D, YYYY') : '—';
  const memberSince = selfUser?.createdAt ? moment(selfUser.createdAt).format('MMM D, YYYY') : '—';

  return (
    <div className="flex flex-col gap-5 p-5">
      <ProfileHeader
        initials={initialsOf(name)}
        name={name}
        role={role}
        status={status}
        email={email}
        showStats={isAdmin}
        totalCameras={stats?.totalCameras ?? account?.cameras ?? cameras?.length ?? '—'}
        configured={stats?.configured ?? '—'}
        nonConfigured={stats?.nonConfigured ?? '—'}
        detectionsEnabled={stats?.detectionsEnabled ?? '—'}
      />

      <AccountDetails
        fullName={name}
        email={email}
        userName={selfUser?.userName}
        role={role}
        plan={account?.plan}
        expireDate={expireDate}
        status={status}
        showTenantFields={isAdmin}
        designation={selfUser?.designation}
        location={selfUser?.location}
        accessLevel={selfUser?.permission}
        memberSince={memberSince}
        adminId={selfUser?.adminId}
      />

      {isAdmin && <DetectionAllocation detections={detections} />}
      {isAdmin && <CamerasList cameras={cameras} stats={stats} />}
      {!isAdmin && <AccessScope authorizedChannels={selfUser?.authorizedChannels} />}
    </div>
  );
}
