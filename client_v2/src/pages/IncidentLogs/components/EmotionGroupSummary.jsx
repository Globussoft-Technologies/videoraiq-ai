import { CircleAlert, Frown, Meh, Smile } from 'lucide-react';
import { EMOTION_LOG_GROUPS, selectedEmotionGroup } from '@/helpers/emotionDetection';

const colors = {
  positive: '#16a34a',
  negative: '#e05a64',
  surprise: '#d18a16',
  neutral: 'var(--blue)',
};
const icons = { positive: Smile, negative: Frown, surprise: CircleAlert, neutral: Meh };

export default function EmotionGroupSummary({ counts = [], emotions = [], onChange, loading = false }) {
  const countByEmotion = new Map(counts.map(({ emotion, count }) => [emotion, count]));
  const activeGroup = selectedEmotionGroup(emotions);
  return <section aria-label="Emotion categories" aria-busy={loading} className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-[var(--tx)]">Emotion categories</h2>
      <span className="text-xs text-[var(--tx2)]">Counts in selected date range</span>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {EMOTION_LOG_GROUPS.map(group => {
        const active = activeGroup === group.id;
        const count = group.emotions.reduce((sum, emotion) => sum + (countByEmotion.get(emotion) || 0), 0);
        const color = colors[group.id];
        const Icon = icons[group.id];
        return <button key={group.id} type="button" aria-pressed={active}
          onClick={() => onChange(active ? [] : group.emotions)}
          className={`cursor-pointer rounded-xl border bg-[var(--bg1)] p-4 text-left transition-colors hover:bg-[var(--bg2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] ${active ? 'border-[var(--blue)] ring-2 ring-[var(--blue)]/20' : 'border-[var(--bd)]'}`}
          style={{ borderLeft: `4px solid ${color}` }}>
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color }}><span className="grid h-8 w-8 place-items-center rounded-lg bg-current/10"><Icon size={18} aria-hidden="true" /></span>{group.label}</span>
          <strong className="mt-2 block text-3xl tabular-nums" style={{ color }}>{count}</strong>
          <small className="mt-1 block text-xs text-[var(--tx3)]">{group.emotions.join(', ')}</small>
        </button>;
      })}
    </div>
  </section>;
}
