import React, { useMemo } from 'react';
import { marked } from 'marked';
import { Images } from '../types';

interface MarkdownPreviewProps {
    markdown: string;
    images: Images;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown, images }) => {
    const html = useMemo(() => {
        // Pre-process the markdown to replace custom "image://" protocol with actual base64 data URLs.
        // This is more robust than using a custom renderer, as it provides a standard markdown
        // string to the 'marked' library, avoiding potential issues with its internal URL handling.
        const processedMarkdown = markdown.replace(/!\[(.*?)\]\(image:\/\/(.*?)\)/g, (match, altText, imageId) => {
            const dataUrl = images?.[imageId];
            if (dataUrl) {
                // Return a standard markdown image link with the data URL
                return `![${altText}](${dataUrl})`;
            }
            // If the image ID is not found, return a comment or the original text
            return `<!-- Image not found: ${imageId} -->`;
        });

        // Parse the processed markdown without any custom renderers.
        const parsedHtml = marked.parse(processedMarkdown);
        
        return typeof parsedHtml === 'string' ? parsedHtml : '';
    }, [markdown, images]);

    return (
        <div 
            className="markdown-preview"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

export default MarkdownPreview;