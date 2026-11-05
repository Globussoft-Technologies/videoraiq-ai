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
  { title: 'Incident overview', description: 'What are the latest incidents?', query: 'What are the latest incidents?', icon: 'incident', tone: 'i1' },
  { title: 'Analytics insights', description: 'Show today’s analytics overview', query: 'Show me the analytics overview for today.', icon: 'analytics', tone: 'i2' },
  { title: 'Camera activity', description: 'Which cameras are online?', query: 'Which cameras are online right now?', icon: 'camera', tone: 'i3' },
  { title: 'Detection trends', description: 'What are today’s top detections?', query: 'What are the most common incidents today?', icon: 'detection', tone: 'i4' },
];
