import React, { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import { renderMathToHtml } from '../utils/renderMathToHtml';
import { Images } from '../types';

// marked's CommonMark-compliant `**bold**` parsing mis-pairs multiple bold
// spans on the same line when they abut CJK text/punctuation with no
// surrounding whitespace — e.g. `**A（X）**或**B（Y）**` (extremely common
// in Chinese output, since CJK prose doesn't use spaces between words)
// resolves as `**A（X）` + `<strong>或</strong>` + `B（Y）**` instead of two
// separate bold spans. This bypasses marked's own delimiter-run resolution
// entirely: pairing `**` markers strictly left-to-right (1st opens, 2nd
// closes, 3rd opens, ...) and emitting literal `<strong>` tags, which
// marked passes through unchanged, matches what's virtually always
// intended and sidesteps the ambiguity altogether. Code fences/spans are
// left untouched, since a literal `**` inside one (e.g. Python's `2**3`)
// isn't emphasis.
const convertBoldMarkersToHtml = (text: string): string => {
    const segments = text.split(/(```[\s\S]*?```|`[^`\n]*`)/);
    return segments
        .map((segment, i) => (i % 2 === 1
            ? segment
            : segment.replace(/\*\*(?!\*)([^\n]+?)(?<!\*)\*\*(?!\*)/g, '<strong>$1</strong>')))
        .join('');
};

// Renders LaTeX math ($$...$$ block, $...$ inline) via KaTeX before marked
// ever sees it — CommonMark would otherwise mangle LaTeX's own use of `_`,
// `*` and `\` as its own emphasis/escape syntax. Matches are pulled out into
// placeholder tokens (plain private-use-area characters marked won't touch
// or reinterpret) and only substituted back into the HTML *after* marked has
// run, so the final DOMPurify.sanitize() pass still covers the KaTeX output
// too, same as everything else. Skips code fences/spans, so e.g. a shell
// snippet's `$HOME` isn't mistaken for math. The inline pattern requires a
// non-whitespace character on both sides of the `$`s (and no `$`/newline in
// between) so ordinary prose like "$5 and $10" isn't matched as math.
const extractMath = (text: string): { text: string; mathHtml: Record<string, string> } => {
    const mathHtml: Record<string, string> = {};
    let counter = 0;
    const renderMath = (expr: string, displayMode: boolean): string => {
        const token = `MATH${counter++}`;
        mathHtml[token] = renderMathToHtml(expr, displayMode);
        return token;
    };

    const segments = text.split(/(```[\s\S]*?```|`[^`\n]*`)/);
    const processedText = segments
        .map((segment, i) => (i % 2 === 1
            ? segment
            : segment
                .replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => renderMath(expr, true))
                .replace(/\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$/g, (_match, expr) => renderMath(expr, false))))
        .join('');

    return { text: processedText, mathHtml };
};

interface MarkdownPreviewProps {
    markdown: string;
    images: Images;
    // Set by the outline view to jump to a specific heading/list-item —
    // see findBlockOrdinal in utils/markdownParser.ts for what this index
    // means. Optional: callers that don't need outline-jump support (the
    // AI chat panel, the print-only render) can simply omit both.
    scrollToBlockOrdinal?: number | null;
    onScrollComplete?: () => void;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown, images, scrollToBlockOrdinal, onScrollComplete }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const html = useMemo(() => {
        // Resolve the custom "image://" protocol to its base64 data URL only inside
        // the renderer callback, never by substituting it into the markdown string
        // itself. A real photo's data URL can be tens of millions of characters on
        // a single line, and handing that to marked's lexer as literal text can
        // overflow its regex-based block tokenizer ("Maximum call stack size
        // exceeded") — which, with no error boundary to catch it, unmounts the
        // entire app to a blank screen.
        const renderer = new marked.Renderer();
        renderer.image = ({ href, title, text }) => {
            const resolvedHref = href.startsWith('image://') ? images?.[href.slice('image://'.length)] : href;
            if (!resolvedHref) {
                return `<!-- Image not found: ${href} -->`;
            }
            let out = `<img src="${resolvedHref}" alt="${text}"`;
            if (title) out += ` title="${title}"`;
            out += '>';
            return out;
        };

        const { text: mathExtractedMarkdown, mathHtml } = extractMath(markdown);
        const parsedHtml = marked.parse(convertBoldMarkersToHtml(mathExtractedMarkdown), { renderer });
        let rawHtml = typeof parsedHtml === 'string' ? parsedHtml : '';
        for (const [token, renderedMath] of Object.entries(mathHtml)) {
            rawHtml = rawHtml.split(token).join(renderedMath);
        }

        // Notes may contain content pasted from untrusted sources, so the rendered
        // HTML must be sanitized before it is injected into the DOM.
        return DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
    }, [markdown, images]);

    // Jumps to the ordinal-th heading/list-item in the rendered HTML — see
    // findBlockOrdinal in utils/markdownParser.ts. Runs after `html` has
    // already committed to the DOM (dangerouslySetInnerHTML applies during
    // the same commit React runs this effect after), so the query below
    // always sees the up-to-date content.
    useEffect(() => {
        if (scrollToBlockOrdinal == null || !containerRef.current) return;
        const blocks = containerRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6, li');
        const target = blocks[scrollToBlockOrdinal] as HTMLElement | undefined;
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        onScrollComplete?.();
    }, [scrollToBlockOrdinal, html, onScrollComplete]);

    return (
        <div
            ref={containerRef}
            className="markdown-preview"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

export default MarkdownPreview;