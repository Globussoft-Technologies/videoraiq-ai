import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import UserDetailModal from '@/pages/RegisterUser/UserDetailModal';
import { fetchRegisteredUser, tagApiError } from '@/helpers/vehicleTagging';

const HOST = import.meta.env.VITE_BACKEND;

/**
 * The registered user behind a tagged vehicle, shown without leaving ANPR Logs
 * or the Incident Center.
 *
 * The `taggedUser` riding along on each log row is deliberately trimmed to the
 * few fields the row renders, so the full record (profile images, phone,
 * department, address) is fetched when the card opens. `taggedUser` seeds the
 * card meanwhile, so the name is on screen immediately rather than after a
 * spinner.
 *
 * Rendering is delegated to the Register your User page's own details card, so
 * a tagged user reads exactly the same here as it does there.
 *
 * @param {object} taggedUser the trimmed record from the log row
 */
export default function TaggedUserDetailsModal({ open, taggedUser, onClose }) {
  const [user, setUser] = useState(null);
  const userId = taggedUser?._id;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;

    // Seed from what the row already has, then replace with the full record.
    setUser(taggedUser);

    (async () => {
      try {
        const full = await fetchRegisteredUser(userId);
        if (!cancelled && full) setUser(full);
      } catch (err) {
        // The seeded fields still render, so this only costs the extra detail.
        if (!cancelled) toast.error(tagApiError(err, 'Could not load full user details'));
      }
    })();

    return () => {
      cancelled = true;
    };
    // taggedUser is a fresh object on every refetch; keying on its id keeps
    // this from re-running (and re-seeding over the loaded record) each poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  useEffect(() => {
    if (!open) setUser(null);
  }, [open]);

  if (!open || !userId) return null;

  return <UserDetailModal user={user} isOpen={open} onClose={onClose} nasUrl={HOST} />;
}
