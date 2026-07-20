import { Field, ErrorMessage, useFormikContext } from 'formik';
import { Input } from '@/components/ui/input';
import SelectField from './SelectField';

const errorClass = 'text-[var(--crit)] text-[11px] mt-1';

function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-[var(--tx2)] mb-1.5 block">{children}</label>;
}

const locationLabel = (loc) => (loc.toLowerCase() === 'banglore' ? 'Bangalore' : loc);

const RegisterFormStep1 = ({ departments = [], locations = [] }) => {
  const { values, setFieldValue } = useFormikContext();

  // Combine fetched locations with the current value so it prepopulates on edit.
  const locationOptions = Array.from(new Set([values.location, ...locations]))
    .filter(Boolean)
    .map((loc) => ({ value: loc, label: locationLabel(loc) }));

  const departmentOptions = departments.map((dep) => ({ value: dep._id, label: dep.departmentName }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <FieldLabel>First Name*</FieldLabel>
        <Field
          as={Input}
          name="firstName"
          placeholder="Enter first name"
          className="bg-[var(--bg3)] border-[var(--bd)] text-[var(--tx)] shadow-none rounded-[10px]"
        />
        <ErrorMessage name="firstName" component="div" className={errorClass} />
      </div>
      <div>
        <FieldLabel>Last Name*</FieldLabel>
        <Field
          as={Input}
          name="lastName"
          placeholder="Enter last name"
          className="bg-[var(--bg3)] border-[var(--bd)] text-[var(--tx)] shadow-none rounded-[10px]"
        />
        <ErrorMessage name="lastName" component="div" className={errorClass} />
      </div>
      <div>
        <FieldLabel>Email*</FieldLabel>
        <Field
          as={Input}
          name="email"
          type="email"
          placeholder="name@company.com"
          className="bg-[var(--bg3)] border-[var(--bd)] text-[var(--tx)] shadow-none rounded-[10px]"
        />
        <ErrorMessage name="email" component="div" className={errorClass} />
      </div>
      <div>
        <FieldLabel>Designation*</FieldLabel>
        <Field
          as={Input}
          name="designation"
          placeholder="Enter designation"
          className="bg-[var(--bg3)] border-[var(--bd)] text-[var(--tx)] shadow-none rounded-[10px]"
        />
        <ErrorMessage name="designation" component="div" className={errorClass} />
      </div>
      <div>
        <FieldLabel>Location</FieldLabel>
        {/* Location/Department sit at the bottom of the dialog, so their panels
            open upward to stay inside it. */}
        <SelectField
          value={values.location}
          options={locationOptions}
          onChange={(loc) => setFieldValue('location', loc)}
          placeholder="Select location"
          preferUp
        />
        <ErrorMessage name="location" component="div" className={errorClass} />
      </div>
      <div>
        <FieldLabel>Department*</FieldLabel>
        <SelectField
          value={values.departmentId}
          options={departmentOptions}
          onChange={(id) => setFieldValue('departmentId', id)}
          placeholder="Select department"
          preferUp
        />
        <ErrorMessage name="departmentId" component="div" className={errorClass} />
      </div>
    </div>
  );
};

export default RegisterFormStep1;
