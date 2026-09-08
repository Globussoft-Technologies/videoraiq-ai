import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FloBrand from './components/FloBrand';
import FloThemeToggle from './components/FloThemeToggle';
import PinPad from './components/PinPad';
import StatusPill from './components/StatusPill';

const operatorPins = ['1042', '2087', '3311'];

export default function FloMattressLogin() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');

  const submit = useCallback(() => {
    if (pin.length < 4) return;
    navigate('/start-measure');
  }, [navigate, pin.length]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (/^\d$/.test(event.key)) {
        setPin((current) => (current.length < 4 ? `${current}${event.key}` : current));
      }
      if (event.key === 'Backspace') setPin((current) => current.slice(0, -1));
      if (event.key === 'Escape') setPin('');
      if (event.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [submit]);

  return (
    <main className="vq-root min-h-screen overflow-hidden bg-[var(--appbg)] text-[var(--tx)]">
      <div className="absolute inset-0 opacity-[0.55] [background-image:linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="relative grid min-h-screen place-items-center px-4 py-10">
        <div className="grid w-full max-w-[980px] gap-6 lg:grid-cols-[1.15fr_0.95fr] lg:gap-9">
          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--glass)] p-7 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur md:p-9">
            <FloBrand />
            <StatusPill tone="online" className="mt-8">
              Station terminal - online
            </StatusPill>
            <h1 className="mt-6 max-w-[440px] text-4xl font-bold leading-[1.08] text-[var(--tx)] sm:text-5xl">
              Mattress measurement station
            </h1>
            <p className="mt-6 max-w-[430px] text-base leading-7 text-[var(--tx2)]">
              Enter your PIN to start. The QR label is read and the mattress is measured for you - you only check the values and accept or reject.
            </p>

            <div className="mt-8">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--tx3)]">
                What you will do
              </p>
              <div className="mt-4 grid gap-3">
                {[
                  'The QR label on top is read automatically',
                  'The mattress is measured for you',
                  'You compare the values and accept or reject',
                ].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-[var(--tx2)]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-blue-400/40 bg-blue-500/10 font-mono text-blue-500">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--glass)] p-7 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur md:p-9">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[var(--tx)]">Operator sign in</h2>
                <p className="mt-1 text-sm text-[var(--tx2)]">Enter your 4-digit PIN</p>
              </div>
              <FloThemeToggle />
            </div>
            <PinPad value={pin} onChange={setPin} onSubmit={submit} />
            <p className="mt-5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--tx3)]">
              Any 4-digit PIN - {operatorPins.join(' / ')} are named operators
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
