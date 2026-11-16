import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, Send, Square, X } from 'lucide-react';
import { transcribeAssistantAudio } from '@/helpers/assistant';
import { prompts, timings } from './data';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const drafts = new Map();
const draftKey = (id) => id || 'new';
export const clearNewChatDraft = () => drafts.delete('new');

export default function ChatInput({ onSend, sending, lockReason, conversationId, onToast }) {
  const existingChat = Boolean(conversationId);
  const [value, setValue] = useState(() => drafts.get(draftKey(conversationId)) || '');
  const [error, setError] = useState('');
  useEffect(() => { if (error) onToast?.(error); }, [error]);
  useEffect(() => { if (value) drafts.set(draftKey(conversationId), value); else drafts.delete(draftKey(conversationId)); }, [conversationId, value]);
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [placeholder, setPlaceholder] = useState(() => existingChat ? 'Ask a follow-up question…' : 'Ask VideoraAI anything…');
  const [promptIndex, setPromptIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [focused, setFocused] = useState(false);
  const textInput = useRef(null);
  const recorderRef = useRef(null); const streamRef = useRef(null); const chunksRef = useRef([]);
  const audioRef = useRef(null); const frameRef = useRef(null); const abortRef = useRef(null);
  const cancelledRef = useRef(false); const requestRef = useRef(0); const conversationRef = useRef(conversationId);
  const busy = sending || Boolean(lockReason) || ['starting', 'recording', 'processing'].includes(voiceState);

  useLayoutEffect(() => {
    const resize = () => {
      const input = textInput.current;
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 180, window.innerHeight * .3)}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [value, conversationId, voiceState]);

  useEffect(() => { if (existingChat || focused || value || voiceState !== 'idle') return; const prompt = prompts[promptIndex]; const delay = !deleting && cursor === prompt.length ? timings.promptHold : deleting ? timings.promptDelete : timings.promptType; const id = window.setTimeout(() => { if (!deleting && cursor >= prompt.length) { setDeleting(true); return; } if (deleting && cursor <= 0) { setDeleting(false); setPromptIndex((promptIndex + 1) % prompts.length); setCursor(0); return; } const next = deleting ? cursor - 1 : cursor + 1; setCursor(next); setPlaceholder(prompt.slice(0, Math.max(0, next)) || ' '); }, delay); return () => window.clearTimeout(id); }, [existingChat, cursor, deleting, promptIndex, value, focused, voiceState]);

  const stopTracks = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (frameRef.current) cancelAnimationFrame(frameRef.current); frameRef.current = null; audioRef.current?.close?.().catch(() => {}); audioRef.current = null; setVoiceLevel(0); };
  const cancelVoice = () => { cancelledRef.current = true; requestRef.current += 1; abortRef.current?.abort(); abortRef.current = null; if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); stopTracks(); setVoiceState('idle'); };
  useEffect(() => { if (conversationRef.current !== conversationId) { conversationRef.current = conversationId; cancelVoice(); setValue(drafts.get(draftKey(conversationId)) || ''); } }, [conversationId]);
  useEffect(() => () => { cancelledRef.current = true; abortRef.current?.abort(); if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); stopTracks(); }, []);

  const submit = async (event) => { event?.preventDefault(); if (!value.trim() || busy || value.trim().length > 16000) return; const text = value.trim(); setError(''); drafts.delete(draftKey(conversationId)); setValue(''); try { const result = await onSend(text); if (!result) { drafts.set(draftKey(conversationId), text); setValue(text); setError('Message could not be sent. Try again.'); } } catch (failure) { drafts.set(draftKey(conversationId), text); setValue(text); setError(failure?.message || 'Message could not be sent. Try again.'); } };

  const startVoice = async () => {
    if (busy) return; setError(''); cancelledRef.current = false; const request = ++requestRef.current; const chatId = conversationId; setVoiceState('starting');
    try {
      if (!window.isSecureContext) throw new Error('Voice input requires HTTPS or localhost.');
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('This browser does not support microphone recording.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current || request !== requestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = (chunk) => { if (chunk.data?.size) chunksRef.current.push(chunk.data); };
      recorder.onerror = () => { stopTracks(); setVoiceState('idle'); setError('Recording failed. Please try again.'); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' }); stopTracks();
        if (cancelledRef.current || request !== requestRef.current) return;
        if (!blob.size) { setVoiceState('idle'); setError('No audio was recorded. Please try again.'); return; }
        if (blob.size > MAX_FILE_BYTES) { setVoiceState('idle'); setError('Recording exceeds the 10 MB upload limit.'); return; }
        setVoiceState('processing'); const controller = new AbortController(); abortRef.current = controller;
        try { const result = await transcribeAssistantAudio({ audio: new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), signal: controller.signal }); if (cancelledRef.current || request !== requestRef.current || chatId !== conversationRef.current) return; const transcript = String(result?.text || '').trim(); if (!transcript) throw new Error('No speech was detected. Please try again.'); setValue((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript); setVoiceState('idle'); window.setTimeout(() => textInput.current?.focus(), 0); }
        catch (failure) { if (failure?.name !== 'AbortError' && request === requestRef.current) { setError(failure?.response?.data?.body?.message || failure?.message || 'Transcription failed. Please try again.'); setVoiceState('idle'); } }
        finally { if (abortRef.current === controller) abortRef.current = null; }
      };
      recorder.start(); setVoiceState('recording');
      try { const AudioContext = window.AudioContext || window.webkitAudioContext; if (AudioContext) { const context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 64; context.createMediaStreamSource(stream).connect(analyser); audioRef.current = context; const samples = new Uint8Array(analyser.fftSize); const update = () => { analyser.getByteTimeDomainData(samples); setVoiceLevel(Math.min(1, samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / samples.length / 32)); frameRef.current = requestAnimationFrame(update); }; update(); } } catch { /* Recording works without the optional waveform. */ }
    } catch (failure) {
      stopTracks(); setVoiceState('idle');
      if (failure?.name === 'NotFoundError' && onToast) onToast('No microphone was found.');
      else setError(failure?.name === 'NotAllowedError' ? 'Allow microphone access in your browser and try again.' : failure?.name === 'NotFoundError' ? 'No microphone was found.' : failure?.message || 'Microphone could not start.');
    }
  };
  const stopVoice = () => { if (recorderRef.current?.state === 'recording') { setVoiceState('processing'); recorderRef.current.stop(); } };

  return <form className={`agent-composer ${existingChat ? 'agent-composer-existing' : ''}`} onSubmit={submit}>
    <div className="agent-input">
      {voiceState !== 'idle' ? <div className={`agent-voice-state ${voiceState}`} role="status"><span className="agent-voice-dot" /><span>{voiceState === 'starting' ? 'Starting microphone…' : voiceState === 'recording' ? 'Listening…' : 'Processing…'}</span><div className="agent-waveform" aria-label="Audio activity">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ height: `${5 + voiceLevel * (8 + (index % 4) * 3)}px`, animationDelay: `${index * .07}s` }} />)}</div>{voiceState === 'recording' && <button type="button" onClick={stopVoice} aria-label="Stop recording"><Square size={14} />Stop</button>}<button type="button" onClick={cancelVoice} aria-label="Cancel recording"><X size={15} /></button></div> : <><textarea ref={textInput} value={value} rows={1} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => { const next = event.target.value; if (next) drafts.set(draftKey(conversationId), next); else drafts.delete(draftKey(conversationId)); setValue(next); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) submit(event); }} placeholder={placeholder} aria-label="Message VideoraAI" /><div className="agent-input-actions"><div className="agent-input-submit"><span className="agent-input-hint">Enter to send</span><button type="button" className="agent-tool" title="Record voice" aria-label="Start voice recording" disabled={busy} onClick={startVoice}><Mic size={18} /></button><button className="agent-send" type="submit" title="Send message" aria-label="Send message" disabled={!value.trim() || value.trim().length > 16000 || busy}>{sending ? <span className="agent-send-spinner" /> : <Send size={18} />}</button></div></div></>}
    </div><p className="agent-composer-note">{lockReason || (sending ? 'Sending…' : 'The agent can make mistakes. Every change needs your explicit approval, and nothing changes from chat text alone.')}</p>{value.length > 12800 && <small>{value.length}/16,000 characters</small>}
  </form>;
}
