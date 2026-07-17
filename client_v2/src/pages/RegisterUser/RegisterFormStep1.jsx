import { useEffect, useRef, useState } from 'react';
import { Field, ErrorMessage, useFormikContext } from 'formik';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';

const selectClass =
  'w-full h-11 rounded-[10px] bg-[var(--bg3)] border border-[var(--bd)] text-[var(--tx)] px-3 text-sm cursor-pointer focus:outline-none focus:border-[var(--blue)]';

const errorClass = 'text-[var(--crit)] text-[11px] mt-1';

// 5 visible rows before scrolling — matches the row height used below (~36px).
const LOCATION_PANEL_MAX_H = 180;

function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-[var(--tx2)] mb-1.5 block">{children}</label>;
}

// Native <select> options lists can't be height-limited/scrolled via CSS (the
// browser/OS renders them), so a custom dropdown is needed to cap Location to
// 5 visible rows with a scrollbar for the rest.
function LocationSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const label = (loc) => (loc.toLowerCase() === 'banglore' ? 'Bangalore' : loc);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={selectClass}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
      >
        <span className={value ? '' : 'text-[var(--tx3)]'}>{value ? label(value) : 'Select location'}</span>
        <ChevronDown size={14} style={{ color: 'var(--tx3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
          maxHeight: LOCATION_PANEL_MAX_H, overflowY: 'auto', background: 'var(--bg1solid)', border: '1px solid var(--bd2)',
          borderRadius: 10, boxShadow: '0 18px 50px rgba(0,0,0,.35)', padding: 5,
        }}>
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            style={{ padding: '8px 10px', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: value ? 'var(--tx)' : 'var(--tx3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Select location
          </div>
          {options.map((loc) => (
            <div
              key={loc}
              onClick={() => { onChange(loc); setOpen(false); }}
              style={{
                padding: '8px 10px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                background: value === loc ? 'var(--blue)' : 'transparent',
                color: value === loc ? '#fff' : 'var(--tx)',
              }}
              onMouseEnter={(e) => { if (value !== loc) e.currentTarget.style.background = 'var(--bg2)'; }}
              onMouseLeave={(e) => { if (value !== loc) e.currentTarget.style.background = 'transparent'; }}
            >
              {label(loc)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RegisterFormStep1 = ({ departments = [], locations = [] }) => {
  const { values, setFieldValue } = useFormikContext();

  // Combine fetched locations with the current value so it prepopulates on edit.
  const allLocations = Array.from(new Set([values.location, ...locations])).filter(Boolean);

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
        <LocationSelect
          value={values.location}
          options={allLocations}
          onChange={(loc) => setFieldValue('location', loc)}
        />
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
