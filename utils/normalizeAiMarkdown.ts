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
    .join('\n');
};
