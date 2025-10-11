import React, { useRef, useMemo, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { MindMapNode } from '../types';
import { PlusIcon, MinusIcon, ResetZoomIcon } from './icons';

const PADDING_X = 24;
const PADDING_Y = 16;
const MAX_NODE_WIDTH = 200;

const ZoomControls: React.FC<{
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}> = ({ onZoomIn, onZoomOut, onReset }) => {
  return (
    <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm shadow-lg rounded-lg p-1 flex flex-col gap-1 border border-gray-200 z-10">
      <button onClick={onZoomIn} title="放大 (Cmd/Ctrl +)" className="p-2 rounded-md hover:bg-gray-200 transition-colors text-gray-600">
        <PlusIcon className="w-5 h-5" />
      </button>
      <button onClick={onZoomOut} title="縮小 (Cmd/Ctrl -)" className="p-2 rounded-md hover:bg-gray-200 transition-colors text-gray-600">
        <MinusIcon className="w-5 h-5" />
      </button>
      <button onClick={onReset} title="重置視圖 (Cmd/Ctrl 0)" className="p-2 rounded-md hover:bg-gray-200 transition-colors text-gray-600">
        <ResetZoomIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

interface MindMapProps {
  data: MindMapNode;
  onNodeUpdate: (nodeId: string, newName: string) => void;
  onStructureUpdate: (newRoot: MindMapNode) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
}

export interface MindMapHandle {
  exportAsJPG: () => void;
}

const getNodeStyles = (depth: number) => {
    const baseText: React.CSSProperties = {
        fontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
        fontWeight: 500,
        fontSize: '14px',
        wordBreak: 'break-word',
    };
    const basePadding = `${PADDING_Y / 2}px ${PADDING_X / 2}px`;

    switch (depth) {
        case 0: // Root
            return {
                rect: { fill: '#4f46e5', stroke: 'transparent' } as React.CSSProperties,
                text: { ...baseText, color: 'white' },
                padding: basePadding,
            };
        case 1: // Level 2
            return {
                rect: { fill: '#e5e7eb', stroke: 'transparent' } as React.CSSProperties,
                text: { ...baseText, color: '#1f2937' },
                padding: basePadding,
            };
        case 2: // Level 3
            return {
                rect: { fill: 'white', stroke: '#d1d5db', strokeWidth: 1 } as React.CSSProperties,
                text: { ...baseText, color: '#1f2937' },
                padding: basePadding,
            };
        default: // Level 4+
            return {
                rect: { fill: 'transparent', stroke: 'transparent' } as React.CSSProperties,
                text: { ...baseText, color: '#374151' },
                padding: `4px 8px`,
            };
    }
};

const MindMap = forwardRef<MindMapHandle, MindMapProps>(({ data, onNodeUpdate, onStructureUpdate, selectedNodeId, setSelectedNodeId }, ref) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>();

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [nodeSizes, setNodeSizes] = useState<Map<string, { width: number; height: number }>>(new Map());
  
  useImperativeHandle(ref, () => ({
    exportAsJPG: () => {
        if (!svgRef.current || !gRef.current) return;

        const EXPORT_PADDING = 40;
        // Use a higher scale factor for a sharper image, especially on high-DPI screens.
        const scale = 2; 
        const svgNode = svgRef.current;
        const gNode = gRef.current;
        
        const bbox = gNode.getBBox();

        // Calculate final canvas dimensions with padding and scaling
        const canvasWidth = (bbox.width + EXPORT_PADDING * 2) * scale;
        const canvasHeight = (bbox.height + EXPORT_PADDING * 2) * scale;

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;
        
        ctx.fillStyle = '#f9fafb'; // bg-gray-50
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const svgClone = svgNode.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('width', `${canvasWidth}`);
        svgClone.setAttribute('height', `${canvasHeight}`);
        
        const gClone = svgClone.querySelector('g');
        if (gClone) {
            const transformX = (-bbox.x + EXPORT_PADDING) * scale;
            const transformY = (-bbox.y + EXPORT_PADDING) * scale;
            // Scale the group content and translate it to fit within the new canvas
            gClone.setAttribute('transform', `translate(${transformX}, ${transformY}) scale(${scale})`);
        }

        // 1. Embed all CSS styles into the SVG to ensure classes are applied.
        const cssText = Array.from(document.styleSheets)
          .map(sheet => {
            try {
              return Array.from(sheet.cssRules).map(rule => rule.cssText).join('');
            } catch (e) {
              console.warn("Could not read stylesheet for export.", e);
              return '';
            }
          })
          .join('');

        const styleEl = document.createElement('style');
        styleEl.textContent = cssText;
        const defsEl = document.createElement('defs');
        defsEl.appendChild(styleEl);
        svgClone.insertBefore(defsEl, svgClone.firstChild);

        // 2. Convert to string and create a data URL to prevent canvas tainting.
        const svgString = new XMLSerializer().serializeToString(svgClone);
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;

        const img = new Image();

        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            
            // Use high quality for JPEG export to produce a sharp image
            const jpgUrl = canvas.toDataURL('image/jpeg', 1.0);
            const a = document.createElement('a');
            a.href = jpgUrl;
            a.download = 'mind-map.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        };

        img.onerror = (e) => {
            console.error("Failed to load SVG image for export", e);
        };

        img.src = svgDataUrl;
    }
  }));

  // Effect to pre-calculate the size of each node based on its wrapped text content.
  useEffect(() => {
    if (!data || !measurementRef.current) return;
    
    const newSizes = new Map<string, { width: number, height: number }>();
    const hierarchy = d3.hierarchy(data);
    
    hierarchy.each(node => {
        if (measurementRef.current) {
            const { padding } = getNodeStyles(node.depth);
            measurementRef.current.style.padding = padding;
            measurementRef.current.innerText = node.data.name;
            const rect = measurementRef.current.getBoundingClientRect();
            newSizes.set(node.data.id, { width: rect.width, height: rect.height });
        }
    });
    setNodeSizes(newSizes);
  }, [data]);


  const { links, nodes } = useMemo(() => {
    if (!data || nodeSizes.size === 0) return { links: [], nodes: [] };

    const dataCopy = JSON.parse(JSON.stringify(data));

    const recurse = (node: MindMapNode) => {
        if (collapsedNodes.has(node.id)) {
            node.children = [];
        }
        if (node.children) {
            for (const child of node.children) {
                recurse(child);
            }
        }
    };
    recurse(dataCopy);
    
    const root = d3.hierarchy(dataCopy);
    
    let maxWidth = 0;
    let maxHeight = 0;
    root.each(node => {
        const size = nodeSizes.get(node.data.id);
        if (size) {
            if (size.width > maxWidth) maxWidth = size.width;
            if (size.height > maxHeight) maxHeight = size.height;
        }
    });

    const dx = maxHeight + PADDING_Y * 2;
    const dy = maxWidth + 100;
    
    const treeLayout = d3.tree<MindMapNode>().nodeSize([dx, dy]);
    const treeData = treeLayout(root);
    
    return { links: treeData.links(), nodes: treeData.descendants() };
  }, [data, collapsedNodes, nodeSizes]);

  const nodeMap = useMemo(() => {
    if (!data) return new Map();
    const map = new Map<string, d3.HierarchyNode<MindMapNode>>();
    const root = d3.hierarchy(data);
    root.each(node => map.set(node.data.id, node));
    return map;
  }, [data]);

  useEffect(() => {
    const target = svgContainerRef.current;
    if (!target) return;
    const resizeObserver = new ResizeObserver(entries => {
        if (entries && entries.length > 0) {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        }
    });
    resizeObserver.observe(target);
    return () => { resizeObserver.unobserve(target); };
  }, []);
  
  const handleZoomIn = useCallback(() => d3.select(svgRef.current).transition().duration(250).call(zoomRef.current!.scaleBy, 1.2), []);
  const handleZoomOut = useCallback(() => d3.select(svgRef.current).transition().duration(250).call(zoomRef.current!.scaleBy, 0.8), []);
  
  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomRef.current || dimensions.height === 0) return;
    const initialTransform = d3.zoomIdentity.translate(120, dimensions.height / 2);
    d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, initialTransform);
  }, [dimensions.height]);
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey) {
            if (event.key === '=' || event.key === '+') { event.preventDefault(); handleZoomIn(); }
            if (event.key === '-') { event.preventDefault(); handleZoomOut(); }
            if (event.key === '0') { event.preventDefault(); resetView(); }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleZoomIn, handleZoomOut, resetView]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    
    if (!zoomRef.current) {
        zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.1, 3])
          .on('zoom', (event) => g.attr('transform', event.transform.toString()));
        svg.call(zoomRef.current);
    }
  }, []);

  useEffect(() => { if (dimensions.width > 0) resetView(); }, [resetView, data, dimensions.width]);
  useEffect(() => { if (editingNodeId && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
    } }, [editingNodeId]);

  useEffect(() => {
    if (!gRef.current) return;
    const g = d3.select(gRef.current);

    const nodeSelection = g.selectAll<SVGGElement, d3.HierarchyPointNode<MindMapNode>>('g.node')
      .data(nodes, (d) => d?.data?.id ?? '');

    const drag = d3.drag<SVGGElement, d3.HierarchyPointNode<MindMapNode>>()
        .on('start', (event, d) => {
            if (!d?.data || d.depth === 0) return;
            setDraggedNodeId(d.data.id);
            d3.select(event.sourceEvent.currentTarget).raise().classed('dragging', true);
        })
        .on('drag', (event, d) => d3.select(event.sourceEvent.currentTarget).attr('transform', `translate(${event.x},${event.y})`))
        .on('end', (event, draggedNode) => {
            d3.select(event.sourceEvent.currentTarget).classed('dragging', false);
            const currentDropTargetId = dropTargetId;
            setDraggedNodeId(null);
            setDropTargetId(null);
            
            if (!draggedNode?.data || !currentDropTargetId || currentDropTargetId === draggedNode.data.id || draggedNode.depth === 0) return;

            let isDescendant = false;
            draggedNode.each(node => { if (node?.data?.id === currentDropTargetId) isDescendant = true; });

            if (!isDescendant) {
                const newRoot = JSON.parse(JSON.stringify(data));
                let draggedInfo: { node: MindMapNode, parent: MindMapNode } | null = null;
                let targetInfo: { node: MindMapNode } | null = null;
                const findNode = (node: MindMapNode, parent: MindMapNode | null): void => {
                    if (node.id === draggedNode.data.id && parent) draggedInfo = { node, parent };
                    if (node.id === currentDropTargetId) targetInfo = { node };
                    if (node.children) node.children.forEach(child => findNode(child, node));
                };
                findNode(newRoot, null);
                if (draggedInfo && targetInfo) {
                    draggedInfo.parent.children = draggedInfo.parent.children?.filter(c => c.id !== draggedInfo!.node.id);
                    targetInfo.node.children = targetInfo.node.children || [];
                    targetInfo.node.children.push(draggedInfo.node);
                    onStructureUpdate(newRoot);
                }
            }
        });

    nodeSelection.call(drag);
  }, [data, nodes, onStructureUpdate, dropTargetId]);
  
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!selectedNodeId || editingNodeId) return;
        
        const currentNode = nodeMap.get(selectedNodeId);
        if (!currentNode) return;
        
        let shouldPreventDefault = true;
        
        switch (e.key) {
            case 'ArrowUp': {
                const parent = currentNode.parent;
                if (parent && parent.children) {
                    const currentIndex = parent.children.findIndex(child => child.data.id === selectedNodeId);
                    if (currentIndex > 0) {
                        setSelectedNodeId(parent.children[currentIndex - 1].data.id);
                    }
                }
                break;
            }
            case 'ArrowDown': {
                const parent = currentNode.parent;
                if (parent && parent.children) {
                    const currentIndex = parent.children.findIndex(child => child.data.id === selectedNodeId);
                    if (currentIndex < parent.children.length - 1) {
                        setSelectedNodeId(parent.children[currentIndex + 1].data.id);
                    }
                }
                break;
            }
            case 'ArrowLeft': {
                if (currentNode.parent) {
                    setSelectedNodeId(currentNode.parent.data.id);
                }
                break;
            }
            case 'ArrowRight': {
                const isCollapsed = collapsedNodes.has(selectedNodeId);
                if (currentNode.children && currentNode.children.length > 0 && !isCollapsed) {
                    setSelectedNodeId(currentNode.children[0].data.id);
                }
                break;
            }
            case 'Enter': {
                 if (currentNode.depth > 0) { // Root cannot be edited
                    setEditingNodeId(selectedNodeId);
                 }
                break;
            }
            case ' ': { // Space bar
                const hasOriginalChildren = !!nodeMap.get(selectedNodeId)?.children?.length;
                if (hasOriginalChildren && currentNode.depth > 0) {
                    setCollapsedNodes(prev => {
                        const newSet = new Set(prev);
                        newSet.has(selectedNodeId) ? newSet.delete(selectedNodeId) : newSet.add(selectedNodeId);
                        return newSet;
                    });
                }
                break;
            }
            default:
                shouldPreventDefault = false;
        }

        if (shouldPreventDefault) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, setSelectedNodeId, nodeMap, collapsedNodes, editingNodeId, data]);

  const handleTextClick = (event: React.MouseEvent, nodeId: string) => { 
      event.stopPropagation(); 
      setSelectedNodeId(nodeId);
      setEditingNodeId(nodeId); 
    };
  const handleInputCommit = (newName: string) => { if (editingNodeId) { onNodeUpdate(editingNodeId, newName); setEditingNodeId(null); } };
  const handleInputBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => handleInputCommit(event.target.value);
  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleInputCommit(event.currentTarget.value); } else if (event.key === 'Escape') { setEditingNodeId(null); }};
  
  const handleNodeToggle = useCallback((event: React.MouseEvent, nodeId: string) => {
    event.stopPropagation();
    setSelectedNodeId(nodeId);
    setEditingNodeId(null); // Exit editing mode when toggling
    setCollapsedNodes(prev => {
        const newSet = new Set(prev);
        newSet.has(nodeId) ? newSet.delete(nodeId) : newSet.add(nodeId);
        return newSet;
    });
  }, [setSelectedNodeId]);

  return (
    <div ref={svgContainerRef} tabIndex={0} className="relative w-full h-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent">
      <div
        ref={measurementRef}
        className="absolute -top-[9999px] -left-[9999px] font-sans font-medium text-center"
        style={{
            maxWidth: `${MAX_NODE_WIDTH}px`,
            wordBreak: 'break-word',
            fontSize: '14px',
        }}
      ></div>

      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="cursor-move">
        <g ref={gRef}>
          {links.map((link, i) => {
             const dy = link.target.y - link.source.y;
             const d = `M${link.source.y},${link.source.x}C${link.source.y + dy / 2},${link.source.x} ${link.source.y + dy / 2},${link.target.x} ${link.target.y},${link.target.x}`;
             return <path key={`link-${i}`} className="transition-all duration-500" style={{ fill: 'none', stroke: '#d1d5db', strokeWidth: 1.5 }} d={d} />;
          })}
          {nodes.map((node) => {
            const isEditing = editingNodeId === node.data.id;
            const isRoot = node.depth === 0;
            const hasChildren = !!node.data.children?.length;
            const isCollapsed = collapsedNodes.has(node.data.id);
            const canToggle = (hasChildren || isCollapsed) && !isRoot;
            const isDropTarget = dropTargetId === node.data.id && draggedNodeId && dropTargetId !== draggedNodeId;
            const isSelected = selectedNodeId === node.data.id;
            
            const size = nodeSizes.get(node.data.id) || { width: 100, height: 38 };
            const rectWidth = size.width;
            const rectHeight = size.height;

            const { rect: rectStyle, text: textStyle, padding } = getNodeStyles(node.depth);
            
            return (
              <g key={node.data.id} className={`node group transition-transform duration-500 ${isSelected ? 'selected' : ''}`}
                 transform={`translate(${node.y},${node.x})`}
                 onClick={() => setSelectedNodeId(node.data.id)}
                 onMouseOver={() => draggedNodeId && setDropTargetId(node.data.id)} onMouseOut={() => draggedNodeId && setDropTargetId(null)}>
                
                <rect x={-rectWidth / 2} y={-rectHeight / 2} width={rectWidth} height={rectHeight} rx="8"
                      className={`transition-all duration-200 stroke-2 ${ isDropTarget ? '!stroke-green-400' : ''}`} style={rectStyle} />

                {isEditing ? (
                  <foreignObject x={-rectWidth / 2} y={-rectHeight / 2} width={rectWidth} height={rectHeight}>
                    <textarea ref={inputRef} defaultValue={node.data.name} onBlur={handleInputBlur}
                           onKeyDown={handleInputKeyDown} onClick={e => e.stopPropagation()}
                           className="p-2 w-full h-full bg-white border border-accent rounded-md text-gray-800 text-sm font-sans text-center resize-none"
                           style={{padding: padding}}/>
                  </foreignObject>
                ) : (
                  <foreignObject x={-rectWidth / 2} y={-rectHeight / 2} width={rectWidth} height={rectHeight}>
                    <div xmlns="http://www.w3.org/1999/xhtml"
                        className={`w-full h-full flex items-center justify-center text-center select-none ${!isRoot ? 'cursor-text' : ''}`}
                        onDoubleClick={!isRoot ? (e) => handleTextClick(e, node.data.id) : undefined}
                        style={{ ...textStyle, padding: padding }}
                    >
                        {node.data.name}
                    </div>
                  </foreignObject>
                )}

                {canToggle && (
                  <g 
                    transform={`translate(${rectWidth / 2}, 0)`}
                    onClick={(e) => handleNodeToggle(e, node.data.id)}
                    className="cursor-pointer"
                  >
                    <circle r="10" className="fill-white stroke-gray-400 stroke-1 transition-all group-hover:stroke-accent" />
                    <foreignObject x="-8" y="-8" width="16" height="16">
                        <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full flex items-center justify-center text-gray-600">
                           {isCollapsed ? (
                                <PlusIcon className="w-4 h-4" />
                            ) : (
                                <MinusIcon className="w-4 h-4" />
                            )}
                        </div>
                    </foreignObject>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onReset={resetView} />
    </div>
  );
});

export default MindMap;