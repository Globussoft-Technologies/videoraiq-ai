import { Play } from 'lucide-react';
import FloButton from './FloButton';
import KeyboardHint from './KeyboardHint';
import StatusPill from './StatusPill';

export default function StationIdleCard({ onStart }) {
  return (
    <section className="w-full max-w-[600px] rounded-2xl border border-[var(--bd)] bg-[var(--glass)] px-6 py-9 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur sm:px-10">
      <StatusPill>System idle - L2-QC-01</StatusPill>
      <h1 className="mt-7 text-3xl font-bold leading-tight text-[var(--tx)] sm:text-4xl">Ready to continue</h1>
      <p className="mx-auto mt-4 max-w-[460px] text-base leading-7 text-[var(--tx2)]">
        The line is stopped. Start again to scan the next mattress - your log is kept.
      </p>
      <FloButton icon={Play} shortcut="S" onClick={onStart} className="mt-7 h-16 min-w-[280px] text-xl">
        Start measuring
      </FloButton>
      <div className="mx-auto mt-6 flex max-w-[460px] flex-wrap justify-center gap-2">
        <KeyboardHint value="S">start / stop</KeyboardHint>
        <KeyboardHint value="A">accept</KeyboardHint>
        <KeyboardHint value="R">reject</KeyboardHint>
        <KeyboardHint value="T">retake</KeyboardHint>
        <KeyboardHint value="ESC">reset</KeyboardHint>
        <KeyboardHint value="L">open / close log</KeyboardHint>
        <KeyboardHint value="F">full screen</KeyboardHint>
      </div>
    </section>
  );
}
