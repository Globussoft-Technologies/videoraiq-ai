import React, { useState } from 'react';
import { Formik, Form } from 'formik';
import * as Yup from 'yup';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import NotificationStep from './NotificationStep';
import EvidenceSeverityStep from './EvidenceSeverityStep';
import DefaultDetectionStep from './DefaultDetectionStep';
import BasicsStep from './BasicsStep';
import { addProfile } from './Api/post';
import { toast } from 'sonner';
import { updateProfile } from './Api/put';
import { updateCameraSettingById } from '@/page/user/Streams/Api/pacth';
import { timezones } from '@/utils/Alltimezone';
import { validationSchema } from '@/schema/profille/profilecreate';


const steps = [
  { id: 1, label: 'Basics' },
  { id: 2, label: 'Notification' },
  { id: 3, label: 'Evidence & Severity' },
  { id: 4, label: 'Default Detection Setting' },
];



const MultiStepForm = ({ trigger, row, fetchProfiles, module, selectedChannelIds, fetchAppliedProfile }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  const handleStep = (values, actions, direction) => {
    // If moving forward from Basics (step 1) and schedule hasn't been saved, block
    if (step === 1 && direction > 0) {
      // values may have scheduleSaved flag set by BasicsStep
      if (values && values.scheduleSaved === false) {
        toast.error('Please save schedule changes before proceeding');
        // mark scheduleSaved touched to highlight if needed
        actions.setTouched({ ...(actions.touched || {}), scheduleSaved: true });
        return;
      }
    }
    validationSchema[step - 1]
      .validate(values, { abortEarly: false })
      .then(() => {
        setStep((s) => Math.max(1, Math.min(4, s + direction)));
        actions.setTouched({});
        actions.setErrors({});
      })
      .catch((err) => {
        const errors = {};
        err.inner.forEach((e) => {
          errors[e.path] = e.message;
        });
        actions.setTouched(errors);
        actions.setErrors(errors);
      });
  };



  const handleSave = () => {
    // setOpen(false),setStep(1)
  }
  

// const convertToObjectsFormat = (input) => {
//   console.log(input)
//   const objects = {};

//   Object.entries(input).forEach(([parentKey, parentData]) => {
//     const arr = [];

//     // Include subcategories if enabled or has subscribed/notified
//     if (parentData.subcategories) {
//       Object.entries(parentData.subcategories).forEach(([childKey, childData]) => {
//         if (childData.enabled || childData.subscribed || childData.notified) {
//           arr.push({
//             name: childKey.charAt(0).toUpperCase() + childKey.slice(1),
//             notify: Boolean( childData.notified),
//             enable:Boolean(childData.subscribed)
//           });
//         }
//       });
//     }

//     // Only include parent itself if it has no subcategories with data
//     if ((!parentData.subcategories || arr.length === 0) && parentData.enabled) {
//       arr.push({
//         name: parentKey.charAt(0).toUpperCase() + parentKey.slice(1),
//         notify: Boolean(parentData.notified),
//       });
//     }

//     if (arr.length > 0) {
//       objects[parentKey] = arr;
//     }
//   });

//   return  objects ;
// };

const convertToObjectsFormat = (input) => {
  const objects = {};

  Object.entries(input || {}).forEach(([parentKey, parentData]) => {
    const arr = [];

    if (parentData.subcategories) {
      Object.entries(parentData.subcategories).forEach(([childKey, childData]) => {
        if (childData.enabled || childData.subscribed || childData.notified) {
          arr.push({
            name: childKey.charAt(0).toUpperCase() + childKey.slice(1),
            notify: Boolean(childData.notified),
            enable: Boolean(childData.subscribed),
          });
        }
      });
    }

    // If no selected children and parent enabled, include parent itself
    if (arr.length === 0 && parentData.enabled) {
      arr.push({
        name: parentKey.charAt(0).toUpperCase() + parentKey.slice(1),
        notify: Boolean(parentData.notified),
        enable: true,
      });
    }

    // Always assign the array (may be empty)
    objects[parentKey] = arr;
  });

  // If all parents map to empty arrays, return empty object
  const allEmpty = Object.values(objects).every(
    (arr) => Array.isArray(arr) && arr.length === 0
  );
  

  if (allEmpty) {
    return {}; // ✅ overall empty
  }

  return objects;
};

const prepareObjectsForApi = (selectedObject) => {
  if (!selectedObject || typeof selectedObject !== 'object') return {};

  const result = {};

  Object.entries(selectedObject).forEach(([parentKey, parentData]) => {
    // If parentData is an array, send it as-is
    if (Array.isArray(parentData)) {
      result[parentKey] = parentData;
      return;
    }

    // Otherwise, assume it's the normalized object shape → convert
    const converted = convertToObjectsFormat({ [parentKey]: parentData });
    if (converted[parentKey] && converted[parentKey].length > 0) {
      result[parentKey] = converted[parentKey];
    } else {
      // if convertToObjectsFormat returned empty, but parent exists, send empty array
      result[parentKey] = [];
    }
  });

  return result;
};




// Utility
const capitalize = (str = '') =>
  str.charAt(0).toUpperCase() + str.slice(1);

  function buildPayload(values) {

    const payload = {
      basics: {
        profileName: values.profileName,
        timeZone: values.timezone,
        // repeatDays: values.repeatDays,
        // runOnWeekends: values.runOnWeekends,
        days: values?.schedule?.days || [],
        // startTime: values.startFrom,
        // endTime: values.endTo,
        // preset: values.preset || null,
      },
      notification: {
        notify: values.notify,
        recipients: values.recipients,
        channels: {
          email: !!values.channels.email,
          smsWhatsapp: !!values.channels.sms,
          push: !!values.channels.push,
          webhook: !!values.channels.webhook,
        },
        // webhooks: values.channels?.webhook
        //   ? [
        //     {
        //       url: values.webhookUrl,
        //       method: values.webhookMethod,
        //       body: values.webhookBody,
        //     },
        //   ]
        //   : [],
        ...(values.digestEvery != null && {
          digestEveryMinutes: Number(values.digestEvery),
        }),
         enableQuietHours: !!values.enableQuiet,
        ...(values.enableQuiet && {
          quietFrom: values.quietFrom,
          quietTo: values.quietTo,
          // quietMode: values.quietMode || 'Digest only',
        }),
        // maxNotificationsPerDay: {
        //   low: values.Low || 0,
        //   moderate: values.Moderate || 0,
        //   high: values.High || 0,
        //   critical: values.Critical || 0,
        // },
        // stormControl: {
        //   perMinuteCap: values.perMinuteCap || 0,
        //   perDayCap: values.stormPerDay || 0,
        //   // onCap: values.oncap || 'Digest only',
        //   // critical: values.stormCritical || 0,
        // },
      },
      evidenceSeverity: {
        evidenceType: values.evidence,
       
        time: values.time || 5,
        storage:values.storage || '',
        // enableQuietHours: !!values.enableQuiet,
        // ...(values.enableQuiet && {
        //   quietFrom: values.quietFrom,
        //   quietTo: values.quietTo,
        //   quietMode: values.quietMode || 'Digest only',
        // }),
        // maxNotificationsPerDay: {
        //   low: values.Low || 0,
        //   moderate: values.Moderate || 0,
        //   high: values.High || 0,
        //   critical: values.Critical || 0,
        // },
        // stormControl: {
        //   perMinuteCap: values.perMinuteCap || 0,
        //   perDayCap: values.stormPerDay || 0,
        //   // onCap: values.oncap || 'Digest only',
        //   // critical: values.stormCritical || 0,
        // },
      },
      defaultDetectionSettings: {
        authorisedUsers: Array.isArray(values?.selectedFaces)
          ? values.selectedFaces
            .map(item =>
              typeof item === 'string'
                ? item
                : item?._id
            )
            .filter(Boolean)
          : []
        ,
  objects: prepareObjectsForApi(values?.selectedObject)?.objects?.length == 0 ?{}: prepareObjectsForApi(values.selectedObject),

      },
    };

    return (payload);
  }


  function getTotalArrayCount(obj) {
  let count = 0;

  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue;

    const value = obj[key];

    if (Array.isArray(value)) {
      count += value.length;
    } else if (value !== null && typeof value === 'object') {
      count += getTotalArrayCount(value); // recursively count nested arrays
    }
  }

  return count;
}
const count =getTotalArrayCount(row?.defaultDetectionSettings?.objects);

  const initialValues = {
    // profileName: row?.basics?.profileName || '',
    profileName: module === 'appliedProfile'
      ? ''
      : row?.basics?.profileName || '',
    timezone: row?.basics?.timeZone || '',
    // runOnWeekends: row?.basics?.runOnWeekends ?? false,

    // Assuming time is coming in 24-hour format (e.g., "22:10") and we need to convert to 12-hour + period
    startFrom: row?.basics?.startTime?.slice(0, 5) || '22:10',
    startFromPeriod: parseInt(row?.basics?.startTime?.split(':')[0]) >= 12 ? 'PM' : 'AM',

    endTo: row?.basics?.endTime?.slice(0, 5) || '22:10',
    endToPeriod: parseInt(row?.basics?.endTime?.split(':')[0]) >= 12 ? 'PM' : 'AM',

    enableQuiet: row?.notification?.enableQuietHours ?? false,
    quietFrom: row?.notification?.quietFrom || '', // not in data, fallback to default
    quietFromPeriod: row?.notification?.quietFromPeriod || 'AM',
    quietTo: row?.notification?.quietTo || '',   // not in data, fallback to default
    quietToPeriod: row?.notification?.quietToPeriod || 'AM',
    quietMode: row?.notification?.quietMode || 'Digest only',

    notify: row?.notification?.notify || 'Digest',
    digestEvery: row?.notification?.digestEveryMinutes?.toString() || '15',
    evidence: row?.evidenceSeverity?.evidenceType || '',
    recipients: row?.notification?.recipients || [],
    newRecipient: '',
   
    channels: {
      email: row?.notification?.channels?.email ?? false,
      sms: row?.notification?.channels?.smsWhatsapp ?? false,
      push: row?.notification?.channels?.push ?? true,
      webhook: row?.notification?.channels?.webhook ?? false,
    },
    // only include days when editing an existing profile; leave undefined for create so defaults apply
    days: row?.basics?.days,
    // webhookUrl: row?.notification?.webhooks?.[0]?.url || '',
    // webhookMethod: row?.notification?.webhooks?.[0]?.method || 'POST',
    // webhookBody: row?.notification?.webhooks?.[0]?.body || '',
    enableFaceAuth: (row?.defaultDetectionSettings?.authorisedUsers?.length ?? 0) > 0,
    selectedFaces: row?.defaultDetectionSettings?.authorisedUsers || [],

    // enableGenericObject: (row?.defaultDetectionSettings?.objects ? Object.keys(row.defaultDetectionSettings.objects).length > 0 : false),
     enableGenericObject: (row?.defaultDetectionSettings?.objects ? getTotalArrayCount(row?.defaultDetectionSettings?.objects) > 0 :false),
  selectedObject: row?.defaultDetectionSettings?.objects || {},
    Low: row?.notification?.maxNotificationsPerDay?.low || 0,
    Moderate: row?.notification?.maxNotificationsPerDay?.moderate || 0,
    High: row?.notification?.maxNotificationsPerDay?.high || 0,
    Critical: row?.notification?.maxNotificationsPerDay?.critical || 0,
    stormPerDay: row?.notification?.stormControl?.perDayCap || 0,
    perMinuteCap: row?.notification?.stormControl?.perMinuteCap || 0,
  time:row?.evidenceSeverity?.time || 5,
  storage:row?.evidenceSeverity?.storage || '',
    // include schedule for editing: prefer row.schedule, fallback to row.days if present
    schedule: row?.schedule || (row?.days ? { days: row.days } : undefined),

  };


  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          setOpen(val);
          if (!val) setStep(1);
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className="bg-transparent hide-scrollbar rounded-[12px] px-3 sm:px-4 md:px-6 py-3 sm:py-4 md:py-6 shadow-none w-full max-w-[98vw] sm:max-w-[95vw] md:max-w-[750px] h-[100vh] overflow-y-auto overflow-x-hidden top-1/2 left-1/2 translate-x-[-50%] translate-y-[-50%] scrollbar-hide"
          closeBtn="[_&_svg]:!size-5 sm:!size-6 [&_svg]:!w-5 sm:!w-6 [&_svg]:!h-5 sm:mt-4 mr-3 sm:mr-4"
        >


          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema[step - 1]}
            validateOnChange={true}   // <-- Add this
            validateOnBlur={true}
            enableReinitialize={false}
            onSubmit={async (values, actions) => {

              if (step < 4) {
                handleStep(values, actions, 1);
                return;
              }

              // Clean up values based on conditions

              if (values.channels?.webhook === false) {
                delete values.webhookUrl;
                delete values.webhookMethod;
                delete values.webhookBody;
              }


              if (values.notify !== 'Digest') {
                delete values.digestEvery;
              }

              let finalPayload;
              try {
                finalPayload = buildPayload(values);

                if (module === 'appliedProfile') {
                  const response = await addProfile(finalPayload);

                  if (response?.status === 'success') {
                    toast.success(response?.message || 'Profile created successfully');
                    setOpen(false);
                    setStep(1);
                    actions.resetForm();
                    // fetchProfiles();

                    // Ensure applied profile is refreshed for the channel if provided
                    try {
                      if (fetchAppliedProfile && selectedChannelIds && selectedChannelIds.length > 0) {
                        fetchAppliedProfile(selectedChannelIds[0]);
                      }
                    } catch (err) {
                      console.error('Error calling fetchAppliedProfile after create', err);
                    }

                    // If channel(s) were provided, apply the newly created profile to the first channel
                    try {
                      const profileId =
                        response?.data?._id || response?.data?._id || response?.data?.profile?._id || response?.data?.data?._id || response?._id || null;
                      if (selectedChannelIds && selectedChannelIds.length > 0 && profileId) {
                        const applyResp = await updateCameraSettingById(selectedChannelIds[0], { profile: profileId });
                        if (applyResp?.data?.statusCode === 200) {
                          toast.success(applyResp?.data?.body?.message || 'Profile applied to camera');
                          fetchAppliedProfile && fetchAppliedProfile(selectedChannelIds[0]);
                        } else {
                          console.warn('Failed to apply profile to camera', applyResp);
                        }
                      }
                    } catch (err) {
                      console.error('Failed to apply new profile to camera', err);
                    }
                  } else {
                    toast.error(response?.message || 'Failed to create profile');
                  }
                  return;
                }

                if (row) {
                  const response = await updateProfile(row, finalPayload);
                  if (response?.status == "success") {
                    toast.success(response?.message || 'Profile updated successfully');
                    setOpen(false);
                    setStep(1);
                    actions.resetForm();
                    fetchProfiles()
                  } else {
                    toast.error(response?.message || 'Failed to update profile');
                  }
                } else {
                  const response = await addProfile(finalPayload);
                  if (response?.status == "success") {
                    toast.success(response?.message || 'Profile added successfully');
                    setOpen(false);
                    setStep(1);
                    actions.resetForm();
                    fetchProfiles()
                  }

                }

              } catch (e) {
                console.error('Failed to build payload', e);
              }

            }}

          >
            {({ values, errors, touched, setFieldValue, setFieldTouched, handleChange, handleSubmit, setValues, setErrors }) => (
              <Form>
                <div className="bg-white rounded-[18px] p-3 sm:p-4 md:p-6 shadow-xl border border-gray-200 flex flex-col justify-between h-full overflow-x-hidden">
                  <div>
                    <DialogHeader>
                      <DialogTitle className="text-sm sm:text-lg md:text-xl justify-center items-center flex font-semibold text-[#333333]">
                        {row ? 'Edit Profile' : ' Add New Profile'}
                      </DialogTitle>
                      <DialogDescription className="text-xs font-[300] text-[#9E9E9E] text-center">
                        Define time-based alert behavior. Keep it simple up-front; extras appear when you enable.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="bg-white shadow-sm p-2 sm:p-3 rounded-lg border border-gray-200 mt-3 sm:mt-4">
                      <div className="mt-4 sm:mt-6">
                        {/* Step tabs */}
                        {/* <div className="flex flex-wrap justify-center items-center gap-1 sm:gap-2 border-b border-gray-200 mb-3 sm:mb-5 cursor-pointer">
                          {steps.map((stepItem) => (
                            <div
                            type='button'
                              key={stepItem.id}
                              className={`px-1 sm:px-2 md:px-4 text-xs font-medium ${step === stepItem.id ? 'text-[#07486A] border-b-2 border-[#07486A]' : 'text-[#D3D3D3]'}`}
                              //  onClick={()=>{setStep(stepItem?.id)}}
                              // onClick={async () => {
                              //   if (stepItem.id === step) return; // if same tab, ignore

                              //   // Validate current step
                              //   try {
                              //     await validationSchema[step - 1].validate(values, { abortEarly: false });
                              //     // If validation passes → switch tab
                              //     setStep(stepItem.id);
                              //   } catch (err) {
                              //     // If validation fails → show errors
                              //     const errors = {};
                              //     err.inner.forEach((e) => {
                              //       errors[e.path] = e.message;
                              //     });
                              //     actions.setTouched(errors);
                              //     actions.setErrors(errors);
                              //     toast.error('Please fix the errors before proceeding');
                              //   }
                              // }}
                            onClick={() => setStep((s) => {setStep(stepItem?.id)})}

                            >
                              {stepItem.label}
                            </div>
                          ))}
                        </div> */}
                        {/* Step tabs */}
                        <div className="flex flex-wrap justify-center items-center gap-1 sm:gap-2 border-b border-gray-200 mb-3 sm:mb-5 cursor-pointer">
                          {steps.map((stepItem) => (
                            <div
                              key={stepItem.id}
                              className={`px-1 sm:px-2 md:px-4 text-xs font-medium ${step === stepItem.id
                                ? 'text-[#07486A] border-b-2 border-[#07486A]'
                                : 'text-[#D3D3D3]'
                                }`}
                              onClick={async () => {
                                if (stepItem.id === step) return; // already on this tab

                                if (stepItem.id < step) {
                                  // Going backward → just switch
                                  setStep(stepItem.id);
                                  return;
                                }

                                // If we're on Basics and schedule is unsaved, block navigation forward immediately
                                if (step === 1 && values && values.scheduleSaved === false) {
                                  toast.error('Please save schedule changes before proceeding');
                                  return;
                                }

                                // Going forward → validate all previous steps sequentially
                                let canProceed = true;
                                for (let s = step; s < stepItem.id; s++) {
                                  try {
                                    await validationSchema[s - 1].validate(values, { abortEarly: false });
                                  } catch (err) {
                                    canProceed = false;
                                    const fieldErrors = {};
                                    err.inner.forEach((e) => {
                                      fieldErrors[e.path] = e.message;
                                    });

                                    Object.keys(fieldErrors).forEach((field) => setFieldTouched(field, true));

                                    toast.error(`Please complete Step ${s} before proceeding to Step ${stepItem.id}`);
                                    break;
                                  }
                                }

                                if (canProceed) {
                                  setStep(stepItem.id);
                                }
                              }}
                            >
                              {stepItem.label}
                            </div>
                          ))}
                        </div>
                        {/* Steps content */}
                        {step === 1 && <BasicsStep form={values} setForm={setFieldValue} />}
                        {step === 2 && <NotificationStep form={values} setForm={setFieldValue} />}
                        {step === 3 && <EvidenceSeverityStep form={values} setForm={setFieldValue} />}
                        {step === 4 && <DefaultDetectionStep row={row} form={values} setForm={setFieldValue} onCancel={() => { setStep(1); setOpen(false) }} onSave={() => { handleSave() }} />}
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="mt-6 md:mt-8">
                    <div className="grid grid-cols-1 sm:grid-cols-3 items-center w-full gap-3 sm:gap-4">
                      <div className="flex items-center gap-2">
                        {step > 1 && (
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => setStep((s) => Math.max(1, s - 1))}
                            className="bg-[#F5F5F5] cursor-pointer text-[#333] border rounded-[8px] border-[#8080804D] hover:bg-gray-50 text-xs md:text-sm"
                          >Back</Button>
                        )}
                        {step < 4 ? (
                          <Button
                            type="submit"
                            className="bg-[#F5F5F5] cursor-pointer text-[#333333] border-[#8080804D] text-xs sm:text-sm"
                            disabled={step === 1 && (values && values.scheduleSaved === false)}
                          >
                            Next
                          </Button>
                        ) : (
                          <Button

                            // type="submit"
                            className="bg-[#F5F5F5] text-[#333333] hover:bg-[#05365A] hover:text-white cursor-pointer text-xs sm:text-sm"
                          >Done</Button>
                        )}
                      </div>
                      <div className="flex flex-col mt-4 items-center justify-center">
                        <div className="w-full max-w-xs h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-1 bg-[#07486A] rounded-full transition-all duration-300`} style={{ width: `${((step - 1) / 3) * 100}%` }} />
                        </div>
                        <div className="text-xs text-[#8b8b8b] mt-2">
                          <span className="text-[#333333] font-semibold">{step}</span> .. 4
                        </div>
                      </div>
                      <div className="flex justify-end"></div>
                    </div>
                  </DialogFooter>
                </div>
              </Form>
            )}
          </Formik>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MultiStepForm;
