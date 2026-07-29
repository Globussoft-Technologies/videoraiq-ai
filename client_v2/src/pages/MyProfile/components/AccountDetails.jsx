function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px]" style={{ color: 'var(--tx3)' }}>{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium" style={{ color: 'var(--tx)' }}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function AccountDetails({ fullName, email, role, plan, expireDate, status }) {
  return (
    <div className="rounded-2xl p-5" style={{ border: '1px solid var(--bd)', background: 'var(--bg1)' }}>
      <h2 className="mb-4 text-sm font-semibold" style={{ fontFamily: 'var(--disp)', color: 'var(--tx)' }}>
        Account Details
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full Name" value={fullName} />
        <Field label="Email Address" value={email} />
        <Field label="Role" value={role} />
        <Field label="Plan" value={plan} />
        <Field label="Expiry Date" value={expireDate} />
        <Field label="Status" value={status} />
      </div>
    </div>
  );
}
