import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers3, Pencil, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createDetectionSetting, updateDetectionSetting } from '../../../../helpers/configure';
import { whatsappRequest } from '../../../../helpers/whatsapp';
import { getTelegramLinkCode } from '../../../../helpers/telegram';
import { useApi } from '../../../../hooks/useApi';
import WhatsAppRecipientSelect from '../DetectionZoneMarking/components/WhatsAppRecipientSelect';
import TelegramChannelMultiSelect from '../DetectionZoneMarking/components/TelegramChannelMultiSelect';
import ZoneScheduleFields, { buildScheduleFields, emptySchedule, scheduleFromConfig } from '../ZoneScheduleFields';

const POSTURE = 'personPostureDetectionSettings';
const STACK = 'cansStackDetectionSettings';

export default function SpecialDetectionSettings({ settingType, setting, camera, embedded = false, onSaved, onDelete, canEdit }) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [alertDraft, setAlertDraft] = useState({ whatsappRecipientIds: undefined, telegramChatIds: [], schedule: emptySchedule() });
  const [alertSaving, setAlertSaving] = useState(false);
  const [editing, setEditing] = useState(!setting?._id);
  const [modalOpen, setModalOpen] = useState(false);
  const isPosture = settingType === POSTURE;
  const isStack = settingType === STACK;
  const whatsappApi = useApi(() => whatsappRequest('recipient-options'), [], { enabled: isStack });
  const telegramApi = useApi(() => getTelegramLinkCode(), [], { enabled: isStack });
  const telegramOptions = (telegramApi.data?.linkedChannels || [])
    .filter(channel => channel?.chatId && channel?.active !== false)
    .map(channel => ({
      value: String(channel.chatId),
      label: channel.channelName || channel.channelTitle || (channel.channelUsername ? `@${channel.channelUsername}` : String(channel.chatId)),
    }));

  useEffect(() => {
    setEditing(!setting?._id);
    setDraft({
      trigger_on: setting?.settings?.trigger_on || 'both',
      layers: setting?.settings?.layers ?? 3,
      zone_name: setting?.settings?.zone_name || '',
      trigger_notification: setting?.settings?.trigger_notification !== false,
    });
    const savedSchedule = {
      startTime: setting?.settings?.startTime,
      endTime: setting?.settings?.endTime,
      ...(setting?.settings?.schedule || {}),
    };
    setAlertDraft({
      whatsappRecipientIds: Array.isArray(setting?.settings?.whatsappRecipientIds)
        ? setting.settings.whatsappRecipientIds.map(item => String(item?._id || item))
        : setting?.settings?.whatsappRecipientIds,
      telegramChatIds: Array.isArray(setting?.settings?.telegramChatIds)
        ? setting.settings.telegramChatIds.map(String)
        : (setting?.settings?.telegramChatId ? [String(setting.settings.telegramChatId)] : []),
      schedule: scheduleFromConfig(savedSchedule),
    });
  }, [
    setting?._id,
    setting?.settings?.trigger_on,
    setting?.settings?.layers,
    setting?.settings?.zone_name,
    setting?.settings?.trigger_notification,
    setting?.settings?.whatsappRecipientIds,
    setting?.settings?.telegramChatIds,
    setting?.settings?.telegramChatId,
    setting?.settings?.schedule,
    setting?.settings?.startTime,
    setting?.settings?.endTime,
  ]);

  if (!isPosture && !isStack) return null;

  const save = async () => {
    const layers = Number(draft.layers);
    if (isStack && (!Number.isInteger(layers) || layers < 1)) return toast.error('Layers must be a positive whole number.');
    setSaving(true);
    try {
      const settings = {
        ...(setting?.settings || {}),
        trigger_notification: draft.trigger_notification,
        ...(isStack ? {
          whatsappRecipientIds: alertDraft.whatsappRecipientIds,
          telegramChatIds: alertDraft.telegramChatIds,
          telegramChatId: alertDraft.telegramChatIds[0] || null,
          schedule: buildScheduleFields(alertDraft.schedule),
        } : {}),
        ...(isPosture
          ? { trigger_on: draft.trigger_on, zone_name: draft.zone_name.trim() }
          : { layers }),
      };
      if (isStack) {
        // Can-stack detection evaluates the complete camera frame; it never owns
        // polygon zones. Clear any legacy zone data when updating an older record.
        settings.zone_name = '';
        settings.zone_configs = [];
        delete settings.zones;
      }
      let savedSetting;
      if (setting?._id) {
        await updateDetectionSetting(setting._id, { settings });
        savedSetting = { ...setting, settings };
      } else if (isStack && camera?._id) {
        const nvrId = typeof camera.nvrId === 'object' ? camera.nvrId?._id : camera.nvrId;
        if (!nvrId) throw new Error('Camera NVR is unavailable.');
        const result = await createDetectionSetting({
          name: 'Cans Stack Detection',
          settingType: STACK,
          NVRId: String(nvrId),
          channelId: [camera._id],
          enabled: true,
          settings,
          alerts: [],
        });
        savedSetting = result?.savedDetectionSettings?.saved?.[0]?.detection || result?.saved?.[0]?.detection;
        if (!savedSetting?._id) throw new Error('The saved Cans Stack setting was not returned.');
      } else {
        return toast.error('Select a camera before configuring this detection.');
      }
      toast.success('Detection settings saved');
      setEditing(false);
      if (isStack) setModalOpen(false);
      await onSaved?.(savedSetting);
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Could not save detection settings.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 py-2 text-sm text-[var(--tx)]';
  const fieldDisabled = !canEdit || saving || !editing;
  const cancelEdit = () => {
    setDraft({
      trigger_on: setting?.settings?.trigger_on || 'both',
      layers: setting?.settings?.layers ?? 3,
      zone_name: setting?.settings?.zone_name || '',
      trigger_notification: setting?.settings?.trigger_notification !== false,
    });
    setEditing(false);
  };
  const saveAlertSettings = async () => {
    if (!setting?._id) return toast.error('Save the Cans Stack configuration first.');
    setAlertSaving(true);
    try {
      const scheduleFields = buildScheduleFields(alertDraft.schedule);
      const nextSettings = {
        ...(setting.settings || {}),
        whatsappRecipientIds: alertDraft.whatsappRecipientIds,
        telegramChatIds: alertDraft.telegramChatIds,
        telegramChatId: alertDraft.telegramChatIds[0] || null,
        schedule: scheduleFields,
      };
      await updateDetectionSetting(setting._id, { settings: nextSettings });
      toast.success('Alert settings saved');
      await onSaved?.();
    } catch (error) {
      toast.error(error?.response?.data?.body?.message || 'Could not save alert settings.');
    } finally {
      setAlertSaving(false);
    }
  };

  const openStackEditor = () => {
    if (!canEdit) return;
    setEditing(true);
    setModalOpen(true);
  };

  if (isStack) {
    const closeStackEditor = () => {
      setModalOpen(false);
      setEditing(false);
      cancelEdit();
    };

    const stackForm = (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--tx2)]">Maximum layers <span className="text-red-500">*</span></label>
          <input
            className={`${inputClass} mt-1`}
            type="number"
            min="1"
            step="1"
            value={draft.layers ?? 3}
            onChange={e => setDraft(v => ({ ...v, layers: e.target.value }))}
            disabled={saving}
            required
          />
          {(!Number.isInteger(Number(draft.layers)) || Number(draft.layers) < 1) && (
            <p className="mt-1 text-[11px] text-red-500">Enter a positive whole number.</p>
          )}
        </div>
        {isStack && (
          <div className="border-t border-[var(--bd)] pt-4">
            <h4 className="mb-3 text-sm font-semibold">Alert delivery</h4>
            <div className="space-y-3">
              <WhatsAppRecipientSelect
                api={whatsappApi}
                scopeLabel="detection"
                showRoutingHint={false}
                value={alertDraft.whatsappRecipientIds}
                onChange={value => setAlertDraft(previous => ({ ...previous, whatsappRecipientIds: value }))}
              />
              <div>
                <label className="mb-1 block text-[10.5px] font-semibold text-[var(--tx3)]">Telegram Channels</label>
                <TelegramChannelMultiSelect
                  value={alertDraft.telegramChatIds}
                  options={telegramOptions}
                  onChange={value => setAlertDraft(previous => ({
                    ...previous,
                    telegramChatIds: value,
                    schedule: value.length ? previous.schedule : emptySchedule(),
                  }))}
                  disabled={!telegramOptions.length}
                  placeholder="Select Telegram channels"
                  noOptionsLabel="No Telegram channel connected"
                />
              </div>
              <ZoneScheduleFields
                value={alertDraft.schedule}
                onChange={schedule => setAlertDraft(previous => ({ ...previous, schedule }))}
                disabled={!alertDraft.telegramChatIds.length}
                disabledMessage="Please select at least one Telegram channel before setting a schedule."
              />
            </div>
          </div>
        )}
      </div>
    );

    return (
      <section className={`${embedded ? 'border-t border-[var(--bd)] pt-4' : 'overflow-hidden rounded-xl border border-[var(--bd)] bg-[var(--bg1)]'} mt-4 text-[var(--tx)]`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 ${setting?._id ? 'px-4 pt-4' : 'bg-violet-500/[.08] px-4 py-3 dark:bg-violet-400/[.08]'}`}>
          <div className="flex items-center gap-3">
            {!setting?._id && <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm"><Layers3 size={18} /></span>}
            <div><h3 className="text-sm font-semibold">Cans Stack Detection Configuration</h3>
            <p className="mt-1 text-[11px] text-[var(--tx3)]">Full-frame detection; no zone drawing is required.</p></div>
          </div>
          <div className="flex items-center gap-2">
            {!setting?._id && <button type="button" onClick={openStackEditor} disabled={!canEdit} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-violet-500 bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-violet-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"><Pencil size={13} /> Configure Cans Stack</button>}
            {setting?._id && canEdit ? <button type="button" onClick={openStackEditor} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 py-2 text-xs font-semibold text-[var(--tx2)] transition-colors hover:border-[var(--blue)] hover:bg-[var(--bg3)] hover:text-[var(--blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] dark:border-slate-500 dark:text-white dark:hover:border-violet-400 dark:hover:text-white"><Pencil size={13} /> Edit</button> : null}
            {setting?._id && canEdit ? <button type="button" onClick={onDelete} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--crit)] bg-[var(--bg2)] px-3 py-2 text-xs font-semibold text-[var(--crit)] transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"><Trash2 size={13} /> Delete</button> : null}
          </div>
        </div>
        {setting?._id ? (
          <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] px-4 py-3">
            <div><div className="text-[11px] font-medium text-[var(--tx3)]">Maximum layers</div><div className="mt-0.5 text-xl font-bold leading-none text-[var(--tx)]">{setting.settings?.layers ?? 3}</div></div>
            <div className="flex flex-wrap items-center gap-2">
              {setting.settings?.trigger_notification !== false && (
                <>
                  {Array.isArray(setting.settings?.whatsappRecipientIds) && setting.settings.whatsappRecipientIds.length > 0 && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">WhatsApp on</span>}
                  {(setting.settings?.telegramChatIds?.length > 0 || setting.settings?.telegramChatId) && <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400">Telegram on</span>}
                </>
              )}
            </div>
          </div>
        ) : null}
        {modalOpen && createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" onClick={closeStackEditor}>
            <div className="max-h-[calc(100vh-48px)] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-[var(--bd2)] bg-[var(--bg1solid)] p-5 text-[var(--tx)] shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--bd)] bg-[var(--bg2)] p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm"><Layers3 size={17} /></span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[var(--tx)]">Cans Stack Detection Configuration</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--tx3)]">Set the maximum allowed layers and configure incident alert delivery.</p>
                  </div>
                </div>
                <button type="button" onClick={closeStackEditor} aria-label="Close configuration" className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[var(--bd)] bg-[var(--bg1)] p-2 text-[var(--tx2)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--bg3)] hover:text-[var(--tx)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"><X size={15} /></button>
              </div>
              {stackForm}
              <div className="mt-5 flex justify-end gap-2 border-t border-[var(--bd)] pt-4">
                <button type="button" onClick={closeStackEditor} disabled={saving || alertSaving} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] px-3 py-2 text-xs font-semibold text-[var(--tx2)] hover:bg-[var(--bg3)] disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
                <button type="button" onClick={save} disabled={saving || !Number.isInteger(Number(draft.layers)) || Number(draft.layers) < 1} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"><Save size={13} /> {saving ? 'Saving...' : setting?._id ? 'Save changes' : 'Save configuration'}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </section>
    );
  }

  return (
    <section className={`${embedded ? 'border-t border-[var(--bd)] pt-4' : 'rounded-xl border border-[var(--bd)] bg-[var(--bg1)] p-4'} mt-4 text-[var(--tx)]`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{isPosture ? 'Posture configuration' : 'Cans Stack configuration'}</h3>
        {isStack && setting?._id && canEdit ? (
          <div className="flex items-center gap-2">
            {editing ? (
              <button type="button" onClick={cancelEdit} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--tx2)] transition-colors hover:bg-[var(--bg3)] hover:text-[var(--tx)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]">
                <X size={12} /> Cancel
              </button>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--bd)] bg-[var(--bg2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--tx2)] transition-colors hover:bg-[var(--bg3)] hover:text-[var(--tx)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]">
                <Pencil size={12} /> Edit
              </button>
            )}
            <button type="button" onClick={onDelete} className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--crit)] bg-[var(--bg2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--crit)] transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {isPosture ? (
          <label className="text-xs font-medium">Zone name
            <input className={`${inputClass} mt-1`} value={draft.zone_name || ''} onChange={e => setDraft(v => ({ ...v, zone_name: e.target.value }))} disabled={!canEdit || saving} />
          </label>
        ) : null}
        {isPosture ? (
          <label className="text-xs font-medium">Trigger on
            <select className={`${inputClass} mt-1 cursor-pointer`} value={draft.trigger_on || 'both'} onChange={e => setDraft(v => ({ ...v, trigger_on: e.target.value }))} disabled={!canEdit || saving}>
              <option value="sitting">Sitting</option><option value="standing">Standing</option><option value="both">Both</option>
            </select>
          </label>
        ) : (
          <label className="text-xs font-medium">Maximum layers
            <input className={`${inputClass} mt-1`} type="number" min="1" step="1" value={draft.layers ?? 3} onChange={e => setDraft(v => ({ ...v, layers: e.target.value }))} disabled={fieldDisabled} />
          </label>
        )}
      </div>
      {!isPosture && <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs"><input className="cursor-pointer" type="checkbox" checked={!!draft.trigger_notification} onChange={e => setDraft(v => ({ ...v, trigger_notification: e.target.checked }))} disabled={fieldDisabled} />Send incident notifications</label>}
      {isStack && <p className="mt-1 text-[11px] text-[var(--tx3)]">When enabled, an alert notification is sent when the observed stack exceeds the maximum layers.</p>}
      {isStack && <p className="mt-2 text-xs text-[var(--tx3)]">This detector evaluates the full frame. Configure the maximum allowed stack layers.</p>}
      {canEdit && editing && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving || (isPosture && !setting?._id)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? 'Saving...' : setting?._id ? 'Save changes' : 'Save configuration'}
          </button>
        </div>
      )}
      {isStack && setting?._id && (
        <div className="mt-5 border-t border-[var(--bd)] pt-4">
          <h4 className="mb-3 text-sm font-semibold">Alert delivery</h4>
          <div className="space-y-3">
            <WhatsAppRecipientSelect
              api={whatsappApi}
              scopeLabel="detection"
              showRoutingHint={false}
              value={alertDraft.whatsappRecipientIds}
              onChange={value => setAlertDraft(previous => ({ ...previous, whatsappRecipientIds: value }))}
            />
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold text-[var(--tx3)]">Telegram Channels</label>
              <TelegramChannelMultiSelect
                value={alertDraft.telegramChatIds}
                options={telegramOptions}
                onChange={value => setAlertDraft(previous => ({ ...previous, telegramChatIds: value }))}
                disabled={!telegramOptions.length}
                placeholder="Select Telegram channels"
                noOptionsLabel="No Telegram channel connected"
              />
            </div>
            <ZoneScheduleFields
              value={alertDraft.schedule}
              onChange={schedule => setAlertDraft(previous => ({ ...previous, schedule }))}
              disabled={!alertDraft.telegramChatIds.length}
              disabledMessage="Please select at least one Telegram channel before setting a schedule."
            />
            {canEdit && <div className="flex justify-end">
              <button type="button" onClick={saveAlertSettings} disabled={alertSaving} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--blue)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-60">
                <Save size={12} /> {alertSaving ? 'Saving...' : 'Save alert settings'}
              </button>
            </div>}
          </div>
        </div>
      )}
    </section>
  );
}
