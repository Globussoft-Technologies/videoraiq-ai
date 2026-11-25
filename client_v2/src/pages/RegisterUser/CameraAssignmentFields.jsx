import { useEffect, useState } from 'react';
import { getChannels } from '@/helpers/configure';
import { useApi } from '@/hooks/useApi';
import MultiSelect from '@/components/MultiSelect';

export const cameraAssignmentFields = [
  { name: 'checkinCameraIds', legacy: 'checkInCameraId', label: 'Check-in Cameras', checkType: 'checkin' },
  { name: 'checkoutCameraIds', legacy: 'checkOutCameraId', label: 'Check-out Cameras', checkType: 'checkout' },
];

export function getCameraAssignmentValues(record) {
  const values = {};
  for (const { name, legacy } of cameraAssignmentFields) {
    if (Array.isArray(record?.[name])) values[name] = record[name];
    else if (record?.[legacy]) values[name] = [record[legacy]];
  }
  return values;
}

export function appendCameraIds(formData, name, ids) {
  // The API accepts repeated multipart fields. A single empty value clears an assignment.
  for (const id of ids.length ? ids : ['']) formData.append(name, id);
}

async function getCameraOptions() {
  const options = [];
  const limit = 100;
  for (let skip = 0; ; skip += limit) {
    const { channels, total } = await getChannels({ skip, limit });
    options.push(...channels.map((camera) => ({
      id: camera._id,
      label: [camera.customName || camera.name || 'Unnamed camera', camera.nvrId?.nvrName].filter(Boolean).join(' — '),
      checkType: camera.checkType,
      departmentIds: (camera.department || []).map(department => String(department?._id ?? department)),
    })));
    if (channels.length < limit || options.length >= total) return options;
  }
}

export default function CameraAssignmentFields({ values, onChange, departmentId, inline = false, disabled = false }) {
  const [requested, setRequested] = useState(false);
  const hasAssignment = cameraAssignmentFields.some(({ name }) => values[name]?.length > 0);
  const { data: options, loading, error, refetch } = useApi(getCameraOptions, [], { enabled: requested || hasAssignment || Boolean(departmentId) });
  const cameras = options || [];
  const listed = new Set(cameras.map(({ id }) => id));

  useEffect(() => {
    if (!departmentId || !options) return;

    for (const { name, checkType } of cameraAssignmentFields) {
      if (Array.isArray(values[name])) continue;
      const matches = options.filter(camera => camera.checkType === checkType && camera.departmentIds.includes(String(departmentId)));
      if (matches.length) onChange(name, matches.map(camera => camera.id));
    }
  }, [departmentId, options, values, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cameraAssignmentFields.map(({ name, label }) => {
        const selected = values[name] || [];
        const unavailable = selected.filter(id => !listed.has(id)).map(id => ({
          id, label: options ? `Assigned camera unavailable (${id})` : `Assigned camera (${id})`,
        }));
        return (
          <div key={name} className="min-w-0">
            <label className="block text-xs font-medium text-[var(--tx2)] mb-1.5">{label} (optional)</label>
            <MultiSelect
              value={selected}
              options={[...cameras, ...unavailable]}
              onChange={(ids) => onChange(name, ids)}
              placeholder={`Select ${label.toLowerCase()}`}
              searchPlaceholder="Search cameras"
              msg={loading ? 'Loading cameras…' : 'No cameras found'}
              onOpen={() => setRequested(true)}
              openUp={inline}
              disabled={disabled}
            />
          </div>
        );
      })}
      {error && (
        <button type="button" onClick={() => refetch()} disabled={disabled}
          className="justify-self-start text-xs text-[var(--crit)] cursor-pointer disabled:cursor-not-allowed">
          Could not load cameras. Retry
        </button>
      )}
    </div>
  );
}
