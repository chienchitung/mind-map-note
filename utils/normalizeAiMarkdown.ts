// Gemini (like many LLMs) sometimes emits bullet points as "*item" with no
// space after the marker. CommonMark requires that space to tell a list
// marker apart from the start of an *emphasis* span, so marked.js leaves
// these as literal, unrendered "*" characters instead of a bullet list.
//
// Insert the missing space, but only when the line has no other "*" later
// on it — a lone, unmatched leading "*" is almost certainly a broken list
// marker, while a leading "*...*" that closes later on the same line is
// emphasis (e.g. "*重要*：這是說明。") and must be left alone, since
// inserting a space there would break the emphasis instead of fixing
// anything.
// AI-generated notes sometimes sprinkle "---" (or "***" / "___") divider
// lines between sections as a stylistic habit, even when asked not to.
// Beyond the visual clutter of a horizontal rule between every heading —
// headings alone already separate sections — a "-"-based divider directly
// under a text line is CommonMark-ambiguous with a Setext heading underline
// (it can silently turn the line above it into a heading instead of
// rendering as a rule), so these are stripped rather than just discouraged
// in the prompt.
const isDividerLine = (line: string): boolean => {
  const compact = line.replace(/\s+/g, '');
  return /^(-{3,}|\*{3,}|_{3,})$/.test(compact);
};

export const normalizeAiMarkdown = (text: string): string => {
  return text
    .split('\n')
    .map(line => {
      const match = line.match(/^(\s*)\*(?!\*)(\S.*)$/);
      if (!match) return line;
      const [, indent, rest] = match;
      if (rest.includes('*')) return line;
      return `${indent}* ${rest}`;
    })
    .filter(line => !isDividerLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n'); // collapse blank-line runs a removed divider leaves behind
};
