import React, { useRef, useMemo, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { MindMapNode, MindMapLayout, Images } from '../types';
import { PlusIcon, MinusIcon, ResetZoomIcon } from './icons';

const PADDING_X = 24;
const PADDING_Y = 16;
const MAX_NODE_WIDTH = 200;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 24;
const IMAGE_HEIGHT = 120;


const ZoomControls: React.FC<{
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}> = ({ onZoomIn, onZoomOut, onReset }) => {
  return (
    <div className="glass-surface absolute bottom-4 right-4 shadow-apple-md rounded-full p-1 flex flex-col gap-1 border border-border-color/60 z-10">
      <button onClick={onZoomIn} title="放大 (Cmd/Ctrl +)" className="p-2 rounded-full hover:bg-border-color/50 transition-all duration-150 ease-apple active:scale-90 text-text-secondary">
        <PlusIcon className="w-5 h-5" />
      </button>
      <button onClick={onZoomOut} title="縮小 (Cmd/Ctrl -)" className="p-2 rounded-full hover:bg-border-color/50 transition-all duration-150 ease-apple active:scale-90 text-text-secondary">
        <MinusIcon className="w-5 h-5" />
      </button>
      <button onClick={onReset} title="重置視圖 (Cmd/Ctrl 0)" className="p-2 rounded-full hover:bg-border-color/50 transition-all duration-150 ease-apple active:scale-90 text-text-secondary">
        <ResetZoomIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

interface MindMapProps {
  data: MindMapNode;
  layout: MindMapLayout;
  onNodeUpdate: (nodeId: string, newName: string) => void;
  onStructureUpdate: (newRoot: MindMapNode) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  images: Images;
  theme: 'light' | 'dark';
}

export interface MindMapHandle {
  exportAsJPG: () => void;
}

// A soft drop shadow applied to "card" style nodes (depth 2+) for an Apple-like
// floating-surface feel, without touching stroke/fill (which theming handles).
const CARD_SHADOW = 'drop-shadow(0 1px 2px rgba(0,0,0,0.06)) drop-shadow(0 4px 10px rgba(0,0,0,0.08))';

const getNodeStyles = (depth: number, theme: 'light' | 'dark') => {
    const isDark = theme === 'dark';
    const baseText: React.CSSProperties = {
        fontFamily: `-apple-system, BlinkMacSystemFont, "SF Pro Text", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
        fontWeight: 500,
        fontSize: '14px',
        letterSpacing: '-0.005em',
        overflowWrap: 'break-word',
    };
    const basePadding = `${PADDING_Y / 2}px ${PADDING_X / 2}px`;

    switch (depth) {
        case 0: // Root — a bold, filled accent capsule
            return {
                rect: { fill: 'var(--color-accent)', stroke: 'transparent' } as React.CSSProperties,
                text: { ...baseText, color: '#ffffff', fontWeight: 600 },
                padding: basePadding,
                rx: 18,
            };
        case 1: // Level 2 — a soft tinted chip in the accent color
            return {
                rect: {
                    fill: isDark ? 'rgba(10, 132, 255, 0.18)' : 'rgba(0, 113, 227, 0.1)',
                    stroke: 'transparent',
                } as React.CSSProperties,
                text: { ...baseText, color: 'var(--color-accent)', fontWeight: 600 },
                padding: basePadding,
                rx: 14,
            };
        default: // Level 3+ — a clean elevated card, floating above the canvas
            return {
                rect: {
                    fill: 'var(--color-elevated)',
                    stroke: 'var(--color-border-color)',
                    strokeWidth: 1,
                    filter: CARD_SHADOW,
                } as React.CSSProperties,
                text: { ...baseText, color: 'var(--color-text-main)' },
                padding: basePadding,
                rx: 12,
            };
    }
};

const MindMap = forwardRef<MindMapHandle, MindMapProps>(({ data, layout, onNodeUpdate, onStructureUpdate, selectedNodeId, setSelectedNodeId, images, theme }, ref) => {
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
        if (!svgRef.current || !gRef.current || !svgContainerRef.current) return;

        const EXPORT_PADDING = 40;
        const scale = 2; 
        const svgNode = svgRef.current;
        const gNode = gRef.current;
        
        const bbox = gNode.getBBox();

        const canvasWidth = (bbox.width + EXPORT_PADDING * 2) * scale;
        const canvasHeight = (bbox.height + EXPORT_PADDING * 2) * scale;

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;
        
        const computedStyle = getComputedStyle(svgContainerRef.current);
        ctx.fillStyle = computedStyle.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const svgClone = svgNode.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('width', `${canvasWidth}`);
        svgClone.setAttribute('height', `${canvasHeight}`);
        
        const gClone = svgClone.querySelector('g');
        if (gClone) {
            const transformX = (-bbox.x + EXPORT_PADDING) * scale;
            const transformY = (-bbox.y + EXPORT_PADDING) * scale;
            gClone.setAttribute('transform', `translate(${transformX}, ${transformY}) scale(${scale})`);
        }

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

        const svgString = new XMLSerializer().serializeToString(svgClone);
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;

        const img = new Image();

        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            
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
            const { padding } = getNodeStyles(node.depth, theme);
            measurementRef.current.style.padding = padding;
            measurementRef.current.innerText = node.data.name;
            const rect = measurementRef.current.getBoundingClientRect();
            
            const hasImage = !!node.data.imageUrl;
            const imageContribution = hasImage ? IMAGE_HEIGHT + PADDING_Y / 2 : 0;
            
            newSizes.set(node.data.id, { 
                width: rect.width, 
                height: rect.height + imageContribution 
            });
        }
    });
    setNodeSizes(newSizes);
  }, [data, theme]);


  const { links, nodes } = useMemo(() => {
    if (!data || nodeSizes.size === 0) return { links: [], nodes: [] };

    const fullRoot = d3.hierarchy(JSON.parse(JSON.stringify(data)));
    
    const getNodeHeight = (node: d3.HierarchyNode<MindMapNode>) => nodeSizes.get(node.data.id)?.height || 0;
    const getNodeWidth = (node: d3.HierarchyNode<MindMapNode>) => nodeSizes.get(node.data.id)?.width || 0;

    // A two-pass layout function for horizontal trees (Logic, MindMap)
    const computeHorizontalLayout = (rootNode: d3.HierarchyNode<MindMapNode>) => {
        // First pass: post-order traversal to calculate subtree spans (heights)
        rootNode.eachAfter(node => {
            const isCollapsed = collapsedNodes.has(node.data.id);
            const nodeHeight = getNodeHeight(node);
            let childrenSpan = 0;
            if (node.children && !isCollapsed) {
                childrenSpan = node.children.reduce((acc, child) => acc + (child as any).subtreeSpan, 0) + (node.children.length - 1) * VERTICAL_GAP;
            }
            (node as any).subtreeSpan = Math.max(nodeHeight, childrenSpan);
        });

        // Second pass: pre-order traversal to set final positions
        const setPositions = (node: d3.HierarchyNode<MindMapNode>, x: number, y: number) => {
            const pointNode = node as d3.HierarchyPointNode<MindMapNode>;
            pointNode.x = x;
            pointNode.y = y;

            const isCollapsed = collapsedNodes.has(node.data.id);
            if (node.children && !isCollapsed) {
                const totalChildrenSpan = (node as any).subtreeSpan;
                let childXOffset = x - totalChildrenSpan / 2;

                node.children.forEach(child => {
                    const childSubtreeSpan = (child as any).subtreeSpan;
                    const childY = y + getNodeWidth(node) / 2 + getNodeWidth(child) / 2 + HORIZONTAL_GAP;
                    setPositions(child, childXOffset + childSubtreeSpan / 2, childY);
                    childXOffset += childSubtreeSpan + VERTICAL_GAP;
                });
            }
        };
        setPositions(rootNode, 0, 0);
    };
    
    // A two-pass layout function for vertical trees (Organizational)
    const computeVerticalLayout = (rootNode: d3.HierarchyNode<MindMapNode>) => {
        rootNode.eachAfter(node => {
            const isCollapsed = collapsedNodes.has(node.data.id);
            const nodeWidth = getNodeWidth(node);
            let childrenSpan = 0;
            if (node.children && !isCollapsed) {
                childrenSpan = node.children.reduce((acc, child) => acc + (child as any).subtreeSpan, 0) + (node.children.length - 1) * HORIZONTAL_GAP;
            }
            (node as any).subtreeSpan = Math.max(nodeWidth, childrenSpan);
        });

        const setPositions = (node: d3.HierarchyNode<MindMapNode>, x: number, y: number) => {
            const pointNode = node as d3.HierarchyPointNode<MindMapNode>;
            pointNode.x = x;
            pointNode.y = y;

            const isCollapsed = collapsedNodes.has(node.data.id);
            if (node.children && !isCollapsed) {
                const totalChildrenSpan = (node as any).subtreeSpan;
                let childXOffset = x - totalChildrenSpan / 2;

                node.children.forEach(child => {
                    const childSubtreeSpan = (child as any).subtreeSpan;
                    const childY = y + getNodeHeight(node) + PADDING_Y * 2;
                    setPositions(child, childXOffset + childSubtreeSpan / 2, childY);
                    childXOffset += childSubtreeSpan + HORIZONTAL_GAP;
                });
            }
        };
        setPositions(rootNode, 0, 0);
    };

    if (layout === MindMapLayout.MindMap) {
        const rootNode = fullRoot.descendants().find(n => n.depth === 0)! as d3.HierarchyPointNode<MindMapNode>;
        rootNode.x = 0;
        rootNode.y = 0;

        const children = rootNode.children || [];
        const midIndex = Math.ceil(children.length / 2);
        const leftChildren = children.slice(0, midIndex);
        const rightChildren = children.slice(midIndex);

        [leftChildren, rightChildren].forEach((childGroup, groupIndex) => {
            const isLeftSide = groupIndex === 0;
            if (childGroup.length === 0) return;

            const dummyRootData: MindMapNode = { id: `dummy-root-${isLeftSide ? 'l' : 'r'}`, name: 'dummy', children: childGroup.map(c => c.data), level: 0, lineNumber: -1, originalLine: '', prefix: '' };
            const groupRoot = d3.hierarchy(dummyRootData);
            
            computeHorizontalLayout(groupRoot);

            const rootNodeWidth = getNodeWidth(rootNode);
            groupRoot.descendants().forEach(node => {
                if (node.depth === 0) return; // Skip the dummy root
                const pointNode = node as d3.HierarchyPointNode<MindMapNode>;
                
                // Find the original node from the full hierarchy to preserve animations
                const originalNode = fullRoot.descendants().find(n => n.data.id === node.data.id) as d3.HierarchyPointNode<MindMapNode>;
                if (originalNode) {
                    // Adjust position to account for the root node's width
                    const finalY = pointNode.y + (rootNodeWidth / 2);
                    
                    originalNode.x = pointNode.x;
                    originalNode.y = isLeftSide ? -finalY : finalY;
                    originalNode.data.side = isLeftSide ? 'left' : 'right';
                }
            });
        });
        
    } else if (layout === MindMapLayout.Logic) {
        computeHorizontalLayout(fullRoot);
    } else if (layout === MindMapLayout.Organizational) {
        computeVerticalLayout(fullRoot);
    }
    
    // Traverse the hierarchy to set visibility and animation start positions for collapsed nodes.
    // A pre-order traversal ensures that a parent's visibility is determined before its children.
    fullRoot.each(node => {
      const pointNode = node as d3.HierarchyPointNode<MindMapNode>;

      if (node.parent) {
        const parentNode = node.parent as d3.HierarchyPointNode<MindMapNode>;
        // A node is hidden if its parent is explicitly collapsed, or if its parent is already hidden 
        // (i.e., it's a descendant of an ancestor that was collapsed).
        const parentIsHidden = (parentNode as any).isCollapsedChild;
        const parentIsCollapsed = collapsedNodes.has(parentNode.data.id);

        if (parentIsHidden || parentIsCollapsed) {
          (pointNode as any).isCollapsedChild = true;
          // For animation, the hidden node should start from its parent's position. Since we traverse 
          // top-down, the parent's position is already correctly set (either its layout position or its 
          // own collapsed-from position).
          pointNode.x = parentNode.x;
          pointNode.y = parentNode.y;
        } else {
          (pointNode as any).isCollapsedChild = false;
        }
      } else {
        // The root node is never hidden.
        (pointNode as any).isCollapsedChild = false;
      }
    });

    // The final nodes are all the descendants, with their visibility and positions now correctly set.
    const finalNodes = fullRoot.descendants();
    // The links connect these nodes. The rendering logic will hide links to invisible nodes.
    const finalLinks = fullRoot.links();

    return { links: finalLinks, nodes: finalNodes };
  }, [data, collapsedNodes, nodeSizes, layout]);

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
    let initialTransform;
    switch (layout) {
        case MindMapLayout.Organizational:
            initialTransform = d3.zoomIdentity.translate(dimensions.width / 2, 80);
            break;
        case MindMapLayout.MindMap:
            initialTransform = d3.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2);
            break;
        case MindMapLayout.Logic:
        default:
            initialTransform = d3.zoomIdentity.translate(80, dimensions.height / 2);
            break;
    }
    d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, initialTransform);
  }, [dimensions.width, dimensions.height, layout]);
  
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
                 if (layout === MindMapLayout.Organizational) {
                    if (currentNode.parent) setSelectedNodeId(currentNode.parent.data.id);
                 } else {
                    const parent = currentNode.parent;
                    if (parent && parent.children) {
                        const currentIndex = parent.children.findIndex(child => child.data.id === selectedNodeId);
                        if (currentIndex > 0) {
                            setSelectedNodeId(parent.children[currentIndex - 1].data.id);
                        }
                    }
                 }
                break;
            }
            case 'ArrowDown': {
                if (layout === MindMapLayout.Organizational) {
                    const isCollapsed = collapsedNodes.has(selectedNodeId);
                     if (currentNode.children && currentNode.children.length > 0 && !isCollapsed) {
                        setSelectedNodeId(currentNode.children[0].data.id);
                    }
                } else {
                    const parent = currentNode.parent;
                    if (parent && parent.children) {
                        const currentIndex = parent.children.findIndex(child => child.data.id === selectedNodeId);
                        if (currentIndex < parent.children.length - 1) {
                            setSelectedNodeId(parent.children[currentIndex + 1].data.id);
                        }
                    }
                }
                break;
            }
            case 'ArrowLeft': {
                if (layout !== MindMapLayout.Organizational && currentNode.parent) {
                    setSelectedNodeId(currentNode.parent.data.id);
                }
                break;
            }
            case 'ArrowRight': {
                if (layout !== MindMapLayout.Organizational) {
                    const isCollapsed = collapsedNodes.has(selectedNodeId);
                    if (currentNode.children && currentNode.children.length > 0 && !isCollapsed) {
                        setSelectedNodeId(currentNode.children[0].data.id);
                    }
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
  }, [selectedNodeId, setSelectedNodeId, nodeMap, collapsedNodes, editingNodeId, data, layout]);

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
    <div ref={svgContainerRef} tabIndex={0} className="relative w-full h-full bg-secondary rounded-2xl border border-border-color overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent/60">
      <div
        ref={measurementRef}
        className="absolute -top-[9999px] -left-[9999px] font-sans font-medium text-center"
        style={{
            maxWidth: `${MAX_NODE_WIDTH}px`,
            overflowWrap: 'break-word',
            fontSize: '14px',
        }}
      ></div>

      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="cursor-move">
        <g ref={gRef}>
          {links.map((link, i) => {
             if (!link.source || !link.target) return null;
             const isTargetCollapsed = (link.target as any).isCollapsedChild;
             let d;
             if (layout === MindMapLayout.Organizational) {
                d = d3.linkVertical<any, d3.HierarchyPointNode<MindMapNode>>().x(d => d.x).y(d => d.y)({ source: link.source as any, target: link.target as any });
             } else {
                 const sourceNode = link.source as d3.HierarchyPointNode<MindMapNode>;
                 const targetNode = link.target as d3.HierarchyPointNode<MindMapNode>;
                 const dx = targetNode.y - sourceNode.y;
                 d = `M${sourceNode.y},${sourceNode.x}C${sourceNode.y + dx / 2},${sourceNode.x} ${sourceNode.y + dx / 2},${targetNode.x} ${targetNode.y},${targetNode.x}`;
             }
             return <path key={`link-${i}`} style={{ fill: 'none', stroke: 'var(--color-border-color)', strokeWidth: 1.5, opacity: isTargetCollapsed ? 0 : 1, transition: 'd 500ms var(--ease-apple), opacity 500ms var(--ease-apple)' }} d={d!} />;
          })}
          {nodes.map((node) => {
            const isEditing = editingNodeId === node.data.id;
            const isRoot = node.depth === 0;
            const hasChildren = !!node.data.children?.length;
            const isCollapsed = collapsedNodes.has(node.data.id);
            const isCollapsedChild = (node as any).isCollapsedChild;
            const canToggle = (hasChildren || isCollapsed) && !isRoot;
            const isDropTarget = dropTargetId === node.data.id && draggedNodeId && dropTargetId !== draggedNodeId;
            const isSelected = selectedNodeId === node.data.id;
            
            const size = nodeSizes.get(node.data.id) || { width: 100, height: 38 };
            const rectWidth = size.width;
            const rectHeight = size.height;

            const { rect: rectStyle, text: textStyle, padding, rx: rectRadius } = getNodeStyles(node.depth, theme);

            const hasImage = !!node.data.imageUrl;
            let imageUrl: string | undefined = node.data.imageUrl;
            if (imageUrl?.startsWith('image://')) {
                const imageId = imageUrl.substring(8);
                imageUrl = images[imageId];
            }
            
            let nodeTransform = `translate(${node.y},${node.x})`;
            if (layout === MindMapLayout.Organizational) {
                nodeTransform = `translate(${node.x},${node.y})`;
            }

            let toggleTransform = `translate(${rectWidth / 2}, 0)`;
            if (layout === MindMapLayout.Organizational) {
                toggleTransform = `translate(0, ${rectHeight / 2})`;
            } else if (layout === MindMapLayout.MindMap && node.data.side === 'left') {
                toggleTransform = `translate(${-rectWidth / 2}, 0)`;
            }

            return (
              <g key={node.data.id} className={`node group ${isSelected ? 'selected' : ''}`}
                 transform={nodeTransform}
                 style={{
                     opacity: isCollapsedChild ? 0 : 1,
                     pointerEvents: isCollapsedChild ? 'none' : 'auto',
                     transition: 'transform 500ms var(--ease-apple), opacity 500ms var(--ease-apple)',
                 }}
                 onClick={() => setSelectedNodeId(node.data.id)}
                 onMouseOver={() => draggedNodeId && setDropTargetId(node.data.id)} onMouseOut={() => draggedNodeId && setDropTargetId(null)}>

                <rect x={-rectWidth / 2} y={-rectHeight / 2} width={rectWidth} height={rectHeight} rx={rectRadius}
                      className={`transition-all duration-200 ease-apple stroke-2 ${ isDropTarget ? '!stroke-green-400' : ''}`} style={rectStyle} />

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
                        className={`w-full h-full flex flex-col items-center justify-center text-center select-none ${!isRoot ? 'cursor-text' : ''}`}
                        onDoubleClick={!isRoot ? (e) => handleTextClick(e, node.data.id) : undefined}
                        style={{ ...textStyle, padding: padding }}
                    >
                        {hasImage && imageUrl && (
                            <img 
                                src={imageUrl} 
                                alt={node.data.name} 
                                className="block rounded-md object-contain mb-2"
                                style={{ maxHeight: `${IMAGE_HEIGHT}px`, maxWidth: '100%' }}
                            />
                        )}
                        <div className="flex-shrink-0">{node.data.name}</div>
                    </div>
                  </foreignObject>
                )}

                {canToggle && (
                  <g 
                    transform={toggleTransform}
                    onClick={(e) => handleNodeToggle(e, node.data.id)}
                    className="cursor-pointer"
                  >
                    <circle r="10" style={{ fill: 'var(--color-elevated)', stroke: 'var(--color-border-color)', filter: CARD_SHADOW }} className="stroke-1 transition-all duration-150 ease-apple group-hover:stroke-accent" />
                    <foreignObject x="-8" y="-8" width="16" height="16">
                        <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full flex items-center justify-center text-text-secondary">
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