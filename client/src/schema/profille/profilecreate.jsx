import * as Yup from 'yup';

export const validationSchema = [
  Yup.object({
    profileName: Yup.string()
      .max(50, 'Profile name must be at most 50 characters')
      .required('Profile name is required'),
    timezone: Yup.string().required('Timezone is required'),
    repeatDays: Yup.array(),
    runOnWeekends: Yup.boolean(),
    startFrom: Yup.string().required('Start time is required'),
    startFromPeriod: Yup.string().required('Start period (AM/PM) is required'),
    endTo: Yup.string().required('End time is required'),
    endToPeriod: Yup.string().required('End period (AM/PM) is required'),
  }),
Yup.object({
  notify: Yup.string().required('Notify is required'),
  digestEvery: Yup.string()
    .nullable()
    .when('notify', {
      is: (val) => typeof val === 'string' && val.toLowerCase() === 'digest',
      then: (schema) => schema.required('Digest Every (Minute) is required'),
      otherwise: (schema) => schema.notRequired(),
    }),

  recipients: Yup.array().min(1, 'At least one recipient is required'),
  channels: Yup.object()
    .test(
      'at-least-one-channel',
      'At least one channel must be selected',
      (value) => {
        if (!value || typeof value !== 'object') return false;
        return Object.values(value).some((v) => v === true);
      }
    )
    .required(),

  webhookUrl: Yup.string().when('channels.webhook', {
    is: true,
    then: (schema) => schema.required('Webhook URL is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  webhookMethod: Yup.string().when('channels.webhook', {
    is: true,
    then: (schema) => schema.required('Webhook Method is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  webhookBody: Yup.string().when('channels.webhook', {
    is: true,
    then: (schema) => schema.required('Webhook Body is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  enableQuiet: Yup.boolean(),

  quietFrom: Yup.string().when('enableQuiet', {
    is: true,
    then: (schema) => schema.required('Quiet From is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  quietTo: Yup.string().when('enableQuiet', {
    is: true,
    then: (schema) => schema.required('Quiet To is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  // quietMode: Yup.string().when('enableQuiet', {
  //   is: true,
  //   then: (schema) => schema.required('Quiet Mode is required'),
  //   otherwise: (schema) => schema.notRequired(),
  // }),

  // ⚠️ Numeric validations added below
  // Low: Yup.number()
  //   .typeError('Low must be a number')
  //   .required('Low is required')
  //   .min(0, 'Low must be at least 0'),

  // Moderate: Yup.number()
  //   .typeError('Moderate must be a number')
  //   .required('Moderate is required')
  //   .min(0, 'Moderate must be at least 0'),

  // High: Yup.number()
  //   .typeError('High must be a number')
  //   .required('High is required')
  //   .min(0, 'High must be at least 0'),

  // Critical: Yup.number()
  //   .typeError('Critical must be a number')
  //   .required('Critical is required')
  //   .min(0, 'Critical must be at least 0'),

  // perMinuteCap: Yup.number()
  //   .typeError('Per-minute cap must be a number')
  //   .required('Per-minute cap is required')
  //   .min(0, 'Per-minute cap must be at least 0'),

  // stormPerDay: Yup.number()
  //   .typeError('Per-day cap must be a number')
  //   .required('Per-day cap is required')
  //   .min(0, 'Per-day cap must be at least 0'),
}),

  // Yup.object({
  //   evidence: Yup.string().required('Evidence is required'),

  //   enableQuiet: Yup.boolean(),

  //   quietFrom: Yup.string(), // Optional

  //   quietFromPeriod: Yup.string().when('enableQuiet', {
  //     is: true,
  //     then: (schema) => schema.required('Quiet From period is required'),
  //     otherwise: (schema) => schema.notRequired(),
  //   }),


  //   quietTo: Yup.string().required('Quiet To is required'), // or optional if needed

  //   quietToPeriod: Yup.string().when('enableQuiet', {
  //     is: true,
  //     then: (schema) => schema.required('Quiet To period is required'),
  //     otherwise: (schema) => schema.notRequired(),
  //   }),

  //   quietMode: Yup.string().when('enableQuiet', {
  //     is: true,
  //     then: (schema) => schema.required('Quiet Mode is required'),
  //     otherwise: (schema) => schema.notRequired(),
  //   }),
  // })

   Yup.object({
    evidence: Yup.string().required('Evidence is required'),
     storage: Yup.string().required('Storage is required'), // ✅ ADDED

    enableQuiet: Yup.boolean(),

    quietFrom: Yup.string().when('enableQuiet', {
      is: true,
      then: (schema) => schema.required('Quiet From is required'),
      otherwise: (schema) => schema.notRequired(),
    }),

    quietTo: Yup.string().when('enableQuiet', {
      is: true,
      then: (schema) => schema.required('Quiet To is required'),
      otherwise: (schema) => schema.notRequired(),
    }),

    quietMode: Yup.string().when('enableQuiet', {
      is: true,
      then: (schema) => schema.required('Quiet Mode is required'),
      otherwise: (schema) => schema.notRequired(),
    }),
  }),
  ,
  Yup.object({
    enableFaceAuth: Yup.boolean(),
    selectedFaces: Yup.array()
      .of(Yup.string())
      .when('enableFaceAuth', {
        is: true,
        then: (schema) => schema.min(1, 'Select at least one face').required('Select identified faces'),
        otherwise: (schema) => schema.notRequired(),
      }),

    enableGenericObject: Yup.boolean(),
    selectedObject: Yup.string().when('enableGenericObject', {
      is: true,
      then: (schema) => schema.required('Select object'),
      otherwise: (schema) => schema.notRequired(),
    }),
  }),
];
