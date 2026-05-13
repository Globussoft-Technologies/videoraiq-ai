// hooks/useResponsivePlacement.js
import { useEffect, useState, useCallback } from 'react';

export function useResponsivePlacement() {
  const getPlacement = useCallback(() => {
    const width = window.innerWidth;
    if (width >= 1536) return 'bottom'; // 2xl
    if (width >= 768) return 'left'; // md
    return 'bottom'; // sm
  }, []);

  const [placement, setPlacement] = useState(getPlacement);

  useEffect(() => {
    let timeout;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const newPlacement = getPlacement();
        setPlacement(prev => (prev !== newPlacement ? newPlacement : prev));
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [getPlacement]);

  return placement;
}
