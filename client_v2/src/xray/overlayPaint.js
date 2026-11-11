import { boundsOf } from './polygon.js';

// Paint dimensions are CSS pixels; the overlay supplies the source/display ratio.
export const GLOW = Object.freeze({
  soft: { halo: 12, haloAlpha: 0.42, fillTop: 0.23, fillMid: 0.13, fillBottom: 0.055, stroke: 1.4, rim: 0.10, tick: 0.30 },
  bold: { halo: 19, haloAlpha: 0.62, fillTop: 0.36, fillMid: 0.23, fillBottom: 0.10, stroke: 1.9, rim: 0.14, tick: 0.45 },
  max: { halo: 26, haloAlpha: 0.78, fillTop: 0.48, fillMid: 0.34, fillBottom: 0.16, stroke: 2.4, rim: 0.20, tick: 0.60 },
});
export const INK = ['#67e8f9', '#c4b5fd'];

const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
function trace(ctx, ring) {
  ctx.beginPath(); ctx.moveTo(...ring[0]);
  for (let i = 1; i < ring.length; i += 1) ctx.lineTo(...ring[i]);
  ctx.closePath();
}

export function drawObject(ctx, ring, ink, glow, breathe, lockProgress, unit = 1) {
  const b = boundsOf(ring);
  if (!b) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // A stronger bloom and translucent body, separated by a dark teal boundary.
  // shadowBlur is in backing pixels and does not follow the context transform.
  const acquisition = lockProgress === null ? 1 : 1 + 0.3 * (1 - lockProgress);
  ctx.shadowColor = rgba(ink, glow.haloAlpha * breathe * acquisition);
  ctx.shadowBlur = glow.halo * unit * (ctx.getTransform?.().a || 1);
  ctx.strokeStyle = rgba(ink, glow.haloAlpha * 0.45);
  ctx.lineWidth = glow.stroke * 2.8 * unit;
  trace(ctx, ring); ctx.stroke();
  ctx.shadowBlur = 0;

  const wash = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.35, b.y + Math.max(1, b.h));
  wash.addColorStop(0, rgba(ink, glow.fillTop));
  wash.addColorStop(0.46, rgba(ink, glow.fillMid));
  wash.addColorStop(1, rgba(ink, glow.fillBottom));
  ctx.fillStyle = wash; trace(ctx, ring); ctx.fill();

  // Dark under-edge preserves separation on white walls and bright clothing.
  ctx.strokeStyle = 'rgba(3,15,24,0.86)';
  ctx.lineWidth = (glow.stroke + 2.8) * unit;
  trace(ctx, ring); ctx.stroke();
  const edge = ctx.createLinearGradient(0, b.y, 0, b.y + Math.max(1, b.h));
  edge.addColorStop(0, '#07546b');
  edge.addColorStop(0.38, '#08768a');
  edge.addColorStop(1, '#06394f');
  ctx.strokeStyle = edge; ctx.lineWidth = glow.stroke * unit;
  trace(ctx, ring); ctx.stroke();
  ctx.strokeStyle = `rgba(240,254,255,${glow.rim * breathe * 0.45})`;
  ctx.lineWidth = 0.45 * unit;
  trace(ctx, ring); ctx.stroke();

  // Small, understated registration corners; no box or large pulsing ring.
  const ease = lockProgress === null ? 1 : 1 - (1 - lockProgress) ** 3;
  const len = Math.min(7 * unit, Math.min(b.w, b.h) * 0.16) * ease;
  const pad = 5 * unit;
  const x0 = b.x - pad, x1 = b.x + b.w + pad;
  const y0 = b.y - pad, y1 = b.y + b.h + pad;
  ctx.strokeStyle = rgba(ink, glow.tick * ease); ctx.lineWidth = unit;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
  ctx.stroke(); ctx.restore();
}

export function drawGhost(ctx, ring, ink, glow, alpha, unit = 1) {
  ctx.save(); ctx.setLineDash([5 * unit, 5 * unit]);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.shadowColor = rgba(ink, glow.haloAlpha * alpha * 0.35);
  ctx.shadowBlur = glow.halo * unit * (ctx.getTransform?.().a || 1) * 0.5;
  ctx.strokeStyle = rgba(ink, alpha * 0.75); ctx.lineWidth = unit;
  trace(ctx, ring); ctx.stroke(); ctx.restore();
}

// This pill follows the interpolated silhouette, not the original click point.
export function drawObjectName(ctx,ring,text,ink,width,height,unit=1) {
  const b=boundsOf(ring);
  if(!b || !text) return;
  ctx.save();
  ctx.font=`600 ${13*unit}px system-ui, sans-serif`;
  const padding=10*unit, boxH=28*unit, margin=6*unit;
  const maxWidth=Math.max(0,width-2*margin);
  const boxW=Math.min(maxWidth,ctx.measureText(text).width+padding*2+10*unit);
  const x=Math.max(margin,Math.min(width-margin-boxW,b.x+b.w/2-boxW/2));
  const above=b.y-boxH-12*unit;
  const below=b.y+b.h+12*unit;
  const y=Math.max(margin,Math.min(height-margin-boxH,above>=margin?above:below));
  ctx.strokeStyle=rgba(ink,0.48); ctx.lineWidth=unit;
  ctx.beginPath();
  const anchorX=Math.max(x+8*unit,Math.min(x+boxW-8*unit,b.x+b.w/2));
  ctx.moveTo(anchorX,above>=margin?y+boxH:y);
  ctx.lineTo(b.x+b.w/2,above>=margin?b.y-3*unit:b.y+b.h+3*unit);
  ctx.stroke();
  ctx.fillStyle='rgba(6,21,32,0.92)';
  ctx.beginPath(); ctx.roundRect(x,y,boxW,boxH,7*unit); ctx.fill();
  ctx.strokeStyle=rgba(ink,0.45); ctx.stroke();
  ctx.fillStyle=ink; ctx.beginPath(); ctx.arc(x+11*unit,y+boxH/2,2.3*unit,0,2*Math.PI); ctx.fill();
  ctx.fillStyle='#eefcfd'; ctx.textBaseline='middle';
  ctx.fillText(text,x+20*unit,y+boxH/2,Math.max(1,boxW-28*unit));
  ctx.restore();
}
