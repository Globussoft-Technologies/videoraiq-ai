import logo from '@/assets/khanbas-logo.png';

// The source image has wide side margins. Crop those margins while keeping the
// crest and wordmark visible at a compact size.
export default function KhanbasLogo() {
  return (
    <span style={{ display: 'block', width: 102, height: 84, overflow: 'hidden', flexShrink: 0 }}>
      <img
        src={logo}
        alt="Khanbas"
        style={{ display: 'block', width: 150, height: 'auto', maxWidth: 'none', filter: 'none', transform: 'translateX(-24px)' }}
      />
    </span>
  );
}
