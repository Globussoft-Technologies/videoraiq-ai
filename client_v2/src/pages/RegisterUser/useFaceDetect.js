import { useEffect, useState } from 'react';

/**
 * Live face-presence check using the browser's native FaceDetector API
 * (Chromium desktop). Returns:
 *   null  — detection unsupported / not yet determined
 *   true  — a face is currently in frame
 *   false — no face detected (after a short debounce)
 *
 * Pass the react-webcam ref and whether the camera view is active.
 */
export default function useFaceDetect(webcamRef, active) {
  const [faceOk, setFaceOk] = useState(null);

  useEffect(() => {
    if (!active) {
      setFaceOk(null);
      return;
    }
    const FD = typeof window !== 'undefined' ? window.FaceDetector : undefined;
    if (!FD) return;

    let detector;
    try {
      detector = new FD({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      return;
    }

    let stopped = false;
    let misses = 0;
    let timer;

    const tick = async () => {
      if (stopped) return;
      const video = webcamRef.current?.video;
      if (video && video.readyState >= 2 && video.videoWidth) {
        try {
          const faces = await detector.detect(video);
          if (faces?.length) {
            misses = 0;
            setFaceOk(true);
          } else if (++misses >= 3) {
            setFaceOk(false);
          }
        } catch {
          /* transient decode errors — ignore */
        }
      }
      if (!stopped) timer = setTimeout(tick, 600);
    };

    timer = setTimeout(tick, 600);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, webcamRef]);

  return faceOk;
}
