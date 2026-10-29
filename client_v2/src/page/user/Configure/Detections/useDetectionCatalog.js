import { useApi } from '../../../../hooks/useApi';
import { getDetectionTypes } from '../../../../helpers/configure';

export function useDetectionCatalog(license) {
  const allowedTypes = Array.isArray(license?.allowedDetections) ? license.allowedDetections : [];
  const visibilityKey = [...allowedTypes].sort().join(',');
  // Licence pushes can grant a detector after this page's initial fetch. Refresh
  // the list as well as the permission filter, bypassing the shared short cache.
  // Usage-count changes retain the same key and do not reload the catalogue.
  return useApi(() => getDetectionTypes({ force: true }), [visibilityKey], { initialData: {} });
}
