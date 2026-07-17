import React from 'react';
import { Field, ErrorMessage, useFormikContext } from 'formik';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const RegisterFormStep1 = ({ departments, locations = [] }) => {
  const { values, errors, touched, setFieldValue } = useFormikContext();

  // Combine fetched locations with the current value to ensure it prepopulates
  const allLocations = Array.from(new Set([values.location, ...locations])).filter(Boolean);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-6">
      {/* ... (First Name, Last Name, Email, Designation fields) */}
      <div className="space-y-1 sm:space-y-2">
        <label className="text-sm font-medium text-gray-700">First Name*</label>
        <Field
          as={Input}
          name="firstName"
          placeholder="Enter First Name"
          className={`bg-white shadow-none ${errors.firstName && touched.firstName ? 'border-red-500' : ''}`}
          autoFocus={false}
        />
        <ErrorMessage name="firstName" component="div" className="text-xs text-red-500" />
      </div>
      <div className="space-y-1 sm:space-y-2">
        <label className="text-sm font-medium text-gray-700">Last Name*</label>
        <Field
          as={Input}
          name="lastName"
          placeholder="Enter Last Name"
          className={`bg-white shadow-none ${errors.lastName && touched.lastName ? 'border-red-500' : ''}`}
        />
        <ErrorMessage name="lastName" component="div" className="text-xs text-red-500" />
      </div>
      <div className="space-y-1 sm:space-y-2">
        <label className="text-sm font-medium text-gray-700">Email*</label>
        <Field
          as={Input}
          name="email"
          placeholder="Enter Email"
          className={`bg-white shadow-none ${errors.email && touched.email ? 'border-red-500' : ''}`}
        />
        <ErrorMessage name="email" component="div" className="text-xs text-red-500" />
      </div>
      <div className="space-y-1 sm:space-y-2">
        <label className="text-sm font-medium text-gray-700">Designation*</label>
        <Field
          as={Input}
          name="designation"
          placeholder="Enter Designation"
          className={`bg-white shadow-none ${errors.designation && touched.designation ? 'border-red-500' : ''}`}
        />
        <ErrorMessage name="designation" component="div" className="text-xs text-red-500" />
      </div>

      <div className="space-y-1 sm:space-y-2">
        <label className="text-sm font-medium text-gray-700">Location</label>
        <Select
          onValueChange={(value) => setFieldValue('location', value)}
          value={values.location}
        >
          <SelectTrigger className={`bg-white shadow-none border-[#D9D9D9] cursor-pointer ${errors.location && touched.location ? 'border-red-500' : ''}`}>
            <SelectValue placeholder="Select Location" />
          </SelectTrigger>
          <SelectContent className="max-h-[250px] overflow-y-auto">
            {allLocations.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-gray-400">No options available</div>
            ) : (
              allLocations.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc.toLowerCase() === 'banglore' ? 'Bangalore' : loc}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <ErrorMessage name="location" component="div" className="text-xs text-red-500" />
      </div>
      <div className="space-y-1 sm:space-y-2">
        <label className="text-sm font-medium text-gray-700">Department</label>
        <Select
          onValueChange={(value) => setFieldValue('departmentId', value)}
          value={values.departmentId}
        >
          <SelectTrigger className={`bg-white shadow-none border-[#D9D9D9] cursor-pointer ${errors.departmentId && touched.departmentId ? 'border-red-500' : ''}`}>
            <SelectValue placeholder="Select Department" />
          </SelectTrigger>
          <SelectContent className="max-h-[250px] overflow-y-auto">
            {/* Find existing department if it's there to ensure labeled show during edit */}
            {departments.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-gray-400">No options available</div>
            ) : (
              departments.map((dep) => (
                <SelectItem key={dep._id} value={dep._id}>
                  {dep.departmentName}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <ErrorMessage name="departmentId" component="div" className="text-xs text-red-500" />
      </div>
    </div>
  );
};

export default RegisterFormStep1;
