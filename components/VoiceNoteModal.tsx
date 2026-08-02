import React, { useState, useRef, useEffect } from 'react';
import { XIcon, MicIcon, StopCircleIcon, WarningIcon } from './icons';
import Spinner from './Spinner';

interface VoiceNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  groqApiKey: string;
  geminiApiKey: string;
  onNoteGenerated: (markdown: string) => void;
}

type Stage = 'idle' | 'recording' | 'transcribing' | 'generating' | 'error';

const formatDuration = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Preferred first — MediaRecorder support (and which of these it accepts)
// varies by browser, so this is checked at record-start time and the first
// one the browser actually supports is used.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const pickSupportedMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported?.(type));
};

const VoiceNoteModal: React.FC<VoiceNoteModalProps> = ({ isOpen, onClose, groqApiKey, geminiApiKey, onNoteGenerated }) => {
  const [stage, setStage] = useState<Stage>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const discardRef = useRef(false);
  // Guards the async transcribe/generate chain against updating state (or
  // creating a note) after the modal has already been closed mid-flight.
  const cancelledRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  // Reset to a clean slate every time the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      cancelledRef.current = false;
      discardRef.current = false;
      setStage('idle');
      setElapsedSeconds(0);
      setTranscript('');
      setErrorMessage('');
      chunksRef.current = [];
    }
  }, [isOpen]);

  // Release the mic and abort any in-flight request the moment the modal
  // closes (or unmounts) mid-flow, no matter which stage it was in —
  // otherwise a recording keeps the mic indicator on, or a stale response
  // arrives after the fact and tries to create a note nobody asked for.
  useEffect(() => {
    if (!isOpen) return;
    return () => {
      cancelledRef.current = true;
      stopTimer();
      releaseStream();
      abortControllerRef.current?.abort();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
    };
  }, [isOpen]);

  const handleStartRecording = async () => {
    setErrorMessage('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStage('error');
      setErrorMessage('這個瀏覽器不支援錄音功能，請改用最新版的 Chrome、Edge 或 Safari。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        releaseStream();
        const wasDiscarded = discardRef.current;
        const capturedMimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: capturedMimeType });
        chunksRef.current = [];
        if (wasDiscarded || cancelledRef.current) {
          if (!cancelledRef.current) {
            setStage('idle');
            setElapsedSeconds(0);
          }
          return;
        }
        void runPipeline(audioBlob, capturedMimeType);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStage('recording');
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      releaseStream();
      setStage('error');
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setErrorMessage('麥克風權限被拒絕，請至瀏覽器設定允許存取麥克風後再試一次。');
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setErrorMessage('找不到可用的麥克風裝置。');
      } else {
        setErrorMessage('無法啟動錄音，請確認麥克風已連接並授權存取。');
      }
    }
  };

  const runPipeline = async (audioBlob: Blob, mimeType: string) => {
    setStage('transcribing');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const [{ transcribeAudio, MissingGroqApiKeyError }, { generateNoteFromTranscript, MissingApiKeyError }, { normalizeAiMarkdown }] = await Promise.all([
        import('../services/groqTranscriptionService'),
        import('../services/geminiChatService'),
        import('../utils/normalizeAiMarkdown'),
      ]);

      let transcriptText: string;
      try {
        transcriptText = await transcribeAudio(audioBlob, mimeType, groqApiKey, controller.signal);
      } catch (error) {
        if (cancelledRef.current) return;
        if (error instanceof MissingGroqApiKeyError) {
          setStage('error');
          setErrorMessage(error.message);
          return;
        }
        throw error;
      }
      if (cancelledRef.current) return;
      setTranscript(transcriptText);
      setStage('generating');

      let noteMarkdown: string;
      try {
        noteMarkdown = await generateNoteFromTranscript(transcriptText, geminiApiKey);
      } catch (error) {
        if (cancelledRef.current) return;
        if (error instanceof MissingApiKeyError) {
          setStage('error');
          setErrorMessage('尚未設定 Gemini API 金鑰，請至設定頁面新增。');
          return;
        }
        throw error;
      }
      if (cancelledRef.current) return;

      onNoteGenerated(normalizeAiMarkdown(noteMarkdown));
      onClose();
    } catch (error) {
      if (cancelledRef.current) return;
      console.error('Voice note pipeline failed:', error);
      setStage('error');
      setErrorMessage(error instanceof Error ? error.message : '發生未知的錯誤，請再試一次。');
    }
  };

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    stopTimer();
    discardRef.current = false;
    recorder.stop(); // triggers the onstop handler wired up in handleStartRecording
  };

  const handleDiscardRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    stopTimer();
    discardRef.current = true;
    recorder.stop(); // same onstop handler, but it sees discardRef and skips the pipeline
  };

  if (!isOpen) return null;

  const renderBody = () => {
    switch (stage) {
      case 'idle':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <p className="text-sm text-text-secondary mb-6 leading-relaxed">
              錄下你想整理的內容，AI 會自動轉成逐字稿並生成一篇結構化的筆記。
            </p>
            <button
              onClick={handleStartRecording}
              className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center shadow-apple-md hover:opacity-90 active:scale-95 transition-all duration-150 ease-apple"
              title="開始錄音"
              aria-label="開始錄音"
            >
              <MicIcon className="w-7 h-7" />
            </button>
          </div>
        );
      case 'recording':
        return (
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-2xl font-semibold tabular-nums text-text-main">{formatDuration(elapsedSeconds)}</span>
            </div>
            <button
              onClick={handleStopRecording}
              className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-apple-md hover:opacity-90 active:scale-95 transition-all duration-150 ease-apple"
              title="停止並生成筆記"
              aria-label="停止並生成筆記"
            >
              <StopCircleIcon className="w-7 h-7" />
            </button>
            <button
              onClick={handleDiscardRecording}
              className="mt-5 text-xs text-text-secondary hover:text-text-main transition-colors duration-150 ease-apple"
            >
              取消並捨棄這段錄音
            </button>
          </div>
        );
      case 'transcribing':
      case 'generating':
        return (
          <div className="flex flex-col items-center text-center py-6">
            <Spinner className="w-8 h-8 text-accent mb-4" />
            <p className="text-sm font-medium text-text-main mb-1">
              {stage === 'transcribing' ? '正在轉錄語音為文字...' : 'AI 正在整理筆記內容...'}
            </p>
            <p className="text-xs text-text-secondary">請稍候，這可能需要幾秒到十幾秒不等。</p>
            {stage === 'generating' && transcript && (
              <div className="mt-5 w-full max-h-32 overflow-y-auto text-left text-xs text-text-secondary bg-secondary rounded-xl p-3 leading-relaxed">
                {transcript}
              </div>
            )}
          </div>
        );
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
                onClick={() => { setStage('idle'); setErrorMessage(''); }}
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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title="關閉 (Esc)" aria-label="關閉">
          <XIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <MicIcon className="w-5 h-5" />
          </div>
          <h2 id="voice-note-modal-title" className="text-xl font-semibold text-text-main">語音筆記</h2>
        </div>

        {renderBody()}
      </div>
    </div>
  );
};

export default VoiceNoteModal;
