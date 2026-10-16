export interface TextMatch {
  from: number;
  to: number;
}

const escapeForRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every non-overlapping occurrence of `query` in `text`, as string offsets.
export const findInText = (text: string, query: string, matchCase: boolean): TextMatch[] => {
  if (!query) return [];
  const regex = new RegExp(escapeForRegExp(query), matchCase ? 'g' : 'gi');
  const matches: TextMatch[] = [];
  for (const found of text.matchAll(regex)) {
    const from = found.index ?? 0;
    matches.push({ from, to: from + found[0].length });
  }
  return matches;
};
