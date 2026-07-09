import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Cookies from 'js-cookie'
import Input from '../../components/UI/Input'
import Button from '../../components/UI/Button'
import BrandPanel from './components/BrandPanel'
import NetworkCanvas from './components/NetworkCanvas'
import RadarSweep from './components/RadarSweep'
import StatusTicker from './components/StatusTicker'
import HudStats from './components/HudStats'
import DetectionTiles from './components/DetectionTiles'
import { signIn } from './apis/post'
import { setAuthUser } from '../../utils/authUser'
import { notifyApiError, notifyApiSuccess } from '../../utils/apiError'
import videoraiqCircle from '../../assets/videoraiq-circle-white.png'

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
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

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l7.5 2.8v5.3c0 4.5-3.1 7.7-7.5 9.1-4.4-1.4-7.5-4.6-7.5-9.1V5.8z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

const LoginPage = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await signIn(form)
      const data = res.data?.body?.data || res.data?.data || res.data || {}
      const token = data.token
      if (!token) throw new Error('No token in response')
      // Clear any stale cookie first so a leftover session/1-day cookie can't mask the new expiry.
      Cookies.remove('access-token', { path: '/' })
      // Remember me → persist 30 days; otherwise a session cookie (clears on browser close).
      const cookieOpts = { path: '/' }
      if (rememberMe) cookieOpts.expires = 30
      Cookies.set('access-token', token, cookieOpts)
      setAuthUser(data.user)
      notifyApiSuccess(res, 'Signed in successfully')
      navigate('/')
    } catch (err) {
      setError(notifyApiError(err, 'Invalid email or password'))
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-950">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,130,246,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.12) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'vq-grid-pan 8s linear infinite',
        }}
      />
      <NetworkCanvas />
      <RadarSweep />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(2,6,23,.55) 100%)',
        }}
      />
      <StatusTicker />
      <HudStats />
      <DetectionTiles />

      <div className="relative z-10 flex min-h-screen items-center px-4 py-24 sm:px-8 sm:py-16 lg:px-11">
        <div className="mx-auto flex max-w-260 flex-wrap items-center justify-center gap-x-16 gap-y-12">
          <BrandPanel />

          <div
            className="relative w-full max-w-98 flex-none"
            style={{ animation: 'vq-fade-up .9s ease both .15s' }}
          >
            {/* floating badge with orbiting rings */}
            <div className="relative z-2 -mb-8.5 flex justify-center">
              <div className="relative flex h-19 w-19 items-center justify-center">
                <span
                  className="absolute -inset-4 rounded-full border border-dashed border-blue-400/30"
                  style={{ animation: 'vq-spin 14s linear infinite' }}
                />
                <span
                  className="absolute -inset-1.5 rounded-full border border-purple-400/35 border-r-transparent border-b-transparent"
                  style={{ animation: 'vq-spin-reverse 8s linear infinite' }}
                />
                <span
                  className="absolute -inset-4 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(59,130,246,.3), transparent 70%)',
                    animation: 'vq-glow 3s ease-in-out infinite',
                  }}
                />
                <span
                  className="flex h-17.5 w-17.5 items-center justify-center rounded-[20px] border border-blue-400/25 bg-slate-900 shadow-2xl"
                  style={{
                    background: 'linear-gradient(135deg,#0c1526,#131d34)',
                    animation: 'vq-float-y 4s ease-in-out infinite',
                  }}
                >
                  <img
                    src={videoraiqCircle}
                    alt="VideoraIQ"
                    className="h-10.5 w-10.5 object-contain"
                  />
                </span>
              </div>
            </div>

            <div
              className="relative overflow-hidden rounded-[22px] border border-blue-400/18 px-7.5 pt-11 pb-7 shadow-2xl backdrop-blur-xl"
              style={{
                background:
                  'linear-gradient(180deg,rgba(14,20,36,.86),rgba(9,13,24,.92))',
              }}
            >
              <span
                className="absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg,transparent,rgba(120,180,255,.6),transparent)',
                }}
              />

              <div className="mb-6 text-center">
                <h2 className="font-display text-2xl font-bold text-slate-50">Secure Sign In</h2>
                <p className="mt-1.75 text-[12.5px] text-slate-500">
                  Restricted to platform administrators
                </p>
              </div>

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
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  label="PASSWORD"
                  variant="glass"
                  icon={<LockIcon />}
                  placeholder="••••••••••••"
                  value={form.password}
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

                {/* 2FA row */}
                <div className="flex items-center gap-2.5 rounded-xl border border-green-500/20 bg-green-500/6 px-3.25 py-2.75">
                  <span className="text-green-400">
                    <ShieldIcon />
                  </span>
                  <span className="flex-1 text-[11.5px] text-green-200/80">
                    2-factor authentication enforced
                  </span>
                  <span className="rounded-md bg-green-500/15 px-1.75 py-0.75 font-mono text-[9px] text-green-400">
                    ACTIVE
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <label
                    htmlFor="rememberMe"
                    className="flex cursor-pointer items-center gap-2 text-xs text-slate-400 select-none"
                  >
                    <input
                      id="rememberMe"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-4.5 w-4.5 items-center justify-center rounded-md border transition-colors ${
                        rememberMe
                          ? 'border-transparent bg-linear-to-br from-purple-600 to-blue-600'
                          : 'border-blue-400/35 bg-slate-950/60'
                      }`}
                    >
                      {rememberMe && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.4">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </span>
                    Remember me
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-blue-400 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="mt-1.5">
                  <Button type="submit" variant="gradient" loading={loading}>
                    <span className="inline-flex items-center gap-2.25">
                      Enter Command Platform
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                        <path d="M5 12h14" />
                        <path d="M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </Button>
                </div>
              </form>

              <div className="mt-5 flex items-center gap-2.5">
                <span className="h-px flex-1 bg-blue-400/12" />
                <span className="font-mono text-[9px] text-slate-500">OR</span>
                <span className="h-px flex-1 bg-blue-400/12" />
              </div>

              {/* <Link
                to="/forgot-password"
                className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-400/18 bg-slate-950/50 text-[12.5px] font-semibold text-slate-300 transition-colors hover:bg-blue-400/8 hover:text-slate-100"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="6" width="14" height="12" rx="2" />
                  <path d="M17 9l4-2v10l-4-2" />
                </svg>
                Go to Client / Admin login
              </Link> */}
            </div>

            <div className="mt-4.5 text-center font-mono text-[9.5px] tracking-wider text-slate-600">
              © 2026 VIDEORAIQ · ENCRYPTED SESSION · SOC-2
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-slate-950/85 backdrop-blur-md"
          style={{ animation: 'vq-fade-up .3s ease' }}
        >
          <div className="relative h-22 w-22">
            <span className="absolute inset-0 rounded-full border-2 border-blue-400/12" />
            <span
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 border-r-blue-500"
              style={{ animation: 'vq-spin .9s linear infinite' }}
            />
            <span
              className="absolute inset-2.5 rounded-full border-2 border-transparent border-b-purple-500"
              style={{ animation: 'vq-spin-reverse 1.3s linear infinite' }}
            />
            <img src={videoraiqCircle} alt="" className="absolute inset-6.5 h-9 w-9 object-contain" />
          </div>
          <div className="font-display text-[15px] text-slate-200">
            Authenticating super admin…
          </div>
          <div className="h-1 w-55 overflow-hidden rounded bg-blue-400/12">
            <span
              className="block h-full w-2/5 rounded bg-linear-to-r from-purple-600 to-cyan-400"
              style={{ animation: 'vq-sheen 1.1s ease-in-out infinite' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginPage
