import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BiTargetLock } from "react-icons/bi";
import { ChevronDown } from 'lucide-react';

const ZoneSelector = ({ detectionsForCamera, selectedZone, setSelectedZone }) => {
  // Zone selector state
  const [zoneOpen, setZoneOpen] = useState(false);

  // Draggable Zone selector state
  const [zonePosition, setZonePosition] = useState({ x: window.innerWidth - 250, y: 80 });
  const [isZoneDragging, setIsZoneDragging] = useState(false);
  const [zoneDragOffset, setZoneDragOffset] = useState({ x: 0, y: 0 });
  const zoneRef = useRef(null);

  // Drag handlers for Zone selector
  const handleZoneMouseDown = (e) => {
    if (zoneRef.current && e.target.closest('.zone-drag-handle')) {
      setIsZoneDragging(true);
      const rect = zoneRef.current.getBoundingClientRect();
      setZoneDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleZoneMouseMove = useCallback((e) => {
    if (isZoneDragging && zoneRef.current) {
      const modalRect = document.querySelector('.stream-modal')?.getBoundingClientRect();
      if (!modalRect) return;

      let newX = e.clientX - modalRect.left - zoneDragOffset.x;
      let newY = e.clientY - modalRect.top - zoneDragOffset.y;

      // Constrain to modal boundaries
      const zoneRect = zoneRef.current.getBoundingClientRect();
      newX = Math.max(0, Math.min(newX, modalRect.width - zoneRect.width));
      newY = Math.max(0, Math.min(newY, modalRect.height - zoneRect.height));

      setZonePosition({ x: newX, y: newY });
    }
  }, [isZoneDragging, zoneDragOffset]);

  const handleZoneMouseUp = useCallback(() => {
    setIsZoneDragging(false);
  }, []);

  useEffect(() => {
    if (isZoneDragging) {
      window.addEventListener('mousemove', handleZoneMouseMove);
      window.addEventListener('mouseup', handleZoneMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleZoneMouseMove);
        window.removeEventListener('mouseup', handleZoneMouseUp);
      };
    }
  }, [isZoneDragging, handleZoneMouseMove, handleZoneMouseUp]);

  return (
    <div
      ref={zoneRef}
      style={{
        position: 'absolute',
        left: `${zonePosition.x}px`,
        top: `${zonePosition.y}px`,
        cursor: isZoneDragging ? 'grabbing' : 'grab',
        zIndex: 50
      }}
      onMouseDown={handleZoneMouseDown}
    >
      <div className="zone-drag-handle relative">
        {selectedZone && (
          <button
            onClick={() => setZoneOpen((s) => !s)}
            className="flex items-center justify-between w-52 bg-gradient-to-r from-white/8 via-white/6 to-white/8 backdrop-blur-xl border border-white/20 rounded-[16px] pl-3 pr-4 py-3 shadow-2xl shadow-black/50 text-white transition-all duration-300 hover:from-white/12 hover:via-white/10 hover:to-white/12 hover:shadow-3xl hover:shadow-black/60"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[14px] bg-[#E5F6FF] flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg">
                <BiTargetLock className="w-5 h-5 text-[#07486A]" />
              </div>
              <span className="font-medium select-none text-sm truncate block">{selectedZone?.detectionSetting?.settings?.referencePoints?.zone_name}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-white/90 transition-transform ${zoneOpen ? 'rotate-180' : ''}`} />
          </button>
        )}

        {zoneOpen && (
          <div className="mt-3 w-full bg-gradient-to-b from-white/10 via-white/8 to-white/6 backdrop-blur-xl border border-white/25 rounded-xl py-3 shadow-2xl shadow-black/50 right-0 absolute text-right overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>

            {detectionsForCamera.map(detection => (
              <button
                key={detection._id}
                onClick={() => { setSelectedZone(detection); setZoneOpen(false); }}
                className="relative cursor-pointer w-full text-left px-4 py-3 hover:bg-white/15 text-white text-sm"
              >
                <span className="truncate block">{detection?.detectionSetting?.settings?.referencePoints?.zone_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoneSelector;