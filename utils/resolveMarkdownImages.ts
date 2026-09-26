import { Images } from '../types';

// Matches `![alt](image://<id>)` — the same internal-only scheme
// useFileSystem's addImage/`image://` references use everywhere else in the
// app. Captures both the alt text and the id so a resolved match can be
// rebuilt with the same alt text.
const IMAGE_REFERENCE_REGEX = /!\[(.*?)\]\(image:\/\/(.*?)\)/g;

// Substitutes every `image://<id>` reference in a note's markdown with the
// image's actual base64 data URL. `image://` only means anything inside
// this app's own renderers (MarkdownPreview, MindMap — see their own
// resolution of it); markdown handed to the clipboard or exported as a
// .md/.zip file needs the real image data inlined instead, or every image
// shows up broken in whatever it's pasted into or opened with. A reference
// to an image that's gone missing from the store is left as-is rather than
// dropped, so the export still shows *something* is missing instead of
// silently deleting content.
export const resolveMarkdownImages = (markdown: string, images: Images): string =>
  markdown.replace(IMAGE_REFERENCE_REGEX, (match, alt, id) => {
    const dataUrl = images[id];
    return dataUrl ? `![${alt}](${dataUrl})` : match;
  });
