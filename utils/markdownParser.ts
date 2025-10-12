import { MindMapNode } from '../types';

/**
 * Determines the hierarchical level and content of a given line of markdown.
 * @param line The markdown line to parse.
 * @returns An object with level, name, and prefix, or null if not a valid node.
 */
const getLineInfo = (line: string): { level: number; name: string; prefix: string } | null => {
  // Match headings like #, ##, etc.
  const headingMatch = line.match(/^(#+)\s+(.*)/);
  if (headingMatch && headingMatch[2].trim()) {
    return {
      level: headingMatch[1].length, // Level is the number of '#'
      name: headingMatch[2].trim(),
      prefix: `${headingMatch[1]} `,
    };
  }

  // Match list items like -, *, +
  const listItemMatch = line.match(/^(\s*)(-|\*|\+)\s+(.*)/);
  if (listItemMatch && listItemMatch[3].trim()) {
    const indent = Math.floor(listItemMatch[1].length / 2);
    // To avoid conflicts with heading levels (1-6), we assign list items
    // a higher base level. Each indent increases the level.
    return {
      level: 10 + indent,
      name: listItemMatch[3].trim(),
      prefix: `${listItemMatch[1]}${listItemMatch[2]} `,
    };
  }

  return null;
};

export const parseMarkdownToMindMap = (markdown: string, noteName: string): MindMapNode | null => {
  const lines = markdown.split('\n');
  if (lines.every(line => line.trim() === '')) {
    return {
        id: 'root-empty',
        name: noteName,
        children: [],
        level: 0,
        lineNumber: -1,
        originalLine: '',
        prefix: '',
    };
  }

  const root: MindMapNode = {
    id: 'root',
    name: noteName,
    children: [],
    level: 0, // The virtual root is at level 0
    lineNumber: -1,
    originalLine: '',
    prefix: '',
  };
  
  const path: MindMapNode[] = [root];
  
  const imageRegex = /!\[(.*?)\]\((.*?)\)/;

  lines.forEach((line, index) => {
    const lineInfo = getLineInfo(line);

    if (lineInfo) {
      let { level, name, prefix } = lineInfo;
      let imageUrl: string | undefined = undefined;

      const imageMatch = name.match(imageRegex);
      
      if (imageMatch) {
          imageUrl = imageMatch[2];
          name = name.replace(imageRegex, '').trim();
          if (!name) {
              name = imageMatch[1] || 'Image'; // Use alt text if no other text
          }
      }
      
      const newNode: MindMapNode = {
          name,
          children: [],
          id: `${index}-${name}`,
          lineNumber: index,
          originalLine: line,
          level: level,
          prefix: prefix,
          imageUrl,
      };

      // Traverse up the path to find the correct parent. The parent's level
      // must be less than the new node's level. This correctly handles
      // cases like an H1 appearing after an H2.
      while (path.length > 1 && path[path.length - 1].level >= level) {
          path.pop();
      }
      
      const parent = path[path.length - 1];
      parent.children = parent.children || [];
      parent.children.push(newNode);
      path.push(newNode);
    }
  });

  if (root.children.length === 0) {
     return root; // Return the root with the note's name if no parsable content
  }
  
  // If there's only one top-level node, make it the root for a cleaner view.
  if (root.children.length === 1) {
    return root.children[0];
  }

  // If there are multiple top-level nodes, return the virtual root that holds them.
  return root;
};