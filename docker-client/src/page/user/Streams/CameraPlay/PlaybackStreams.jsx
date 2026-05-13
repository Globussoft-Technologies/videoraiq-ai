import React, { useRef, useState, useEffect, forwardRef } from 'react';
import { Minimize2, RotateCw } from 'lucide-react';
import { LuMaximize, LuMinimize } from 'react-icons/lu';
import { GoDownload } from "react-icons/go";
import { GrFormNext, GrFormPrevious } from "react-icons/gr";
import { TbCut } from "react-icons/tb";
import { Switch } from '@/components/ui/switch';
import { IoPlayBack } from "react-icons/io5";
import { IoStopSharp } from "react-icons/io5";
import { IoPlay } from "react-icons/io5";
import { CiVolumeMute } from "react-icons/ci";
import { IoPlaySkipForward } from "react-icons/io5";
import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

export const PlaybackStreams = forwardRef(({
  maxminBtnclass,
  maxsize,
  playbackChannel,
  onLoadedMetadata,
  onWaiting,
  onPlaying,
  onEnded,
  onTimeUpdate,
  onSeek,
  playbackRate,
  isPlaying
}, ref) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const animationFrameId = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const socket_Url = import.meta.env.VITE_SOCKET_URL;
  useEffect(() => {
    if (!playbackChannel || !window.JSMpeg || !window.JSMpeg.Player) return;

    const initPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      if (!canvasRef.current) return;

      const socketUrl = `${socket_Url}/${playbackChannel}`;

      try {
        playerRef.current = new window.JSMpeg.Player(socketUrl, {
          canvas: canvasRef.current,
          autoplay: isPlaying,
          audio: true,
          onSourceCompleted: onEnded,
          onPlay: () => {
            if (onPlaying) onPlaying();
          },
          onPause: () => {
            if (onEnded) onEnded();
          },
        });

        if (onLoadedMetadata) {
          // Simulate loaded metadata event
          setTimeout(() => onLoadedMetadata(), 100);
        }
      } catch (err) {
        console.error('Failed to initialize JSMpeg Player:', err);
      }
    };

    initPlayer();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying JSMpeg player:', e);
        }
        playerRef.current = null;
      }
    };
  }, [playbackChannel, isPlaying]);

  useEffect(() => {
    if (!playerRef.current) return;

    const updateTimeline = () => {
      if (playerRef.current) {
        const now = playerRef.current.currentTime;
        if (onTimeUpdate) onTimeUpdate(now);
      }
      animationFrameId.current = requestAnimationFrame(updateTimeline);
    };

    if (isPlaying) {
      animationFrameId.current = requestAnimationFrame(updateTimeline);
    } else if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    if (playerRef.current && playbackRate) {
      playerRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isFullscreen) {
      container.requestFullscreen?.() ||
      container.webkitRequestFullscreen?.() ||
      container.msRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() ||
      document.webkitExitFullscreen?.() ||
      document.msExitFullscreen?.();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(containerRef.current);
      } else {
        ref.current = containerRef.current;
      }
    }
  }, [ref]);

  return (
    <div
      ref={containerRef}
      className="relative rounded overflow-hidden w-full h-full bg-black"
    >
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="w-full h-full object-contain"
      />
      {/* <button
        onClick={toggleFullscreen}
        className={maxminBtnclass}
      >
        {isFullscreen ? (
          <LuMinimize className={maxsize} />
        ) : (
          <LuMaximize className={maxsize} />
        )}
      </button> */}
    </div>
  );
});

