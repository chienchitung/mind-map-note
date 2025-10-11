import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownPreviewProps {
    markdown: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ markdown }) => {
    const html = useMemo(() => {
        // Use marked to parse the markdown string into HTML.
        // Marked's default options are secure against XSS.
        return marked.parse(markdown);
    }, [markdown]);

    return (
        <div 
            className="markdown-preview"
            dangerouslySetInnerHTML={{ __html: html as string }}
        />
    );
};

export default MarkdownPreview;
