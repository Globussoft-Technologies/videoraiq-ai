import React, { useState, useRef, useEffect, useCallback } from 'react';

const AutoHideWrapper = ({ 
  children, 
  hideDelay = 2000, 
  className = '',
  style = {},
  targetRef = null // New prop: ref to the element to listen for hover events
}) => {
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef(null);
  const localRef = useRef(null);

  // Reset the timer to hide controls
  const resetHideControlsTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, hideDelay);
  }, [hideDelay]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    resetHideControlsTimer();
  }, [resetHideControlsTimer]);

  const handleMouseEnter = useCallback(() => {
    setShowControls(true);
    resetHideControlsTimer();
  }, [resetHideControlsTimer]);

  const handleMouseLeave = useCallback(() => {
    // Only start the hide timer when leaving, don't hide immediately
    resetHideControlsTimer();
  }, [resetHideControlsTimer]);

  // Set up event listeners on target element if provided
  useEffect(() => {
    const targetElement = targetRef?.current;    
    if (targetElement) {
      console.log('Setting up event listeners on target element');
      // Start the hide timer when component mounts
      resetHideControlsTimer();
      
      targetElement.addEventListener('mousemove', handleMouseMove);
      targetElement.addEventListener('mouseenter', handleMouseEnter);
      targetElement.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        console.log('Cleaning up event listeners');
        targetElement.removeEventListener('mousemove', handleMouseMove);
        targetElement.removeEventListener('mouseenter', handleMouseEnter);
        targetElement.removeEventListener('mouseleave', handleMouseLeave);
      };
    } else {
      console.log('No target element, starting hide timer for local mode');
      // If no targetRef, start hide timer for local mode
      resetHideControlsTimer();
    }
  }, [targetRef, handleMouseMove, handleMouseEnter, handleMouseLeave, resetHideControlsTimer]);

  // Also listen to mouse events on the wrapper itself to prevent hiding when hovering over controls
  const handleLocalMouseEnter = useCallback(() => {
    if (targetRef) {
      // If we're using targetRef, also show controls when hovering over the wrapper itself
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    }
  }, [targetRef]);

  const handleLocalMouseLeave = useCallback(() => {
    if (targetRef) {
      // Start hide timer when leaving the controls
      resetHideControlsTimer();
    }
  }, [targetRef, resetHideControlsTimer]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // If targetRef is provided, attach local handlers to the wrapper to prevent hiding when hovering over controls
  const localEventHandlers = targetRef ? {
    onMouseEnter: handleLocalMouseEnter,
    onMouseLeave: handleLocalMouseLeave,
  } : {
    onMouseMove: handleMouseMove,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  };

  return (
    <div
      ref={localRef}
      {...localEventHandlers}
      className={className}
      style={style}
    >
      <div
        className="transition-opacity duration-300"
        style={{ 
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default AutoHideWrapper;
