// Broad, editable vocabulary; these are model candidates, never hardcoded predictions.
export const OBJECT_NAMES = Object.freeze([
  'person', 'car', 'truck', 'bus', 'motorcycle', 'bicycle', 'forklift',
  'handcart', 'shopping cart', 'wheelchair', 'train', 'airplane', 'boat',
  'dog', 'cat', 'bird', 'cow', 'horse', 'sheep', 'goat', 'deer', 'elephant',
  'tiger', 'lion', 'bear', 'monkey', 'rabbit', 'snake',
  'chair', 'table', 'bench', 'sofa', 'bed', 'shelf', 'cabinet',
  'cardboard box', 'plastic crate', 'wooden pallet', 'bag', 'backpack', 'suitcase',
  'bottle', 'cup', 'bowl', 'plate', 'bucket', 'barrel', 'trash bin',
  'laptop', 'computer monitor', 'television', 'mobile phone', 'camera',
  'notepad', 'notebook', 'book', 'sheet of paper', 'pen', 'pencil',
  'clipboard', 'stapler', 'scissors', 'keyboard', 'computer mouse',
  'door handle', 'drawer handle', 'door lock', 'key', 'hinge',
  'light switch', 'power socket', 'tap',
  'door', 'window', 'ladder', 'pipe', 'valve', 'electric motor', 'machine',
  'hand tool', 'cable', 'helmet', 'shoe', 'clothing', 'traffic cone',
  'plant', 'tree', 'food', 'fire', 'smoke', 'unrecognizable object',
]);
export const NAME_MODEL = 'Xenova/clip-vit-base-patch32';
export const NAME_MODEL_REVISION = '4c1807b705b1d015fb032789cc4d221b23025a6f';
const DISPLAY = {'cardboard box':'Box', 'plastic crate':'Crate', 'wooden pallet':'Pallet',
  'computer monitor':'Monitor', 'mobile phone':'Phone', 'unrecognizable object':'Unknown object'};

// CLIP scores rank candidates; they are not calibrated confidence percentages.
// Abstain when candidates are too close or the crop has no clear winner.
export function chooseObjectName(predictions) {
  const ranked = (Array.isArray(predictions) ? predictions : [])
    .filter(p => OBJECT_NAMES.includes(p?.label) && Number.isFinite(p.score) && p.score >= 0 && p.score <= 1)
    .sort((a,b) => b.score-a.score);
  // Similar terms should not split a supported category's evidence.
  const aliases = {'notepad':'Notepad / notebook', 'notebook':'Notepad / notebook'};
  const grouped = new Map();
  for (const p of ranked) {
    const name = aliases[p.label] || DISPLAY[p.label] || p.label[0].toUpperCase()+p.label.slice(1);
    grouped.set(name, (grouped.get(name) || 0)+p.score);
  }
  const [best, second] = [...grouped].sort((a,b)=>b[1]-a[1]);
  if (!best || best[0] === 'Unknown object' || best[1] < 0.24 ||
      (second && best[1]-second[1] < 0.06)) return 'Unknown object';
  return best[0];
}

// Clip to the frame, preserve aspect ratio and include a little context.
export function objectCrop(ring, sourceWidth, sourceHeight, videoWidth, videoHeight) {
  if (![sourceWidth,sourceHeight,videoWidth,videoHeight].every(v => Number.isFinite(v) && v>0) ||
      !Array.isArray(ring) || ring.length<3 || ring.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const xs=ring.map(p=>p[0]), ys=ring.map(p=>p[1]);
  const left=Math.min(...xs), top=Math.min(...ys);
  const w=Math.max(...xs)-left, h=Math.max(...ys)-top;
  if (w<=0 || h<=0) return null;
  const pad=Math.max(w,h)*0.08;
  const x0=Math.max(0,left-pad), y0=Math.max(0,top-pad);
  const x1=Math.min(sourceWidth,left+w+pad), y1=Math.min(sourceHeight,top+h+pad);
  if (x1<=x0 || y1<=y0) return null;
  return {x:x0*videoWidth/sourceWidth, y:y0*videoHeight/sourceHeight,
    width:(x1-x0)*videoWidth/sourceWidth, height:(y1-y0)*videoHeight/sourceHeight};
}


export const MAX_NAME_ATTEMPTS = 3;
export const NAME_RETRY_MS = 1500;

// One request at a time; only uncertain names get a later video-frame sample.
export function canSampleName(attempt, mediaTime, now) {
  if (attempt?.pending || attempt?.done || (attempt?.count || 0)>=MAX_NAME_ATTEMPTS) return false;
  if (!attempt) return true;
  return now-attempt.at>=NAME_RETRY_MS && Math.abs(mediaTime-attempt.mediaTime)>=0.5;
}
