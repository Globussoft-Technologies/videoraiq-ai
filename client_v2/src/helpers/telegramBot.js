const FRONTEND_BOT_BY_URL = {
  'https://stagingv2.videoraiq.com': '@VideoraIQDEVAlertsbot',
  'https://app.videoraiq.com': '@VideoraIQbot',
};

export function telegramBotUsername() {
  const frontendUrl = String(import.meta.env.VITE_FRONTEND || '').replace(/\/+$/, '');
  return (
    FRONTEND_BOT_BY_URL[frontendUrl] ||
    import.meta.env.VITE_TELEGRAM_BOT ||
    '@VideoraIQDEVAlertsbot'
  );
}
