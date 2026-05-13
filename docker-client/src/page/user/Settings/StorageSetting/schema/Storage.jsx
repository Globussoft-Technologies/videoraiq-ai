import * as Yup from 'yup';
export const storageSchema = Yup.object({
  name: Yup.string().trim().required('Name is required'),
  path: Yup.string().when('storageType', {
    is: 'sftp',
    then: (schema) => schema.required('Path is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  port: Yup.number().when('storageType', {
    is: 'sftp',
    then: (schema) => schema.required('Port is required').min(1, 'Port must be at least 1').max(65535, 'Port must be at most 65535'),
    otherwise: (schema) => schema.notRequired(),
  }),
  password: Yup.string().when('storageType', {
    is: 'sftp',
    then: (schema) => schema.required('Password is required'),
    otherwise: (schema) => schema.notRequired(),
  }), 
  username: Yup.string().when('storageType', {
    is: 'sftp',
    then: (schema) => schema.required('Username is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  host: Yup.string().when('storageType', {
    is: 'sftp',
    then: (schema) => schema.required('Host is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  clientId: Yup.string().when('storageType', {
    is: 'google_drive_oauth',
    then: (schema) => schema.required('Client ID is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  clientSecret: Yup.string().when('storageType', {
    is: 'google_drive_oauth',
    then: (schema) => schema.required('Client Secret is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  redirectUri: Yup.string().when('storageType', {
    is: 'google_drive_oauth',
    then: (schema) => schema.required('Redirect URI is required'),
    otherwise: (schema) => schema.notRequired(),
  }),

  accessKeyId: Yup.string().when('storageType', {
    is: 's3',
    then: (schema) => schema.required('Access Key ID is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  secretAccessKey: Yup.string().when('storageType', {
    is: 's3',
    then: (schema) => schema.required('Secret Access Key is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  bucketName: Yup.string().when('storageType', {
    is: 's3',
    then: (schema) => schema.required('Bucket Name is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
  region: Yup.string().when('storageType', {
    is: 's3',
    then: (schema) => schema.required('Region is required'),
    otherwise: (schema) => schema.notRequired(),
  }),
});

