
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
