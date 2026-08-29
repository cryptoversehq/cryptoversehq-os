/**
 * ChartErrorBoundary.tsx
 *
 * Both trading audits flagged the same critical gap: no React Error
 * Boundary wraps the chart/trading rendering path, so a single SVG or
 * calculation crash (e.g. a malformed candle, a NaN from a division by
 * zero) takes down the entire terminal instead of just the chart panel.
 *
 * This is a small, dependency-free class component (Error Boundaries must
 * be class components — there is no hook equivalent) that:
 *   - catches render errors anywhere in its subtree,
 *   - shows a calm, on-brand fallback instead of a blank/broken page,
 *   - lets the user recover with a "Reload chart" button without having
 *     to refresh the whole app and lose their open positions.
 */
import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Optional label shown in the fallback, e.g. "Trading Chart". */
  label?: string;
}

interface State {
  hasError: boolean;
}

export class ChartErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ChartErrorBoundary] ${this.props.label ?? 'chart'} crashed:`, error, info);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-3 p-6 text-center"
        style={{ background: 'var(--cv-dash-bg, #0b0e14)' }}>
        <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-white/80">
            {this.props.label ?? 'This panel'} hit a rendering error
          </p>
          <p className="text-[11px] text-white/40 max-w-xs">
            Your positions and balance are safe — only the chart view crashed.
          </p>
        </div>
        <button
          onClick={this.reset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 text-amber-400 text-[11px] font-semibold transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reload chart
        </button>
      </div>
    );
  }
}
