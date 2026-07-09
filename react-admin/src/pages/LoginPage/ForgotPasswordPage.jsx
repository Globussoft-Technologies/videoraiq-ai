import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Input from '../../components/UI/Input'
import Button from '../../components/UI/Button'
import AuthShell from './components/AuthShell'
import { forgotPassword } from './apis/post'
import { notifyApiError, notifyApiSuccess } from '../../utils/apiError'

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
)

const ForgotPasswordPage = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await forgotPassword({ email })
      notifyApiSuccess(res, 'OTP sent to your email')
      navigate('/reset-password', { state: { email } })
    } catch (err) {
      setError(notifyApiError(err, 'Unable to send reset OTP'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Forgot password?"
      subtitle="Enter your email and we'll send you an OTP to reset your password"
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && <p className="text-[12.5px] text-red-400">{error}</p>}

        <div className="mt-1.5">
          <Button type="submit" variant="gradient" loading={loading}>
            Send OTP
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

export default ForgotPasswordPage
