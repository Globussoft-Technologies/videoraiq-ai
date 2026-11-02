export const timings = {
  robotStart: 700,
  robotPause: 1000,
  toast: 4200,
  toastVisible: 3000,
  toastExit: 400,
  ticker: 2600,
  tickerSwap: 300,
  card: 2000,
  promptType: 70,
  promptDelete: 30,
  promptHold: 1400,
};

export const robotMoves = [
  { className: 'g-wave', text: 'Hi! 👋', duration: 3000 },
  { className: 'g-nod', text: 'All systems normal ✅', duration: 1700 },
  { className: 'g-point', text: 'Try the cards below 👇', duration: 2500 },
  { className: 'g-cheer', metric: 'criticalAlerts', text: 'Critical alerts', duration: 2500 },
];

export const prompts = ['Show me today’s incidents…', 'Which camera is offline?', 'Summarize this week’s detections…'];
export const actionCards = [
  { title: 'Incident overview', description: 'Get latest incident details', query: 'Show me the latest incident details', icon: 'incident', tone: 'i1' },
  { title: 'Analytics insights', description: 'Explore performance', query: 'Explore performance analytics', icon: 'analytics', tone: 'i2' },
  { title: 'Camera activity', description: 'Check live status', query: 'Check live camera status', icon: 'camera', tone: 'i3' },
  { title: 'Detection trends', description: 'View detection stats', query: 'View detection stats and trends', icon: 'detection', tone: 'i4' },
];
