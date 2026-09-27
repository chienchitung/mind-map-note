import React from 'react';
import { RestartIcon } from './icons';
import Spinner from './Spinner';
import { useTranslation } from '../contexts/LanguageContext';

interface UpdateAvailablePillProps {
  updating: boolean;
  onClick: () => void;
  // VoiceNoteStatusPill occupies the same bottom-left corner — shift up
  // above it instead of overlapping when both are visible at once.
  stackedAboveVoicePill?: boolean;
}

// Shown bottom-left (see App.tsx) once usePwaUpdate reports a new version
// is installed and waiting — clicking it is what actually activates the
// new service worker and reloads the page; nothing happens on its own
// until the user asks for it (registerType: 'prompt' in vite.config.ts).
const UpdateAvailablePill: React.FC<UpdateAvailablePillProps> = ({ updating, onClick, stackedAboveVoicePill }) => {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      disabled={updating}
      className={`glass-surface-solid fixed ${stackedAboveVoicePill ? 'bottom-[4.75rem]' : 'bottom-4'} left-4 z-40 flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full shadow-apple-md border border-border-color/70 hover:shadow-apple-lg transition-all duration-150 ease-apple active:scale-95 disabled:active:scale-100 animate-pwa-update-in`}
      title={t('pwaUpdate.tooltip')}
      aria-label={t('pwaUpdate.tooltip')}
    >
      <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
        {updating ? <Spinner className="w-3.5 h-3.5" /> : <RestartIcon className="w-3.5 h-3.5" />}
      </div>
      <span className="text-sm font-medium text-text-main">
        {updating ? t('pwaUpdate.updating') : t('pwaUpdate.available')}
      </span>
    </button>
  );
};

export default UpdateAvailablePill;
