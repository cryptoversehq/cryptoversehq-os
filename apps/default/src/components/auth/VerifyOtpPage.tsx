/**
 * VerifyOtpPage.tsx — /verify-otp?email={email}&mode=signup|login|reset
 *
 * Handles OTP entry for:
 *   - signup  → verify email, complete registration, auto-login
 *   - login   → second-factor OTP, auto-login
 *   - reset   → redirect to /reset-password after verify
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AuthLayout, Alert } from './AuthLayout';
import { verifyOtp, findUserByEmail, generateOtp, sendOtpEmail, updateUserOtp, loadPendingSignup, clearPendingSignup } from '../../lib/authApi';
import { useAuthStore } from '../../lib/authStore';

export function VerifyOtpPage() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const loginFromSession = useAuthStore(s => s.loginFromSession);

  const email = decodeURIComponent(params.get('email') ?? '');
  const mode  = (params.get('mode') ?? 'login') as 'signup' | 'login' | 'reset';

  const [digits, setDigits]     = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading]   = useState(false);
  const [resending, setResend]  = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const inputRefs               = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const code = digits.join('');
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
      const result = await verifyOtp(email, code);

      if (!result.ok) {
        setError(result.error ?? 'Code is invalid or expired.');
        setLoading(false);
        return;
      }

      const user = result.user!;

      if (mode === 'reset') {
        // Store verified email + verified flag in sessionStorage for reset page
        sessionStorage.setItem('cryptoverse_reset_email', email);
        sessionStorage.setItem('cryptoverse_reset_verified', 'true');
        setSuccess('Code verified! Redirecting to password reset…');
        setTimeout(() => navigate(`/reset-password?email=${encodeURIComponent(email)}`), 800);
        return;
      }

      // signup or login → auto-login
      setSuccess('Verified! Logging you in…');
      clearPendingSignup();
      loginFromSession({
        id:       user.nodeId,
        email:    user.email,
        fullName: user.fullName,
        role:     user.role,
      });
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err: any) {
      console.error('[VerifyOtpPage]', err);
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Resend ───────────────────────────────────────────────────────────────

  async function handleResend() {
    if (resending || !email) return;
    setResend(true);
    setError('');
    setSuccess('');

    try {
      // Find the user
      const user = await findUserByEmail(email);
      if (!user) {
        setError('No account found for this email.');
        return;
      }

      const otpCode      = generateOtp();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await updateUserOtp(user.nodeId, otpCode, otpExpiresAt);
      await sendOtpEmail({ email, name: user.fullName, code: otpCode });

      setSuccess('A new code has been sent to your email.');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resend. Please try again.');
    } finally {
      setResend(false);
    }
  }

  const modeTitle: Record<string, string> = {
    signup: 'Verify your email',
    login:  'Two-factor verification',
    reset:  'Verify your identity',
  };
  const modeSubtitle: Record<string, string> = {
    signup: `We sent a 6-digit code to ${email}. Enter it below to activate your account.`,
    login:  `We sent a 6-digit code to ${email}. Enter it to complete sign-in.`,
    reset:  `We sent a 6-digit code to ${email}. Enter it to verify your identity.`,
  };

  return (
    <AuthLayout title={modeTitle[mode]} subtitle={modeSubtitle[mode]}>
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
            disabled={resending}
            className="text-primary hover:underline font-medium disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend Code'}
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
