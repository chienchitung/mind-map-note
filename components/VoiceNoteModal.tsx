import React, { useEffect, useRef, useState } from 'react';
import { XIcon, MicIcon, StopCircleIcon, WarningIcon, UploadIcon, ExportIcon } from './icons';
import Spinner from './Spinner';
import type { VoiceNoteState, useVoiceNotePipeline } from '../hooks/useVoiceNotePipeline';
import { useTranslation } from '../contexts/LanguageContext';

type VoiceNoteActions = ReturnType<typeof useVoiceNotePipeline>['actions'];

interface VoiceNoteModalProps {
  isOpen: boolean;
  // Always just hides the modal — it never cancels an active recording or
  // in-flight transcription/generation, which keeps running in the
  // background via the hook that owns this state (see useVoiceNotePipeline
  // in App.tsx). Use the in-modal "cancel" action to actually abort.
  onClose: () => void;
  state: VoiceNoteState;
  actions: VoiceNoteActions;
}

const formatDuration = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// getDisplayMedia (tab/window/screen sharing) has inconsistent support
// outside Chromium browsers — detected once here so the checkbox that
// depends on it can be disabled with an explanation instead of silently
// doing nothing when clicked.
const isDisplayCaptureSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

const ProgressBar: React.FC<{ fraction: number }> = ({ fraction }) => (
  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
    <div
      className="h-full bg-accent transition-[width] duration-200 ease-apple"
      style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
    />
  </div>
);

