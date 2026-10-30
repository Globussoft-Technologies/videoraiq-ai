import { useEffect, useState } from 'react';
import { dropdownCache } from '@/utils/dropdownCache';

// Existing dropdown-loading effects keep their own setters and loading behavior.
// Re-run only those effects whose metadata was invalidated. Batch synchronous
// invalidations into one render; subscription is removed on unmount.
export default function useMetadataEffect(effect, deps, domains) {
  const [revision, setRevision] = useState(0);
  const domainKey = domains.slice().sort().join(',');
  useEffect(() => dropdownCache.subscribe(changed => {
    if (changed.some(domain => domainKey.split(',').includes(domain))) setRevision(value => value + 1);
  }), [domainKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [...deps, revision]);
}
