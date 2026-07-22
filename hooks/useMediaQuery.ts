import { useState, useEffect } from 'react';

/**
 * Tracks whether a CSS media query currently matches, updating live as the
 * viewport (or other media features) change.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handleChange = () => setMatches(mql.matches);

    handleChange();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
};

// Below this width the app switches to the mobile layout: full-screen
// overlay drawers instead of persistent side-by-side panels, a condensed
// header, and a single-pane preview.
export const useIsMobile = (): boolean => useMediaQuery('(max-width: 767px)');

// True when the primary pointer is touch (phones/tablets), regardless of
// screen width — used to disable mouse-hover-dependent interactions (like
// dragging a mind map node to reparent it) that don't translate to touch.
export const useIsTouchPrimary = (): boolean => useMediaQuery('(pointer: coarse)');
