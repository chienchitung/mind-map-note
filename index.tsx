
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider } from './contexts/LanguageContext';
import './index.css';

// Lazy-loaded chunks (RichTextEditor, AIPanel) are fetched by the exact
// filename — including its content hash — the currently-loaded index.html
// was built with. Deploying a new version replaces those files on the
// server, so a tab left open across a deploy fails with "Failed to fetch
// dynamically imported module" the moment it tries to load one. Vite fires
// this event specifically for that case; reloading re-fetches index.html
// and its now-current chunk references, which normally clears it right up.
// Guarded to only auto-reload once per tab session, in case reloading
// somehow doesn't help (e.g. genuinely offline) — better to fall through to
// the ErrorBoundary than loop forever.
window.addEventListener('vite:preloadError', () => {
  const guardKey = 'mind-map-reloaded-after-preload-error';
  if (sessionStorage.getItem(guardKey)) return;
  sessionStorage.setItem(guardKey, '1');
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
