export const detectionServiceErrorMessage = error => {
  const data = error?.response?.data;
  const detail = data?.detail ?? data?.message ?? error?.message ?? error;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => item?.msg || item?.error || JSON.stringify(item)).join('; ');
  return detail ? JSON.stringify(detail) : 'No response from the detection service';
};

export function assertDetectionServiceSuccess(data) {
  const failed = Array.isArray(data?.failed) ? data.failed : [];
  if (data?.success === false || ['failed', 'failure', 'error', 'partial'].includes(String(data?.status || '').toLowerCase()) || failed.length) {
    const message = failed.length
      ? failed.map(item => detectionServiceErrorMessage(item?.error || item?.message || item)).join('; ')
      : data?.detail || data?.message || 'The detection service could not complete this action';
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    error.response = { data };
    throw error;
  }
  return data;
}
