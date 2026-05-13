import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import Delete from '@/assets/Delete.svg';
import { CirclePlay, BrushCleaning, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import DetectionPreviewModal from './DetectionPreviewModal';
import MiniCameraPreview from './MiniCameraPreview';
import { callMarkPointsApi } from '@/utils/callMarkPointsApi';
import ConfirmationModal from './DeleteConfirmation';
import AreaMarkingControls from './zonemarking/AreaMarkingControls';
import useAreaMarking from '@/hooks/useAreaMarking';
import CounterImg2 from '@/assets/CounterImg2.png';

const StaticAreaMarking = forwardRef(({ initialReferencePoints = {} }, ref) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const adapterRef = useRef({});
  const [points, setPoints] = useState([]);
  const [modalType, setModalType] = useState('');
  const [processedImage, setProcessedImage] = useState(null);
  const [loadingPreviewImg, setLoadingPreviewImg] = useState(false);

  // Adapter ref exposes the imperative API expected by useAreaMarking and AreaMarkingControls
  useEffect(() => {
    adapterRef.current = {
      setPoints: (pts) => {
        setPoints(pts || []);
      },
      clearPoints: () => setPoints([]),
      getPoints: () => [...points],
      // setDrawingMode / setMoveMode are no-ops here because the hook
      // manages drawing/move state; kept for API parity
      setDrawingMode: (mode) => {},
      setMoveMode: (mode) => {},
      captureScreenshot: async ({ base64Only = false, noOverlay = false } = {}) => {
        try {
          const img = imageRef.current;
          const overlay = canvasRef.current;
          if (!img) return null;

          const temp = document.createElement('canvas');
          temp.width = img.naturalWidth || 1280;
          temp.height = img.naturalHeight || 720;
          const ctx = temp.getContext('2d');

          // draw base image
          ctx.drawImage(img, 0, 0, temp.width, temp.height);

          if (!noOverlay && overlay) {
            // scale overlay to image if needed
            ctx.drawImage(overlay, 0, 0, temp.width, temp.height);
          }

          const data = temp.toDataURL('image/jpeg', 0.95);
          if (base64Only) return data;
          return data;
        } catch (err) {
          console.error('captureScreenshot error', err);
          return null;
        }
      },
      getResolution: () => {
        const img = imageRef.current;
        return [img?.naturalWidth || 1280, img?.naturalHeight || 720];
      },
    };
  }, [points]);

  const {
    drawingMode,
    moveMode,
    handleToggleDrawing,
    handleDeleteArea,
    handleMinArea,
    handleMaxArea,
    handleSingleLinePlacement,
    handleEnableEdit,
  } = useAreaMarking(adapterRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (points.length > 0) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        if (points.length === 4) {
          ctx.closePath();
        }
        ctx.stroke();
      }
    };

    draw();
  }, [points]);

  useImperativeHandle(ref, () => ({
    getPoints: () => points,
    setPoints: (newPoints) => setPoints(newPoints),
    clearPoints: () => setPoints([]),
    // expose capture and resolution for parity with live stream component
    captureScreenshot: async (opts) => adapterRef.current.captureScreenshot(opts),
    getResolution: () => adapterRef.current.getResolution(),
    setDrawingMode: (mode) => adapterRef.current.setDrawingMode(mode),
    setMoveMode: (mode) => adapterRef.current.setMoveMode(mode),
  }));

  const handleCanvasClick = (e) => {
    if (drawingMode) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      // scale click coordinates to canvas internal resolution
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const x = clickX * scaleX;
      const y = clickY * scaleY;
      setPoints((prev) => [...prev, { x, y }]);
    }
  };

  return (
    <div className="w-full bg-white rounded-[10px] px-2 sm:px-4 md:px-5 py-2 mt-6">
      <div className={'w-full'}>
        <div className="relative aspect-video overflow-hidden ">
          <img ref={imageRef} src={CounterImg2} alt="Static image for zone marking" className="w-full h-full object-cover" />
          <button
            className="absolute top-4 right-4 bg-white/10 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 border border-white/20 hover:bg-white/20 transition-all"
            onClick={async () => {
              setModalType('preview');
              setProcessedImage(null);
              setLoadingPreviewImg(true);
              try {
                if (adapterRef.current?.captureScreenshot) {
                  const imgData = await adapterRef.current.captureScreenshot({ base64Only: true, noOverlay: true });
                  if (!imgData) {
                    console.error('Failed to capture screenshot');
                    setLoadingPreviewImg(false);
                    return;
                  }
                  const pointsData = adapterRef.current?.getPoints ? adapterRef.current.getPoints() : points;
                  const resolution = adapterRef.current?.getResolution ? adapterRef.current.getResolution() : [1280, 720];
                  const base64Data = imgData.replace(/^data:image\/(png|jpeg);base64,/, '');
                  const response = await callMarkPointsApi(base64Data, resolution, pointsData);
                  if (response?.status === 200 && response.data?.processed_image) {
                    setProcessedImage(response.data.processed_image);
                  }
                }
              } catch (err) {
                console.error('Error processing screenshot:', err);
              } finally {
                setLoadingPreviewImg(false);
              }
            }}
          >
            <CirclePlay size={12} />
            Preview
          </button>
          <canvas
            ref={canvasRef}
            width="1280"
            height="720"
            className="absolute top-0 left-0 w-full h-full"
            onClick={handleCanvasClick}
          />
        </div>
        
        <AreaMarkingControls
          cameraStreamRef={adapterRef}
          drawingMode={drawingMode}
          moveMode={moveMode}
          handleToggleDrawing={handleToggleDrawing}
          handleDeleteArea={handleDeleteArea}
          handleMinArea={handleMinArea}
          handleMaxArea={handleMaxArea}
          handleSingleLinePlacement={handleSingleLinePlacement}
          handleEnableEdit={handleEnableEdit}
        />
        {modalType === 'preview' && (
          <DetectionPreviewModal isOpen={true} onClose={() => setModalType('') }>
            <MiniCameraPreview processedImage={processedImage} loadingPreviewImg={loadingPreviewImg} />
          </DetectionPreviewModal>
        )}
      </div>
    </div>
  );
});

export default StaticAreaMarking;
