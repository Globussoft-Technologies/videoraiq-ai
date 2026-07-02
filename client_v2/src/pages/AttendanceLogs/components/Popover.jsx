import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Minimal Popover mirroring the slice of the Radix API the log components use:
 * <Popover>, <PopoverTrigger asChild>, <PopoverContent align="start|end">.
 *
 * The content is rendered in a PORTAL to <body> (like Radix) so it escapes any
 * `overflow-hidden`/`overflow-auto` ancestor (e.g. the rounded auto-refresh
 * pill or a scroll container) that would otherwise clip it. Positioned with
 * fixed coords from the trigger's bounding rect. Themed via CSS vars — <body>
 * carries data-vq-theme, so the tokens resolve in the portal too.
 */
const PopoverContext = createContext(null);

export const Popover = ({ children, open, onOpenChange, className }) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = useCallback(
    (v) => {
      if (!isControlled) setInternalOpen(v);
      if (typeof onOpenChange === 'function') onOpenChange(v);
    },
    [isControlled, onOpenChange]
  );
  const triggerRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (contentRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [isOpen, setOpen]);

  return (
    <PopoverContext.Provider value={{ isOpen, setOpen, triggerRef, contentRef }}>
      <div ref={triggerRef} className={cn('relative inline-block', className)}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
};

export const PopoverTrigger = ({ children, asChild }) => {
  const ctx = useContext(PopoverContext);
  const toggle = (e) => {
    e.stopPropagation();
    ctx.setOpen(!ctx.isOpen);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: (e) => {
        children.props.onClick?.(e);
        toggle(e);
      },
    });
  }
  return (
    <button type="button" onClick={toggle}>
      {children}
    </button>
  );
};

export const PopoverContent = ({ children, className, align = 'start', sideOffset = 8 }) => {
  const ctx = useContext(PopoverContext);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!ctx.isOpen) return;
    const update = () => {
      const el = ctx.triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const style = { position: 'fixed', top: Math.round(r.bottom + sideOffset) };
      if (align === 'end') style.right = Math.round(window.innerWidth - r.right);
      else style.left = Math.round(r.left);
      setPos(style);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ctx.isOpen, align, sideOffset, ctx.triggerRef]);

  if (!ctx.isOpen || !pos) return null;

  return createPortal(
    <div
      ref={ctx.contentRef}
      style={pos}
      className={cn(
        'z-[200] rounded-xl border border-[var(--bd)] bg-[var(--bg1solid)] text-[var(--tx)] shadow-lg',
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
};

export default Popover;
