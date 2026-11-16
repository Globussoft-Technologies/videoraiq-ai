import { agentApi } from './agentApi';

const previews = new Map();

export async function zonePreviewBlob(actionId) {
  if (!actionId) return null;
  if (previews.has(actionId)) return previews.get(actionId);
  const blob = await agentApi.preview(actionId);
  if (!blob?.type?.startsWith('image/')) return null;
  previews.set(actionId, blob);
  if (previews.size > 20) previews.delete(previews.keys().next().value);
  return blob;
}
