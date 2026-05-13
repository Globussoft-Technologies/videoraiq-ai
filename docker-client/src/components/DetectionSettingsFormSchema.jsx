import * as Yup from 'yup';

export const DetectionSettingsFormSchema = Yup.object().shape({
  name: Yup.string().required('Setting name is required'),
  settingType: Yup.string(),
  channelId: Yup.array()
    .of(Yup.string().required())
    .min(1, 'Select at least one camera'),
  NVRId: Yup.string().required('NVR is required'),
  enabled: Yup.boolean(),
  alerts: Yup.array().of(Yup.string().required('Recipient ID is required')),
  settings: Yup.object().shape({
    imageRequired: Yup.boolean(),
    levelOfImportance: Yup.string()
      .oneOf(['low', 'medium', 'high', 'moderate'])
      .required('Importance is required'),
  }),
});
