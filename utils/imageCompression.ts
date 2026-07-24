// A photo straight off a phone camera can be 10+ MB once base64-encoded —
// larger than the entire localStorage quota (~5-10MB per origin) by itself.
// Downscaling to a sane display resolution and re-encoding brings a typical
// photo down to a few hundred KB, so uploading one image doesn't fill the
// whole workspace's storage.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const SKIP_COMPRESSION_BYTES = 400 * 1024;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Resolves to a possibly downscaled/re-encoded data URL for the given image
// file. Animated GIFs pass through untouched (a canvas re-encode would
// flatten them to a single frame); everything else is only re-encoded when
// it's actually large enough for the trade-off to be worth it.
export const compressImageFile = async (file: File): Promise<string> => {
  const dataUrl = await readFileAsDataUrl(file);
  if (file.type === 'image/gif') return dataUrl;

  const img = await loadImage(dataUrl).catch(() => null);
  if (!img || !img.width || !img.height) return dataUrl;

  const withinDimensionLimit = img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION;
  if (withinDimensionLimit && file.size <= SKIP_COMPRESSION_BYTES) {
    return dataUrl;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Keep PNG lossless (for transparency/crisp text in screenshots); every
  // other source format re-encodes as JPEG, which compresses photos far
  // better than a dimension reduction alone.
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const compressed = canvas.toDataURL(outputType, outputType === 'image/jpeg' ? JPEG_QUALITY : undefined);

  // Guard against pathological cases (e.g. a tiny image that re-encodes larger).
  return compressed.length < dataUrl.length ? compressed : dataUrl;
};
