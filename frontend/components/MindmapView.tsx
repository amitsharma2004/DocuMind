'use client';

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import { BrainIcon, CloseIcon, RefreshIcon, FullscreenIcon, ExitFullscreenIcon, SpinnerIcon } from './Icons';

interface MindmapNode {
  id: string;
  label: string;
  children: string[];
}

interface MindmapData {
  title: string;
  nodes: MindmapNode[];
}

interface MindmapViewProps {
  namespace: string;
  query: string;
  selectedDocIds?: string[];
  onClose: () => void;
}

interface NodePosition {
  x: number;
  y: number;
}

export default function MindmapView({ namespace, query, selectedDocIds, onClose }: MindmapViewProps) {
  const [data, setData] = useState<MindmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          namespace,
          filter_doc_ids: selectedDocIds?.length ? selectedDocIds : null,
          top_k: 5,
          chat_history: [],
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result?.error || 'Failed to generate mindmap');
      setData(result);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate node positions using hierarchical layout
  const calculatePositions = (data: MindmapData) => {
    const positions = new Map<string, NodePosition>();
    const horizontalSpacing = 200;
    const verticalSpacing = 160;

    const rootId = data.nodes[0]?.id || '';
    const visited = new Set<string>();
    const levelMap = new Map<string, number>();
    const queue: { id: string; level: number; index: number; siblingCount: number }[] = [
      { id: rootId, level: 0, index: 0, siblingCount: 1 },
    ];

    while (queue.length > 0) {
      const { id, level, index, siblingCount } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      levelMap.set(id, level);
      const node = data.nodes.find(n => n.id === id);
      if (!node) continue;

      const y = level * verticalSpacing;
      const totalWidth = siblingCount * horizontalSpacing;
      const x = -totalWidth / 2 + index * horizontalSpacing;

      positions.set(id, { x, y });

      node.children.forEach((childId, childIndex) => {
        queue.push({
          id: childId,
          level: level + 1,
          index: childIndex,
          siblingCount: node.children.length,
        });
      });
    }

    return { positions, levelMap };
  };

  // Get node radius based on level
  const getNodeRadius = (level: number) => {
    const radii = [70, 55, 45, 38, 32, 28];
    return radii[Math.min(level, radii.length - 1)];
  };

  // Draw mindmap
  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { positions, levelMap } = calculatePositions(data);
    setNodePositions(positions);

    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      // Clear
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply transformations
      ctx.save();
      ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
      ctx.scale(zoom, zoom);

      const colors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
        '#06b6d4', '#6366f1', '#f43f5e', '#14b8a6', '#f97316',
      ];

      // Draw connections first
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      data.nodes.forEach(node => {
        const parentPos = positions.get(node.id);
        if (!parentPos) return;

        const parentLevel = levelMap.get(node.id) || 0;
        const parentRadius = getNodeRadius(parentLevel);

        node.children.forEach(childId => {
          const childPos = positions.get(childId);
          if (!childPos) return;

          const childLevel = levelMap.get(childId) || 0;
          const childRadius = getNodeRadius(childLevel);

          // Draw curved line
          ctx.beginPath();
          ctx.moveTo(parentPos.x, parentPos.y + parentRadius);
          const midY = (parentPos.y + childPos.y) / 2;
          ctx.bezierCurveTo(
            parentPos.x, midY,
            childPos.x, midY,
            childPos.x, childPos.y - childRadius
          );
          ctx.stroke();
        });
      });

      // Draw nodes
      data.nodes.forEach((node, idx) => {
        const pos = positions.get(node.id);
        if (!pos) return;

        const level = levelMap.get(node.id) || 0;
        const nodeRadius = getNodeRadius(level);
        const isRoot = node.id === data.nodes[0].id;
        const color = colors[idx % colors.length];

        // Draw circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.font = isRoot ? 'bold 13px sans-serif' : `${11 - level * 0.5}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Wrap text based on node size
        const maxCharsPerLine = Math.max(8, 16 - level * 2);
        const words = node.label.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        words.forEach(word => {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          if (testLine.length > maxCharsPerLine) {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        });
        if (currentLine) lines.push(currentLine);

        const lineHeight = 12;
        const totalHeight = (lines.length - 1) * lineHeight;
        const textStartY = pos.y - totalHeight / 2;

        lines.forEach((line, i) => {
          ctx.fillText(line, pos.x, textStartY + i * lineHeight);
        });
      });

      ctx.restore();
    };

    draw();
  }, [data, zoom, pan]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  // Pan with mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Reset view
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'}`}>
      <div className={`${isFullscreen ? 'w-full h-full' : 'bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh]'} bg-white dark:bg-gray-900 ${!isFullscreen && 'rounded-2xl shadow-2xl'} p-6 flex flex-col gap-4`}>
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="w-5 h-5"><BrainIcon /></div>
              Mind Map
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Scroll to zoom · Drag to pan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-6 h-6"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 w-6 h-6">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Generate button */}
        {!data && (
          <div className="flex flex-col items-center gap-4 py-12 flex-1">
            <div className="w-16 h-16"><BrainIcon /></div>
            <p className="text-gray-600 dark:text-gray-300 text-sm text-center max-w-sm">
              Generate a visual mind map from your documents
            </p>
            <button
              onClick={generate}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4"><SpinnerIcon /></div>
                  Generating…
                </>
              ) : '✨ Generate Mind Map'}
            </button>
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </div>
        )}

        {/* Canvas */}
        {data && (
          <>
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{data.title}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetView}
                  className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
                >
                  <div className="w-3 h-3"><RefreshIcon /></div>
                  Reset
                </button>
                <button
                  onClick={generate}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-1"
                >
                  {loading ? (
                    <>
                      <div className="w-3 h-3"><SpinnerIcon /></div>
                      Regenerating…
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3"><RefreshIcon /></div>
                      Regenerate
                    </>
                  )}
                </button>
              </div>
            </div>
            <div 
              ref={containerRef}
              className={`${isFullscreen ? 'flex-1' : 'flex-1'} overflow-hidden ${!isFullscreen && 'rounded-lg'} border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-grab active:cursor-grabbing`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full"
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Zoom: {(zoom * 100).toFixed(0)}% · Use scroll wheel to zoom, drag to pan
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
