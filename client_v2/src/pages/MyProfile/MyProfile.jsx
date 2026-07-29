import moment from 'moment';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { fetchMyAccount, fetchClientConfig, fetchClientCameras } from './Api';
import ProfileHeader from './components/ProfileHeader';
import AccountDetails from './components/AccountDetails';
import DetectionAllocation from './components/DetectionAllocation';
import CamerasList from './components/CamerasList';

function initialsOf(name) {
  if (!name) return 'U';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function MyProfile() {
  const { user } = useAuth();
  const email = user?.user_email || user?.email || '';
  const roleName = user?.roleId?.roleName || user?.roleIds?.roleName || user?.role || '';

  // Self-service endpoints (server/core/v1/clientConfig) resolve the tenant
  // from the caller's own token — no id to pass, and they work for any
  // logged-in admin/member on this app's own login.
  const accountApi = useApi(() => fetchMyAccount(), []);
  const configApi = useApi(() => fetchClientConfig(), []);
  const camerasApi = useApi(() => fetchClientCameras(), []);

  const account = accountApi.data;
  const config = configApi.data;
  const cameras = camerasApi.data;
  const stats = config?.stats;

  const name = account?.name || user?.user_name || user?.name || email.split('@')[0] || 'User';
  const role = roleName || 'User';
  const rawStatus = account?.status || 'active';
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
  const expireDate = account?.expireDate ? moment(account.expireDate).format('MMM D, YYYY') : '—';

  return (
    <div className="flex flex-col gap-5 p-5">
      <ProfileHeader
        initials={initialsOf(name)}
        name={name}
        role={role}
        status={status}
        email={email}
        totalCameras={stats?.totalCameras ?? account?.cameras ?? cameras?.length ?? '—'}
        configured={stats?.configured ?? '—'}
        nonConfigured={stats?.nonConfigured ?? '—'}
        detectionsEnabled={stats?.detectionsEnabled ?? '—'}
      />

      <AccountDetails
        fullName={name}
        email={email}
        role={role}
        plan={account?.plan}
        expireDate={expireDate}
        status={status}
      />

      <DetectionAllocation detections={config?.detections} />
      <CamerasList cameras={cameras} stats={stats} />
    </div>
  );
}
