// Decodes an uploaded audio file and re-encodes it as a series of smaller,
// independent WAV segments — used when a file is too large to upload to
// Groq's transcription API in a single request. Unlike live recording,
// where segments are produced by rotating MediaRecorder in real time, an
// already-recorded file can be sliced directly from its fully-decoded
// audio buffer, all up front, and fed into the same segment queue.
//
// Downmixed to mono and resampled to 16kHz: plenty for speech
// intelligibility (it's also exactly what Whisper's own model expects
// internally), and it keeps each segment's re-encoded size small and
// predictable regardless of how the source file was originally encoded —
// letting the segment duration be computed directly from the byte budget
// instead of guessing at a compression ratio.
import { translate } from '../i18n/translations';

const TARGET_SAMPLE_RATE = 16000;

// Sanity ceiling on the *original* uploaded file, independent of Groq's
// upload cap — decoding holds the entire clip in memory as Float32 samples
// (roughly 4 bytes/sample/channel), so an unbounded input could exhaust
// memory or freeze the tab well before hitting any network limit.
export const MAX_SPLITTABLE_FILE_BYTES = 500 * 1024 * 1024;

const toMonoSamples = (buffer: AudioBuffer): Float32Array => {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
            mono[i] += data[i] / buffer.numberOfChannels;
        }
    }
    return mono;
};

const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
    const dataSize = samples.length * 2; // 16-bit PCM
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM fmt chunk size
    view.setUint16(20, 1, true); // audio format = PCM
    view.setUint16(22, 1, true); // channels = mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * blockAlign)
    view.setUint16(32, 2, true); // block align (bytes per sample frame)
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
};

export interface AudioSegment {
    blob: Blob;
    filename: string;
}

/**
 * Splits an audio file into a sequence of WAV segments, each kept under
 * `maxSegmentBytes` (a 10% margin is reserved automatically for header
 * overhead and rounding).
 */
export const splitAudioFileIntoSegments = async (file: File, maxSegmentBytes: number): Promise<AudioSegment[]> => {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
        throw new Error(translate('audioSplitter.decodeUnsupported'));
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContextClass({ sampleRate: TARGET_SAMPLE_RATE });
    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        // decodeAudioData rejects with a terse, browser-internal message
        // ("Unable to decode audio data") that isn't useful to show
        // directly — replace it with something the user can actually act on.
        console.error('decodeAudioData failed:', error);
        throw new Error(translate('audioSplitter.cannotParseAudio'));
    } finally {
        void audioContext.close();
    }

    const samples = toMonoSamples(audioBuffer);
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSecond = sampleRate * 2; // 16-bit mono PCM
    const segmentSeconds = Math.max(30, Math.floor((maxSegmentBytes * 0.9) / bytesPerSecond));
    const segmentSamples = segmentSeconds * sampleRate;

    const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'upload';
    const segments: AudioSegment[] = [];
    for (let start = 0, index = 1; start < samples.length; start += segmentSamples, index++) {
        const end = Math.min(start + segmentSamples, samples.length);
        segments.push({
            blob: encodeWav(samples.subarray(start, end), sampleRate),
            filename: `${baseName}-part${index}.wav`,
        });
    }
    return segments;
};
