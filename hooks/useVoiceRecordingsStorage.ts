import { useCallback, useEffect, useState } from 'react';
import {
  saveVoiceRecording,
  deleteVoiceRecording,
  clearAllVoiceRecordings,
  getTotalVoiceRecordingsBytes,
} from '../services/voiceRecordingStorage';

export const useVoiceRecordingsStorage = () => {
  // null while the initial read is still in flight, distinguishing "not
  // loaded yet" from "zero bytes used" for the UI.
  const [totalBytes, setTotalBytes] = useState<number | null>(null);

  const refreshUsage = useCallback(async () => {
    try {
      setTotalBytes(await getTotalVoiceRecordingsBytes());
    } catch (error) {
      console.error('Failed to read voice recording storage usage:', error);
    }
  }, []);

  useEffect(() => { void refreshUsage(); }, [refreshUsage]);

  const saveRecording = useCallback(async (noteId: string, transcript: string, segments: Blob[]) => {
    await saveVoiceRecording(noteId, transcript, segments);
    void refreshUsage();
  }, [refreshUsage]);

  const deleteRecording = useCallback(async (noteId: string) => {
    await deleteVoiceRecording(noteId);
    void refreshUsage();
  }, [refreshUsage]);

  const clearAll = useCallback(async () => {
    await clearAllVoiceRecordings();
    void refreshUsage();
  }, [refreshUsage]);

  return { totalBytes, saveRecording, deleteRecording, clearAll, refreshUsage };
};
