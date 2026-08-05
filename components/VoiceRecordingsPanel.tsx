import React, { useEffect, useState } from 'react';
import { ExportIcon, TrashIcon } from './icons';
import type { StoredVoiceRecording } from '../services/voiceRecordingStorage';
import { extensionForMimeType } from '../services/groqTranscriptionService';
import { downloadBlob } from '../utils/downloadBlob';
import { useTranslation } from '../contexts/LanguageContext';

interface VoiceRecordingsPanelProps {
  // null while the initial storage read is still in flight.
  voiceRecordingsBytes: number | null;
  onListVoiceRecordings: () => Promise<StoredVoiceRecording[]>;
  onDeleteVoiceRecording: (noteId: string) => Promise<void>;
  onClearVoiceRecordings: () => void;
  // A stored recording's note may since have been deleted or renamed —
  // undefined means "no longer exists".
  getNoteTitle: (noteId: string) => string | undefined;
  onSelectNote: (noteId: string) => void;
}

const formatMB = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// A stored recording's segments are downloaded as a single file — same
// "concatenate only when there's more than one" approach used elsewhere,
// since these are always plain audio (video is never persisted here).
const downloadStoredAudio = (recording: StoredVoiceRecording) => {
  const mimeType = recording.segments[0]?.type || 'audio/webm';
  const blob = recording.segments.length === 1
    ? recording.segments[0]
    : new Blob(recording.segments, { type: mimeType });
  downloadBlob(blob, `voice-note-${recording.noteId}.${extensionForMimeType(mimeType)}`);
};

// Prefers the `[MM:SS] text` timestamped format; recordings saved before
// that field existed fall back to the plain transcript.
const downloadTranscript = (recording: StoredVoiceRecording) => {
  const content = recording.timestampedTranscript || recording.transcript;
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `voice-note-${recording.noteId}-transcript.txt`);
};

// Browsable list of everything saved by useVoiceRecordingsStorage — lives in
// the Sidebar (not Settings) because it's content to browse through, not
// configuration, and can grow long enough that it needs its own scrollable
// tab rather than being squeezed into a small centered dialog.
const VoiceRecordingsPanel: React.FC<VoiceRecordingsPanelProps> = ({
  voiceRecordingsBytes,
  onListVoiceRecordings,
  onDeleteVoiceRecording,
  onClearVoiceRecordings,
  getNoteTitle,
  onSelectNote,
}) => {
  const { t } = useTranslation();
  // null while the initial list read is still in flight.
  const [recordings, setRecordings] = useState<StoredVoiceRecording[] | null>(null);

  const refreshRecordings = () => {
    onListVoiceRecordings()
      .then(list => setRecordings(list.sort((a, b) => b.createdAt - a.createdAt)))
      .catch(error => console.error('Failed to list voice recordings:', error));
  };

  useEffect(() => {
    refreshRecordings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (noteId: string) => {
    if (!confirm(t('voiceRecordings.deleteConfirm'))) return;
    await onDeleteVoiceRecording(noteId);
    refreshRecordings();
  };

  const handleClearAll = () => {
    if (!confirm(t('voiceRecordings.clearAllConfirm'))) return;
    onClearVoiceRecordings();
    setRecordings([]);
  };

  return (
    <div className="h-full bg-primary text-text-secondary text-sm flex flex-col">
      <div className="flex-grow overflow-y-auto px-2.5 pt-2 pb-2">
        <div className="flex items-center justify-between gap-3 px-1 py-2 mb-2">
          <span className="text-xs">{t('voiceRecordings.storageUsed')}</span>
          <span className="text-xs font-medium text-text-main tabular-nums">
            {voiceRecordingsBytes === null ? t('common.loading') : formatMB(voiceRecordingsBytes)}
          </span>
        </div>

        {recordings === null ? (
          <p className="text-xs text-text-secondary px-1">{t('common.loading')}</p>
        ) : recordings.length === 0 ? (
          <p className="text-xs text-text-secondary px-1 leading-relaxed">
            {t('voiceRecordings.empty')}
          </p>
        ) : (
          <div className="space-y-2">
            {recordings.map(rec => {
              const title = getNoteTitle(rec.noteId);
              return (
                <div key={rec.noteId} className="p-3 bg-secondary rounded-xl">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => title && onSelectNote(rec.noteId)}
                      disabled={!title}
                      className="text-sm font-medium text-text-main truncate text-left hover:underline disabled:no-underline disabled:cursor-default"
                      title={title ? t('voiceRecordings.goToNote') : undefined}
                    >
                      {title ?? t('voiceRecordings.noteDeleted')}
                    </button>
                    <span className="text-xs text-text-secondary flex-shrink-0 tabular-nums">{formatMB(rec.totalBytes)}</span>
                  </div>
                  {rec.transcript && (
                    <p className="text-xs text-text-secondary line-clamp-3 mb-2 leading-relaxed">{rec.transcript}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => downloadStoredAudio(rec)}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <ExportIcon className="w-3.5 h-3.5" />
                      {t('voiceRecordings.downloadAudio')}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTranscript(rec)}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <ExportIcon className="w-3.5 h-3.5" />
                      {t('voiceRecordings.downloadTranscript')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rec.noteId)}
                      className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      {t('voiceRecordings.delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {recordings !== null && recordings.length > 0 && (
        <div className="flex-shrink-0 px-2.5 py-2 border-t border-border-color">
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-2 text-xs text-red-500 hover:text-red-400 transition-colors duration-150 ease-apple"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            {t('voiceRecordings.clearAll')}
          </button>
        </div>
      )}
    </div>
  );
};

export default VoiceRecordingsPanel;
