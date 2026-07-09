import videoraiqLogo from '../../../assets/videoraiq-logo-white.png'

const CHIPS = [
  { label: 'Client Provisioning', dot: '#3b82f6' },
  { label: 'Camera & Detection Config', dot: '#a855f7' },
  { label: 'Fleet Analytics', dot: '#22d3ee' },
  { label: 'Billing & Plans', dot: '#f5a623' },
]

const BrandPanel = () => {
  return (
    <div
      className="w-full max-w-130 flex-1 text-center lg:text-left"
      style={{ animation: 'vq-fade-left .8s ease both' }}
    >
      <img
        src={videoraiqLogo}
        alt="VideoraIQ"
        className="mx-auto mb-7.5 h-8.5 w-auto lg:mx-0"
      />

      <div className="mb-5.5 inline-flex items-center gap-2 rounded-full border border-purple-400/40 bg-linear-to-br from-purple-500/20 to-blue-500/20 px-3.25 py-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c39bff" strokeWidth="2">
          <path d="M12 3l7.5 2.8v5.3c0 4.5-3.1 7.7-7.5 9.1-4.4-1.4-7.5-4.6-7.5-9.1V5.8z" />
        </svg>
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-purple-300">
          SUPER ADMIN · COMMAND PLATFORM
        </span>
      </div>

      <h1 className="text-4xl leading-[1.06] font-bold tracking-tight text-slate-50 sm:text-[42px]">
        Every client.
        <br />
        Every camera.
        <br />
        <span className="bg-linear-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          One control room.
        </span>
      </h1>

      <p className="mx-auto mt-5 max-w-105 text-[15px] leading-relaxed text-slate-400 lg:mx-0">
        The master console for the VideoraIQ platform — provision client workspaces, allocate
        cameras &amp; detections, and monitor fleet-wide activity in real time.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2.25 lg:justify-start">
        {CHIPS.map((c) => (
          <span
            key={c.label}
            className="flex items-center gap-1.75 rounded-full border border-blue-400/20 bg-slate-950/50 px-3.25 py-1.75 text-xs font-medium text-slate-200 backdrop-blur-sm"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: c.dot, boxShadow: `0 0 7px ${c.dot}` }}
            />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default BrandPanel
