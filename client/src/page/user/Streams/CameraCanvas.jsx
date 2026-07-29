import UserContext from '@/context/UserContext/Context';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { LuMaximize } from 'react-icons/lu';
import fallbackThumbnail from '@/assets/Missing.svg';

const CameraCanvas = ({
    src,
    maxminBtnclass,
    thumbnailSrc,
    isInModal = false,
    // Overrides the default maximize behavior (which opens the global
    // stream-preview modal via UserContext — only ever rendered on the
    // Dashboard page). Callers that have their own detail/lightbox view
    // (e.g. IncidentCard) pass this instead so the button actually does
    // something on pages the stream modal was never wired into.
    onMaximize,
}) => {
    // const videoRef = useRef(null);
    // const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const { setStreamModalShow, setStreamModalContentSrc } = useContext(UserContext);
    const [isTrueFullscreen, setIsTrueFullscreen] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const INCIDENT_URL = import.meta.env.VITE_INCIDENT_URL;
    useEffect(() => {
        setVideoError(false);
    //      const video = videoRef.current; dont need this anymore but commenting out for now
    //     const canvas = canvasRef.current;
    //     const ctx = canvas.getContext('2d');
    //     let animationFrameId;

    //     const drawFrame = () => {
    //         if (video && video.readyState >= 2) {
    //             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    //         }
    //         animationFrameId = requestAnimationFrame(drawFrame);
    //     };

    //     if (!isInModal && thumbnailSrc) {
    //         const img = new Image();
    //         img.onload = () => {
    //             ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    //         };
    //         img.src = thumbnailSrc;
    //         video?.pause();
    //         if (animationFrameId) cancelAnimationFrame(animationFrameId);
    //     } else {
    //         if (video && src) {
    //             video.src = src;
    //             video.load();
    //             video.play()
    //                 .then(() => {
    //                     drawFrame();
    //                 })
    //                 .catch((err) => {
    //                     console.error('Video play failed:', err);
    //                 });
    //         } else if (animationFrameId) {
    //             cancelAnimationFrame(animationFrameId);
    //         }
    //     }

    //     return () => {
    //         if (animationFrameId) {
    //             cancelAnimationFrame(animationFrameId);
    //         }
    //         video?.pause();
    //     };
    // }, [isInModal, src, thumbnailSrc]);
    }, [src]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = document.fullscreenElement === containerRef.current;
            setIsTrueFullscreen(isCurrentlyFullscreen);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    const handleMaximizeClick = async (e) => {
        e.stopPropagation();
        if (onMaximize) {
            onMaximize();
            return;
        }
        if (isInModal) {
            if (containerRef.current.requestFullscreen) {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    await containerRef.current.requestFullscreen();
                }
            } else if (containerRef.current.webkitRequestFullscreen) {
                if (document.webkitFullscreenElement) {
                    await document.webkitExitFullscreen();
                } else {
                    await containerRef.current.webkitRequestFullscreen();
                }
            } else if (containerRef.current.mozRequestFullScreen) {
                if (document.mozFullScreenElement) {
                    await document.mozCancelFullScreen();
                } else {
                    await containerRef.current.mozRequestFullScreen();
                }
            } else if (containerRef.current.msRequestFullscreen) {
                if (document.msFullscreenElement) {
                    await document.msExitFullscreen();
                } else {
                    await containerRef.current.msRequestFullscreen();
                }
            }
        } else {
            setStreamModalContentSrc(src);
            setStreamModalShow(true);
        }
    };

    const showVideo = src && !videoError;

    return (
        <div
            ref={containerRef}
            className={`relative rounded overflow-hidden w-full aspect-[16/9] bg-black ${isTrueFullscreen ? 'bg-black' : ''}`}
            style={isInModal ? { width: '100%', height: '100%' } : {}}
        >
            {showVideo ? (
                <video
                    key={src}
                    src={src}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                    onError={() => {
                        console.error('Video failed to load:', src);
                        setVideoError(true);
                    }}
                />
            ) :(
                <img
                    src={`${INCIDENT_URL}${thumbnailSrc}`}
                    alt="Video thumbnail"
                    className="w-full h-full object-contain"
                    style={{ imageRendering: 'crisp-edges' }}
                    onError={e => {
                        if (e.target.src !== fallbackThumbnail) {
                            e.target.src = fallbackThumbnail;
                        }
                    }}
                />
            ) }

            {/* Dark overlay for thumbnail (only when video is not shown) */}
            {/* {!showVideo && (
                <div
                    className="absolute inset-0 bg-[rgba(7,72,106,0.25)] pointer-events-none"
                />
            )} */}

            <button
                onClick={handleMaximizeClick}
                className={`${maxminBtnclass} cursor-pointer`}
            >
                <LuMaximize />
            </button>
        </div>
    );
};

export default CameraCanvas;
