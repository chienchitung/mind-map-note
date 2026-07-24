import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Images } from '../types';

interface MarkdownPreviewProps {
    markdown: string;
    images: Images;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown, images }) => {
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

    return (
        <div 
            className="markdown-preview"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

export default MarkdownPreview;