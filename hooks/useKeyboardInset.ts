import { useState, useEffect } from 'react';

// Mobile browsers shrink the *visual* viewport (not the layout viewport) when
// the on-screen keyboard opens, so a `position: fixed` element stays pinned
// to the bottom of the full, keyboard-covered layout — i.e. hidden behind
// the keyboard — unless it's explicitly offset by how much the visual
// viewport has shrunk. This tracks that offset so a toolbar can sit just
// above the keyboard instead, the way a native app's input accessory view
// does. Resolves to 0 (no offset) when the keyboard is closed, or in
// browsers without `visualViewport` support.
export const useKeyboardInset = (): number => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(Math.max(0, Math.round(covered)));
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
};
