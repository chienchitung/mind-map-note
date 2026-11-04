// Generated notes are asked not to use Markdown tables — the formatted (Aa)
// editor has no table support, so a table there collapses into a single run
// of text with every cell glued together, and the mind map can't show it
// either. The model still writes one now and then, most often for meeting
// action items (item / owner / deadline). This turns any table left in a
// generated note into a list: one bullet per row, led by its first cell,
// with the other cells nested below as "Header: value".

const SEPARATOR_CELL_REGEX = /^:?-+:?$/;

// Splits "| a | b |" into ["a", "b"], keeping escaped "\|" inside a cell.
const splitRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
};

const isRowLine = (line: string): boolean => line.trim().includes('|');

const isSeparatorLine = (line: string): boolean => {
  if (!isRowLine(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every(cell => SEPARATOR_CELL_REGEX.test(cell));
};

// `labelSeparator` joins a header to its value: "：" for Chinese notes,
// ": " for English ones.
export const tablesToLists = (markdown: string, labelSeparator = '：'): string => {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    // A table is a header row followed directly by a separator row.
    if (inFence || !isRowLine(line) || !isSeparatorLine(lines[i + 1] ?? '')) {
      output.push(line);
      continue;
    }
    const indent = line.match(/^\s*/)![0];
    const headers = splitRow(line);
    let j = i + 2;
    for (; j < lines.length && isRowLine(lines[j]) && lines[j].trim() !== ''; j++) {
      const cells = splitRow(lines[j]);
      const leadIndex = cells.findIndex(cell => cell !== '');
      if (leadIndex === -1) continue;
      output.push(`${indent}- ${cells[leadIndex]}`);
      cells.forEach((cell, k) => {
        if (k === leadIndex || cell === '') return;
        const header = headers[k]?.trim();
        output.push(`${indent}  - ${header ? `${header}${labelSeparator}${cell}` : cell}`);
      });
    }
    i = j - 1;
  }
  return output.join('\n');
};
