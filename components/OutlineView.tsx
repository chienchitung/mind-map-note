import React from 'react';
import { MindMapNode } from '../types';
import { ChevronDoubleLeftIcon } from './icons';

interface OutlineViewProps {
  data: MindMapNode;
  activeLine: number;
  onNodeClick: (lineNumber: number) => void;
  onToggleCollapse: () => void;
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

const OutlineView: React.FC<OutlineViewProps> = ({ data, activeLine, onNodeClick, onToggleCollapse }) => {
  return (
    <div className="outline-view text-text-secondary text-sm h-full flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0">
            <h2 className="font-semibold text-text-main text-[13px] tracking-tight">大綱</h2>
            <button onClick={onToggleCollapse} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90" title="收合大綱">
                <ChevronDoubleLeftIcon className="w-4 h-4" />
            </button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 pl-1">
            <ul>
                <OutlineNode node={data} activeLine={activeLine} onNodeClick={onNodeClick} />
            </ul>
        </div>
    </div>
  );
};

export default OutlineView;
