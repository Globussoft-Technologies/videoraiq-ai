import { useEffect, useMemo, useState } from 'react';
import { getChannels } from '@/helpers/configure';
import { useApi } from '@/hooks/useApi';
import MultiSelect from '@/components/MultiSelect';

export const cameraAssignmentFields = [
  { name: 'checkinCameraIds', legacy: 'checkInCameraId', label: 'Check-in Cameras', checkType: 'checkin', typeLabel: 'Check-in' },
  { name: 'checkoutCameraIds', legacy: 'checkOutCameraId', label: 'Check-out Cameras', checkType: 'checkout', typeLabel: 'Check-out' },
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
  const camType = cameraAssignmentFields.map(({ checkType }) => checkType);
  for (let skip = 0; ; skip += limit) {
    const { channels, total } = await getChannels({ skip, limit, camType });
    options.push(...channels.map((camera) => {
      const name = camera.customName || camera.name || 'Unnamed camera';
      const nvrName = camera.nvrId?.nvrName;
      return {
        id: String(camera._id),
        label: nvrName ? `${name} (NVR name: ${nvrName})` : name,
        checkType: camera.checkType,
        departmentIds: (camera.department || []).map(department => String(department?._id ?? department)),
      };
    }));
    if (channels.length < limit || options.length >= total) return options;
  }
}

export default function CameraAssignmentFields({ values, onChange, departmentId, inline = false, disabled = false }) {
  const [requested, setRequested] = useState(false);
  const hasAssignment = cameraAssignmentFields.some(({ name }) => values[name]?.length > 0);
  const { data: options, loading, error, refetch } = useApi(getCameraOptions, [], {
    enabled: requested || hasAssignment || Boolean(departmentId),
    metadataDomains: ['cameras'],
  });
  const fields = useMemo(() => cameraAssignmentFields.map(({ name, label, checkType, typeLabel }) => {
    const typed = (options || []).filter(camera => camera.checkType === checkType);
    const cameras = departmentId
      ? typed.filter(camera => camera.departmentIds.includes(String(departmentId)))
      : typed;
    const type = typeLabel.toLowerCase();
    const emptyMessage = typed.length > 0 && departmentId
      ? `No ${type} cameras are assigned to this department. Assign one in Camera Settings.`
      : `No ${type} cameras are configured. Set Camera Type to ${typeLabel} in Detections.`;
    return { name, label, cameras, emptyMessage };
  }), [options, departmentId]);

  useEffect(() => {
    if (!departmentId || !options) return;

    for (const { name, cameras } of fields) {
      if (!Array.isArray(values[name]) && cameras.length) onChange(name, cameras.map(camera => camera.id));
    }
  }, [departmentId, options, fields, values, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map(({ name, label, cameras, emptyMessage }) => {
        const assigned = values[name] || [];
        const eligibleIds = new Set(cameras.map(camera => camera.id));
        const selected = assigned.map(String).filter(id => eligibleIds.has(id));
        const msg = error ? 'Could not load cameras. Use Retry below.'
          : loading || !options ? 'Loading cameras…'
          : cameras.length ? 'No cameras match your search.' : emptyMessage;
        return (
          <div key={name} className="min-w-0">
            <label className="block text-xs font-medium text-[var(--tx2)] mb-1.5">{label} (optional)</label>
            <MultiSelect
              value={selected}
              options={cameras}
              onChange={(ids) => onChange(name, ids)}
              placeholder={`Select ${label.toLowerCase()}`}
              searchPlaceholder="Search cameras"
              msg={msg}
              onOpen={() => setRequested(true)}
              openUp={inline}
              disabled={disabled}
            />
            {options && selected.length < assigned.length && (
              <p className="mt-1 text-xs text-[var(--tx3)]">Some saved cameras no longer match this field. Select cameras or use Clear All to update the assignment.</p>
            )}
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
