import React from 'react';
import { MindMapNode } from '../types';

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
        <span className="truncate">{node.name}</span>
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
    <div className="outline-view text-text-secondary text-sm">
        <ul>
            <OutlineNode node={data} activeLine={activeLine} onNodeClick={onNodeClick} />
        </ul>
    </div>
  );
};

export default OutlineView;