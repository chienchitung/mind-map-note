import React from 'react';
import { WarningIcon, CheckIcon, XIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface ToastProps {
  message: string;
  variant?: 'warning' | 'success';
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}

// A single toast row — stateless, no fixed positioning of its own, so
// multiple can stack inside one positioned wrapper (see App.tsx).
const Toast: React.FC<ToastProps> = ({ message, variant = 'warning', action, onDismiss }) => {
  const { t } = useTranslation();
  return (
    <div className="glass-surface-solid flex items-start gap-3 border border-border-color/70 rounded-2xl shadow-apple-lg px-4 py-3 text-text-main">
      {variant === 'success' ? (
        <CheckIcon className="w-5 h-5 flex-shrink-0 text-green-500 mt-0.5" />
      ) : (
        <WarningIcon className="w-5 h-5 flex-shrink-0 text-amber-500 mt-0.5" />
      )}
      <div className="flex-grow">
        <p className="text-sm leading-snug">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 px-3 py-1 rounded-full text-xs font-medium bg-accent text-white hover:opacity-90 transition-opacity duration-150 ease-apple"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label={t('toast.close')}
        title={t('toast.closeLabel')}
        className="flex-shrink-0 p-1 -m-1 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Toast;
