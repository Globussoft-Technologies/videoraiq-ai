import { Field, ErrorMessage, useFormikContext } from 'formik';
import { Input } from '@/components/ui/input';

const selectClass =
  'w-full h-11 rounded-[10px] bg-[var(--bg3)] border border-[var(--bd)] text-[var(--tx)] px-3 text-sm cursor-pointer focus:outline-none focus:border-[var(--blue)]';

const errorClass = 'text-[var(--crit)] text-[11px] mt-1';

function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-[var(--tx2)] mb-1.5 block">{children}</label>;
}

const RegisterFormStep1 = ({ departments = [], locations = [] }) => {
  const { values } = useFormikContext();

  // Combine fetched locations with the current value so it prepopulates on edit.
  const allLocations = Array.from(new Set([values.location, ...locations])).filter(Boolean);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <FieldLabel>Testing working fine*</FieldLabel>
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
        <Field as="select" name="location" className={selectClass}>
          <option value="">Select location</option>
          {allLocations.map((loc) => (
            <option key={loc} value={loc}>
              {loc.toLowerCase() === 'banglore' ? 'Bangalore' : loc}
            </option>
          ))}
        </Field>
        <ErrorMessage name="location" component="div" className={errorClass} />
      </div>
      <div>
        <FieldLabel>Department*</FieldLabel>
        <Field as="select" name="departmentId" className={selectClass}>
          <option value="">Select department</option>
          {departments.map((dep) => (
            <option key={dep._id} value={dep._id}>
              {dep.departmentName}
            </option>
          ))}
        </Field>
        <ErrorMessage name="departmentId" component="div" className={errorClass} />
      </div>
    </div>
  );
};

export default RegisterFormStep1;
