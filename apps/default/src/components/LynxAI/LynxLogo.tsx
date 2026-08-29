/**
 * LynxLogo.tsx — Lynx 2.0 (cat/lynx look)
 * Pure SVG lynx head (NO circle): triangular face, almond eyes, pointed tufted
 * ears, whiskers, 6 emotional states, mouse-tracking eyes, auto-blink.
 */

import React, { useState, useEffect, useRef } from 'react';

export type EmotionalState =
  | 'neutral'
  | 'thinking'
  | 'excited'
  | 'concerned'
  | 'playful'
  | 'focused';

interface LynxLogoProps {
  size?: number;
  /** Explicit emotional state (accepts legacy values too). */
  state?: string;
  /** Legacy shorthand kept for backward compatibility. */
  mode?: string;
  onClick?: () => void;
  className?: string;
}

// ── SVG path data (Lynx 2.0, cat/lynx proportions) ────────────────────────────
const LYNX_HEAD = {
  head: {
    // Inverted-triangle face: wide at top (ears), narrow at chin.
    path: `M 50 12 C 25 12, 15 25, 12 40 C 10 55, 12 70, 18 80 C 25 90, 35 95, 50 95 C 65 95, 75 90, 82 80 C 88 70, 90 55, 88 40 C 85 25, 75 12, 50 12 Z`,
    // Fluffy cheek fur (lynx signature)
    leftCheek: `M 12 50 C 5 55, 3 65, 10 72 C 8 68, 6 58, 14 52`,
    rightCheek: `M 88 50 C 95 55, 97 65, 90 72 C 92 68, 94 58, 86 52`,
  },
  ears: {
    left: {
      outer: `M 25 25 L 8 5 L 35 15 Z`,
      inner: `M 26 23 L 14 9 L 33 17 Z`,
      tuft: `M 8 5 L 3 0 L 12 3`,
    },
    right: {
      outer: `M 75 25 L 92 5 L 65 15 Z`,
      inner: `M 74 23 L 86 9 L 67 17 Z`,
      tuft: `M 92 5 L 97 0 L 88 3`,
    },
  },
  eyes: {
    // Almond-shaped cat eyes (not round human eyes)
    left: {
      outer: `M 30 52 C 28 46, 38 44, 42 48 C 44 50, 44 54, 40 56 C 36 58, 32 58, 30 52 Z`,
      pupil: `M 35 49 C 37 48, 39 48, 39 51 C 39 53, 37 54, 35 54 C 33 54, 33 50, 35 49 Z`,
    },
    right: {
      outer: `M 58 48 C 56 44, 62 42, 68 44 C 72 46, 74 50, 72 54 C 70 58, 62 58, 58 48 Z`,
      pupil: `M 63 47 C 65 46, 67 46, 67 49 C 67 51, 65 52, 63 52 C 61 52, 61 48, 63 47 Z`,
    },
  },
  nose: {
    // Small triangular cat nose
    path: `M 50 62 L 47 68 L 53 68 Z`,
  },
  mouth: {
    neutral: `M 44 72 Q 50 76, 56 72`,
    smile: `M 42 70 Q 50 78, 58 70`,
    concern: `M 44 74 L 50 72 L 56 74`,
    thinking: `M 46 73 L 54 73`,
    excited: `M 40 69 Q 50 80, 60 69`,
    playful: `M 45 74 L 50 71 L 55 74`,
    focused: `M 47 73 L 53 73`,
  },
  whiskers: {
    left: [`M 15 58 L 5 55`, `M 15 63 L 5 63`, `M 15 68 L 5 71`],
    right: [`M 85 58 L 95 55`, `M 85 63 L 95 63`, `M 85 68 L 95 71`],
  },
  eyebrows: {
    neutral: { left: `M 28 44 L 36 44`, right: `M 64 44 L 72 44` },
    concerned: { left: `M 28 42 L 36 46`, right: `M 64 42 L 72 46` },
    focused: { left: `M 28 43 L 36 41`, right: `M 64 43 L 72 41` },
    excited: { left: `M 28 42 L 36 40`, right: `M 64 42 L 72 40` },
  },
};

// ── Color scheme (warm lynx fur) ───────────────────────────────────────────────
const COLORS = {
  main: '#D4A574',
  dark: '#8B6B4D',
  light: '#F5E6D3',
  earInner: '#F0C8A0',
  earTuft: '#6B4C3B',
  eyeWhite: '#FFFFFF',
  eyeColor: '#8B6B00',
  pupil: '#1A1A1A',
  nose: '#E88080',
  whisker: '#8B7355',
  blush: '#FFB6C1',
  outline: '#5C3D2E',
};

interface EmotionalExpression {
  eyes: { width: number; height: number; pupilSize: number; tilt: number };
  mouth: 'neutral' | 'smile' | 'concern' | 'thinking' | 'excited' | 'playful' | 'focused';
  eyebrows: 'neutral' | 'concerned' | 'focused' | 'excited';
  ears: { tilt: number; position: 'up' | 'back' | 'oneUp' };
  blush: boolean;
  animation: 'none' | 'blink' | 'wink' | 'earTwitch' | 'headTilt';
}

