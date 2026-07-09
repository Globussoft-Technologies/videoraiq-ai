const RadarSweep = () => {
  return (
    <div className="pointer-events-none absolute -top-[8%] -right-[10%] h-[640px] w-[640px]">
      <div className="absolute inset-0 rounded-full border border-blue-400/10" />
      <div className="absolute inset-[14%] rounded-full border border-blue-400/[0.09]" />
      <div className="absolute inset-[30%] rounded-full border border-blue-400/[0.08]" />
      <div className="absolute inset-[46%] rounded-full border border-blue-400/[0.07]" />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(59,130,246,.34), rgba(59,130,246,0) 42%, transparent)',
          animation: 'vq-radar-spin 6s linear infinite',
        }}
      />
      <div
        className="absolute top-1/2 left-0 right-1/2 h-px origin-right"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(120,180,255,.4))',
          animation: 'vq-radar-spin 6s linear infinite',
        }}
      />
    </div>
  )
}

export default RadarSweep
