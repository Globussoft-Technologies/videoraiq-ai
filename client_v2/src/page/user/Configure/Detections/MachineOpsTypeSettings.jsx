import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { createDetectionSetting, updateDetectionSetting } from '../../../../helpers/configure';
import { MACHINE_OPS_SETTING_TYPE, ROLLER_MACHINE_TYPE } from '../../../../helpers/machineOpsDetection';
import { getTelegramLinkCode } from '../../../../helpers/telegram';
import { whatsappRequest } from '../../../../helpers/whatsapp';
import { useApi } from '../../../../hooks/useApi';
import { IS_FLO_MATTRESS } from '@/lib/featureFlags';
import MachineOpsNotifications from '../DetectionZoneMarking/components/MachineOpsNotifications';
import { buildScheduleFields, emptySchedule, scheduleError, scheduleFromConfig } from '../ZoneScheduleFields';

const field = 'mt-1 block w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 py-2 text-sm text-[var(--tx)]';
const label = 'block text-xs font-semibold text-[var(--tx2)]';
const selectField = `${field} pr-9 enabled:cursor-pointer enabled:hover:border-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-60`;
const selectIcon = 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tx2)]';

export default function MachineOpsTypeSettings({ camera, setting, machineType, onTypeChange, onSaved, canEdit }) {
  const stored = setting?.settings;
  const savedRoller = stored?.machine_type === ROLLER_MACHINE_TYPE;
  const [machineName, setMachineName] = useState(savedRoller ? stored.machine_name || '' : '');
  const [severity, setSeverity] = useState(savedRoller ? stored.levelOfImportance || 'low' : 'low');
  const [alertSettings, setAlertSettings] = useState(() => {
    const config = savedRoller ? stored : {};
    const chatIds = config.telegramChatIds?.length ? config.telegramChatIds : [config.telegramChatId].filter(Boolean);
    const whatsappRecipientIds = config.whatsappRecipientIds?.map(id => String(id?._id || id));
    return {
      // An existing enabled configuration can still use account-level WhatsApp routing.
      whatsappRecipientIds: whatsappRecipientIds ?? (config.trigger_notification === true ? undefined : []),
      telegramChatIds: chatIds.map(String),
      schedule: scheduleFromConfig(config.schedule),
    };
  });
  const [saving, setSaving] = useState(false);
  const machineTypeId = useId();
  const disabled = saving || !canEdit;
  const isRoller = machineType === ROLLER_MACHINE_TYPE;
  const whatsappApi = useApi(() => whatsappRequest('recipient-options'), [], { enabled: isRoller && !IS_FLO_MATTRESS });
  const telegramApi = useApi(getTelegramLinkCode, [], { enabled: isRoller });
  const telegramOptions = (telegramApi.data?.linkedChannels || [])
    .filter(channel => channel?.chatId && channel.active !== false)
    .map(channel => ({
      value: String(channel.chatId),
      label: channel.channelName || channel.channelTitle || (channel.channelUsername ? `@${channel.channelUsername}` : String(channel.chatId)),
    }));

  const changeAlertSetting = (key, value) => {
    setAlertSettings(previous => ({
      ...previous,
      [key]: value,
      ...(key === 'telegramChatIds' && !value.length ? { schedule: emptySchedule() } : {}),
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (disabled || !isRoller || !machineName.trim()) return;
    const { schedule, telegramChatIds, whatsappRecipientIds } = alertSettings;
    const scheduleFields = telegramChatIds.length ? buildScheduleFields(schedule) : {};
    if (telegramChatIds.length) {
      const hasTime = [schedule.from, schedule.to].some(time => time.hour || time.minute || time.meridiem);
      if (hasTime && (!scheduleFields.startTime || !scheduleFields.endTime)) {
        toast.error('Select both start and end times for the Telegram schedule.');
        return;
      }
      const invalidSchedule = scheduleError(schedule);
      if (invalidSchedule) {
        toast.error(invalidSchedule);
        return;
      }
    }
    const settings = {
      machine_type: ROLLER_MACHINE_TYPE,
      machine_name: machineName.trim(),
      levelOfImportance: severity,
      trigger_notification: whatsappRecipientIds === undefined || whatsappRecipientIds.length > 0 || telegramChatIds.length > 0,
      whatsappRecipientIds,
      telegramChatIds,
      telegramChatId: telegramChatIds[0] || null,
      schedule: scheduleFields,
    };
    setSaving(true);
    try {
      let savedSetting;
      if (setting?._id) {
        await updateDetectionSetting(setting._id, { settings });
        savedSetting = { ...setting, settings: { ...stored, ...settings } };
      } else {
        const nvrId = camera.nvrId?._id || camera.nvrId;
        if (typeof nvrId !== 'string' || !nvrId) throw new Error('Camera NVR is unavailable.');
        const result = await createDetectionSetting({
          name: 'Machine Operations Detection',
          settingType: MACHINE_OPS_SETTING_TYPE,
          NVRId: nvrId,
          channelId: [camera._id],
          enabled: false,
          settings,
          alerts: [],
        });
        const saved = result?.savedDetectionSettings;
        savedSetting = saved?.saved?.[0]?.detection;
        if (!savedSetting?._id) throw new Error(saved?.skipped?.[0]?.reason || 'The camera setting could not be saved.');
      }
      onSaved(savedSetting);
      toast.success('Roller settings saved');
    } catch (error) {
      const body = error?.response?.data?.body;
      toast.error(body?.error || body?.message || error.message || 'Could not save Roller settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mb-3 w-full space-y-3 rounded-xl border border-[var(--bd)] bg-[var(--bg1)] p-4">
      <div className="max-w-xs">
        <label className={label} htmlFor={machineTypeId}>Machine Type</label>
        <div className="relative">
          <select id={machineTypeId} className={selectField} value={machineType}
            onChange={(event) => onTypeChange(event.target.value)} disabled={disabled}>
            <option value="">Machine and Indicator Zones</option>
            <option value={ROLLER_MACHINE_TYPE}>Roller</option>
          </select>
          <ChevronDown size={16} className={selectIcon} aria-hidden="true" />
        </div>
        {!machineType && canEdit && <p className="mt-1.5 text-xs text-[var(--tx3)]">Choose Roller to use the full camera frame.</p>}
      </div>
      {isRoller && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Machine Name
              <input className={field} value={machineName} onChange={(event) => setMachineName(event.target.value)}
                placeholder="e.g. Foaming Machine" required disabled={disabled} />
            </label>
            <label className={label}>
              Severity
              <span className="relative block">
                <select className={selectField} value={severity} onChange={(event) => setSeverity(event.target.value)} disabled={disabled}>
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
                <ChevronDown size={16} className={selectIcon} aria-hidden="true" />
              </span>
            </label>
          </div>
          <MachineOpsNotifications zone={alertSettings} onChange={changeAlertSetting} whatsappApi={whatsappApi}
            channelOptions={telegramOptions} disabled={disabled} scheduleLabel="Telegram schedule" />
          <div className="flex justify-end">
            {canEdit && <button type="submit" disabled={saving || !machineName.trim()}
              className="rounded-lg bg-[var(--blue)] px-4 py-2 text-xs font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Roller Settings'}
            </button>}
          </div>
        </>
      )}
    </form>
  );
}
