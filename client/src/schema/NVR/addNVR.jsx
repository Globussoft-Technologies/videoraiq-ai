import * as yup from 'yup';

export const nvrSchema = yup.object().shape({
  ip: yup
    .string()
    .required('IP address is required')
    .matches(
      /^(https?:\/\/)?(localhost|([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3})$/,
      'Invalid IP address or domain format'
    ),

  port: yup
    .number()
    .required('Port is required')
    .typeError('Port must be a number')
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535'),

  rtspPort: yup
    .number()
    .required('RTSP port is required')
    .typeError('RTSP port must be a number')
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535'),

  username: yup
    .string()
    .required('Username is required')
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username cannot exceed 32 characters'),
    
  location: yup
    .string()
    .required('Location is required')
    .min(3, 'Location must be at least 3 characters')
    .max(150, 'Location cannot exceed 150 characters'),

  brand: yup
    .string()
    .required('Brand is required')
    .oneOf(['hikvision', 'cpplus'], 'Invalid brand'),

  password: yup.string().when('$isEdit', {
    is: false,
    then: (schema) => schema.required('Password is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  oldPassword: yup.string().when('$isEdit', {
    is: true,
    then: (schema) => schema.required('Old password is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  newPassword: yup.string().when('$isEdit', {
    is: true,
    then: (schema) => schema.required('New password is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  nvrName: yup
    .string()
    .required('NVR name is required')
    .min(3, 'NVR name must be at least 3 characters')
    .max(50, 'NVR name cannot exceed 50 characters')
    .matches(
      /^[a-zA-Z0-9-_ ]+$/,
      'NVR name can only contain letters, numbers, spaces, hyphens, and underscores'
    ),
});
