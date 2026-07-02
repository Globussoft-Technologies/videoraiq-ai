import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { tagUser, authorizedUsers } from './Api';

/**
 * Encapsulates the tag/untag flow for access-log entries:
 *  - loads an email/username → userId lookup of authorized users,
 *  - tracks per-entry local overrides so toggles reflect immediately,
 *  - exposes the dropdown anchor state and the tag/untag handlers.
 *
 * Returns everything the page + column renderers need. `resetOverrides` should
 * be called after each fresh fetch so server state wins.
 */
export const useAccessTagging = () => {
  const [taggingId, setTaggingId] = useState(null);
  // Local override of the tag state per access log: { [accessLogId]: boolean }
  const [tagOverrides, setTagOverrides] = useState({});
  // Name of the authorized user picked per access log: { [accessLogId]: name }
  const [pickedNames, setPickedNames] = useState({});
  // Id of the authorized user picked per access log: { [accessLogId]: userId }
  const [pickedUserIds, setPickedUserIds] = useState({});
  // Open dropdown: { item, rect } — rect anchors the floating panel.
  const [dropdown, setDropdown] = useState(null);
  // Lookup of authorized user _id by email/username for untag resolution.
  const [authUserMap, setAuthUserMap] = useState({ byEmail: {}, byName: {} });

  useEffect(() => {
    (async () => {
      try {
        const res = await authorizedUsers(0, 1000, '');
        if (res?.body?.status === 'success') {
          const byEmail = {};
          const byName = {};
          (res.body.data.users || []).forEach((u) => {
            if (u.email) byEmail[u.email.toLowerCase()] = u._id;
            const name = u.userName || `${u.firstName || ''} ${u.lastName || ''}`.trim();
            if (name) byName[name.toLowerCase()] = u._id;
          });
          setAuthUserMap({ byEmail, byName });
        }
      } catch (err) {
        console.error('Failed to load authorized users', err);
      }
    })();
  }, []);

  const resetOverrides = () => {
    setTagOverrides({});
    setPickedNames({});
    setPickedUserIds({});
  };

  const isTagged = (item) =>
    item?.accessLogId in tagOverrides ? tagOverrides[item.accessLogId] : !!item?.tag;

  const resolveUserId = (item) => {
    if (pickedUserIds[item.accessLogId]) return pickedUserIds[item.accessLogId];
    if (item.userId) return item.userId;
    const byEmail =
      item.email && item.email !== '--' ? authUserMap.byEmail[item.email.toLowerCase()] : null;
    if (byEmail) return byEmail;
    const byName = item.name ? authUserMap.byName[item.name.toLowerCase()] : null;
    return byName || null;
  };

  const handleToggle = (item, evt) => {
    if (taggingId || !item?.accessLogId) return;
    if (isTagged(item)) {
      untagEntry(item);
    } else {
      const rect = evt?.currentTarget?.getBoundingClientRect?.();
      setDropdown({ item, rect });
    }
  };

  const tagWithUser = async (item, pickedUser) => {
    if (taggingId) return;
    const profileImages = item.personImages || [];
    if (profileImages.length === 0) {
      toast.error('No person images found for this entry');
      return;
    }
    setTaggingId(item.accessLogId);
    try {
      const result = await tagUser(pickedUser._id, {
        tag: true,
        profileImages,
        accessLogId: item.accessLogId,
      });
      if (result?.body?.status === 'success' || result?.statusCode === 200) {
        setTagOverrides((prev) => ({ ...prev, [item.accessLogId]: true }));
        setPickedNames((prev) => ({
          ...prev,
          [item.accessLogId]:
            pickedUser.userName ||
            `${pickedUser.firstName || ''} ${pickedUser.lastName || ''}`.trim(),
        }));
        setPickedUserIds((prev) => ({ ...prev, [item.accessLogId]: pickedUser._id }));
        setDropdown(null);
        toast.success('User tagged successfully');
      } else {
        toast.error(result?.body?.message || result?.body?.error || 'Failed to tag user');
      }
    } catch (error) {
      console.error('Failed to tag user', error);
      toast.error(
        error?.response?.data?.body?.message ||
          error?.response?.data?.body?.error ||
          error?.response?.data?.message ||
          'Failed to tag user'
      );
    } finally {
      setTaggingId(null);
    }
  };

  const untagEntry = async (item) => {
    const userId = resolveUserId(item);
    if (!userId) {
      toast.error('Could not resolve user for this entry');
      return;
    }
    setTaggingId(item.accessLogId);
    try {
      const result = await tagUser(userId, {
        tag: false,
        profileImages: item.personImages || [],
        accessLogId: item.accessLogId,
      });
      if (result?.body?.status === 'success' || result?.statusCode === 200) {
        setTagOverrides((prev) => ({ ...prev, [item.accessLogId]: false }));
        setPickedNames((prev) => {
          const next = { ...prev };
          delete next[item.accessLogId];
          return next;
        });
        setPickedUserIds((prev) => {
          const next = { ...prev };
          delete next[item.accessLogId];
          return next;
        });
        toast.success('User untagged successfully');
      } else {
        toast.error(result?.body?.message || result?.body?.error || 'Failed to untag user');
      }
    } catch (error) {
      console.error('Failed to untag user', error);
      toast.error(
        error?.response?.data?.body?.message ||
          error?.response?.data?.body?.error ||
          error?.response?.data?.message ||
          'Failed to untag user'
      );
    } finally {
      setTaggingId(null);
    }
  };

  return {
    taggingId,
    tagOverrides,
    pickedNames,
    dropdown,
    setDropdown,
    isTagged,
    handleToggle,
    tagWithUser,
    resetOverrides,
  };
};