const EXPRESSIONS: Record<EmotionalState, EmotionalExpression> = {
  neutral: { eyes: { width: 1, height: 1, pupilSize: 1, tilt: 0 }, mouth: 'neutral', eyebrows: 'neutral', ears: { tilt: 0, position: 'up' }, blush: false, animation: 'blink' },
  thinking: { eyes: { width: 0.9, height: 0.9, pupilSize: 0.8, tilt: 5 }, mouth: 'thinking', eyebrows: 'excited', ears: { tilt: 5, position: 'up' }, blush: false, animation: 'headTilt' },
  excited: { eyes: { width: 1.2, height: 1.2, pupilSize: 1.3, tilt: -5 }, mouth: 'excited', eyebrows: 'excited', ears: { tilt: -5, position: 'up' }, blush: true, animation: 'earTwitch' },
  concerned: { eyes: { width: 0.8, height: 0.9, pupilSize: 0.9, tilt: 8 }, mouth: 'concern', eyebrows: 'concerned', ears: { tilt: 10, position: 'back' }, blush: false, animation: 'blink' },
  playful: { eyes: { width: 1, height: 0.9, pupilSize: 1.1, tilt: -3 }, mouth: 'playful', eyebrows: 'neutral', ears: { tilt: -8, position: 'oneUp' }, blush: true, animation: 'wink' },
  focused: { eyes: { width: 0.9, height: 0.8, pupilSize: 0.9, tilt: 0 }, mouth: 'focused', eyebrows: 'focused', ears: { tilt: 0, position: 'up' }, blush: false, animation: 'none' },
};

// Map legacy (pre-2.0) states to the new set so old callers never crash.
const STATE_MAP: Record<string, EmotionalState> = {
  idle: 'neutral',
  listening: 'thinking',
  talking: 'excited',
  happy: 'excited',
  thinking: 'thinking',
  neutral: 'neutral',
  excited: 'excited',
  concerned: 'concerned',
  playful: 'playful',
  focused: 'focused',
};

const EYE_LEFT = { cx: 37, cy: 52 };
const EYE_RIGHT = { cx: 64, cy: 50 };
const EAR_LEFT = { cx: 25, cy: 20 };
const EAR_RIGHT = { cx: 75, cy: 20 };

