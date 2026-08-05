import React from 'react';
import { MicIcon } from './icons';
import Spinner from './Spinner';
import type { VoiceNoteState } from '../hooks/useVoiceNotePipeline';
import { useTranslation } from '../contexts/LanguageContext';

interface VoiceNoteStatusPillProps {
  state: VoiceNoteState;
  onClick: () => void;
}

const formatDuration = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// A small persistent indicator shown once the voice note modal is
// minimized (or was never reopened) while a recording or the
// transcribe/generate pipeline is still running in the background — lets
// the user keep browsing other notes without losing track of it, and
// click back in at any time. Only rendered by App.tsx while stage !== 'idle'.
const VoiceNoteStatusPill: React.FC<VoiceNoteStatusPillProps> = ({ state, onClick }) => {
  const { t } = useTranslation();
  const { stage, elapsedSeconds, processingPhase, totalSegments, completedSegments, rateLimitRetrySeconds, hasVideo, awaitingVideoReview } = state;

  let label = t('voicePill.processing');
  if (stage === 'recording') {
    label = hasVideo
      ? t('voicePill.recordingVideo', { duration: formatDuration(elapsedSeconds) })
      : t('voicePill.recordingAudio', { duration: formatDuration(elapsedSeconds) });
  } else if (stage === 'processing') {
    if (awaitingVideoReview) {
      label = t('voicePill.awaitingVideoReview');
    } else if (processingPhase === 'splitting') label = hasVideo ? t('voicePill.extractingAudio') : t('voicePill.splitting');
    else if (processingPhase === 'uploading') label = t('voicePill.uploading');
    else if (processingPhase === 'transcribing') {
      label = totalSegments > 1 ? t('voicePill.transcribingSegments', { completed: completedSegments, total: totalSegments }) : t('voicePill.transcribing');
    } else if (processingPhase === 'generating') {
      label = t('voicePill.generating');
    }
    if (!awaitingVideoReview && rateLimitRetrySeconds !== null) {
      label = t('voicePill.rateLimited', { seconds: rateLimitRetrySeconds });
    }
  } else if (stage === 'error') {
    label = t('voicePill.error');
  }

  return (
    <button
      onClick={onClick}
      className="glass-surface-solid fixed bottom-4 left-4 z-40 flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full shadow-apple-md border border-border-color/70 hover:shadow-apple-lg transition-all duration-150 ease-apple active:scale-95"
      title={t('voicePill.backToVoiceNote')}
      aria-label={t('voicePill.backToVoiceNoteWithLabel', { label })}
    >
      <div className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
        {stage === 'recording' ? (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        ) : stage === 'error' ? (
          <MicIcon className="w-3.5 h-3.5" />
        ) : (
          <Spinner className="w-3.5 h-3.5" />
        )}
      </div>
      <span className="text-sm font-medium text-text-main tabular-nums">{label}</span>
    </button>
  );
};

export default VoiceNoteStatusPill;
