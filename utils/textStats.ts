import { stripInlineMarkdown } from './markdownParser';

// Strips block-level Markdown syntax (headings, list markers, blockquotes,
// horizontal rules, code fence lines, table pipes) from a single line, so
// what's left is text a reader would actually see as body content rather
// than markup. Paired with stripInlineMarkdown (bold/italic/links/etc.) in
// toPlainText below.
const stripBlockMarkdown = (line: string): string => {
    return line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, '')
        .replace(/^\s*```.*$/, '')
        .replace(/\|/g, ' ');
};

const toPlainText = (markdown: string): string =>
    markdown.split('\n').map(stripBlockMarkdown).map(stripInlineMarkdown).join('\n');

// CJK ideographs/kana/hangul — each counted as its own "word" below, since
// (unlike space-delimited scripts) there's no whitespace between them to
// split on.
const CJK_CHAR_REGEX = /[一-鿿㐀-䶿豈-﫿぀-ヿ가-힯]/;
const LATIN_WORD_CHAR_REGEX = /[A-Za-z0-9]/;

export interface TextStats {
    // Non-whitespace characters in the note's rendered content — i.e. with
    // Markdown syntax (headings, list markers, bold/italic, etc.) stripped
    // out, since those are formatting rather than something the user is
    // counting as "written."
    characters: number;
    // CJK characters counted individually (no inter-character whitespace to
    // split words on) plus space-delimited runs of Latin/digit characters —
    // the same approach most CJK-aware word counters use, so mixed
    // Chinese/English notes get a sensible count either way.
    words: number;
}

export const computeTextStats = (markdown: string): TextStats => {
    const plainText = toPlainText(markdown);
    const characters = (plainText.match(/\S/g) ?? []).length;

    let words = 0;
    let inLatinWord = false;
    for (const char of plainText) {
        if (CJK_CHAR_REGEX.test(char)) {
            words += 1;
            inLatinWord = false;
        } else if (LATIN_WORD_CHAR_REGEX.test(char)) {
            if (!inLatinWord) words += 1;
            inLatinWord = true;
        } else {
            inLatinWord = false;
        }
    }

    return { characters, words };
};
