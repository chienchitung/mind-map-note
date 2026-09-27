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

// The browser's own update check only runs when registerSW() is called —
// i.e. once per page load. A tab that's never reloaded (no F5, never
// closed and reopened) would otherwise sit there indefinitely without
// ever noticing a new deploy, since nothing here polls on its own
// otherwise. This re-asks the browser to check on an interval so a
// long-lived tab still surfaces the update prompt within a bounded time,
// without the user needing to do anything.
const UPDATE_CHECK_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes

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
    let intervalId: number | undefined;
    let registrationRef: ServiceWorkerRegistration | undefined;

    const checkForUpdate = () => {
      // A hidden/backgrounded tab has no one around to act on a prompt
      // yet anyway, and re-checking dozens of idle background tabs at
      // once is wasted network activity — skip this tick and let the
      // next one (or the check on becoming visible again) cover it.
      if (document.visibilityState !== 'visible') return;
      registrationRef?.update().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    updateSWRef.current = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateAvailable(true);
      },
      onRegisteredSW(_swScriptUrl, registration) {
        registrationRef = registration;
        intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      },
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  const applyUpdate = () => {
    setUpdating(true);
    updateSWRef.current?.(true);
  };

  return { updateAvailable, updating, applyUpdate };
};
