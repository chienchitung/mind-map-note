import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

interface PwaUpdateState {
  // True once a new service worker has finished installing and is sitting
  // there waiting (registerType: 'prompt' in vite.config.ts — it does NOT
  // activate itself) — the moment to show the user an "update available"
  // affordance rather than silently swapping things out from under them.
  updateAvailable: boolean;
  // True while applyUpdate() is in flight, so the UI can show a spinner for
  // the brief window between the click and the page's own reload.
  updating: boolean;
  // Tells the waiting worker to activate; the page reloads itself once it
  // takes control (vite-plugin-pwa's own default behavior for this case).
  applyUpdate: () => void;
}

// Wraps vite-plugin-pwa's registerSW() (see index.d.ts type in
// node_modules/vite-plugin-pwa for onNeedRefresh's exact semantics) so the
// UI can render its own update prompt instead of the update happening
// invisibly. registerSW() must only be called once per page load — this
// hook is meant to be used from exactly one place (App.tsx).
export const usePwaUpdate = (): PwaUpdateState => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateAvailable(true);
      },
    });
  }, []);

  const applyUpdate = () => {
    setUpdating(true);
    updateSWRef.current?.(true);
  };

  return { updateAvailable, updating, applyUpdate };
};
