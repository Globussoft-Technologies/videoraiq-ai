import api from './client';

// Support both the direct Pi response ({ data: [...] }) and the standard
// VideoraIQ envelope ({ body: { data: [...] } }). A deployment can use either
// shape, so returning the envelope object would make the devices page crash
// when it calls .map().
const dataOf = (response) => response?.data?.body?.data
  ?? response?.data?.data
  ?? response?.data?.body
  ?? response?.data;

export async function getRaspberryPiDevices() {
  const result = dataOf(await api.get('/auth/raspberry-pi/registrations'));
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.devices)) return result.devices;
  throw new TypeError('Raspberry Pi registrations API returned an invalid device list');
}

export async function setRaspberryPiApproval(code, status) {
  if (!['approved', 'rejected'].includes(status)) throw new TypeError('Invalid Raspberry Pi approval status');
  return dataOf(await api.patch(`/auth/raspberry-pi/registrations/${encodeURIComponent(code)}/status`, { status }));
}

export async function deleteRaspberryPiDevice(code) {
  return dataOf(await api.delete(`/auth/raspberry-pi/registrations/${encodeURIComponent(code)}`));
}
