// Geometry remains in source pixels; only rasterization follows the display.
// Cap allocation so a high-DPI fullscreen overlay cannot grow without bound.
export function canvasViewport(sourceWidth, sourceHeight, displayWidth, displayHeight, dpr = 1) {
  const cssWidth = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : sourceWidth;
  const cssHeight = Number.isFinite(displayHeight) && displayHeight > 0 ? displayHeight : sourceHeight;
  const density = Number.isFinite(dpr) && dpr > 0 ? Math.min(2, dpr) : 1;
  const fit = Math.min(density, Math.sqrt(8_294_400 / (cssWidth * cssHeight)), 8192/cssWidth, 8192/cssHeight);
  const width = Math.max(1, Math.floor(cssWidth * fit));
  const height = Math.max(1, Math.floor(cssHeight * fit));
  return {width, height, scaleX:width/sourceWidth, scaleY:height/sourceHeight, unit:sourceWidth/cssWidth};
}
