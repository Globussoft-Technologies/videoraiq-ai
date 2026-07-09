import NetworkCanvas from './NetworkCanvas'
import RadarSweep from './RadarSweep'
import videoraiqCircle from '../../../assets/videoraiq-circle-white.png'

// Shared dark, glassy auth-page shell used by Login / Forgot / Reset so the
// whole authentication flow looks like one system. Renders the animated
// background + the floating VideoraIQ badge, and wraps `children` in a card.
const AuthShell = ({ title, subtitle, children }) => {
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

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <div
          className="relative w-full max-w-98"
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
              <h2 className="font-display text-2xl font-bold text-slate-50">{title}</h2>
              {subtitle && <p className="mt-1.75 text-[12.5px] text-slate-500">{subtitle}</p>}
            </div>

            {children}
          </div>

          <div className="mt-4.5 text-center font-mono text-[9.5px] tracking-wider text-slate-600">
            © 2026 VIDEORAIQ · ENCRYPTED SESSION · SOC-2
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthShell
