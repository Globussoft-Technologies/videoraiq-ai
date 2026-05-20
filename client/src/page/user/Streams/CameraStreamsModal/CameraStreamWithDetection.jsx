import React, { useEffect, useRef } from 'react';

const CameraStreamWithDetection = ({ videoRef, detections = [] }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');

    const draw = () => {
      if (!ctx || !canvas || !video) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!detections || (Array.isArray(detections) && detections.length === 0)) {
        return;
      }
      
      const detectionList = Array.isArray(detections) ? detections : [detections];
      const videoWidth = video.videoWidth || video.clientWidth;
      const videoHeight = video.videoHeight || video.clientHeight;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      const scaleX = displayWidth / videoWidth;
      const scaleY = displayHeight / videoHeight;

      detectionList.forEach((det) => {
        const polygonPoints =
          det?.detectionSetting?.settings?.referencePoints?.[det.cameraId] || [];

        if (!polygonPoints.length) return;

        const scaledPoints = polygonPoints.map(([x, y]) => [
          x * scaleX,
          y * scaleY,
        ]);

        // Draw polygon
        ctx.beginPath();
        scaledPoints.forEach(([x, y], index) => {
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        
        const isPersonPresent = det.personPresent === true;
        const zoneColor = isPersonPresent ? '#10b981' : '#ef4444'; 
        const fillColor = isPersonPresent ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

        ctx.strokeStyle = zoneColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = fillColor;
        ctx.fill();
      });
    };

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = video.clientWidth;
      const height = video.clientHeight;

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    resizeCanvas();

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(video);

    window.addEventListener('resize', resizeCanvas);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [detections, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      const resizeEvent = new Event('resize');
      window.dispatchEvent(resizeEvent);
    };

    video.addEventListener('playing', handlePlay);
    return () => video.removeEventListener('playing', handlePlay);
  }, [videoRef]);

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />
    </div>
  );
};

export default React.memo(CameraStreamWithDetection);