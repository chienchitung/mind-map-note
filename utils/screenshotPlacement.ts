// Places screen-share screenshots into the AI-generated note where the
// content actually needs them. Works together with the prompt addition in
// geminiChatService.ts's generateNoteFromTranscript (withScreenshotAnchors):
// wherever seeing the screen helps (a slide being explained, code, a
// diagram, a demo), the model adds a hidden `<!--shot:SECONDS-->` marker
// naming the moment that visual was on screen. The frame at that moment is
// then taken from the recorded/uploaded video (see utils/videoFrames.ts) and
// inserted at the marker — so which screenshots appear, and where, follows
// the note's content rather than whenever the screen happened to change.

const SHOT_MARKER_REGEX = /<!--shot:(\d+)-->/g;
const HEADING_REGEX = /^#{1,6}\s/;
const LIST_ITEM_REGEX = /^(\s*)(-|\*|\+|\d+\.)\s/;

export interface ShotMarker {
  // Line (in the cleaned markdown) the screenshot goes right after.
  lineIndex: number;
  seconds: number;
}

/**
 * Removes every `<!--shot:SECONDS-->` marker from the note, returning the
 * cleaned markdown and where each marker was. A marker at the end of a line
 * anchors to that line; one on a line of its own anchors to the nearest
 * non-empty line above it. Markers before any content are dropped.
 */
export const extractShotMarkers = (markdown: string): { markdown: string; shots: ShotMarker[] } => {
  const shots: ShotMarker[] = [];
  const output: string[] = [];
  let lastContentIndex = -1;
  for (const line of markdown.split('\n')) {
    const seconds = [...line.matchAll(SHOT_MARKER_REGEX)].map(match => Number(match[1]));
    const cleaned = seconds.length > 0 ? line.replace(SHOT_MARKER_REGEX, '').replace(/\s+$/, '') : line;
    if (seconds.length > 0 && cleaned.trim() === '') {
      // A marker on a line of its own: drop the line entirely.
      if (lastContentIndex >= 0) seconds.forEach(s => shots.push({ lineIndex: lastContentIndex, seconds: s }));
      continue;
    }
    output.push(cleaned);
    if (cleaned.trim() !== '') lastContentIndex = output.length - 1;
    seconds.forEach(s => shots.push({ lineIndex: output.length - 1, seconds: s }));
  }
  return { markdown: output.join('\n'), shots };
};

/**
 * Inserts each image right after its anchor line: as a nested item under a
 * list item, or as a top-level item under a heading or paragraph.
 */
export const insertScreenshots = (
  markdown: string,
  placements: { lineIndex: number; dataUrl: string }[],
  addImage: (dataUrl: string) => string,
  imageAlt: string
): string => {
  if (placements.length === 0) return markdown;
  const lines = markdown.split('\n');
  const insertionsByLine = new Map<number, string[]>();
  for (const { lineIndex, dataUrl } of placements) {
    const anchor = lines[lineIndex] ?? '';
    const listMatch = HEADING_REGEX.test(anchor) ? null : anchor.match(LIST_ITEM_REGEX);
    const indent = listMatch ? `${listMatch[1]}  ` : '';
    const line = `${indent}- ![${imageAlt}](image://${addImage(dataUrl)})`;
    const existing = insertionsByLine.get(lineIndex);
    if (existing) existing.push(line);
    else insertionsByLine.set(lineIndex, [line]);
  }
  // Splice from the bottom up so an earlier insertion never shifts a later
  // anchor's recorded line index out from under it.
  for (const lineIndex of [...insertionsByLine.keys()].sort((a, b) => b - a)) {
    lines.splice(lineIndex + 1, 0, ...insertionsByLine.get(lineIndex)!);
  }
  return lines.join('\n');
};
