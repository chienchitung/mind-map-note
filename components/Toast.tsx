import React from 'react';
import { WarningIcon, CheckIcon, XIcon } from './icons';

interface ToastProps {
  message: string;
  variant?: 'warning' | 'success';
  onDismiss: () => void;
}

// A single toast row — stateless, no fixed positioning of its own, so
// multiple can stack inside one positioned wrapper (see App.tsx).
const Toast: React.FC<ToastProps> = ({ message, variant = 'warning', onDismiss }) => (
  <div className="glass-surface flex items-start gap-3 border border-border-color/70 rounded-2xl shadow-apple-lg px-4 py-3 text-text-main">
    {variant === 'success' ? (
      <CheckIcon className="w-5 h-5 flex-shrink-0 text-green-500 mt-0.5" />
    ) : (
      <WarningIcon className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
    )}
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
);

export default Toast;
