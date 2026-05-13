
import * as Yup from 'yup';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const emailValidationSchema = Yup.object().shape({
  fullName: Yup.string()
    .matches(/^[A-Z][a-zA-Z\s]*$/, 'Must start with uppercase and only contain letters and spaces')
    .min(6, 'Full name must be at least 6 characters')
    .max(20, 'Full name must not exceed 20 characters')
    .required('Please enter your full name'),
  email: Yup.string()
    .email('Invalid email format')
    .required('Email is required'),
});

export const phoneValidationSchema = (selectedCountry) =>
  Yup.object().shape({
    fullName: Yup.string()
      .matches(/^[A-Z][a-zA-Z]*(\s[A-Za-z]+)*$/, 'Must start with uppercase and only contain letters and spaces')
      .min(6, 'Full name must be at least 6 characters')
      .max(20, 'Full name must not exceed 20 characters')
      .required('Please enter your full name'),

    phonenumber: Yup.string()
      .required('Phone number is required')
      .test('is-valid-phone', 'Invalid phone number format', function (value) {
        if (!value || !selectedCountry) return false;

        try {
          const fullNumber = `+${String(selectedCountry.value)}${value.trim()}`;
          const phoneNumber = parsePhoneNumberFromString(fullNumber);
          return phoneNumber ? phoneNumber.isValid() : false;
        } catch (error) {
          return false;
        }
      }),
  });


