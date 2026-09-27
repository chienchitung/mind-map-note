// Places screen-share screenshots (see useVoiceNotePipeline's
// startScreenshotCapture) into the AI-generated note at the point that
// actually discusses them, instead of dumping them all in one flat list at
// the end. This works together with a prompt addition in
// geminiChatService.ts's generateNoteFromTranscript (withScreenshotAnchors)
// that asks Gemini to tag every heading/top-level list item with a hidden
// `<!--t:START-END-->` marker naming the transcript time range that
// content was drawn from — the note itself is generated exactly as usual
// (same holistic, freely-reorganized structure), only with this one extra
// piece of provenance per block. Placement is then a plain, deterministic
// nearest-time-range match done here in code, not another judgment call
// left to the model.

const TIME_ANNOTATION_REGEX = /\s*<!--t:(\d+)-(\d+)-->\s*$/;
// Headings, and *top-level* list items only (no leading whitespace) —
// matches what the prompt asks Gemini to annotate. A nested sub-item is
// deliberately never a placement target: anchoring only at the top level
// keeps this resilient to the model varying exactly how deep it nests
// supporting details.
const ANCHORABLE_LINE_REGEX = /^(#{1,6}\s|(-|\*|\+|\d+\.)\s)/;

export interface TimeAnnotation {
  lineIndex: number;
  start: number;
  end: number;
  isHeading: boolean;
}

/**
 * Strips every `<!--t:START-END-->` marker from the note (so it never
 * reaches the user), returning the cleaned markdown plus where each one
 * was — by line index into the *cleaned* text, so placeScreenshots below
 * can splice new lines in directly without re-deriving positions.
 */
export const extractTimeAnnotations = (markdown: string): { markdown: string; annotations: TimeAnnotation[] } => {
  const annotations: TimeAnnotation[] = [];
  const lines = markdown.split('\n').map((line, lineIndex) => {
    if (!ANCHORABLE_LINE_REGEX.test(line)) return line;
    const match = line.match(TIME_ANNOTATION_REGEX);
    if (!match) return line;
    annotations.push({ lineIndex, start: Number(match[1]), end: Number(match[2]), isHeading: line.startsWith('#') });
    return line.slice(0, match.index).replace(/\s+$/, '');
  });
  return { markdown: lines.join('\n'), annotations };
};

// How far (in seconds) a screenshot sits from an annotation's own range —
// 0 when the range contains it, otherwise the gap to whichever edge is
// closer. The annotation with the smallest distance wins; a tie keeps
// whichever appears first in the note (a stable sort, so this is simply
// "don't reorder ties").
const distanceToRange = (timeSeconds: number, start: number, end: number): number => {
  if (timeSeconds >= start && timeSeconds <= end) return 0;
  return Math.min(Math.abs(timeSeconds - start), Math.abs(timeSeconds - end));
};

const leadingWhitespace = (line: string): string => line.match(/^\s*/)?.[0] ?? '';

/**
 * Inserts each screenshot as a new list item directly after whichever
 * annotated heading/list-item its capture time is nearest to. Falls back
 * to one flat trailing section (the original, pre-anchor behavior) when
 * there are no annotations at all to match against — a model that ignored
 * the marker instruction, or a note generated without screenshot anchors
 * in the first place.
 */
export const placeScreenshotsByTimestamp = (
  markdown: string,
  annotations: TimeAnnotation[],
  screenshots: { timeSeconds: number; dataUrl: string }[],
  addImage: (dataUrl: string) => string,
  fallbackHeading: string,
  imageAlt: string
): string => {
  if (screenshots.length === 0) return markdown;

  const imageLine = (indent: string, dataUrl: string) => `${indent}- ![${imageAlt}](image://${addImage(dataUrl)})`;

  if (annotations.length === 0) {
    const entries = screenshots.map(({ dataUrl }) => imageLine('', dataUrl));
    return `${markdown}\n\n## ${fallbackHeading}\n\n${entries.join('\n')}`;
  }

  const lines = markdown.split('\n');
  const insertionsByLine = new Map<number, string[]>();
  for (const { timeSeconds, dataUrl } of screenshots) {
    let best = annotations[0];
    let bestDistance = distanceToRange(timeSeconds, best.start, best.end);
    for (const candidate of annotations) {
      const distance = distanceToRange(timeSeconds, candidate.start, candidate.end);
      // A heading's range always encloses its own bullets' narrower ones,
      // so an equal (typically zero) distance is a tie between a whole
      // section and one specific point within it — prefer the narrower
      // range, since it's the more specific match (e.g. the one bullet a
      // screenshot's moment actually falls in, not just its heading). If
      // even the width ties (a heading whose only bullet spans its exact
      // range), fall back to preferring the bullet outright: a screenshot
      // belongs with a specific point of content, not its section header.
      const candidateWidth = candidate.end - candidate.start;
      const bestWidth = best.end - best.start;
      const isBetter = distance < bestDistance ||
        (distance === bestDistance && candidateWidth < bestWidth) ||
        (distance === bestDistance && candidateWidth === bestWidth && best.isHeading && !candidate.isHeading);
      if (isBetter) {
        best = candidate;
        bestDistance = distance;
      }
    }
    const targetLine = lines[best.lineIndex] ?? '';
    const indent = /^#{1,6}\s/.test(targetLine) ? '' : leadingWhitespace(targetLine);
    const line = imageLine(indent, dataUrl);
    const existing = insertionsByLine.get(best.lineIndex);
    if (existing) existing.push(line);
    else insertionsByLine.set(best.lineIndex, [line]);
  }

  // Splice from the bottom up so an earlier insertion never shifts a
  // later target's recorded line index out from under it.
  const targetLines = [...insertionsByLine.keys()].sort((a, b) => b - a);
  for (const lineIndex of targetLines) {
    lines.splice(lineIndex + 1, 0, ...insertionsByLine.get(lineIndex)!);
  }
  return lines.join('\n');
};
