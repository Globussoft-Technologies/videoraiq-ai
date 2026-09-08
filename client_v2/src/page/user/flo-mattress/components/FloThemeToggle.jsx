import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/theme/ThemeContext';

export default function FloThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--bd)] bg-[var(--bg2)] p-1">
      <button
        type="button"
        aria-label="Use light theme"
        title="Light theme"
        onClick={() => setTheme('light')}
        className={`grid h-8 w-8 place-items-center rounded-md transition ${
          !isDark ? 'bg-violet-500 text-white shadow-sm' : 'text-[var(--tx3)] hover:text-[var(--tx)]'
        }`}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Use dark theme"
        title="Dark theme"
        onClick={() => setTheme('dark')}
        className={`grid h-8 w-8 place-items-center rounded-md transition ${
          isDark ? 'bg-violet-500 text-white shadow-sm' : 'text-[var(--tx3)] hover:text-[var(--tx)]'
        }`}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
