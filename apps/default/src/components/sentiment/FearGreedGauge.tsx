/**
 * FearGreedGauge.tsx
 * Animated SVG semicircle gauge showing the Fear & Greed Index 0-100.
 * Needle rotates smoothly via CSS transitions. Color bands match Alternative.me.
 */
import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { type FearGreedZone, FEAR_GREED_META } from '../../lib/sentimentTypes';
import { fearGreedToAngle } from './sentimentUtils';
import { cn } from '@/lib/utils';

interface FearGreedGaugeProps {
  value: number;        // 0-100
  zone:  FearGreedZone;
  size?: number;        // viewBox size (default 220)
  showLabel?: boolean;
  animate?: boolean;
}

const BANDS = [
  { from: 0,  to: 25,  color: '#ef4444', label: 'Extreme Fear' },
  { from: 25, to: 45,  color: '#f97316', label: 'Fear' },
  { from: 45, to: 56,  color: '#a3a3a3', label: 'Neutral' },
  { from: 56, to: 75,  color: '#22c55e', label: 'Greed' },
  { from: 75, to: 100, color: '#4ade80', label: 'Extreme Greed' },
];

const CX = 110;
const CY = 110;
const R  = 82;

function valueToAngleDeg(v: number): number {
  return fearGreedToAngle(v);
}

function polarToXY(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function bandArc(fromV: number, toV: number): string {
  const a1 = valueToAngleDeg(fromV);
  const a2 = valueToAngleDeg(toV);
  const p1 = polarToXY(a1, R);
  const p2 = polarToXY(a2, R);
  const large = toV - fromV > 50 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${R} ${R} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

export function FearGreedGauge({ value, zone, size = 220, showLabel = true, animate = true }: FearGreedGaugeProps) {
  const meta = FEAR_GREED_META[zone];
  const [displayValue, setDisplayValue] = useState(animate ? 50 : value);

  useEffect(() => {
    if (!animate) { setDisplayValue(value); return; }
    const target = value;
    const start  = displayValue;
    const diff   = target - start;
    const steps  = 30;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplayValue(start + diff * (step / steps));
      if (step >= steps) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [value]);

  const needleAngle = valueToAngleDeg(displayValue);
  const needleTip   = polarToXY(needleAngle, R - 8);
  const needleBase1 = polarToXY(needleAngle + 90, 7);
  const needleBase2 = polarToXY(needleAngle - 90, 7);

  const scale = size / 220;

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ width: size, height: size * 0.68 }}>
        <svg
          viewBox="0 0 220 150"
          width={size}
          height={size * 0.68}
          style={{ overflow: 'visible' }}
        >
          {/* Colour bands */}
          {BANDS.map(b => (
            <path
              key={b.label}
              d={bandArc(b.from, b.to)}
              fill="none"
              stroke={b.color}
              strokeWidth={12}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}

          {/* Track glow */}
          <path
            d={`M ${polarToXY(valueToAngleDeg(0), R).x} ${polarToXY(valueToAngleDeg(0), R).y}
                A ${R} ${R} 0 0 1 ${polarToXY(valueToAngleDeg(100), R).x} ${polarToXY(valueToAngleDeg(100), R).y}`}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={20}
            strokeLinecap="round"
          />

          {/* Tick marks */}
          {[0, 25, 45, 55, 75, 100].map(v => {
            const inner = polarToXY(valueToAngleDeg(v), R - 16);
            const outer = polarToXY(valueToAngleDeg(v), R + 4);
            return (
              <line
                key={v}
                x1={inner.x} y1={inner.y}
                x2={outer.x} y2={outer.y}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
            fill={meta.color}
            style={{ filter: `drop-shadow(0 0 4px ${meta.color}80)` }}
          />

          {/* Centre hub */}
          <circle cx={CX} cy={CY} r={9} fill={meta.color} />
          <circle cx={CX} cy={CY} r={5} fill="#0a0a0f" />

          {/* Value text */}
          <text x={CX} y={CY + 32} textAnchor="middle"
            fill={meta.color} fontSize={30} fontWeight={900} fontFamily="inherit"
            style={{ filter: `drop-shadow(0 0 8px ${meta.color}60)` }}>
            {Math.round(displayValue)}
          </text>

          {/* Label */}
          {showLabel && (
            <text x={CX} y={CY + 52} textAnchor="middle"
              fill={meta.color} fontSize={11} fontWeight={700} fontFamily="inherit">
              {meta.label} {meta.icon}
            </text>
          )}

          {/* Axis labels */}
          <text x={17}  y={126} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={9}>0</text>
          <text x={203} y={126} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={9}>100</text>
        </svg>
      </div>
    </div>
  );
}
