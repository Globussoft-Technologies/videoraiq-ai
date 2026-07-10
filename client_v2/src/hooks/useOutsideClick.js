import { useEffect } from 'react';

// Closes a popup when a pointer event lands outside `ref`, or on Escape.
//
// Replaces the transparent fixed-overlay "backdrop" pattern, which breaks
// inside the header/sidebar: those containers set `backdrop-filter`, which
// makes them the containing block for `position: fixed` descendants, so the
// overlay only covers the parent box (not the viewport) and never receives
// clicks from the rest of the page.
export function useOutsideClick(ref, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, isOpen, onClose]);
}
