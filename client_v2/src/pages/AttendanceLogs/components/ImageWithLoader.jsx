import React, { useLayoutEffect, useRef, useState } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

/**
 * <img> wrapper that shows a spinner ONLY while an image is genuinely still
 * loading, and a fallback icon on error.
 *
 * Key behaviours:
 *  - Already-cached images (img.complete on mount) render instantly with no
 *    spinner flash — this is why plain onLoad handlers "stick" on a spinner:
 *    a cached image never fires load, so we detect completeness synchronously.
 *  - The spinner only appears if loading takes longer than ~180ms, so fast
 *    loads don't flash a spinner.
 *
 * The wrapper `<span>` takes `className` (size/rounding/position); the inner
 * image takes `imgClassName`.
 */
const ImageWithLoader = ({ src, alt = '', className = '', imgClassName = '', onLoad, onError, ...rest }) => {
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  // Runs before paint: if the image is already complete (cached), mark it
  // loaded immediately so there is no spinner and no opacity flash.
  useLayoutEffect(() => {
    const img = imgRef.current;
    setErrored(false);
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
      setShowSpinner(false);
      onLoad?.();
      return undefined;
    }
    setLoaded(false);
    setShowSpinner(false);
    const t = setTimeout(() => setShowSpinner(true), 180);
    return () => clearTimeout(t);
  }, [src]);

  return (
    <span className={`relative block overflow-hidden bg-[var(--bg2)] ${className}`}>
      {showSpinner && !loaded && !errored && (
        <span className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--tx3)]" />
        </span>
      )}
      {errored && (
        <span className="absolute inset-0 z-10 flex items-center justify-center">
          <ImageOff className="w-4 h-4 text-[var(--tx3)]" />
        </span>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        // Off-screen cards defer their download; async decode keeps the
        // main thread free so the visible grid stays responsive.
        loading="lazy"
        decoding="async"
        onLoad={() => {
          setLoaded(true);
          setShowSpinner(false);
          onLoad?.();
        }}
        onError={() => {
          setErrored(true);
          setShowSpinner(false);
          onError?.();
        }}
        className={`${imgClassName} transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        {...rest}
      />
    </span>
  );
};

export default ImageWithLoader;
