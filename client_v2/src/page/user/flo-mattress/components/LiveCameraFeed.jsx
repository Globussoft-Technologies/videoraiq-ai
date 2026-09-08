import { Maximize2, Radio, ScanLine, Video } from 'lucide-react';

export default function LiveCameraFeed() {
  return (
    <section className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--glass)] shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/12 text-cyan-500">
            <Video className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[var(--tx)]">Live camera feed</h2>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--tx3)]">
              L2-QC-01 - top view
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Full screen camera"
          title="Full screen camera"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--bd)] bg-[var(--bg2)] text-[var(--tx2)] transition hover:text-[var(--tx)]"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1 bg-[#101827]">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:36px_36px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.35),rgba(2,6,23,0.86))]" />
        <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/28 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Camera online
        </div>
        <div className="absolute right-5 top-5 rounded-full border border-white/10 bg-black/28 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75 backdrop-blur">
          1920 x 1080
        </div>

        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="relative aspect-[4/3] w-full max-w-[520px] rounded-[18px] border border-cyan-300/25 bg-cyan-300/5">
            <div className="absolute inset-x-[18%] top-[30%] h-[38%] rounded-[22px] border border-cyan-200/55 bg-cyan-200/10 shadow-[0_0_40px_rgba(34,211,238,0.12)]" />
            <div className="absolute inset-x-[14%] top-[27%] h-[44%] rounded-[26px] border border-white/20" />
            <div className="absolute left-1/2 top-[18%] h-[64%] w-px -translate-x-1/2 bg-cyan-200/35" />
            <div className="absolute inset-y-[16%] left-[18%] w-px bg-cyan-200/25" />
            <div className="absolute inset-y-[16%] right-[18%] w-px bg-cyan-200/25" />
            <ScanLine className="absolute left-1/2 top-[46%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-cyan-200/80" />
          </div>
        </div>

        <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-emerald-400" />
            Waiting for next mattress
          </div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
            Stream placeholder - API later
          </div>
        </div>
      </div>
    </section>
  );
}
