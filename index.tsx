
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider } from './contexts/LanguageContext';
import './index.css';

// A deployment can remove hashed chunks that an already-open tab still
// references. Retry once for each entry bundle, so a second deployment in
// the same tab can recover too. If the same bundle fails again after reload,
// let ErrorBoundary show the error rather than entering a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const guardKey = 'mind-map-reloaded-after-preload-error';
  const entryUrl = import.meta.url;
  if (sessionStorage.getItem(guardKey) === entryUrl) return;
  sessionStorage.setItem(guardKey, entryUrl);
  event.preventDefault();
  window.location.reload();
});

// vite-plugin-pwa's `registerType: 'autoUpdate'` (vite.config.ts) only
// controls what gets baked into the service worker itself — the worker
// still just sits there installed-but-inactive until something on the
// client side actually asks it to check for and take over from a new
// version. Without this call, that "something" never happens: a plain
// reload is served straight from whichever service worker is already
// active, so it can look and feel like nothing happened, and a genuinely
// new deployment only shows up once some *unrelated* later navigation
// happens to be the one that wins the update race — hence needing several
// manual refreshes before a new version actually appears. Calling
// registerSW() (with no onNeedReload override) makes the registered worker
// check for updates on load and, once a new one activates, reload the page
// itself immediately, so a single refresh is enough.
registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
      <Analytics />
    </ErrorBoundary>
  </React.StrictMode>
);
