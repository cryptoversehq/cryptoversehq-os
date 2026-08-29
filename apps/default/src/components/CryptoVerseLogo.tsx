import React from 'react';

interface CryptoVerseLogoProps {
  size?: number;
  className?: string;
}

/**
 * CryptoVerse HQ — bold minimalist brand mark.
 * A single golden orb (coin + universe) centered on deep navy,
 * with negative-space CV monogram carved through it.
 */
export function CryptoVerseLogo({ size = 40, className = '' }: CryptoVerseLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CryptoVerse HQ Logo"
    >
      <defs>
        <linearGradient id="cvGold" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>

      {/* Navy rounded square */}
      <rect width="48" height="48" rx="12" fill="#0A1929" />

      {/* Golden orb — coin + universe in one gesture */}
      <circle cx="24" cy="24" r="11.5" fill="url(#cvGold)" />

      {/* Negative-space CV cutout */}
      <path
        d="M19 19.5 L19 28.5"
        stroke="#0A1929"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M23 19.5 L27.5 24 L23 28.5"
        stroke="#0A1929"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
