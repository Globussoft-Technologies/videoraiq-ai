import React, { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Info } from 'lucide-react';

const styles = {
  checkbox:
    'border-[#07486A] data-[state=checked]:bg-[#07486A] cursor-pointer data-[state=checked]:text-white w-5 h-5',
};

// small helper textarea component using project textarea if exists else fallback
const Textarea = ({ value, onChange, placeholder, className }) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={
      'w-full border border-[#d1d5db] rounded-md p-1 text-xs ' +
      (className || '')
    }
    rows={5}
  />
);

const channelsList = [
  { key: 'email', label: 'Email' },
  // { key: 'sms', label: 'SMS/Whatsapp' },
  { key: 'push', label: 'Push' },
  // { key: 'webhook', label: 'Webhook' },
];

import { useFormikContext } from 'formik';
import MultiSelect from '@/components/ui/multiselect';
import { getRecipientsData, getVerifiedRecipients } from '../Detection/Api/get';

const NotificationStep = ({ form, setForm }) => {
  // Try to get Formik context if available
  let formik = {};
  try {
    formik = useFormikContext();
  } catch (e) { }
  const [recipientOptions, setRecipientOptions] = React.useState([]);
  // const recipientOptions = [
  //   { id: 'user1@example.com', label: 'User 1' },
  //   { id: 'admin@example.com', label: 'Admin' },
  //   { id: 'support@example.com', label: 'Support' },
  //   { id: 'manager@example.com', label: 'Manager' },
  // ];

  const fetchRecipients = async () => {
    const recipientsResp = await getVerifiedRecipients(0, 1000);
    setRecipientOptions(recipientsResp?.data?.body?.data?.alerts.map(r => ({ id: r._id, label: r.fullName })) || []);
  }

  useEffect(() => {
    fetchRecipients()
  }, [])

  
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top row: Notify + Digest */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-end">
        <div>
          <label className="flex items-center text-xs text-[#7A7A7A] mb-2 ml-2 mt-2">
            Notify *
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent
                className="bg-[#F5F5F5] text-black max-w-[150px] whitespace-normal break-words text-center"
                arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]"
              >
                <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                  Choose notification type for alerts
                </p>
              </TooltipContent>
            </Tooltip>
          </label>
          <Select
            value={form.notify || 'Digest'}
            onValueChange={(v) => {
              if (formik && typeof formik.setFieldValue === 'function') {
                formik.setFieldValue('notify', v);
              } else if (typeof setForm === 'function') {
                if (setForm.length >= 2) {
                  try { setForm('notify', v); } catch (e) {}
                } else {
                  setForm((prev) => ({ ...prev, notify: v }));
                }
              }
            }}
          >
            <SelectTrigger className="w-full border-[#d1d5db] text-xs h-10">
              <SelectValue placeholder="Digest" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Instant">Instant</SelectItem>
              <SelectItem value="Digest">Digest</SelectItem>
            </SelectContent>
          </Select>
          {/* Notify error */}
          {formik.errors && formik.errors.notify && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.notify}</div>
          )}
        </div>
        {/* {form.notify == 'Digest' && <div>
          <label className="block text-xs text-[#7A7A7A] ml-2 mb-2">
            Digest Every (Minute) *
          </label>
          <Select
            value={form.digestEvery}
            onValueChange={(v) => {
              if (formik && typeof formik.setFieldValue === 'function') {
                formik.setFieldValue('digestEvery', v);
              } else if (typeof setForm === 'function') {
                if (setForm.length >= 2) {
                  try { setForm('digestEvery', v); } catch (e) {}
                } else {
                  setForm((prev) => ({ ...prev, digestEvery: v }));
                }
              }
            }}
          > */}
            {/* <SelectTrigger className="w-full border-[#d1d5db] text-xs h-10">
              <SelectValue placeholder="15 minutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 minutes</SelectItem>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="60">60 minutes</SelectItem>
            </SelectContent>
          </Select> */}
          {/* Digest Every error (only if notify is digest) */}
          {/* {form.notify === 'digest' && formik.errors && formik.errors.digestEvery && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.digestEvery}</div>
          )}
        </div>} */}
{/* 
        // Around line 122, replace the commented section with: */}
{form.notify === 'Digest' && (
  <div>
    <label className="block text-xs text-[#7A7A7A] ml-2 mb-2">
      Digest Every (Minute) *
    </label>
    <NumberInput
      value={form.digestEvery || ''}
      onChange={(e) => {
        const v = e.target.value;
        if (formik && typeof formik.setFieldValue === 'function') {
          formik.setFieldValue('digestEvery', v);
        } else if (typeof setForm === 'function') {
          if (setForm.length >= 2) {
            try { setForm('digestEvery', v); } catch (e) {}
          } else {
            setForm((prev) => ({ ...prev, digestEvery: v }));
          }
        }
      }}
      min={1}
      max={1440}
      step={5}
      className="w-full"
    />
    {/* Digest Every error (only if notify is digest) */}
    {form.notify === 'Digest' && formik.errors && formik.errors.digestEvery && (
      <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.digestEvery}</div>
    )}
  </div>
)}
      </div>

      {/* Recipients and Channels row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* Left column: Channels */}
        <div className="mt-1">

          <label className="block text-xs text-[#7A7A7A] mb-2">Channels *</label>
          <div className="grid grid-cols-2 gap-3">
            {channelsList.map((ch) => (
              <label key={ch.key} className="flex items-center gap-3 text-xs">
                <Checkbox
                  checked={(form.channels || {})[ch.key] || false}
                  onCheckedChange={(checked) => {
                    setForm((prev) => ({
                      ...prev,
                      channels: {
                        ...(prev.channels || {}),
                        [ch.key]: checked,
                      },
                    }));

                    if (formik.setFieldValue) {
                      formik.setFieldValue(`channels.${ch.key}`, checked);
                    }
                  }}
                  className={styles.checkbox}
                />
                <span className="text-[#7A7A7A]">{ch.label}</span>
              </label>
            ))}


          </div>
          {formik.errors?.channels && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.channels}</div>
          )}
        </div>

        {/* Right column: Recipients */}
        <div>
          <label className="flex items-center text-xs text-[#7A7A7A] mb-2 ml-2">
            Recipients *
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="2xl:h-4 2xl:w-4 w-3 h-3 ml-1 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent
                className="bg-[#F5F5F5] text-black max-w-[150px] whitespace-normal break-words text-center"
                arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]"
              >
                <p className="text-[#333333] font-[400] 2xl:text-xs text-[10px]">
                  Add recipients to receive notifications
                </p>
              </TooltipContent>
            </Tooltip>
          </label>
          <div className="mb-2">
            <MultiSelect
              options={recipientOptions}
              value={form.recipients || []}
              onChange={(newRecipients) => {
                if (formik && typeof formik.setFieldValue === 'function') {
                  formik.setFieldValue('recipients', newRecipients);
                } else if (typeof setForm === 'function') {
                  if (setForm.length >= 2) {
                    try { setForm('recipients', newRecipients); } catch (e) {}
                  } else {
                    setForm((prev) => ({ ...prev, recipients: newRecipients }));
                  }
                }
              }}
              placeholder="Select Recipients"
              searchable={true}
              searchPlaceholder="Search recipients..."
              className="w-full"
            />
          </div>
          {/* Recipients error */}
          {formik.errors && formik.errors.recipients && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.recipients}</div>
          )}
        </div>

      

      </div>

      {/* Webhook Section */}
      {/* {form.channels?.webhook && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div>
            <label className="block text-xs text-[#7A7A7A] mb-2 ml-2">Webhook URL</label>
            <Input
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault(); // disable Enter key
              }}
              value={form.webhookUrl || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (formik && typeof formik.setFieldValue === 'function') {
                  formik.setFieldValue('webhookUrl', v);
                } else if (typeof setForm === 'function') {
                  if (setForm.length >= 2) {
                    try { setForm('webhookUrl', v); } catch (e) {}
                  } else {
                    setForm((prev) => ({ ...prev, webhookUrl: v }));
                  }
                }
              }}
              placeholder="http://Example.com/hooks/alerts"
              className="border-[#d1d5db] shadow-none text-xs h-10 w-full"
            />
            {formik.errors?.webhookUrl && (
              <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.webhookUrl}</div>
            )}
          </div>

          <div>
            <label className="block text-xs text-[#7A7A7A] mb-2 ml-2">Method</label>
            <Input
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault(); // disable Enter key
              }}
              value={form.webhookMethod || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (formik && typeof formik.setFieldValue === 'function') {
                  formik.setFieldValue('webhookMethod', v);
                } else if (typeof setForm === 'function') {
                  if (setForm.length >= 2) {
                    try { setForm('webhookMethod', v); } catch (e) {}
                  } else {
                    setForm((prev) => ({ ...prev, webhookMethod: v }));
                  }
                }
              }}
              placeholder="POST / GET"
              className="border-[#d1d5db] shadow-none text-xs h-10 w-full"
            />
            {formik.errors?.webhookMethod && (
              <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.webhookMethod}</div>
            )}
          </div>
        </div>
      )} */}

      {/* Full width Webhook Body */}
      {/* {form.channels?.webhook && (
        <div>
          <label className="block text-xs text-[#7A7A7A] mb-2 ml-2">Webhook Body</label>
          <Textarea
            value={form.webhookBody || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (formik && typeof formik.setFieldValue === 'function') {
                formik.setFieldValue('webhookBody', v);
              } else if (typeof setForm === 'function') {
                if (setForm.length >= 2) {
                  try { setForm('webhookBody', v); } catch (e) {}
                } else {
                  setForm((prev) => ({ ...prev, webhookBody: v }));
                }
              }
            }}
            placeholder='{ "alert": "info" }'
            className="resize-none w-full h-32"
          />
          {formik.errors?.webhookBody && (
            <div className="text-red-500 text-xs ml-2 mt-1">{formik.errors.webhookBody}</div>
          )}
        </div>
      )} */}
     

      <hr className='border-[#D9D9D9]' />

      {/* Enable Quiet Hours */}
      <div className="flex items-center justify-start gap-2 sm:gap-3">
        <label className="block text-xs text-[#7A7A7A]">Enable quiet hours</label>
        <Switch
          checked={!!form.enableQuiet}
          onCheckedChange={(val) => {
            if (formik && typeof formik.setFieldValue === 'function') {
              formik.setFieldValue('enableQuiet', val);
            } else if (typeof setForm === 'function') {
              if (setForm.length >= 2) {
                try { setForm('enableQuiet', val); } catch (e) {}
              } else {
                setForm((prev) => ({ ...prev, enableQuiet: val }));
              }
            }
          }}
          className="data-[state=checked]:bg-[#07486A] cursor-pointer scale-75"
        />
      </div>

      {/* Quiet From / To / Mode */}
      {form.enableQuiet && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 items-start">
          {/* Quiet From */}
          <div>
            <label className="block text-xs text-[#7A7A7A] mb-1 ml-1">Quiet From *</label>
            <Input
              type="time"
                onFocus={(e) => e.target.showPicker?.()}
              value={form.quietFrom || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (formik && typeof formik.setFieldValue === 'function') {
                  formik.setFieldValue('quietFrom', v);
                } else if (typeof setForm === 'function') {
                  if (setForm.length >= 2) {
                    try { setForm('quietFrom', v); } catch (e) {}
                  } else {
                    setForm((prev) => ({ ...prev, quietFrom: v }));
                  }
                }
              }}
              className="w-full border-[#d1d5db] text-xs h-8 sm:h-10 shadow-none rounded-xl"
            />
            <div className="h-4">
              {formik.touched?.quietFrom && formik.errors?.quietFrom && (
                <p className="text-[10px] text-red-500 mt-1 ml-1">{formik.errors.quietFrom}</p>
              )}
            </div>
          </div>

          {/* Quiet To */}
          <div>
            <label className="block text-xs text-[#7A7A7A] mb-1 ml-1">Quiet To *</label>
            <Input
              type="time"
                onFocus={(e) => e.target.showPicker?.()}
              value={form.quietTo || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (formik && typeof formik.setFieldValue === 'function') {
                  formik.setFieldValue('quietTo', v);
                } else if (typeof setForm === 'function') {
                  if (setForm.length >= 2) {
                    try { setForm('quietTo', v); } catch (e) {}
                  } else {
                    setForm((prev) => ({ ...prev, quietTo: v }));
                  }
                }
              }}
              className="w-full border-[#d1d5db] text-xs h-8 sm:h-10 shadow-none rounded-xl"
            />
            <div className="h-4">
              {formik.touched?.quietTo && formik.errors?.quietTo && (
                <p className="text-[10px] text-red-500 mt-1 ml-1">{formik.errors.quietTo}</p>
              )}
            </div>
          </div>

          {/* Quiet Mode */}
          {/* <div>
            <label className="block text-xs text-[#7A7A7A] mb-1 ml-1">Quiet Mode *</label>
            <Select
              value={form.quietMode || ''}
              onValueChange={(v) => {
                if (formik && typeof formik.setFieldValue === 'function') {
                  formik.setFieldValue('quietMode', v);
                } else if (typeof setForm === 'function') {
                  if (setForm.length >= 2) {
                    try { setForm('quietMode', v); } catch (e) {}
                  } else {
                    setForm((prev) => ({ ...prev, quietMode: v }));
                  }
                }
              }}
            >
              <SelectTrigger className="w-full border-[#d1d5db] text-xs h-8 sm:h-10">
                <SelectValue placeholder="Digest only" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Digest only">Digest only</SelectItem>
                <SelectItem value="Mute">Mute</SelectItem>
                <SelectItem value="Allow">Allow</SelectItem>
              </SelectContent>
            </Select>
            <div className="h-4">
              {formik.touched?.quietMode && formik.errors?.quietMode && (
                <p className="text-[10px] text-red-500 mt-1 ml-1">{formik.errors.quietMode}</p>
              )}
            </div>
          </div> */}
        </div>
      )}

      <hr className='border-[#D9D9D9]' />

      {/* Retention and Storm Control */}
{/* <div>
  <label className="block text-xs text-[#7A7A7A] mb-2">
    Retention and Storm Control
  </label>

  <div className="flex flex-col lg:flex-row overflow-hidden">
    <div className="w-full lg:w-1/2 p-2 sm:p-3">
      <label className="flex items-center text-xs text-[#7A7A7A] mb-2 sm:mb-4">
        Max Notification Per Day *
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="w-3 h-3 ml-1 sm:ml-2 text-gray-400" />
          </TooltipTrigger>
          <TooltipContent
            className="bg-[#F5F5F5] text-black max-w-[300px] text-center"
            arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]"
          >
            <p className="text-[10px]">
              Set the max notifications per day for each severity level
            </p>
          </TooltipContent>
        </Tooltip>
      </label>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {['Low', 'Moderate', 'High'].map((severity) => {
          const key = severity;

          return (
            <div key={key}>
              <div className="text-[10px] text-[#7A7A7A] mb-1 ml-1">
                {severity}
              </div>

              <Input
                type="number"
                value={form[key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Number(e.target.value);
                  formik.setFieldValue(key, v);
                }}
                className="w-20 sm:w-26 border-[#d1d5db] text-xs h-8 sm:h-10 shadow-none rounded-xl"
                min="0"
              />

              {formik.touched[key] && formik.errors[key] && (
                <div className="text-red-500 text-xs ml-1 mt-1">
                  {formik.errors[key]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>

    <div className="w-px bg-[#E6E6E6]" />

    <div className="w-full lg:w-1/2 p-2 sm:p-3">
      <label className="flex items-center text-xs text-[#7A7A7A] mb-2 sm:mb-4">
        Storm Control *
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="w-3 h-3 ml-1 sm:ml-2 text-gray-400" />
          </TooltipTrigger>
          <TooltipContent
            className="bg-[#F5F5F5] text-black max-w-[210px] text-center"
            arrowClassName="bg-[#F5F5F5] fill-[#F5F5F5]"
          >
            <p className="text-[#333333] text-[10px]">
              Prevent notification overload with caps
            </p>
          </TooltipContent>
        </Tooltip>
      </label>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {[
          { label: 'Per-minute cap', key: 'perMinuteCap' },
          { label: 'Per-day cap', key: 'stormPerDay' },
        ].map(({ label, key }) => (
          <div key={key}>
            <div className="text-[10px] text-[#7A7A7A] mb-1 ml-1">
              {label}
            </div>

            <Input
              type="number"
              value={form[key] ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? '' : Number(e.target.value);
                formik.setFieldValue(key, v);
              }}
              className="w-20 sm:w-28 border-[#d1d5db] text-xs shadow-none h-8 sm:h-10 rounded-xl"
              min="0"
            />

            {formik.touched[key] && formik.errors[key] && (
              <div className="text-red-500 text-xs ml-1 mt-1">
                {formik.errors[key]}
              </div>
            )}
          </div>
        ))}

        <div>
          <div className="text-[10px] text-[#7A7A7A] mb-1 ml-1">On Cap</div>

          <Select>
            <SelectTrigger className="w-full border-[#d1d5db] text-xs h-10">
              <SelectValue placeholder="Digest" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Instant">Instant</SelectItem>
              <SelectItem value="Digest">Digest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="text-[10px] text-[#7A7A7A] mb-1 ml-1">Critical</div>

          <Input
            type="number"
            value={form.Critical ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? '' : Number(e.target.value);
              formik.setFieldValue('Critical', v);
            }}
            className="w-20 sm:w-28 border-[#d1d5db] text-xs shadow-none h-8 sm:h-10 rounded-xl"
            min="0"
          />

          {formik.touched.Critical && formik.errors.Critical && (
            <div className="text-red-500 text-xs ml-1 mt-1">
              {formik.errors.Critical}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
</div> */}

    </div>
  );
};

export default NotificationStep;
