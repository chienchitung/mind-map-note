import React from 'react';
import { WarningIcon, XIcon } from './icons';

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

// A single persistent warning toast, anchored bottom-center — used for
// conditions the user needs to notice but that don't block interaction
// (e.g. storage writes silently failing in the background).
const Toast: React.FC<ToastProps> = ({ message, onDismiss }) => (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md">
    <div className="glass-surface flex items-start gap-3 border border-border-color/70 rounded-2xl shadow-apple-lg px-4 py-3 text-text-main">
      <WarningIcon className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
      <p className="flex-grow text-sm leading-snug">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="關閉提示"
        title="關閉"
        className="flex-shrink-0 p-1 -m-1 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  </div>
);

export default Toast;
