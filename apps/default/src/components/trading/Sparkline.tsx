import React, { useMemo } from 'react';

interface Props {
  data:   number[];
  width?: number;
  height?: number;
  color:  string;
  /** Whether to fill the area under the line */
  filled?: boolean;
  /** Show a dot at the last point */
  dot?:   boolean;
  /** Show subtle horizontal grid */
  grid?:  boolean;
  strokeWidth?: number;
}

function smooth(points: [number, number][]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cpx = (x0 + x1) / 2;
    d += ` C ${cpx} ${y0}, ${cpx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

export function Sparkline({
  data,
  width  = 80,
  height = 32,
  color,
  filled    = true,
  dot       = true,
  grid      = false,
  strokeWidth = 1.5,
}: Props) {
  const path = useMemo(() => {
    const valid = data.filter(v => isFinite(v) && v > 0);
    if (valid.length < 2) return { line: '', area: '', points: [] as [number,number][] };

    const minV = Math.min(...valid);
    const maxV = Math.max(...valid);
    const range = maxV - minV || 1;
    const padX  = 2;
    const padY  = 3;
    const w     = width  - padX * 2;
    const h     = height - padY * 2;

    const pts: [number, number][] = valid.map((v, i) => [
      padX + (i / (valid.length - 1)) * w,
      padY + (1 - (v - minV) / range) * h,
    ]);

    const line = smooth(pts);
    const lastX = pts[pts.length - 1][0];
    const area  = filled
      ? `${line} L ${lastX} ${height - padY} L ${padX} ${height - padY} Z`
      : '';

    return { line, area, points: pts };
  }, [data, width, height, filled]);

  if (!path.line) return (
    <svg width={width} height={height}>
      <line x1={2} y1={height / 2} x2={width - 2} y2={height / 2} stroke={color} strokeOpacity={0.2} strokeWidth={1} />
    </svg>
  );

  const gradId = `spark-grad-${color.replace('#', '')}`;
  const lastPt  = path.points[path.points.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Optional grid */}
      {grid && (
        <>
          <line x1={2} y1={height / 2} x2={width - 2} y2={height / 2}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <line x1={2} y1={height / 4} x2={width - 2} y2={height / 4}
            stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
          <line x1={2} y1={(height * 3) / 4} x2={width - 2} y2={(height * 3) / 4}
            stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        </>
      )}

      {/* Area fill */}
      {filled && (
        <path d={path.area} fill={`url(#${gradId})`} />
      )}

      {/* Line */}
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Endpoint dot */}
      {dot && lastPt && (
        <>
          <circle cx={lastPt[0]} cy={lastPt[1]} r={3} fill={color} opacity={0.25} />
          <circle cx={lastPt[0]} cy={lastPt[1]} r={1.5} fill={color} />
        </>
      )}
    </svg>
  );
}
