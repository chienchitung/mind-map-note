import katex from 'katex';

// AI-generated math occasionally comes back with a doubled backslash before
// a command name (`\\rightarrow` instead of `\rightarrow`) — plausibly the
// model over-escaping backslashes the way it would inside a JSON string.
// `\\` on its own is LaTeX's line-break command, so KaTeX parses that as an
// (invisible) line break immediately followed by the command name spelled
// out as separate italic letters, instead of the intended symbol. A literal
// `\\` immediately butted up against a letter with nothing between them
// isn't a pattern that shows up in genuine LaTeX (an intentional line break
// is followed by whitespace, another command, or a table cell separator,
// never directly by a word) — safe to treat as this mistake and collapse
// back to a single backslash.
const normalizeDoubledBackslashes = (expr: string): string => expr.replace(/\\\\(?=[a-zA-Z])/g, '\\');

// Shared by MarkdownPreview.tsx (Preview mode / AI chat panel) and
// RichTextEditor's math node (Aa mode) — both need the exact same
// LaTeX-quirk handling so a note renders identically in either view.
export const renderMathToHtml = (rawExpr: string, displayMode: boolean): string => {
    const expr = normalizeDoubledBackslashes(rawExpr);
    try {
        // 'html' only, not the default 'htmlAndMathml' — the MathML branch is
        // meant to be visually hidden (screen-reader-only) via KaTeX's own
        // CSS, but that hiding didn't survive the production build, and
        // DOMPurify separately strips its <semantics>/<annotation> wrapper
        // tags while keeping their raw-LaTeX text content, leaving that stray
        // text sitting visible in the DOM right next to the correctly-
        // rendered symbol. Not worth chasing either issue down when the
        // visible HTML rendering doesn't need MathML at all.
        return katex.renderToString(expr, { throwOnError: false, displayMode, output: 'html' });
    } catch {
        // Malformed LaTeX the renderer itself couldn't recover from — fall
        // back to the original source rather than losing the text.
        return displayMode ? `$$${expr}$$` : `$${expr}$`;
    }
};
