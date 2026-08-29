/**
 * AuthLayout.tsx — Shared layout wrapper for all auth pages
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { CryptoVerseLogo } from '../CryptoVerseLogo';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-yellow-500/3 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link to="/login" className="flex items-center gap-3">
            <CryptoVerseLogo size={32} />
            <span className="text-xl font-bold text-foreground">CryptoVerse HQ</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-1">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Alert components ─────────────────────────────────────────────────────────

interface AlertProps {
  message: React.ReactNode;
  type: 'error' | 'success';
}

export function Alert({ message, type }: AlertProps) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 mb-4 ${
      isError
        ? 'bg-red-500/10 border border-red-500/30 text-red-400'
        : 'bg-green-500/10 border border-green-500/30 text-green-400'
    }`}>
      <span className="shrink-0 mt-0.5">{isError ? '✕' : '✓'}</span>
      <span>{message}</span>
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  suffix?: React.ReactNode;
}

export function Field({ label, type = 'text', value, onChange, placeholder, error, autoFocus, autoComplete, disabled, suffix }: FieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`w-full bg-secondary/50 border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 transition-colors ${
            error ? 'border-red-500/50' : 'border-white/10'
          } ${suffix ? 'pr-12' : ''}`}
        />
        {suffix && <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

// ─── Submit button ────────────────────────────────────────────────────────────

interface SubmitButtonProps {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  loadingLabel?: string;
}

export function SubmitButton({ label, loading, disabled, loadingLabel }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2"
    >
      {loading ? (loadingLabel ?? 'Please wait…') : label}
    </button>
  );
}
