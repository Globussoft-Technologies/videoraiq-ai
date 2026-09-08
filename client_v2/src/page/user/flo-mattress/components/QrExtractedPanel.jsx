import { QrCode } from 'lucide-react';
import FieldTile from './FieldTile';

const fields = [
  ['Order ID', '567360', true],
  ['Ref No', 'AK3984', true],
  ['SKU', 'G_OK8478', true],
  ['Custom Size', '78 X 78 X 6', true],
  ['Product Model', 'Flo Ortho Mattress'],
  ['Product Colour', 'Beige'],
  ['MRP', 'RS. 21,310.00'],
  ['Net Quantity', '1 X Flo Ortho Mattress'],
  ['Weight', '20.70 KG'],
  ['Channel', 'SM-SH'],
  ['Country of Origin', 'INDIA'],
  ['MFG Month / Year', 'JAN 26'],
];

export default function QrExtractedPanel() {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--glass)] shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--bd)] px-4 py-3">
        <div className="flex items-center gap-3">
          <QrCode className="h-5 w-5 text-blue-500" />
          <h2 className="text-base font-bold text-[var(--tx)]">QR Code Extracted</h2>
          <span className="rounded-md border border-emerald-500 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-500">
            12 / 12 fields
          </span>
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--tx3)]">Read 13:48:57</span>
      </div>

      <div className="p-4">
        <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--tx3)]">Raw QR Payload</div>
        <div className="mb-3 rounded-lg border border-blue-400/45 bg-blue-500/5 p-3 font-mono text-[11px] font-semibold leading-6 text-[var(--tx)]">
          ORD:567360|REF:AK3984|SKU:G_OK8478|SIZE:78X78X6|MRP:21310.00|MOD:FLO ORTHO MATTRESS|COL:BEIGE|QTY:1|WT:20.70KG|CH:SM-SH|ORG:INDIA|MFG:JAN 26
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map(([label, value, highlight]) => (
            <FieldTile key={label} label={label} value={value} highlight={highlight} />
          ))}
        </div>
      </div>
    </section>
  );
}
