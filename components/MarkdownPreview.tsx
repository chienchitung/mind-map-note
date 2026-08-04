import React, { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Images } from '../types';

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

        const parsedHtml = marked.parse(markdown, { renderer });
        const rawHtml = typeof parsedHtml === 'string' ? parsedHtml : '';

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