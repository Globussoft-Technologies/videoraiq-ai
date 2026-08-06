import { User, Mail, AtSign, Code2, ShieldCheck, Calendar, MapPin, Activity, UserCog } from 'lucide-react';
function Field({ icon: Icon, label, value, tint = 'var(--tx3)', valueColor, mono }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon size={15} strokeWidth={1.8} className="mt-[3px] shrink-0" style={{ color: tint }} />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.04em]" style={{ color: 'var(--tx3)' }}>
          {label}
        </div>
        <div
          className={`mt-1 truncate text-[13.5px] font-semibold leading-none ${mono ? 'font-mono text-[12px] tracking-tight' : ''}`}
          style={{ color: valueColor || 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}
          title={typeof value === 'string' ? value : undefined}
        >
          {value || 'Ã¢â‚¬â€'}
        </div>
      </div>
    </div>
  );
}
export default function AccountDetails({
  fullName,
  email,
  userName,
  role,
  plan,
  expireDate,
  status,
  designation,
  location,
  accessLevel,
  memberSince,
  adminId,
  showTenantFields = true,
  showLocation = true,
}) {
  const isActive = String(status || '').toLowerCase() === 'active';
  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--bd)', background: 'var(--bg1)' }}>
      <div className="mb-1 flex items-center gap-2.5">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg,var(--blue),var(--violet))' }}
        >
          <UserCog size={14} color="#fff" strokeWidth={2.25} />
        </span>
        <h2 className="text-[13.5px] font-semibold tracking-tight" style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}>
          Account Overview
        </h2>
      </div>
      <div
        className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3"
        style={{ marginTop: 10 }}
      >
        <Field icon={User} label="Full Name" value={fullName} tint="var(--blue)" />
        <Field icon={Mail} label="Email Address" value={email} tint="var(--violet)" />
        {showTenantFields ? (
          <>
            <Field icon={Code2} label="Role" value={role} tint="var(--magenta)" />
            <Field icon={ShieldCheck} label="Plan" value={plan} tint="var(--cyan)" />
            <Field icon={Calendar} label="Expiry Date" value={expireDate} tint="var(--warn)" />
            <Field
              icon={Activity}
              label="Status"
              value={status}
              tint={isActive ? 'var(--ok)' : 'var(--tx3)'}
              valueColor={isActive ? 'var(--ok)' : 'var(--tx)'}
            />
          </>
        ) : (
          <>
            {userName && <Field icon={AtSign} label="User Name" value={userName} tint="var(--magenta)" />}
            <Field icon={Code2} label="Role" value={role} tint="var(--cyan)" />
            <Field icon={ShieldCheck} label="Permission Level" value={accessLevel} tint="var(--warn)" />
            {showLocation && <Field icon={MapPin} label="Location" value={location} tint="var(--blue)" />}
            <Field
              icon={Activity}
              label="Status"
              value={status}
              tint={isActive ? 'var(--ok)' : 'var(--tx3)'}
              valueColor={isActive ? 'var(--ok)' : 'var(--tx)'}
            />
            <Field icon={Calendar} label="Access Since" value={memberSince} tint="var(--violet)" />
            {designation && <Field icon={UserCog} label="Designation" value={designation} tint="var(--magenta)" />}

          </>
        )}
      </div>
    </div>
  );
}
