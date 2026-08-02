import React, { useRef, useState } from 'react';
import { XIcon, MicIcon, StopCircleIcon, WarningIcon, UploadIcon } from './icons';
import Spinner from './Spinner';
import type { VoiceNoteState, useVoiceNotePipeline } from '../hooks/useVoiceNotePipeline';

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

const ProgressBar: React.FC<{ fraction: number }> = ({ fraction }) => (
  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
    <div
      className="h-full bg-accent transition-[width] duration-200 ease-apple"
      style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
    />
  </div>
);

const VoiceNoteModal: React.FC<VoiceNoteModalProps> = ({ isOpen, onClose, state, actions }) => {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const { stage, inputMode, elapsedSeconds, processingPhase, totalSegments, completedSegments, currentUploadFraction, errorMessage } = state;
  const isBusy = stage === 'recording' || stage === 'processing';

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

  const renderBody = () => {
    switch (stage) {
      case 'idle':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex rounded-full bg-secondary p-1 mb-6" role="tablist" aria-label="語音來源">
              <button
                role="tab"
                aria-selected={inputMode === 'record'}
                onClick={() => actions.setInputMode('record')}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                  inputMode === 'record' ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
                }`}
              >
                錄音
              </button>
              <button
                role="tab"
                aria-selected={inputMode === 'upload'}
                onClick={() => actions.setInputMode('upload')}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                  inputMode === 'upload' ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
                }`}
              >
                上傳檔案
              </button>
            </div>

            {inputMode === 'record' ? (
              <>
                <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                  錄下你想整理的內容，AI 會自動轉成逐字稿並生成一篇結構化的筆記。長時間錄音會自動分段即時轉錄，錄多久都不怕。
                </p>
                <button
                  onClick={() => actions.startRecording()}
                  className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center shadow-apple-md hover:opacity-90 active:scale-95 transition-all duration-150 ease-apple"
                  title="開始錄音"
                  aria-label="開始錄音"
                >
                  <MicIcon className="w-7 h-7" />
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                  上傳一段錄音檔案，AI 會自動轉成逐字稿並生成一篇結構化的筆記。
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
                    isDraggingFile ? 'border-accent bg-accent/5' : 'border-border-color hover:border-accent/50'
                  }`}
                >
                  <UploadIcon className="w-6 h-6 mx-auto mb-2 text-text-secondary" />
                  <p className="text-sm text-text-main font-medium">點擊或拖曳音檔到這裡</p>
                  <p className="text-xs text-text-secondary mt-1">支援 mp3、wav、m4a、webm 等常見格式，超過 25 MB 會自動分段處理</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                  aria-label="選擇音訊檔案"
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
            {completedSegments > 0 && (
              <p className="text-xs text-text-secondary mb-4">背景已即時轉錄 {completedSegments} 段，繼續錄音中...</p>
            )}
            <button
              onClick={() => actions.stopRecording()}
              className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-apple-md hover:opacity-90 active:scale-95 transition-all duration-150 ease-apple mt-2"
              title="停止並生成筆記"
              aria-label="停止並生成筆記"
            >
              <StopCircleIcon className="w-7 h-7" />
            </button>
            <button
              onClick={() => actions.cancel()}
              className="mt-5 text-xs text-text-secondary hover:text-text-main transition-colors duration-150 ease-apple"
            >
              取消並捨棄這段錄音
            </button>
          </div>
        );
      case 'processing': {
        const showSegmentProgress = processingPhase === 'transcribing' && totalSegments > 1;
        const showUploadProgress = processingPhase === 'uploading';
        const segmentFraction = totalSegments > 0 ? (completedSegments + currentUploadFraction) / totalSegments : 0;

        let label = 'AI 正在整理筆記內容...';
        if (processingPhase === 'splitting') label = '檔案較大，正在自動分段處理...';
        else if (processingPhase === 'uploading') label = '正在上傳音檔...';
        else if (processingPhase === 'transcribing') {
          label = showSegmentProgress
            ? `正在轉錄語音（${completedSegments} / ${totalSegments} 段）...`
            : 'AI 正在辨識語音內容...';
        }

        return (
          <div className="flex flex-col items-center text-center py-6">
            {showUploadProgress || showSegmentProgress ? (
              <div className="w-full mb-4">
                <ProgressBar fraction={showUploadProgress ? currentUploadFraction : segmentFraction} />
              </div>
            ) : (
              <Spinner className="w-8 h-8 text-accent mb-4" />
            )}
            <p className="text-sm font-medium text-text-main mb-1">{label}</p>
            <p className="text-xs text-text-secondary">
              {elapsedSeconds > 0 ? `錄音長度 ${formatDuration(elapsedSeconds)}，` : ''}請稍候，這可能需要幾秒到十幾秒不等。
            </p>
            <button
              onClick={() => actions.cancel()}
              className="mt-5 text-xs text-text-secondary hover:text-text-main transition-colors duration-150 ease-apple"
            >
              取消
            </button>
          </div>
        );
      }
      case 'error':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
              <WarningIcon className="w-5 h-5" />
            </div>
            <p className="text-sm text-text-main mb-6 leading-relaxed">{errorMessage}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-full text-text-secondary hover:bg-secondary transition-all duration-150 ease-apple active:scale-95"
              >
                關閉
              </button>
              <button
                onClick={() => actions.retry()}
                className="px-4 py-2 text-sm font-medium rounded-full bg-accent text-white hover:opacity-90 transition-all duration-150 ease-apple active:scale-95"
              >
                重試
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-[420px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-note-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple"
          title={isBusy ? '縮小到背景（不中斷）' : '關閉'}
          aria-label={isBusy ? '縮小到背景' : '關閉'}
        >
          <XIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <MicIcon className="w-5 h-5" />
          </div>
          <h2 id="voice-note-modal-title" className="text-xl font-semibold text-text-main">語音筆記</h2>
        </div>

        {isBusy && (
          <p className="text-xs text-text-secondary text-center -mt-1 mb-1">可以縮小視窗，繼續瀏覽其他筆記</p>
        )}

        {renderBody()}
      </div>
    </div>
  );
};

export default VoiceNoteModal;
