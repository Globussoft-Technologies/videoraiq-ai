import {env, pipeline, RawImage} from '@huggingface/transformers';
import {OBJECT_NAMES, NAME_MODEL, NAME_MODEL_REVISION, chooseObjectName} from './objectNames.js';

env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let classifier;
const history = new Map();
const load = () => classifier ??= pipeline('zero-shot-image-classification', NAME_MODEL, {
  revision:NAME_MODEL_REVISION, device:'wasm', dtype:'q8',
});
// Serialized, once per selected track. No video loop or GPU execution provider.
let queue=Promise.resolve();
self.onmessage=({data}) => {
  queue=queue.then(async()=>{
    try {
      const model=await load();
      if(data.type==='init') {self.postMessage({type:'ready'}); return;}
      if(data.type!=='classify') return;
      const image=new RawImage(new Uint8ClampedArray(data.pixels),data.width,data.height,4);
      const predictions=await model(image,OBJECT_NAMES,{hypothesis_template:'A photo of a {}.'});
      const previous = history.get(data.objId) || {count:0, sums:new Map()};
      for (const p of predictions) previous.sums.set(p.label,(previous.sums.get(p.label)||0)+p.score);
      previous.count+=1; history.set(data.objId,previous);
      const averaged=[...previous.sums].map(([label,sum])=>({label,score:sum/previous.count}));
      self.postMessage({type:'label',objId:data.objId,label:chooseObjectName(averaged)});
    } catch {
      // No image buffers, stream URLs or credentials in diagnostics.
      self.postMessage({type:'unavailable',objId:data.objId || null});
    }
  });
};
