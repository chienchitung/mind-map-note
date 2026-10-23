// Grabs still frames from a recorded or uploaded video, entirely in the
// browser: a hidden <video> is seeked to each requested moment and drawn to
// a canvas. Works on MediaRecorder's WebM output too, even though it carries
// no duration or seek index (Chromium scans to the requested time).

// A saved frame is downscaled to at most this wide (height follows the
// aspect ratio) — enough to read a shared slide or code in a note.
const FRAME_MAX_WIDTH = 1280;
const FRAME_JPEG_QUALITY = 0.8;
// Small grayscale copy used only to tell whether two frames show the same
// screen (see isSameScreen).
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 90;
const SEEK_TIMEOUT_MS = 20000;

export interface VideoFrame {
  seconds: number;
  dataUrl: string;
  thumb: Uint8ClampedArray;
}

const waitForEvent = (target: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      target.removeEventListener(event, onEvent);
      reject(new Error(`video ${event} timed out`));
    }, timeoutMs);
    const onEvent = () => {
      window.clearTimeout(timer);
      resolve();
    };
    target.addEventListener(event, onEvent, { once: true });
  });

const grayscaleThumb = (source: CanvasImageSource): Uint8ClampedArray => {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  const rgba = ctx.getImageData(0, 0, THUMB_WIDTH, THUMB_HEIGHT).data;
  const gray = new Uint8ClampedArray(THUMB_WIDTH * THUMB_HEIGHT);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  }
  return gray;
};

/**
 * Whether two frames show essentially the same screen. Compares 8x8-pixel
 * blocks of their thumbnails rather than the whole-frame average: a slide
 * change that only rewrites some text alters a small area a lot, which a
 * single average washes out but a share of changed blocks still catches.
 */
export const isSameScreen = (a: Uint8ClampedArray, b: Uint8ClampedArray): boolean => {
  const BLOCK = 8;
  const BLOCK_DELTA = 14;
  const CHANGED_SHARE = 0.02;
  let blocks = 0;
  let changed = 0;
  for (let by = 0; by + BLOCK <= THUMB_HEIGHT; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= THUMB_WIDTH; bx += BLOCK) {
      let diff = 0;
      for (let y = by; y < by + BLOCK; y++) {
        for (let x = bx; x < bx + BLOCK; x++) {
          const i = y * THUMB_WIDTH + x;
          diff += Math.abs(a[i] - b[i]);
        }
      }
      blocks++;
      if (diff / (BLOCK * BLOCK) > BLOCK_DELTA) changed++;
    }
  }
  return changed / blocks <= CHANGED_SHARE;
};

/**
 * Grabs a frame at each requested second, in the order given. A moment
 * that can't be read (seek failure, past the end of a broken file) comes
 * back as null rather than failing the rest.
 */
export const grabVideoFrames = async (
  video: Blob,
  seconds: number[],
  onProgress?: (done: number, total: number) => void
): Promise<(VideoFrame | null)[]> => {
  const url = URL.createObjectURL(video);
  const element = document.createElement('video');
  element.muted = true;
  element.playsInline = true;
  element.preload = 'auto';
  element.src = url;
  const results: (VideoFrame | null)[] = seconds.map(() => null);
  try {
    await waitForEvent(element, 'loadeddata', SEEK_TIMEOUT_MS);
    // Seeking in increasing order lets the browser scan an index-less
    // recording forward once instead of from the start for every frame.
    const order = seconds.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s);
    let done = 0;
    for (const { s, i } of order) {
      try {
        const seeked = waitForEvent(element, 'seeked', SEEK_TIMEOUT_MS);
        element.currentTime = Math.max(0, s);
        await seeked;
        const width = element.videoWidth;
        const height = element.videoHeight;
        if (width > 0 && height > 0) {
          const scale = Math.min(1, FRAME_MAX_WIDTH / width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          canvas.getContext('2d')!.drawImage(element, 0, 0, canvas.width, canvas.height);
          results[i] = { seconds: s, dataUrl: canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY), thumb: grayscaleThumb(canvas) };
        }
      } catch (error) {
        console.warn(`Could not grab the video frame at ${s}s:`, error);
      }
      onProgress?.(++done, order.length);
    }
  } finally {
    element.removeAttribute('src');
    element.load();
    URL.revokeObjectURL(url);
  }
  return results;
};
