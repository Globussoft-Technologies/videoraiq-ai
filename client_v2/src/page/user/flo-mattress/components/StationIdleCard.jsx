import { Play } from 'lucide-react';
import FloButton from './FloButton';
import KeyboardHint from './KeyboardHint';

export default function StationIdleCard({ onStart }) {
  return (
    <section className="w-full rounded-2xl border border-[var(--bd)] bg-[var(--glass)] px-6 py-9 text-center shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur sm:px-10">
      <h1 className="text-3xl font-bold leading-tight text-[var(--tx)] sm:text-4xl">Ready to continue</h1>
      <p className="mx-auto mt-4 max-w-[460px] text-base leading-7 text-[var(--tx2)]">
        The line is stopped. Start again to scan the next mattress - your log is kept.
      </p>
      <FloButton icon={Play} shortcut="S" onClick={onStart} className="mt-7 h-16 min-w-[280px] text-xl">
        Start measuring
      </FloButton>
      <div className="mx-auto mt-6 flex max-w-[280px] flex-wrap justify-center gap-2">
        <KeyboardHint value="S">start / stop</KeyboardHint>
        <KeyboardHint value="F">full screen</KeyboardHint>
      </div>
    </section>
  );
}
