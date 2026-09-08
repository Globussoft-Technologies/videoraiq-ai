import { ArrowRight, Delete } from 'lucide-react';
import FloButton from './FloButton';

const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function PinPad({ value, onChange, onSubmit }) {
  const complete = value.length >= 4;
  const addDigit = (digit) => {
    if (value.length < 4) onChange(`${value}${digit}`);
  };
  const clear = () => onChange('');
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="w-full max-w-[390px]">
      <div className="mb-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={`h-14 rounded-xl border bg-[var(--bg2)] transition sm:h-16 ${
              index === value.length
                ? 'border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.16)]'
                : value[index]
                  ? 'border-emerald-400/60'
                  : 'border-[var(--bd)]'
            }`}
          >
            {value[index] && <div className="mx-auto mt-5 h-3 w-3 rounded-full bg-[var(--tx)] sm:mt-6" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {digits.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => addDigit(digit)}
            className="h-14 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] text-xl font-bold text-[var(--tx)] transition hover:bg-[var(--bg2)] active:scale-[0.98]"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          className="h-14 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] font-mono text-lg font-bold text-amber-500 transition hover:bg-[var(--bg2)] active:scale-[0.98]"
        >
          C
        </button>
        <button
          type="button"
          onClick={() => addDigit('0')}
          className="h-14 rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] text-xl font-bold text-[var(--tx)] transition hover:bg-[var(--bg2)] active:scale-[0.98]"
        >
          0
        </button>
        <button
          type="button"
          aria-label="Delete digit"
          title="Delete digit"
          onClick={backspace}
          className="grid h-14 place-items-center rounded-lg border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx2)] transition hover:bg-[var(--bg2)] active:scale-[0.98]"
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>

      <FloButton
        icon={ArrowRight}
        disabled={!complete}
        onClick={onSubmit}
        className="mt-5 h-14 w-full justify-center text-base"
      >
        Sign in to station
      </FloButton>
    </div>
  );
}
