import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Input from '../../components/UI/Input'
import Button from '../../components/UI/Button'
import AuthShell from './components/AuthShell'
import { resetPassword } from './apis/post'
import { notifyApiError, notifyApiSuccess } from '../../utils/apiError'

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 8.3-8.3" />
    <path d="m16 5 3 3" />
    <path d="m13 8 2 2" />
  </svg>
)

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="10.5" width="16" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
)

const EyeIcon = ({ off }) =>
  off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.5 5.2A10.6 10.6 0 0 1 12 5c5.5 0 9 5 9.5 7-.3.9-1 2.2-2.1 3.4M6.6 6.6C4.6 7.9 3.1 9.7 2.5 12c.7 2.5 3.5 7 9.5 7 1.3 0 2.5-.2 3.6-.6" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )

const ResetPasswordPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({
    email: location.state?.email || '',
    otp: '',
    newPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await resetPassword(form)
      notifyApiSuccess(res, 'Password reset successfully')
      navigate('/login')
    } catch (err) {
      setError(notifyApiError(err, 'Unable to reset password'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter the OTP sent to your email along with your new password"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.75">
        <Input
          id="email"
          name="email"
          type="email"
          label="ADMIN EMAIL"
          variant="glass"
          icon={<MailIcon />}
          placeholder="owner@videoraiq.com"
          value={form.email}
          onChange={handleChange}
          required
        />

        <Input
          id="otp"
          name="otp"
          type="text"
          inputMode="numeric"
          label="OTP CODE"
          variant="glass"
          icon={<KeyIcon />}
          placeholder="123456"
          value={form.otp}
          onChange={handleChange}
          required
        />

        <Input
          id="newPassword"
          name="newPassword"
          type={showPassword ? 'text' : 'password'}
          label="NEW PASSWORD"
          variant="glass"
          icon={<LockIcon />}
          placeholder="••••••••••••"
          value={form.newPassword}
          onChange={handleChange}
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-slate-500 transition-colors hover:text-slate-300"
              tabIndex={-1}
            >
              <EyeIcon off={showPassword} />
            </button>
          }
        />

        {error && <p className="text-[12.5px] text-red-400">{error}</p>}

        <div className="mt-1.5">
          <Button type="submit" variant="gradient" loading={loading}>
            Reset password
          </Button>
        </div>
      </form>

      <div className="mt-5 flex items-center gap-2.5">
        <span className="h-px flex-1 bg-blue-400/12" />
        <span className="font-mono text-[9px] text-slate-500">OR</span>
        <span className="h-px flex-1 bg-blue-400/12" />
      </div>

      <Link
        to="/login"
        className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-400/18 bg-slate-950/50 text-[12.5px] font-semibold text-slate-300 transition-colors hover:bg-blue-400/8 hover:text-slate-100"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to login
      </Link>
    </AuthShell>
  )
}

export default ResetPasswordPage
