import React, { useRef, useEffect, useMemo, useState } from 'react';
import { OrderBookLevel } from '@/lib/marketEngine';

interface Props {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midPrice: number;
  width?: number;
  height?: number;
}

const COLORS = {
  bid: { r: 14, g: 203, b: 129 },
  bidBright: { r: 50, g: 255, b: 170 },
  ask: { r: 246, g: 70, b: 93 },
  askBright: { r: 255, g: 100, b: 120 },
  bg: { r: 15, g: 17, b: 23 },
  grid: { r: 255, g: 255, b: 255 },
  text: { r: 255, g: 255, b: 255 },
};

export function OrderBookHeatmap({ bids, asks, midPrice, width = 260, height = 400 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<{ price: number; volume: number; side: string } | null>(null);

  const allOrders = useMemo(() => {
    const askRows = asks.slice(0, 14).map(a => ({ ...a, side: 'ask' as const }));
    const bidRows = bids.slice(0, 14).map(b => ({ ...b, side: 'bid' as const }));
    return [...askRows.reverse(), ...bidRows];
  }, [bids, asks]);

  const maxVolume = useMemo(() => Math.max(...allOrders.map(o => o.amount), 1), [allOrders]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    // Background
    ctx.fillStyle = `rgb(${COLORS.bg.r},${COLORS.bg.g},${COLORS.bg.b})`;
    ctx.fillRect(0, 0, width, height);

    const rowH = height / allOrders.length;
    const barMaxW = width * 0.55;

    allOrders.forEach((order, i) => {
      const y = i * rowH;
      const isAsk = order.side === 'ask';
      const alpha = isAsk ? 0.15 : 0.12;
      const color = isAsk ? COLORS.ask : COLORS.bid;

      // Heatmap bar
      const barW = (order.amount / maxVolume) * barMaxW;
      const startX = isAsk ? width - 10 - barW : 10;
      const gradient = ctx.createLinearGradient(isAsk ? startX + barW : startX, 0, isAsk ? startX : startX + barW, 0);
      gradient.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.05)`);
      gradient.addColorStop(1, `rgba(${color.r},${color.g},${color.b},${alpha + 0.1})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(startX, y + 1, barW, rowH - 2);

      // Price text
      ctx.fillStyle = isAsk ? `rgba(${COLORS.ask.r},${COLORS.ask.g},${COLORS.ask.b},0.8)` : `rgba(${COLORS.bid.r},${COLORS.bid.g},${COLORS.bid.b},0.8)`;
      ctx.font = '10px monospace';
      const priceText = order.price.toFixed(order.price > 10000 ? 2 : order.price > 10 ? 4 : 6);
      ctx.fillText(priceText, isAsk ? width - 10 : 10, y + rowH / 2 + 3.5);

      // Volume text (right-aligned for asks, after bar for bids)
      const volText = order.amount.toFixed(4);
      ctx.fillStyle = `rgba(${COLORS.text.r},${COLORS.text.g},${COLORS.text.b},0.5)`;
      ctx.font = '9px monospace';
      if (isAsk) {
        const vw = ctx.measureText(volText).width;
        ctx.fillText(volText, startX - vw - 6, y + rowH / 2 + 3.5);
      } else {
        ctx.fillText(volText, startX + barW + 6, y + rowH / 2 + 3.5);
      }
    });

    // Mid price line
    const midY = (asks.slice(0, 14).length / allOrders.length) * height;
    ctx.strokeStyle = 'rgba(240,185,11,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [bids, asks, allOrders, maxVolume, width, height]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, borderRadius: 4 }}
      />
      {hovered && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(15,17,23,0.95)', borderRadius: 8,
          padding: '6px 10px', fontSize: 10, border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff', fontFamily: 'monospace',
        }}>
          <div>Price: {hovered.price.toFixed(4)}</div>
          <div>Vol: {hovered.volume.toFixed(4)}</div>
          <div style={{ color: hovered.side === 'bid' ? '#0ecb81' : '#f6465d' }}>{hovered.side.toUpperCase()}</div>
        </div>
      )}
    </div>
  );
}