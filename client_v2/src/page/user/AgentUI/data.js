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
  { title: 'Summarize incidents', description: 'Highlights from the last 7 days', query: 'Summarize all incidents from the last 7 days and highlight the busiest cameras', icon: 'incident', tone: 'i1' },
  { title: 'Camera health', description: 'Find detections that stopped', query: 'Which cameras have detection that is not running right now?', icon: 'camera', tone: 'i2' },
  { title: 'PPE violations', description: 'Group today’s violations by camera', query: 'Show PPE violations from today, grouped by camera', icon: 'detection', tone: 'i3' },
  { title: 'Detection zones', description: 'Show intrusion detection zones', query: 'Show me the current detection zone for intrusion detection on my cameras', icon: 'detection', tone: 'i1' },
];
