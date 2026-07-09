const TILES = [
  {
    cam: 'CAM-04',
    client: 'Embassy Tech Park',
    status: 'INTRUSION',
    bg: 'linear-gradient(135deg,#12203a,#0a1428)',
    boxStyle: { top: '34%', left: '22%', width: '42%', height: '44%' },
    boxColor: '#ff4d4d',
    boxGlow: 'rgba(255,77,77,.35)',
    label: 'PERSON 96%',
  },
  {
    cam: 'CAM-11',
    client: 'Manipal Hospital',
    status: 'FACE MATCH',
    bg: 'linear-gradient(135deg,#191430,#0c0a1e)',
    boxStyle: { top: '24%', left: '34%', width: '34%', height: '52%' },
    boxColor: '#22c55e',
    boxGlow: 'rgba(34,197,94,.35)',
    label: 'ID 99%',
  },
]

const DetectionTiles = () => {
  return (
    <div
      className="pointer-events-none absolute top-20 right-11 z-5 hidden flex-col gap-3 xl:flex"
      style={{ animation: 'vq-fade-up 1s ease both .35s' }}
    >
      {TILES.map((t) => (
        <div
          key={t.cam}
          className="w-52.5 overflow-hidden rounded-[14px] border border-blue-400/15 bg-slate-950/60 shadow-2xl backdrop-blur-md"
        >
          <div className="relative h-29 overflow-hidden" style={{ background: t.bg }}>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)',
              }}
            />
            <div className="absolute top-2 left-2.5 flex items-center gap-1.5 font-mono text-[8.5px] text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              REC
            </div>
            <div className="absolute top-2 right-2.5 font-mono text-[8px] text-slate-400">
              {t.cam}
            </div>
            <div
              className="absolute rounded-[3px] border-[1.4px]"
              style={{
                ...t.boxStyle,
                borderColor: t.boxColor,
                animation: 'vq-box-pulse 3.4s ease-in-out infinite',
                boxShadow: `0 0 14px ${t.boxGlow}`,
              }}
            >
              <span
                className="absolute -top-3.25 -left-px rounded-sm px-1 py-px font-mono text-[7px] font-semibold whitespace-nowrap text-slate-950"
                style={{ background: t.boxColor }}
              >
                {t.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.75 px-2.75 py-2">
            <span className="font-mono text-[9px] text-slate-400">{t.client}</span>
            <span
              className="ml-auto font-mono text-[8.5px]"
              style={{ color: t.boxColor }}
            >
              ● {t.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default DetectionTiles
