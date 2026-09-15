/**
 * VerifyOtpPage.tsx — /verify-otp?email={email}&mode=signup|login
 *
 * Phase 0.5 · frontend Batch B — passwordless verification on Better Auth.
 *
 * Flow:
 *   1. POST /api/auth/sign-in/email-otp { email, otp }  → mints the session cookie
 *   2. GET  /api/me                                      → authoritative profile
 *   3. authStore.applyServerUser(me.user)                → mirrors it into the store
 *   4. signup only: PATCH /api/me { display_name }       → applies the name captured
 *                                                          on SignupPage
 *   5. → /dashboard
 *
 * The 'reset' mode is gone: a passwordless account has nothing to reset, so
 * ForgotPasswordPage/ResetPasswordPage are deleted in Batch D. No OTP, code,
 * password hash or pending-user record is generated in the browser any more —
 * Better Auth owns the code and the session, and the app row is auto-provisioned
 * server-side on the first /api/me call.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AuthLayout, Alert } from './AuthLayout';
import {
  signInWithOtp,
  sendSignInOtp,
  fetchMe,
  updateProfile as updateProfileRemote,
  AuthRequestError,
} from '../../lib/betterAuthClient';
import { useAuthStore } from '../../lib/authStore';

/** Written by SignupPage before the account existed. */
const PENDING_NAME_KEY = 'cv_pending_display_name';
const RESEND_COOLDOWN_S = 30;

/** Reads and clears the signup display name (one-shot). */
function takePendingDisplayName(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_NAME_KEY);
    if (value) sessionStorage.removeItem(PENDING_NAME_KEY);
    const trimmed = (value ?? '').trim();
    return trimmed.length >= 2 ? trimmed : null;
  } catch {
    return null;
  }
}

function describeVerifyError(err: unknown): string {
  if (err instanceof AuthRequestError) {
    if (err.status === 400 || err.status === 401) {
      return 'That code is invalid or has expired. Request a new one below.';
    }
    if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (err.status === 403) return err.message || 'This account is not allowed to sign in.';
    if (err.status === 0 || err.status >= 500) {
      return 'We could not reach the server. Please try again in a moment.';
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export function VerifyOtpPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const applyServerUser = useAuthStore(s => s.applyServerUser);

  const email = decodeURIComponent(params.get('email') ?? '');
  const mode  = (params.get('mode') === 'signup' ? 'signup' : 'login') as 'signup' | 'login';

  const [digits, setDigits]     = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading]   = useState(false);
  const [resending, setResend]  = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const inputRefs               = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Resend cooldown — Better Auth rate-limits OTP requests, so keep the user off it.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const code      = digits.join('');
  const canVerify = code.length === 6 && !loading;

  // ─── Input handling ───────────────────────────────────────────────────────

  function handleDigit(idx: number, val: string) {
    const clean = val.replace(/\D/g, '').slice(-1);
    const next  = [...digits];
    next[idx]   = clean;
    setDigits(next);
    if (clean && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next   = [...digits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? '';
    setDigits(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  // ─── Verify ───────────────────────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!canVerify) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Exchange the code for a Better Auth session.
      await signInWithOtp(email, code);

      // 2. Read the authoritative identity (this is also what auto-provisions the
      //    app row on the server for a brand-new account).
      const me = await fetchMe();

      // 3. Mirror it into the store so every consumer sees the real profile.
      await applyServerUser(me.user);

      // 4. Signup only: apply the display name captured before the account existed.
      if (mode === 'signup') {
        const pendingName = takePendingDisplayName();
        if (pendingName) {
          try {
            await updateProfileRemote({ display_name: pendingName });
            await applyServerUser({ ...me.user, display_name: pendingName });
          } catch (nameError) {
            // A missing display name must never block a successful sign-in.
            console.warn('[VerifyOtpPage] display name not applied', nameError);
          }
        }
      }

      setSuccess('Verified — signing you in…');
      setTimeout(() => navigate('/dashboard'), 500);
    } catch (err) {
      console.error('[VerifyOtpPage]', err);
      setError(describeVerifyError(err));
    } finally {
      setLoading(false);
    }
  }

  // ─── Resend ───────────────────────────────────────────────────────────────

  async function handleResend() {
    if (resending || cooldown > 0 || !email) return;

    setResend(true);
    setError('');
    setSuccess('');

    try {
      await sendSignInOtp(email, 'sign-in');
      setSuccess('A new code has been sent to your email.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      console.error('[VerifyOtpPage] resend failed', err);
      setError(describeVerifyError(err));
    } finally {
      setResend(false);
    }
  }

  // ─── Guard: no email in the URL ───────────────────────────────────────────

  if (!email) {
    return (
      <AuthLayout
        title="Verify your email"
        subtitle="We need an email address to verify a code."
      >
        <Alert message="No email address was provided. Please start again." type="error" />
        <p className="text-center text-sm text-muted-foreground mt-4">
          <Link to="/login" className="text-primary hover:underline font-medium">
            ← Back to login
          </Link>
        </p>
      </AuthLayout>
    );
  }

  const title    = mode === 'signup' ? 'Verify your email' : 'Confirm your sign-in';
  const subtitle = mode === 'signup'
    ? `We sent a 6-digit code to ${email}. Enter it to activate your account.`
    : `We sent a 6-digit code to ${email}. Enter it to finish signing in.`;

  return (
    <AuthLayout title={title} subtitle={subtitle}>
      <form onSubmit={handleVerify} noValidate>
        <Alert message={error}   type="error"   />
        <Alert message={success} type="success" />

        {/* OTP digit inputs */}
        <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
              className={`w-12 h-12 text-center text-xl font-bold bg-secondary/50 border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 ${
                d ? 'border-primary/50' : 'border-white/10'
              }`}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={!canVerify}
          className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? 'Verifying…' : 'Verify Code'}
        </button>
      </form>

      <div className="mt-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Didn't receive a code?{' '}
          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="text-primary hover:underline font-medium disabled:opacity-50 disabled:no-underline"
          >
            {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </p>
        <p className="text-sm text-muted-foreground">
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            ← Back to login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