function resolveState(mode?: string, state?: string): EmotionalState {
  const raw = state ?? mode;
  if (raw && raw in EXPRESSIONS) return raw as EmotionalState;
  if (raw && raw in STATE_MAP) return STATE_MAP[raw];
  return 'neutral';
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function LynxLogo({ size = 48, state, mode, onClick, className = '' }: LynxLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });
  const [mouseRot, setMouseRot] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const [wink, setWink] = useState(false);
  const [earTwitch, setEarTwitch] = useState(0);

  const emotionalState = resolveState(mode, state);
  const expr = EXPRESSIONS[emotionalState];

  // ── Mouse tracking (eyes follow + subtle head turn) ──
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      setEyePos({ x: clamp(dx, -1, 1), y: clamp(dy * 0.6, -1, 1) });
      setMouseRot(clamp(dx * 12, -12, 12));
    };
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);

  // ── Auto-blink (random 3–5s) ──
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
        schedule();
      }, 3000 + Math.random() * 2000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // ── Wink (playful) ──
  useEffect(() => {
    if (expr.animation !== 'wink') { setWink(false); return; }
    const id = setInterval(() => {
      setWink(true);
      setTimeout(() => setWink(false), 180);
    }, 2600);
    return () => clearInterval(id);
  }, [expr.animation]);

  // ── Ear twitch (excited) ──
  useEffect(() => {
    if (expr.animation !== 'earTwitch') { setEarTwitch(0); return; }
    const id = setInterval(() => {
      setEarTwitch(Math.random() > 0.5 ? 6 : -6);
      setTimeout(() => setEarTwitch(0), 200);
    }, 1800);
    return () => clearInterval(id);
  }, [expr.animation]);

  const blinkScale = (eye: 'left' | 'right') => {
    if (isBlinking) return 0.1;
    if (eye === 'left' && wink) return 0.1;
    return 1;
  };

  const eyeOffset = 2.6;
  const leftPupilT = `translate(${EYE_LEFT.cx + eyePos.x * eyeOffset} ${EYE_LEFT.cy + eyePos.y * eyeOffset}) scale(${expr.eyes.pupilSize * expr.eyes.width} ${expr.eyes.pupilSize * expr.eyes.height * blinkScale('left')}) translate(${-EYE_LEFT.cx} ${-EYE_LEFT.cy})`;
  const leftOuterT = `translate(${EYE_LEFT.cx} ${EYE_LEFT.cy}) scale(${expr.eyes.width} ${expr.eyes.height * blinkScale('left')}) translate(${-EYE_LEFT.cx} ${-EYE_LEFT.cy})`;
  const rightPupilT = `translate(${EYE_RIGHT.cx + eyePos.x * eyeOffset} ${EYE_RIGHT.cy + eyePos.y * eyeOffset}) scale(${expr.eyes.pupilSize * expr.eyes.width} ${expr.eyes.pupilSize * expr.eyes.height * blinkScale('right')}) translate(${-EYE_RIGHT.cx} ${-EYE_RIGHT.cy})`;
  const rightOuterT = `translate(${EYE_RIGHT.cx} ${EYE_RIGHT.cy}) scale(${expr.eyes.width} ${expr.eyes.height * blinkScale('right')}) translate(${-EYE_RIGHT.cx} ${-EYE_RIGHT.cy})`;

  const brow = LYNX_HEAD.eyebrows[expr.eyebrows];
  const mouth = LYNX_HEAD.mouth[expr.mouth];

  const leftEarTilt = expr.ears.tilt + earTwitch;
  const rightEarTilt = expr.ears.position === 'oneUp' ? expr.ears.tilt + 12 : expr.ears.tilt - earTwitch;

  const finalRot = mouseRot + (emotionalState === 'thinking' ? -8 : 0);

  return (
    <div
      ref={containerRef}
      className={`lynx-logo inline-flex items-center justify-center select-none bg-transparent ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label="Lynx AI"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible', transition: 'transform 250ms ease-out', transform: `rotate(${finalRot}deg)` }}
      >
        {/* Ears (large, pointed, tufted) */}
        <g transform={`rotate(${leftEarTilt} ${EAR_LEFT.cx} ${EAR_LEFT.cy})`} style={{ transition: 'transform 200ms ease-out' }}>
          <path d={LYNX_HEAD.ears.left.outer} fill={COLORS.main} stroke={COLORS.outline} strokeWidth="1" strokeLinejoin="round" />
          <path d={LYNX_HEAD.ears.left.inner} fill={COLORS.earInner} />
          <path d={LYNX_HEAD.ears.left.tuft} fill={COLORS.earTuft} stroke={COLORS.earTuft} strokeWidth="1" strokeLinejoin="round" />
        </g>
        <g transform={`rotate(${rightEarTilt} ${EAR_RIGHT.cx} ${EAR_RIGHT.cy})`} style={{ transition: 'transform 200ms ease-out' }}>
          <path d={LYNX_HEAD.ears.right.outer} fill={COLORS.main} stroke={COLORS.outline} strokeWidth="1" strokeLinejoin="round" />
          <path d={LYNX_HEAD.ears.right.inner} fill={COLORS.earInner} />
          <path d={LYNX_HEAD.ears.right.tuft} fill={COLORS.earTuft} stroke={COLORS.earTuft} strokeWidth="1" strokeLinejoin="round" />
        </g>

        {/* Head (triangular, no circle) */}
        <path d={LYNX_HEAD.head.path} fill={COLORS.main} stroke={COLORS.outline} strokeWidth="1.5" />
        <path d={LYNX_HEAD.head.leftCheek} fill="none" stroke={COLORS.dark} strokeWidth="1" strokeLinecap="round" opacity="0.5" />
        <path d={LYNX_HEAD.head.rightCheek} fill="none" stroke={COLORS.dark} strokeWidth="1" strokeLinecap="round" opacity="0.5" />

        {/* Eyebrows */}
        <path d={brow.left} stroke={COLORS.outline} strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <path d={brow.right} stroke={COLORS.outline} strokeWidth="1.4" strokeLinecap="round" fill="none" />

        {/* Eyes (almond, cat-like) */}
        <path d={LYNX_HEAD.eyes.left.outer} fill={COLORS.eyeColor} stroke={COLORS.outline} strokeWidth="0.8" transform={leftOuterT} />
        <path d={LYNX_HEAD.eyes.left.pupil} fill={COLORS.pupil} transform={leftPupilT} />
        <path d={LYNX_HEAD.eyes.right.outer} fill={COLORS.eyeColor} stroke={COLORS.outline} strokeWidth="0.8" transform={rightOuterT} />
        <path d={LYNX_HEAD.eyes.right.pupil} fill={COLORS.pupil} transform={rightPupilT} />

        {/* Nose */}
        <path d={LYNX_HEAD.nose.path} fill={COLORS.nose} stroke={COLORS.dark} strokeWidth="0.5" strokeLinejoin="round" />

        {/* Mouth */}
        <path d={mouth} stroke={COLORS.outline} strokeWidth="1.2" strokeLinecap="round" fill="none" />

        {/* Whiskers */}
        {LYNX_HEAD.whiskers.left.map((w, i) => (
          <path key={`wl-${i}`} d={w} stroke={COLORS.whisker} strokeWidth="0.8" strokeLinecap="round" opacity="0.8" fill="none" />
        ))}
        {LYNX_HEAD.whiskers.right.map((w, i) => (
          <path key={`wr-${i}`} d={w} stroke={COLORS.whisker} strokeWidth="0.8" strokeLinecap="round" opacity="0.8" fill="none" />
        ))}

        {/* Blush */}
        {expr.blush && (
          <>
            <ellipse cx="24" cy="64" rx="5" ry="3" fill={COLORS.blush} opacity="0.4" />
            <ellipse cx="76" cy="64" rx="5" ry="3" fill={COLORS.blush} opacity="0.4" />
          </>
        )}
      </svg>
    </div>
  );
}
