import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { subscribeGenderAgeCounts } from '../lib/genderAgeUpdates';

export default function useGenderAgeLiveUpdates(refresh, enabled) {
  const { user } = useAuth();
  const { socket } = useSocket() || {};
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!enabled || !user?.adminId) return undefined;
    return subscribeGenderAgeCounts(socket, user.adminId, options => refreshRef.current(options), 150, 5000);
  }, [enabled, socket, user?.adminId]);
}
