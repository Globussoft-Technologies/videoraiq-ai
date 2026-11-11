import {useCallback,useEffect,useRef,useState} from 'react';
import {objectCrop,canSampleName,MAX_NAME_ATTEMPTS} from './objectNames';

/** Classification stays on the laptop. The mutable map is read by the canvas;
 * React only announces completed names, never per-mask or per-frame updates. */
export default function useObjectNames(sessionId,videoRef,sourceWidth,sourceHeight) {
  const labelsRef=useRef(new Map());
  const workerRef=useRef(null);
  const failed=useRef(false);
  const deadlines=useRef(new Map());
  const attempts=useRef(new Map());
  const [announcement,setAnnouncement]=useState('');
  useEffect(()=>{
    labelsRef.current=new Map(); attempts.current=new Map(); failed.current=false; setAnnouncement('');
    if(!sessionId) return undefined;
    let disposed=false, worker;
    const unavailable=()=>{
      if(disposed) return;
      failed.current=true;
      for(const [id,label] of labelsRef.current) {
        if(label==='Identifying…' || label==='Checking another frame…') labelsRef.current.set(id,'Name unavailable');
      }
      setAnnouncement('Automatic object names are unavailable. Tracking continues.');
    };
    try {
      worker=new Worker(new URL('./objectNames.worker.js',import.meta.url),{type:'module'});
      workerRef.current=worker;
      worker.onmessage=({data})=>{
        if(disposed) return;
        if(data.type==='unavailable') {unavailable(); return;}
        if(data.type==='label' && labelsRef.current.has(data.objId)) {
          clearTimeout(deadlines.current.get(data.objId)); deadlines.current.delete(data.objId);
          const attempt=attempts.current.get(data.objId);
          if (!attempt || attempt.done) return;
          attempt.pending=false;
          attempt.done=data.label!=='Unknown object' || attempt.count>=MAX_NAME_ATTEMPTS;
          labelsRef.current.set(data.objId,attempt.done ? data.label : 'Checking another frame…');
          if(attempt.done) setAnnouncement(`Selected object: ${data.label}`);
        }
      };
      worker.onerror=unavailable;
      worker.postMessage({type:'init'});
    } catch {unavailable();}
    // A failed or very slow download must not leave an indefinite spinner.
    const timeout=setTimeout(()=>{
      if([...attempts.current.values()].some(a=>a.pending)) {
        unavailable(); worker?.terminate(); workerRef.current=null;
      }
    },90000);
    return ()=>{
      disposed=true; clearTimeout(timeout); worker?.terminate(); workerRef.current=null;
      labelsRef.current=new Map(); attempts.current=new Map();
      for(const timer of deadlines.current.values()) clearTimeout(timer);
      deadlines.current.clear();
    };
  },[sessionId]);

  const identify=useCallback((objId,ring)=>{
    if(failed.current) {labelsRef.current.set(objId,'Name unavailable'); return;}
    const video=videoRef?.current;
    if(!workerRef.current || !video || video.readyState<2 || video.seeking) return;
    const now=performance.now();
    const previous=attempts.current.get(objId);
    if(!canSampleName(previous,video.currentTime,now)) return;
    const crop=objectCrop(ring,sourceWidth,sourceHeight,video.videoWidth,video.videoHeight);
    if(!crop) return;
    try {
      const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx) throw new Error('canvas unavailable');
      ctx.fillStyle='#d8dde0'; ctx.fillRect(0,0,256,256);
      const scale=240/Math.max(crop.width,crop.height);
      const w=crop.width*scale, h=crop.height*scale;
      ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,(256-w)/2,(256-h)/2,w,h);
      const pixels=ctx.getImageData(0,0,256,256).data;
      attempts.current.set(objId,{count:(previous?.count || 0)+1,at:now,mediaTime:video.currentTime,pending:true,done:false});
      labelsRef.current.set(objId,'Identifying…');
      deadlines.current.set(objId,setTimeout(()=>{
        deadlines.current.delete(objId);
        if(labelsRef.current.get(objId)==='Identifying…') {
          attempts.current.get(objId).done=true;
          labelsRef.current.set(objId,'Name unavailable');
          setAnnouncement('Object name unavailable. Tracking continues.');
        }
      },60000));
      workerRef.current.postMessage({type:'classify',objId,pixels:pixels.buffer,width:256,height:256},[pixels.buffer]);
    } catch {
      clearTimeout(deadlines.current.get(objId)); deadlines.current.delete(objId);
      attempts.current.set(objId,{done:true,pending:false,count:MAX_NAME_ATTEMPTS});
      labelsRef.current.set(objId,'Name unavailable');
      setAnnouncement('Object name unavailable. The video frame could not be read.');
    }
  },[videoRef,sourceWidth,sourceHeight]);
  return {labelsRef,identify,announcement};
}
