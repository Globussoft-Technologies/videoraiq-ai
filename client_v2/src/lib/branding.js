import videoraiqIcon from '@/assets/logo.svg';
import khanbasLogo from '@/assets/khanbas-logo.png';

export const IS_KHANBAS = import.meta.env.VITE_KHANBAS === 'true';
export const BRAND_NAME = IS_KHANBAS ? 'KHANBAS' : 'VideoraIQ';

export function applyBrowserBranding() {
  document.title = IS_KHANBAS ? BRAND_NAME : 'VideoraIQ 2.0';
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) {
    favicon.type = IS_KHANBAS ? 'image/png' : 'image/svg+xml';
    favicon.href = IS_KHANBAS ? khanbasLogo : videoraiqIcon;
    if (IS_KHANBAS) {
      // The full logo has wide transparent margins and a wordmark below it.
      // Crop to the emblem so it fills the square browser icon without stretching.
      const logo = new Image();
      logo.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d');
        if (!context) return;
        const sourceX = logo.naturalWidth * 0.277;
        const sourceWidth = logo.naturalWidth * 0.446;
        const sourceHeight = logo.naturalHeight * 0.798;
        const scale = Math.min(64 / sourceWidth, 64 / sourceHeight);
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        context.drawImage(logo, sourceX, 0, sourceWidth, sourceHeight,
          (64 - width) / 2, (64 - height) / 2, width, height);
        favicon.sizes = '64x64';
        favicon.href = canvas.toDataURL('image/png');
      };
      logo.src = khanbasLogo;
    }
  }
}
