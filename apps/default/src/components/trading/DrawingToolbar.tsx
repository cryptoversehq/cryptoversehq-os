import React from 'react';
import { Minus, TrendingUp, GitBranch, Trash2, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDrawingStore, DrawingTool } from '@/lib/drawingStore';

const TOOLS: {
  id:      DrawingTool;
  icon:    React.ComponentType<{ className?: string }>;
  label:   string;
  hint:    string;
  color:   string;
}[] = [
  {
    id:    'hline',
    icon:  Minus,
    label: 'H-Line',
    hint:  'Click to place a horizontal support/resistance line',
    color: '#f0b90b',
  },
  {
    id:    'trendline',
    icon:  TrendingUp,
    label: 'Trend',
    hint:  'Click two points to draw a trend line',
    color: '#00bcd4',
  },
  {
    id:    'fibonacci',
    icon:  GitBranch,
    label: 'Fib',
    hint:  'Drag from swing high to swing low — auto-draws 23.6%, 38.2%, 50%, 61.8%, 78.6% levels',
    color: '#9945FF',
  },
];

export function DrawingToolbar() {
  const { activeTool, setActiveTool, drawings, clearAll } = useDrawingStore();

  return (
    <div className="flex items-center gap-0.5">
      {/* Cursor / deselect */}
      <button
        onClick={() => setActiveTool('none')}
        title="Pointer (Esc)"
        className={cn(
          'p-1.5 rounded transition-all text-[11px] flex items-center gap-1',
          activeTool === 'none'
            ? 'bg-white/10 text-[#eaecef]'
            : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-white/5',
        )}
      >
        <MousePointer2 className="w-3.5 h-3.5" />
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-white/10 mx-0.5" />

      {/* Tool buttons */}
      {TOOLS.map(({ id, icon: Icon, label, hint, color }) => {
        const isActive = activeTool === id;
        return (
          <button
            key={id}
            onClick={() => setActiveTool(isActive ? 'none' : id)}
            title={hint}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all',
              isActive
                ? 'text-[#161a1e] font-bold shadow-md'
                : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-white/5',
            )}
            style={isActive ? { backgroundColor: color, boxShadow: `0 0 8px ${color}55` } : {}}
          >
            <Icon className="w-3 h-3" />
            <span>{label}</span>
            {isActive && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"
              />
            )}
          </button>
        );
      })}

      {/* Drawing count badge + clear */}
      {drawings.length > 0 && (
        <>
          <div className="w-px h-4 bg-white/10 mx-0.5" />
          <span className="text-[10px] text-[#848e9c] px-1">
            {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={clearAll}
            title="Clear all drawings"
            className="p-1.5 rounded text-[#848e9c] hover:text-[#f6465d] hover:bg-[#f6465d]/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}