const VoiceNoteModal: React.FC<VoiceNoteModalProps> = ({ isOpen, onClose, state, actions }) => {
  const { t } = useTranslation();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [captureTabAudio, setCaptureTabAudio] = useState(false);
  const [captureVideo, setCaptureVideo] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { stage } = state;
  useEffect(() => { setShowDiscardConfirm(false); }, [stage]);

  if (!isOpen) return null;

  const {
    inputMode, elapsedSeconds, processingPhase, totalSegments, completedSegments, currentUploadFraction,
    errorMessage, rateLimitRetrySeconds, hasVideo, canDownload, previewUrl, awaitingVideoReview,
  } = state;
  const isBusy = stage === 'recording' || stage === 'processing';
  const kind = hasVideo ? t('voiceNote.kindVideo') : t('voiceNote.kindAudio');
  const downloadKindLabel = hasVideo ? t('voiceNote.downloadVideoKind') : t('voiceNote.downloadAudioKind');

  const DownloadButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
      onClick={onClick}
      className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-all duration-150 ease-apple active:scale-95"
    >
      <ExportIcon className="w-3.5 h-3.5" />
      {t('voiceNote.downloadKind', { kind: downloadKindLabel })}
    </button>
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (file) actions.selectFile(file);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) actions.selectFile(file);
  };

  const renderDiscardConfirm = (label: string) => (
    <div className="flex flex-col items-center gap-2 mt-5">
      <p className="text-xs text-text-secondary">{label}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDiscardConfirm(false)}
          className="px-3 py-1.5 text-xs font-medium rounded-full text-text-secondary hover:bg-secondary transition-all duration-150 ease-apple active:scale-95"
        >
          {t('voiceNote.keep')}
        </button>
        <button
          onClick={() => { setShowDiscardConfirm(false); actions.cancel(); }}
          className="px-3 py-1.5 text-xs font-medium rounded-full bg-red-500 text-white hover:opacity-90 transition-all duration-150 ease-apple active:scale-95"
        >
          {t('voiceNote.confirmDiscard')}
        </button>
      </div>
    </div>
  );

  const renderBody = () => {
    switch (stage) {
      case 'idle':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex rounded-full bg-secondary p-1 mb-6" role="tablist" aria-label={t('voiceNote.sourceTabs')}>
              <button
                role="tab"
                aria-selected={inputMode === 'record'}
                onClick={() => actions.setInputMode('record')}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                  inputMode === 'record' ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
                }`}
              >
                {t('voiceNote.tabRecord')}
              </button>
              <button
                role="tab"
                aria-selected={inputMode === 'upload'}
                onClick={() => actions.setInputMode('upload')}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                  inputMode === 'upload' ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
                }`}
              >
                {t('voiceNote.tabUpload')}
              </button>
            </div>

            {inputMode === 'record' ? (
              <>
                <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                  {t('voiceNote.recordDescription')}
                </p>
                <div className="w-full mb-4 text-left">
                  <label className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
                    <input
                      type="checkbox"
                      className="mt-0.5 flex-shrink-0"
                      checked={captureTabAudio}
                      disabled={!isDisplayCaptureSupported}
                      onChange={(e) => {
                        setCaptureTabAudio(e.target.checked);
                        if (!e.target.checked) setCaptureVideo(false);
                      }}
                    />
                    <span>{t('voiceNote.captureTabAudio')}</span>
                  </label>
                  {!isDisplayCaptureSupported && (
                    <p className="text-[11px] text-text-secondary/70 mt-0.5 pl-5">{t('voiceNote.captureTabAudioUnsupported')}</p>
                  )}
                  {captureTabAudio && isDisplayCaptureSupported && (
                    <label className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed mt-2">
                      <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={captureVideo} onChange={(e) => setCaptureVideo(e.target.checked)} />
                      <span>{t('voiceNote.captureVideo')}</span>
                    </label>
                  )}
                </div>
                <button
                  onClick={() => actions.startRecording({ captureTabAudio, captureVideo })}
                  className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center shadow-apple-md hover:opacity-90 active:scale-95 transition-all duration-150 ease-apple"
                  title={t('voiceNote.startRecording')}
                  aria-label={t('voiceNote.startRecording')}
                >
                  <MicIcon className="w-7 h-7" />
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                  {t('voiceNote.uploadDescription')}
                </p>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={handleFileDrop}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                  className={`w-full border-2 border-dashed rounded-2xl py-8 px-4 cursor-pointer transition-colors duration-150 ease-apple ${
                    isDraggingFile
                      ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]'
                      : 'border-border-color hover:border-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]'
                  }`}
                >
                  <UploadIcon className="w-6 h-6 mx-auto mb-2 text-text-secondary" />
                  <p className="text-sm text-text-main font-medium">{t('voiceNote.dropzoneTitle')}</p>
                  <p className="text-xs text-text-secondary mt-1">{t('voiceNote.dropzoneHint')}</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                  aria-label={t('voiceNote.selectFile')}
                />
              </>
            )}
          </div>
        );
      case 'recording':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-2xl font-semibold tabular-nums text-text-main">{formatDuration(elapsedSeconds)}</span>
            </div>
            {hasVideo && <p className="text-xs text-text-secondary mb-1">{t('voiceNote.recordingVideoHint')}</p>}
            {completedSegments > 0 && (
              <p className="text-xs text-text-secondary mb-4">{t('voiceNote.backgroundTranscribed', { count: completedSegments })}</p>
            )}
            <button
              onClick={() => actions.stopRecording()}
              className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-apple-md hover:opacity-90 active:scale-95 transition-all duration-150 ease-apple mt-2"
              title={t('voiceNote.stopAndGenerate')}
              aria-label={t('voiceNote.stopAndGenerate')}
            >
              <StopCircleIcon className="w-7 h-7" />
            </button>
            {showDiscardConfirm ? (
              renderDiscardConfirm(t('voiceNote.discardRecordingConfirm', { kind }))
            ) : (
              <button
                onClick={() => setShowDiscardConfirm(true)}
                className="mt-5 text-xs text-text-secondary hover:text-text-main transition-colors duration-150 ease-apple"
              >
                {t('voiceNote.discardAndCancel')}
              </button>
            )}
          </div>
        );
      case 'processing': {
        if (awaitingVideoReview) {
          return (
            <div className="flex flex-col items-center text-center py-6">
              {previewUrl ? (
                <video src={previewUrl} controls className="w-full max-h-48 rounded-lg mb-4 bg-black" />
              ) : (
                <Spinner className="w-8 h-8 text-accent mb-4" />
              )}
              <p className="text-sm font-medium text-text-main mb-1">{t('voiceNote.recordingComplete')}</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {t('voiceNote.reviewVideoHint')}
              </p>
              <div className="flex items-center gap-2 mt-4">
                {canDownload && (
                  <button
                    onClick={() => actions.downloadRecording()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full text-text-secondary hover:bg-secondary transition-all duration-150 ease-apple active:scale-95"
                  >
                    <ExportIcon className="w-4 h-4" />
                    {t('voiceNote.downloadVideo')}
                  </button>
                )}
                <button
                  onClick={() => actions.confirmVideoReviewed()}
                  className="px-4 py-2 text-sm font-medium rounded-full bg-accent text-white hover:opacity-90 transition-all duration-150 ease-apple active:scale-95"
                >
                  {t('voiceNote.continueGenerating')}
                </button>
              </div>
              {showDiscardConfirm ? (
                renderDiscardConfirm(t('voiceNote.discardRecordingConfirm', { kind: t('voiceNote.kindVideo') }))
              ) : (
                <button
                  onClick={() => setShowDiscardConfirm(true)}
                  className="mt-5 text-xs text-text-secondary hover:text-text-main transition-colors duration-150 ease-apple"
                >
                  {t('voiceNote.discardOnly')}
                </button>
              )}
            </div>
          );
        }

        const showSegmentProgress = processingPhase === 'transcribing' && totalSegments > 1;
        const showUploadProgress = processingPhase === 'uploading';
        const segmentFraction = totalSegments > 0 ? (completedSegments + currentUploadFraction) / totalSegments : 0;

        let label = t('voiceNote.generatingLabel');
        if (processingPhase === 'splitting') label = hasVideo ? t('voiceNote.extractingAudio') : t('voiceNote.splittingFile');
        else if (processingPhase === 'uploading') label = t('voiceNote.uploadingAudio');
        else if (processingPhase === 'transcribing') {
          label = showSegmentProgress
            ? t('voiceNote.transcribingSegments', { completed: completedSegments, total: totalSegments })
            : t('voiceNote.transcribing');
        }

        if (rateLimitRetrySeconds !== null) {
          label = totalSegments > 1
            ? t('voiceNote.rateLimitMultiSegment', { seconds: rateLimitRetrySeconds, completed: completedSegments, total: totalSegments })
            : t('voiceNote.rateLimitSingle', { seconds: rateLimitRetrySeconds });
        }

        return (
          <div className="flex flex-col items-center text-center py-6">
            {hasVideo && previewUrl && (
              <video src={previewUrl} controls className="w-full max-h-40 rounded-lg mb-4 bg-black" />
            )}
            {showUploadProgress || showSegmentProgress ? (
              <div className="w-full mb-4">
                <ProgressBar fraction={showUploadProgress ? currentUploadFraction : segmentFraction} />
              </div>
            ) : (
              <Spinner className="w-8 h-8 text-accent mb-4" />
            )}
            <p className="text-sm font-medium text-text-main mb-1">{label}</p>
            <p className="text-xs text-text-secondary">
              {elapsedSeconds > 0 ? t('voiceNote.recordingLengthPrefix', { duration: formatDuration(elapsedSeconds) }) : ''}{t('voiceNote.pleaseWait')}
            </p>
            {canDownload && <DownloadButton onClick={() => actions.downloadRecording()} />}
            {showDiscardConfirm ? (
              renderDiscardConfirm(t('voiceNote.discardCancelRecordingConfirm', { kind }))
            ) : (
              <button
                onClick={() => setShowDiscardConfirm(true)}
                className="mt-5 text-xs text-text-secondary hover:text-text-main transition-colors duration-150 ease-apple"
              >
                {t('voiceNote.cancel')}
              </button>
            )}
          </div>
        );
      }
      case 'error':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
              <WarningIcon className="w-5 h-5" />
            </div>
            <p className="text-sm text-text-main mb-2 leading-relaxed">{errorMessage}</p>
            {canDownload && <DownloadButton onClick={() => actions.downloadRecording()} />}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-full text-text-secondary hover:bg-secondary transition-all duration-150 ease-apple active:scale-95"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => actions.retry()}
                className="px-4 py-2 text-sm font-medium rounded-full bg-accent text-white hover:opacity-90 transition-all duration-150 ease-apple active:scale-95"
              >
                {t('common.retry')}
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-note-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple"
          title={isBusy ? t('voiceNote.minimizeBackground') : t('common.close')}
          aria-label={isBusy ? t('voiceNote.minimize') : t('common.close')}
        >
          <XIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <MicIcon className="w-5 h-5" />
          </div>
          <h2 id="voice-note-modal-title" className="text-xl font-semibold text-text-main">{t('voiceNote.title')}</h2>
        </div>

        {isBusy && (
          <p className="text-xs text-text-secondary text-center -mt-1 mb-1">{t('voiceNote.canMinimizeHint')}</p>
        )}

        {renderBody()}
      </div>
    </div>
  );
};

export default VoiceNoteModal;
