import { MindMapNode } from '../types';

const generateNodeMarkdown = (node: MindMapNode, parentLevel: number): string => {
    let markdownLines: string[] = [];
    
    const isHeading = node.prefix.trim().startsWith('#');
    let currentPrefix: string;

    const newLevel = isHeading ? Math.max(1, parentLevel + 1) : parentLevel;

    if (isHeading) {
        currentPrefix = `${'#'.repeat(newLevel)} `;
    } else {
        const indent = '  '.repeat(Math.max(0, newLevel));
        const bullet = (node.prefix.trim().match(/^[-*+]/) || ['-'])[0];
        currentPrefix = `${indent}${bullet} `;
    }
    
    const line = `${currentPrefix}${node.name}`;
    markdownLines.push(line);

    if (node.children) {
        node.children.forEach(child => {
            markdownLines.push(generateNodeMarkdown(child, newLevel));
        });
    }

    return markdownLines.join('\n');
};

export const mindMapToMarkdown = (rootNode: MindMapNode | null): string => {
    if (!rootNode) return '';
    // The root node's parent level is effectively 0, so its own level will be 1 (H1).
    return generateNodeMarkdown({ ...rootNode, prefix: '# ' }, 0);
};