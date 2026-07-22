import React from 'react';
import { MindMapNode } from '../types';
import { stripInlineMarkdown } from '../utils/markdownParser';

interface OutlineViewProps {
  data: MindMapNode;
  activeLine: number;
  onNodeClick: (lineNumber: number) => void;
}

const OutlineNode: React.FC<{ 
  node: MindMapNode;
  activeLine: number;
  onNodeClick: (lineNumber: number) => void;
}> = ({ node, activeLine, onNodeClick }) => {
  // A node is considered "active" if the cursor is on its line or on any line belonging to its children.
  // This is a simplification; a more complex check would parse the whole markdown again.
  // For now, we just check the node's own line. A more robust solution might pass down a range.
  const isActive = node.lineNumber === activeLine;

  return (
    <li>
      <div 
        className={`outline-node-content ${isActive ? 'active' : ''}`}
        onClick={() => onNodeClick(node.lineNumber)}
      >
        <span className="node-bullet"></span>
        <span className="truncate">{stripInlineMarkdown(node.name)}</span>
      </div>
      {node.children && node.children.length > 0 && (
        <ul>
          {node.children.map(child => (
            <OutlineNode 
              key={child.id} 
              node={child} 
              activeLine={activeLine}
              onNodeClick={onNodeClick}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const OutlineView: React.FC<OutlineViewProps> = ({ data, activeLine, onNodeClick }) => {
  return (
    <div className="outline-view text-text-secondary text-sm h-full flex flex-col">
        <div className="flex-grow overflow-y-auto pr-2 pl-1 pt-2">
            <ul>
                <OutlineNode node={data} activeLine={activeLine} onNodeClick={onNodeClick} />
            </ul>
        </div>
    </div>
  );
};

export default OutlineView;
