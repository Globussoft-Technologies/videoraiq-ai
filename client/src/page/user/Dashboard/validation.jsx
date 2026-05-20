
import * as Yup from 'yup';

export const validationSchema = Yup.object({
  firstName: Yup.string()
    .matches(/^[a-zA-Z\s]+$/, 'Only alphabets and spaces allowed')
    .min(2, 'First name must be at least 2 characters')
    .max(30, 'First name cannot exceed 30 characters')
    .required('First name is required'),
  lastName: Yup.string()
    .matches(/^[a-zA-Z\s]+$/, 'Only alphabets and spaces allowed')
    .min(1, 'Last name must be at least 1 character')
    .max(30, 'Last name cannot exceed 30 characters')
    .required('Last name is required'),
  email: Yup.string()
    .email('Invalid email')
    .required('Email is required'),
});
