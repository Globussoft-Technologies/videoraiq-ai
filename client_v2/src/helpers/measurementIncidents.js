import api, { unwrap } from './client';

/**
 * Start is deliberately one helper even though it performs the two required
 * API calls. The measurement request is only sent after the QR upload succeeds,
 * so DS never receives a storage path that does not exist.
 */
export async function startMeasurement({ qrFile, stationId, operatorId, payload = {} }) {
  if (!(qrFile instanceof File)) throw new TypeError('qrFile must be a File');

  const form = new FormData();
  form.append('file', qrFile);
  const upload = await api.post('/uploads/media', form, {
    params: { mediaType: 'image', folderName: 'measurement-qr' },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const qrImagePath = upload.data?.data?.remotePath;
  if (!qrImagePath) throw new Error('QR upload did not return a remotePath');

  const response = await api.post('/measurement-incidents/process', {
    stationId,
    qrImagePath,
    operatorId,
    payload,
  });
  return unwrap(response);
}

export async function setMeasurementStatus(id, status) {
  if (!['accepted', 'rejected'].includes(status)) {
    throw new TypeError('status must be accepted or rejected');
  }
  return unwrap(await api.patch(`/measurement-incidents/${id}/status`, { status }));
}

export const acceptMeasurement = (id) => setMeasurementStatus(id, 'accepted');
export const rejectMeasurement = (id) => setMeasurementStatus(id, 'rejected');

export async function resetMeasurement(id) {
  return unwrap(await api.delete(`/measurement-incidents/${id}`));
}
