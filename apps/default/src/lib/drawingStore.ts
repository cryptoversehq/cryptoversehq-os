import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DrawingTool = 'none' | 'hline' | 'trendline' | 'fibonacci';

export interface HorizontalLine {
  kind:     'hline';
  id:       string;
  price:    number;
  color:    string;
  label?:   string;
  style:    'solid' | 'dashed' | 'dotted';
  /** ID of a linked PriceAlert (if any) */
  alertId?: string;
  /** Visual state when a linked alert fires */
  alertTriggered?: boolean;
}

export interface TrendLine {
  kind:    'trendline';
  id:      string;
  x1:      number;   // candle index (0-based in visible slice)
  price1:  number;
  x2:      number;
  price2:  number;
  color:   string;
  style:   'solid' | 'dashed';
}

export interface FibRetracement {
  kind:    'fibonacci';
  id:      string;
  price1:  number;   // swing high (top of drag)
  price2:  number;   // swing low  (bottom of drag)
  x1:      number;   // candle index
  x2:      number;
  color:   string;
}

export type Drawing = HorizontalLine | TrendLine | FibRetracement;

// Fibonacci levels to draw
export const FIB_LEVELS = [
  { level: 0,     label: '0',     color: '#eaecef' },
  { level: 0.236, label: '0.236', color: '#f0b90b' },
  { level: 0.382, label: '0.382', color: '#00bcd4' },
  { level: 0.5,   label: '0.5',   color: '#9945FF' },
  { level: 0.618, label: '0.618', color: '#f6465d' },
  { level: 0.786, label: '0.786', color: '#ff9800' },
  { level: 1,     label: '1',     color: '#eaecef' },
];

interface DrawingState {
  activeTool:   DrawingTool;
  drawings:     Drawing[];
  selectedId:   string | null;

  setActiveTool:  (tool: DrawingTool) => void;
  addDrawing:     (d: Drawing) => void;
  removeDrawing:  (id: string) => void;
  clearAll:       () => void;
  selectDrawing:  (id: string | null) => void;
  updateDrawing:  (id: string, patch: Record<string, unknown>) => void;
}

let idCounter = 0;
export const newId = () => `drawing-${++idCounter}-${Date.now()}`;

export const useDrawingStore = create<DrawingState>((set) => ({
  activeTool:  'none',
  drawings:    [],
  selectedId:  null,

  setActiveTool: (tool) => set({ activeTool: tool, selectedId: null }),

  addDrawing: (d) => set(s => ({
    drawings:   [...s.drawings, d],
    activeTool: 'none',  // auto-deactivate after placing
  })),

  removeDrawing: (id) => set(s => ({
    drawings:  s.drawings.filter(d => d.id !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
  })),

  clearAll: () => set({ drawings: [], selectedId: null }),

  selectDrawing: (id) => set({ selectedId: id }),

  updateDrawing: (id, patch) => set(s => ({
    drawings: s.drawings.map(d => d.id === id ? { ...d, ...patch } as unknown as Drawing : d),
  })),
}));
