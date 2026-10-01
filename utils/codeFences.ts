const FENCE_LINE = /^(\s*)(`{3,}|~{3,})(.*)$/;

// Repairs malformed code fences in model-generated Markdown so every code
// snippet renders as one complete code block:
// - unwraps a response that is wrapped whole in a ```markdown fence;
// - drops a stray bare fence opened right after another block just closed
//   (it would otherwise swallow the following headings/bullets as code);
// - closes an unclosed block before a new ```lang fence starts;
// - re-indents closing fences to match their opener, so a block nested in
//   a list item doesn't end the list item early;
// - closes a block still open at the end of the note.
export const repairCodeFences = (markdown: string): string => {
  let lines = markdown.split('\n');

  const first = lines.findIndex((l) => l.trim() !== '');
  let last = lines.length - 1;
  while (last >= 0 && lines[last].trim() === '') last--;
  if (first >= 0 && last > first) {
    const open = lines[first].match(/^\s*(`{3,}|~{3,})\s*(markdown|md)?\s*$/i);
    const close = lines[last].match(/^\s*(`{3,}|~{3,})\s*$/);
    if (open && close && open[1][0] === close[1][0]) {
      lines = lines.slice(first + 1, last);
    }
  }

  const out: string[] = [];
  let open = null as { indent: string; marker: string } | null;
  let lastClosedAt = -1;

  for (const line of lines) {
    const m = line.match(FENCE_LINE);
    if (!m) {
      out.push(line);
      continue;
    }
    const [, indent, marker, rest] = m;
    const info = rest.trim();

    if (open) {
      const isClosing = info === '' && marker[0] === open.marker[0] && marker.length >= open.marker.length;
      if (isClosing) {
        out.push(open.indent + open.marker);
        open = null;
        lastClosedAt = out.length - 1;
        continue;
      }
      if (info !== '') {
        out.push(open.indent + open.marker);
        open = { indent, marker };
        out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }

    if (info === '' && lastClosedAt >= 0 && out.slice(lastClosedAt + 1).every((l) => l.trim() === '')) {
      continue;
    }
    open = { indent, marker };
    out.push(line);
  }

  if (open) out.push(open.indent + open.marker);

  return out.join('\n');
};
