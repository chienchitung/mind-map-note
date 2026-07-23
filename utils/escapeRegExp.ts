// Escapes characters with special meaning in a RegExp so a string can be
// used as a literal search term instead of being parsed as a pattern.
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
