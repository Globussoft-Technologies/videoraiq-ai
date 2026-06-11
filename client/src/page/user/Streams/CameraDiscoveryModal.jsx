import React, { useEffect, useRef, useMemo, useState } from 'react';
import { X, Loader2, Maximize2, Minimize2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { addSelectedCameras } from './Api/post';
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
import useHlsPlayer from '@/hooks/useHlsPlayer';

const HOST = import.meta.env.VITE_BACKEND;
const STREAM_BASE = import.meta.env.VITE_STREAM_URL;
const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP;

const CameraPreviewModal = ({ cam, onClose }) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const streamUrl = useMemo(() => {
    if (!cam?.streamingUrl) return null;
    if (LOCAL_SETUP === 'true') return cam.streamingUrl;
    return STREAM_BASE + cam.streamingUrl;
  }, [cam?.streamingUrl]);

  useHlsPlayer(videoRef, streamUrl, {
    autoPlay: true,
    onError: (msg) => { setErrorMsg(msg); setIsLoading(false); setHasError(true); },
  });

  useEffect(() => {
    const handleFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('msfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('msfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-2xl bg-neutral-900 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="text-white text-sm font-medium">{cam.name}</span>
            <span className="text-[11px] text-neutral-400 border border-white/10 px-2 py-0.5 rounded bg-white/5">
              Channel {cam.channelId}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFullscreen}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative bg-black aspect-video w-full flex items-center justify-center">
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10">
              <Loader2 className="animate-spin text-white w-8 h-8" />
              <span className="text-neutral-400 text-xs">Connecting to stream...</span>
            </div>
          )}
          {hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/80 z-20 text-center">
              <p>Unable to load stream</p>
              <p className="text-xs opacity-70 mt-1">{errorMsg || 'Camera offline'}</p>
            </div>
          )}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            preload="metadata"
            onCanPlay={() => { setIsLoading(false); setHasError(false); }}
            onPlaying={() => { setIsLoading(false); setHasError(false); }}
          />
          <div className="absolute bottom-3 left-3 z-10">
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30 tracking-wider">
              LIVE PREVIEW
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CameraDiscoveryModal = ({ nvrId, onClose, onSaved }) => {
  const [cameras, setCameras] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [initialAdded, setInitialAdded] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCam, setPreviewCam] = useState(null);

  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const token = getAccessToken();
        const res = await axios.get(`${HOST}/api/v1/nvr/edit/${nvrId}`, {
          headers: { 'x-access-token': token },
        });
        if (res?.data?.body?.status === 'success') {
          const available = res.data.body.data.availableCameras || [];
          setCameras(available);
          const addedMap = new Map();
          const selectedSet = new Set();
          available.forEach((cam) => {
            if (cam.isAdded && cam.dbId) {
              addedMap.set(cam.channelId, cam.dbId);
              selectedSet.add(cam.channelId);
            }
          });
          setInitialAdded(addedMap);
          setSelected(selectedSet);
        } else {
          toast.error(res?.data?.body?.message || 'Failed to load cameras');
          onClose();
        }
      } catch {
        toast.error('Failed to load cameras from NVR');
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchCameras();
  }, [nvrId]);

  const toggleCamera = (channelId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toAdd = cameras.filter((cam) => selected.has(cam.channelId) && !initialAdded.has(cam.channelId));
      const toRemove = cameras.filter((cam) => !selected.has(cam.channelId) && initialAdded.has(cam.channelId));

      if (toAdd.length === 0 && toRemove.length === 0) {
        toast.info('No changes made');
        onClose();
        return;
      }

      // Send ALL currently selected cameras - backend will mark unselected as isAdded: false
      const cameraIds = Array.from(selected);
      const res = await addSelectedCameras({ nvrId, cameraIds });
      if (res?.data?.body?.status !== 'success') {
        toast.error(res?.data?.body?.message || 'Failed to update cameras');
      } else {
        const parts = [];
        if (toAdd.length > 0) parts.push(`${toAdd.length} camera${toAdd.length > 1 ? 's' : ''} added`);
        if (toRemove.length > 0) parts.push(`${toRemove.length} camera${toRemove.length > 1 ? 's' : ''} removed`);
        toast.success(parts.join(', '));
        onSaved();
        onClose();
      }
    } catch {
      toast.error('Something went wrong while saving');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
      <div className="w-full sm:w-[520px] bg-white rounded-[24px] px-6 sm:px-10 py-8 relative max-h-[80vh] flex flex-col">
        <Button onClick={onClose} className="absolute top-4 right-4 shadow-none hover:text-black cursor-pointer">
          <X className="size-6 text-[#333333]" />
        </Button>
        <h2 className="text-lg sm:text-xl font-medium text-[#333333] mb-1 text-center">Manage Cameras</h2>
        <p className="text-sm text-[#7A7A7A] text-center mb-5">Check to add · Uncheck to remove</p>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <Loader2 className="animate-spin w-8 h-8 text-[#07486a]" />
          </div>
        ) : cameras.length === 0 ? (
          <p className="text-sm text-center text-gray-500 py-10">No cameras found on this NVR</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {cameras.map((cam) => (
              <div
                key={cam.channelId}
                className="flex items-center gap-3 p-3 rounded-lg border border-[#80808059] hover:bg-[#F5F9FF] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(cam.channelId)}
                  onChange={() => toggleCamera(cam.channelId)}
                  className="w-4 h-4 accent-[#07486a] cursor-pointer shrink-0"
                />
                <label
                  onClick={() => toggleCamera(cam.channelId)}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <p className="text-sm font-medium text-[#333333] truncate">{cam.name}</p>
                  <p className="text-xs text-[#7A7A7A]">Channel {cam.channelId}</p>
                </label>
                {cam.isAdded && (
                  <span className="text-[10px] bg-[#E5F6FF] text-[#07486a] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">Added</span>
                )}
                {cam.isAdded && cam.dbId && (
                  <button
                    type="button"
                    onClick={() => setPreviewCam({ ...cam, streamingUrl: `stream/${nvrId}-${cam.dbId}/playlist.m3u8` })}
                    title="Preview stream"
                    className="shrink-0 flex items-center gap-1 text-[11px] text-[#07486a] border border-[#07486a]/30 bg-[#07486a]/5 hover:bg-[#07486a]/10 px-2 py-1 rounded-full transition-colors cursor-pointer"
                  >
                    <Play size={11} className="fill-[#07486a]" />
                    Preview
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-10 px-6 rounded-full border-[#C9C9C9] text-[#333333] cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="h-10 px-6 rounded-full bg-[#07486a] hover:bg-[#05364f] text-white cursor-pointer">
            {saving && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {previewCam && (
        <CameraPreviewModal cam={previewCam} onClose={() => setPreviewCam(null)} />
      )}
    </div>
  );
};

export default CameraDiscoveryModal;
