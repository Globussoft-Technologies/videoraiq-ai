import { createPortal, flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Plus, Send, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { COMPOSER_PLACEHOLDER, COMPOSER_FOOTNOTE, MAX_ASSISTANT_MESSAGE_CHARS } from './assistant.copy';
import { transcribeAssistantAudio } from '@/helpers/assistant';

const MAX_TEXTAREA_H = 168;

/**
 * Message input. Grows with its content up to a cap, then scrolls internally —
 * so a long question never pushes the thread off screen.
 *
 * Enter sends, Shift+Enter inserts a newline (the convention every chat UI uses).
 */
export default function Composer({ value, onChange, onSend, onStop, conversationId, sending = false, uploading = false, autoFocus = true, registerStep, onRegisterUpload, onRegisterBatchUpload, onFilesPrepared, files = [], clearAttachmentsToken = 0 }) {
  const taRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const popoverRef = useRef(null);
  const selectedFilesRef = useRef([]);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const discardRequestedRef = useRef(false);
  const voiceRequestRef = useRef(0);
  const voiceAbortRef = useRef(null);
  const conversationIdRef = useRef(conversationId);
  const requestConversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  // Photos are staged data, not a message. Require an explicit prompt before
  // enabling Send so an empty submission cannot upload or trigger a workflow.
  const canSend = value.trim().length > 0 && !sending && !uploading;

  const stopAudioTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close?.().catch(() => {});
    audioContextRef.current = null;
    setVoiceLevel(0);
  };

  const startWaveform = (stream) => {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize);
      const update = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let total = 0;
        samples.forEach((sample) => { total += Math.abs(sample - 128); });
        setVoiceLevel(Math.min(1, total / samples.length / 32));
        animationRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {
      // The waveform is optional. Some browsers/embedded contexts block the
      // Web Audio analyser even though microphone recording is permitted.
      audioContextRef.current = null;
      analyserRef.current = null;
    }
  };

  const showVoiceError = ({ title, detail, action }) => {
    toast.error(title, {
      description: detail,
      ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
    });
  };

  const startVoice = async () => {
    if (voiceState === 'starting' || voiceState === 'recording' || voiceState === 'processing' || voiceState === 'submitting' || sending || uploading) return;
    discardRequestedRef.current = false;
    const requestId = ++voiceRequestRef.current;
    const requestConversationId = conversationId;
    setVoiceState('starting');
    try {
      if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { code: 'INSECURE_CONTEXT' });
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Object.assign(new Error('unsupported'), { code: 'UNSUPPORTED' });
      // getUserMedia opens the browser's native permission dialog when access
      // has not been decided yet. Keep the UI quiet here so a denied request
      // results in one clear toast instead of an info toast plus an error toast.
      let timedOut = false;
      const mediaRequest = navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRequest.then((lateStream) => {
        if (timedOut) lateStream.getTracks().forEach((track) => track.stop());
      }).catch(() => {});
      let timeoutId;
      const permissionTimeout = new Promise((_, reject) => { timeoutId = setTimeout(() => {
        timedOut = true;
        reject(Object.assign(new Error('permission-timeout'), { code: 'PERMISSION_TIMEOUT' }));
      }, 12_000); });
      const stream = await Promise.race([mediaRequest, permissionTimeout]);
      clearTimeout(timeoutId);
      timedOut = false;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        stopAudioTracks();
        setVoiceState('idle');
        showVoiceError({ title: 'Recording failed', detail: 'The recording could not be completed. Please try again.' });
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        stopAudioTracks();
        if (discardRequestedRef.current || requestId !== voiceRequestRef.current || requestConversationId !== conversationIdRef.current) {
          discardRequestedRef.current = false;
          return;
        }
        if (!blob.size) {
          setVoiceState('idle');
          showVoiceError({ title: 'No speech detected', detail: 'Speak clearly into your microphone, then try again.' });
          return;
        }
        setVoiceState('processing');
        const transcribeController = new AbortController();
        voiceAbortRef.current = transcribeController;
        try {
          const result = await transcribeAssistantAudio({
            audio: new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }),
            conversationId: requestConversationId,
            signal: transcribeController.signal,
          });
          const text = String(result?.text || '').trim();
          if (!text) throw Object.assign(new Error('empty'), { code: 'EMPTY_TRANSCRIPT' });
          if (requestId !== voiceRequestRef.current || requestConversationId !== conversationIdRef.current) return;
          // Voice input only fills the composer. Do not submit here: the user
          // must explicitly click Send or press Enter so they can review and
          // edit the transcript first.
          onChange(text);
          setVoiceState('transcribed');
          if (requestId !== voiceRequestRef.current || requestConversationId !== conversationIdRef.current) return;
        } catch (error) {
          if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED' || requestId !== voiceRequestRef.current || requestConversationId !== conversationIdRef.current) return;
          setVoiceState('idle');
          showVoiceError(error?.code === 'EMPTY_TRANSCRIPT' || error?.response?.status === 422
            ? { title: 'No speech detected', detail: 'Speak clearly into your microphone, then try again.' }
            : { title: 'Transcription failed', detail: 'I could not understand that recording. Please try again.' });
        } finally {
          if (voiceAbortRef.current === transcribeController) voiceAbortRef.current = null;
        }
      };
      recorder.start();
      setVoiceState('recording');
      startWaveform(stream);
    } catch (error) {
      stopAudioTracks();
      setVoiceState('idle');
      if (error?.code === 'PERMISSION_TIMEOUT') {
        showVoiceError({ title: 'Microphone permission is needed', detail: 'The browser did not finish the microphone request. Allow microphone access for this site, then try again.' });
      } else if (error?.code === 'INSECURE_CONTEXT') {
        showVoiceError({ title: 'Secure connection required', detail: 'Voice input requires the assistant to be opened over HTTPS.' });
      } else if (error?.code === 'UNSUPPORTED') {
        showVoiceError({ title: 'Voice input unavailable', detail: 'This browser does not support microphone recording.' });
      } else if (error?.name === 'NotFoundError') {
        showVoiceError({ title: 'No microphone detected', detail: 'Connect a microphone and check that it is available, then try again.' });
      } else if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        showVoiceError({
          title: 'Microphone permission is needed',
          detail: 'Allow microphone access in your browser or site settings, then try again.',
          action: { label: 'Try again', onClick: startVoice },
        });
      } else {
        showVoiceError({
          title: 'Voice input is unavailable',
          detail: 'Check your microphone and browser permissions, then try again.',
          action: { label: 'Try again', onClick: startVoice },
        });
      }
    }
  };

  const stopVoice = () => {
    if (recorderRef.current?.state === 'recording') {
      setVoiceState('processing');
      recorderRef.current.stop();
    }
  };

  const discardVoice = () => {
    if (voiceState === 'recording') {
      discardRequestedRef.current = true;
      stopVoice();
    }
    setVoiceState('idle');
    voiceRequestRef.current += 1;
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    onChange('');
  };

  useEffect(() => () => {
    voiceRequestRef.current += 1;
    voiceAbortRef.current?.abort();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopAudioTracks();
  }, []);

  useEffect(() => {
    // A transcription belongs to the chat in which recording started. Abort
    // it when the user switches chats so a late result cannot cross boundaries.
    if (requestConversationIdRef.current === conversationId) return undefined;
    requestConversationIdRef.current = conversationId;
    if (voiceState === 'processing' || voiceState === 'submitting') {
      voiceRequestRef.current += 1;
      voiceAbortRef.current?.abort();
      voiceAbortRef.current = null;
      setVoiceState('idle');
    }
    return undefined;
  }, [conversationId, voiceState]);

  useEffect(() => {
    const previous = selectedFilesRef.current;
    const unchanged = previous.length === files.length && previous.every((item, index) => item.file === files[index]);
    if (unchanged) return;
    previous.forEach((item) => URL.revokeObjectURL(item.url));
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    selectedFilesRef.current = next;
    setSelectedFiles(next);
  }, [files]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!attachmentMenuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [menuOpen]);

  // Re-measure on every change so the box tracks wrapped lines, not keystrokes.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_H)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_H ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => () => {
    selectedFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  useEffect(() => {
    if (!clearAttachmentsToken) return;
    selectedFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    selectedFilesRef.current = [];
    setSelectedFiles([]);
    onFilesPrepared?.([]);
  }, [clearAttachmentsToken, onFilesPrepared]);

  useEffect(() => {
    if (!previewImage) return undefined;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPreviewImage(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [previewImage]);

  const submit = () => {
    if (!canSend) return;
    const files = selectedFiles.map((item) => item.file);
    onSend(value, files);
    if (files.length) {
      selectedFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      selectedFilesRef.current = [];
      setSelectedFiles([]);
      onFilesPrepared?.([]);
    }
  };
  const imageStep = registerStep?.inputType === 'image' ? registerStep : null;
  const registrationWorkflow = registerStep?.workflow === 'register_new_user';
  const imageLabel = imageStep?.label || 'Face image';
  const upload = (event) => {
    // Close the popover before the browser opens its native file picker. The
    // picker does not belong to the React tree, so relying only on the label's
    // click handler can leave the popover visible when focus returns.
    setMenuOpen(false);
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || files.some((file) => !['image/jpeg', 'image/png'].includes(file.type))) return;
    // A file input only reports the files selected in the current picker
    // interaction. Keep earlier selections so opening the picker again adds
    // photos instead of replacing the thumbnails already shown.
    const addedFiles = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    const next = [...selectedFilesRef.current, ...addedFiles];
    selectedFilesRef.current = next;
    setSelectedFiles(next);
    onFilesPrepared?.(next.map((item) => item.file));
    // Selecting files only stages them in the composer. Upload starts when
    // the user explicitly submits the message or presses a workflow upload
    // control, so opening the picker never sends a message by itself.
  };
  const removeFile = (index) => {
    if (uploading) return;
    const previous = selectedFilesRef.current;
    const removed = previous[index];
    if (removed) URL.revokeObjectURL(removed.url);
    const next = previous.filter((_, itemIndex) => itemIndex !== index);
    selectedFilesRef.current = next;
    setSelectedFiles(next);
    onFilesPrepared?.(next.map((item) => item.file));
  };
  const clearFiles = () => {
    if (uploading) return;
    selectedFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    selectedFilesRef.current = [];
    setSelectedFiles([]);
    onFilesPrepared?.([]);
  };

  return (
    <div
      style={{
        flex: '0 0 auto',
        borderTop: '1px solid var(--bd)',
        background: 'var(--headerglass)',
        backdropFilter: 'blur(10px)',
        padding: '16px 22px 14px',
      }}
    >
      {/* Same 22px gutter as the thread above, so the input's edges line up
          with where the messages start and end. */}
      <div style={{ width: '100%' }}>
        {selectedFiles.length > 0 && <div style={{ marginBottom: 9, padding: '10px 12px 11px', border: '1px solid rgba(99,102,241,.28)', borderRadius: 12, background: 'linear-gradient(180deg, rgba(99,102,241,.07), var(--bg2))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--tx)' }}>Attached photos</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 10.5, color: uploading ? 'var(--blue)' : 'var(--tx3)', fontWeight: uploading ? 700 : 400 }}>{uploading ? 'Uploading images…' : `${selectedFiles.length} selected · JPG/PNG`}</span>
              {!uploading && <button type="button" onClick={clearFiles} style={{ border: 0, background: 'transparent', color: 'var(--crit)', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>Clear all</button>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, overflowX: 'auto' }}>
            {selectedFiles.map(({ file, url }, index) => {
              const faceLabel = registrationWorkflow && selectedFiles.length === 3 ? ['Front face', 'Left face', 'Right face'][index] : imageStep?.label;
              return <div key={`${file.name}-${file.lastModified}-${index}`} style={{ position: 'relative', flex: '0 0 auto', width: 88, padding: 4, border: '1px solid var(--bd2)', borderRadius: 9, background: 'var(--bg1)' }}>
                {!uploading && <button type="button" onClick={() => removeFile(index)} title={`Remove ${file.name || 'image'}`} aria-label={`Remove ${file.name || 'image'}`} style={{ position: 'absolute', top: 1, right: 1, zIndex: 1, width: 20, height: 20, padding: 0, border: '1px solid rgba(255,255,255,.8)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(15,23,42,.78)', cursor: 'pointer' }}><X size={12} strokeWidth={2.4} /></button>}
                <button
                  type="button"
                  className="assistant-image-preview-trigger"
                  onClick={() => setPreviewImage({ url, alt: faceLabel || file.name || `Selected image ${index + 1}` })}
                  aria-label={`Open ${faceLabel || file.name || `selected image ${index + 1}`} in full view`}
                  style={{ display: 'block', padding: 0, border: 0, borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                >
                  <img src={url} alt={faceLabel || file.name || `Selected image ${index + 1}`} style={{ display: 'block', width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--bd)', cursor: 'pointer' }} />
                </button>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)' }}>{faceLabel || `Image ${index + 1}`}</div>
              </div>;
            })}
          </div>
        </div>}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            padding: '9px 9px 9px 16px',
            borderRadius: 14,
            background: 'var(--bg2)',
            border: `1px solid ${focused ? 'var(--blue)' : 'var(--bd2)'}`,
            boxShadow: focused ? '0 0 0 3px rgba(59,130,246,.13)' : 'none',
            transition: 'border-color .15s, box-shadow .15s',
            position: 'relative',
          }}
        >
          <div ref={attachmentMenuRef} style={{ position: 'relative', flex: '0 0 auto', alignSelf: 'flex-end' }}>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} disabled={sending || uploading} title="Add photos and files" aria-label="Add photos and files" style={{ width: 32, height: 32, border: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending || uploading ? 'not-allowed' : 'pointer', color: 'var(--tx2)', background: menuOpen ? 'var(--bg3)' : 'transparent' }}>
              <Plus size={20} strokeWidth={1.8} />
            </button>
            {menuOpen && !sending && !uploading && <div ref={popoverRef} style={{ position: 'absolute', zIndex: 20, left: 0, bottom: 42, width: 268, padding: 6, border: '1px solid var(--bd)', borderRadius: 12, background: 'var(--bg1)', boxShadow: '0 14px 34px rgba(15,23,42,.22)' }}>
              <button type="button" onClick={() => { popoverRef.current && (popoverRef.current.style.display = 'none'); flushSync(() => setMenuOpen(false)); fileInputRef.current?.click(); }} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 11px', border: 0, borderRadius: 8, cursor: 'pointer', textAlign: 'left', background: 'var(--bg2)' }}>
                <Paperclip size={18} style={{ color: 'var(--tx2)', flex: '0 0 auto', marginTop: 1 }} />
                <span style={{ display: 'grid', gap: 2 }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--tx)' }}>Add photos &amp; files</strong>
                  <small style={{ fontSize: 11, color: 'var(--tx3)' }}>{imageStep ? `Upload ${imageLabel} (JPG/PNG)` : registrationWorkflow ? 'Upload 3 face photos: Front, Left, Right' : 'Attach files to your message'}</small>
                </span>
              </button>
            </div>}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={upload} />
          </div>
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            maxLength={MAX_ASSISTANT_MESSAGE_CHARS}
            onChange={(e) => { if (voiceState === 'transcribed') setVoiceState('editable'); onChange(e.target.value); }}
            disabled={sending || uploading || voiceState === 'starting' || voiceState === 'recording' || voiceState === 'processing' || voiceState === 'submitting'}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={uploading ? 'Uploading images, please wait…' : COMPOSER_PLACEHOLDER}
            aria-label="Message the AI Assistant"
            className="vq-scroll"
            style={{
              flex: 1,
              display: voiceState === 'starting' || voiceState === 'recording' || voiceState === 'processing' || voiceState === 'submitting' ? 'none' : undefined,
              minWidth: 0,
              minHeight: 26,
              maxHeight: MAX_TEXTAREA_H,
              padding: '4px 0',
              resize: 'none',
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--tx)',
              fontFamily: 'var(--ui)',
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          />

          {(voiceState === 'starting' || voiceState === 'recording' || voiceState === 'processing' || voiceState === 'submitting') && <div aria-live="polite" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 8, color: voiceState === 'recording' ? 'var(--crit)' : 'var(--tx2)', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: voiceState === 'recording' ? 'var(--crit)' : 'var(--warn)', boxShadow: voiceState === 'recording' ? '0 0 0 5px rgba(239,68,68,.12)' : 'none' }} />
            <span>{voiceState === 'starting' ? 'Starting microphone…' : voiceState === 'recording' ? 'Listening…' : voiceState === 'processing' ? 'Processing…' : 'Sending…'}</span>
            {voiceState === 'recording' && <div aria-label="Audio waveform" style={{ display: 'flex', alignItems: 'center', gap: 2, height: 24, width: 44 }}>
              {Array.from({ length: 10 }, (_, index) => <span key={index} style={{ width: 3, height: `${Math.max(4, 5 + voiceLevel * (8 + (index % 4) * 3))}px`, borderRadius: 3, background: 'var(--crit)', transition: 'height .08s ease' }} />)}
            </div>}
          </div>}
          {voiceState === 'recording' ? (
            <button type="button" onClick={stopVoice} title="Stop recording" aria-label="Stop recording" style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.35)', color: 'var(--crit)' }}><Square size={14} strokeWidth={2.4} /></button>
          ) : voiceState === 'starting' || voiceState === 'processing' || voiceState === 'submitting' ? (
            <button type="button" disabled title={voiceState === 'starting' ? 'Starting microphone' : voiceState === 'processing' ? 'Processing recording' : 'Sending voice message'} aria-label={voiceState === 'starting' ? 'Starting microphone' : voiceState === 'processing' ? 'Processing recording' : 'Sending voice message'} style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'wait', background: 'var(--bg3)', border: '1px solid var(--bd2)', color: 'var(--tx2)' }}><Mic size={16} /></button>
          ) : sending ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              style={{
                flex: '0 0 auto',
                width: 40,
                height: 40,
                borderRadius: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'var(--bg3)',
                border: '1px solid var(--bd2)',
                color: 'var(--tx2)',
              }}
            >
              <Square size={14} strokeWidth={2.4} />
            </button>
          ) : (
            <>
            <button type="button" onClick={startVoice} disabled={sending || uploading || voiceState === 'submitting'} title="Use voice input" aria-label="Use voice input" style={{ flex: '0 0 auto', width: 32, height: 32, border: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending || uploading || voiceState === 'submitting' ? 'not-allowed' : 'pointer', color: 'var(--tx2)', background: 'transparent' }}><Mic size={18} strokeWidth={1.8} /></button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              title="Send"
              aria-label="Send message"
              style={{
                flex: '0 0 auto',
                width: 40,
                height: 40,
                borderRadius: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canSend ? 'pointer' : 'not-allowed',
                color: '#fff',
                background: canSend
                  ? 'linear-gradient(135deg,var(--blue),var(--violet))'
                  : 'var(--toggleoff)',
                border: canSend ? '1px solid rgba(255,255,255,.18)' : '1px solid var(--bd)',
                boxShadow: canSend ? '0 6px 18px rgba(99,102,241,.32)' : 'none',
                transition: 'background .15s, box-shadow .15s',
              }}
            >
              <Send size={16} strokeWidth={1.9} />
            </button>
            </>
          )}
        </div>

        <div style={{ marginTop: 9, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: 'var(--tx3)' }}>
          <span>{COMPOSER_FOOTNOTE}</span>
          <span aria-live="polite">{value.length}/{MAX_ASSISTANT_MESSAGE_CHARS}</span>
        </div>
        {previewImage && createPortal(<div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setPreviewImage(null)}
          style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 2147483647, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'rgba(2, 6, 23, .86)', cursor: 'zoom-out', isolation: 'isolate' }}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            aria-label="Close image preview"
            style={{ position: 'absolute', top: 20, right: 24, width: 40, height: 40, border: '1px solid rgba(255,255,255,.35)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(15,23,42,.7)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
          <img
            src={previewImage.url}
            alt={previewImage.alt}
            onClick={(event) => event.stopPropagation()}
            style={{ display: 'block', width: 'auto', maxWidth: 'min(70vw, 720px)', maxHeight: '78vh', objectFit: 'contain', margin: 0, borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,.45)', cursor: 'default' }}
          />
        </div>, document.documentElement)}
      </div>
    </div>
  );
}
