
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
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

// #initial-loader (index.html) is static markup shown before any JS has
// even parsed, so a reload always reads as "yes, this is actually
// reloading" instead of the page just silently sitting there — this app
// loads too fast off the service worker's precache for that to be visible
// on its own. MIN_VISIBLE_MS enforces a floor so it can't flash by
// unnoticed even when React mounts almost instantly; the double rAF waits
// until after the real tree has actually painted before starting the fade,
// rather than merely after render() returns.
const MIN_VISIBLE_MS = 250;
const loaderShownAt = performance.now();
requestAnimationFrame(() => requestAnimationFrame(() => {
  const loader = document.getElementById('initial-loader');
  if (!loader) return;
  const remaining = MIN_VISIBLE_MS - (performance.now() - loaderShownAt);
  setTimeout(() => {
    loader.classList.add('is-hidden');
    loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  }, Math.max(0, remaining));
}));
