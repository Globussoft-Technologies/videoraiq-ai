import assert from 'node:assert/strict';
import test from 'node:test';
import {canvasViewport} from '../src/xray/overlayViewport.js';

test('fullscreen rasterization follows displayed pixels instead of stretching a 640px label',()=>{
 const small=canvasViewport(640,360,640,360,1);
 const expanded=canvasViewport(640,360,1920,1080,1);
 assert.equal(small.width,640); assert.equal(expanded.width,1920);
 assert.equal(expanded.height,1080); assert.equal(expanded.scaleX,3);
 // A source point stays at the same fractional video position after expansion.
 assert.equal(320*expanded.scaleX/expanded.width,0.5);
 // Font remains 13 CSS pixels while its actual raster now contains 13 pixels.
 assert.equal(13*expanded.unit*expanded.scaleX,13);
});
test('high-DPI text gets real backing pixels while display size stays constant',()=>{
 const v=canvasViewport(640,360,1280,720,2);
 assert.equal(v.width,2560); assert.equal(v.height,1440);
 assert.equal(13*v.unit*v.scaleX,26);
});
test('very large or high-DPI displays cannot allocate an unbounded canvas',()=>{
 for(const [w,h,dpr] of [[3840,2160,4],[7680,4320,2],[10000,100,2]]){
  const v=canvasViewport(640,360,w,h,dpr);
  assert.ok(v.width*v.height<=8_294_400); assert.ok(v.width<=8192); assert.ok(v.height<=8192);
 }
});
test('hidden display and invalid pixel density fall back to usable source dimensions',()=>{
 const v=canvasViewport(640,360,0,0,NaN);
 assert.equal(v.width,640); assert.equal(v.height,360); assert.equal(v.unit,1);
});
