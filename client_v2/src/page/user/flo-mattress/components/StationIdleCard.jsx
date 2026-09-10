import { Play } from 'lucide-react';
import FloButton from './FloButton';
import KeyboardHint from './KeyboardHint';

export default function StationIdleCard({ onStart, disabled = false, capturing = false }) {
  return (
    <section className="flex h-full min-h-[500px] w-full items-center justify-center rounded-2xl border border-[#dfe3ec] bg-[#fbfcff] px-6 py-10 text-center dark:border-[var(--bd)] dark:bg-[var(--bg1)] sm:px-10">
      <div className="w-full max-w-[560px]">
        <h1 className="text-3xl font-bold leading-tight text-[var(--tx)]">Ready to continue</h1>
        <p className="mx-auto mt-3 max-w-[430px] text-sm leading-6 text-[var(--tx2)]">
          The line is stopped. Start again to scan the next mattress - your log is kept.
        </p>
        <div className="mx-auto mt-3 max-w-[350px] rounded-2xl bg-[#eff1ff] p-2 dark:bg-[var(--bg2)]">
          <FloButton icon={Play} shortcut="S" onClick={onStart} disabled={disabled} className="h-[62px] w-full text-lg disabled:cursor-not-allowed disabled:opacity-50">
            {capturing ? 'Capturing...' : 'Start measuring'}
          </FloButton>
        </div>
        <div className="mx-auto mt-3 flex max-w-[540px] flex-wrap justify-center gap-1.5">
          <KeyboardHint value="S">start / stop</KeyboardHint>
          <KeyboardHint value="L">open / close log</KeyboardHint>
          <KeyboardHint value="F">full screen</KeyboardHint>
        </div>
      </div>
    </section>
  );
}
