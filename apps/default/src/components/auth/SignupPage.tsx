/**
 * SignupPage.tsx — /signup
 *
 * Flow:
 * 1. Validate fields (email format, password strength, match)
 * 2. Check email not already in Users project
 * 3. Generate OTP, store pending user (node with ev_false)
 * 4. Send OTP email via automation webhook
 * 5. Redirect → /verify-otp?email={email}
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { AuthLayout, Alert, Field, SubmitButton } from './AuthLayout';
import {
  sha256, generateOtp, emailExists, createPendingUser,
  sendOtpEmail, savePendingSignup,
} from '../../lib/authApi';
import { referralService } from '@/lib/referralService';

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Please enter a valid email address.';
}

function validatePassword(v: string) {
  if (v.length < 6) return 'Password must be at least 6 characters.';
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignupPage() {
  const navigate = useNavigate();

  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');

  // ── P2-1: Capture referral code from URL on mount ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (refCode) {
      const referrerId = referralService.decodeReferralCode(refCode);
      if (referrerId) {
        sessionStorage.setItem('cv_referrer_code', referrerId);
      }
    }
  }, []);
  const [confirm, setConfirm]     = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [showCfm, setShowCfm]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<React.ReactNode>('');
  const [success, setSuccess]     = useState('');

  // Per-field errors (shown after touch)
  const [touched, setTouched] = useState({ fullName: false, email: false, password: false, confirm: false });

  const emailErr    = touched.email    ? validateEmail(email)        : '';
  const passwordErr = touched.password ? validatePassword(password)  : '';
  const confirmErr  = touched.confirm  ? (confirm !== password ? 'Passwords do not match.' : '') : '';
  const nameErr     = touched.fullName ? (fullName.trim().length < 2 ? 'Please enter your full name.' : '') : '';

  const canSubmit =
    !loading &&
    fullName.trim().length >= 2 &&
    validateEmail(email) === '' &&
    validatePassword(password) === '' &&
    confirm === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ fullName: true, email: true, password: true, confirm: true });
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Check duplicate email
      const exists = await emailExists(email.toLowerCase().trim());
      if (exists) {
        setError(
          <span>
            <span>This email is already registered.</span>{' '}
            <Link to="/login" className="text-primary underline font-medium">Log in instead</Link>.
          </span>,
        );
        setLoading(false);
        return;
      }

      // 2. Hash password
      const passwordHash = await sha256(password);

      // 3. Generate OTP (10 min expiry)
      const otpCode      = generateOtp();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      console.info('[SignupPage] OTP generated and stored for delivery', { email: email.toLowerCase().trim() });

      // 4. Create pending user node in project
      const nodeId = await createPendingUser({
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: fullName.trim(),
        otpCode,
        otpExpiresAt,
      });

      // 5. Save pending signup to sessionStorage
      savePendingSignup({
        email:        email.toLowerCase().trim(),
        fullName:     fullName.trim(),
        passwordHash,
        nodeId,
      });

      // 6. Send OTP email
      await sendOtpEmail({
        email: email.toLowerCase().trim(),
        name:  fullName.trim(),
        code:  otpCode,
      });

      setSuccess('A verification code has been sent to your email.');

      // 7. Redirect
      setTimeout(() => {
        navigate(`/verify-otp?email=${encodeURIComponent(email.toLowerCase().trim())}&mode=signup`);
      }, 800);
    } catch (err: any) {
      console.error('[SignupPage]', err);
      const message = err?.message ?? 'Something went wrong. Please try again.';
      if (message.toLowerCase().includes('already exists')) {
        setError(
          <span>
            <span>This email is already registered.</span>{' '}
            <Link to="/login" className="text-primary underline font-medium">Log in instead</Link>.
          </span>,
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join CryptoVerse HQ — trade, learn, and compete."
    >
      <form onSubmit={handleSubmit} noValidate>
        <Alert message={error}   type="error"   />
        <Alert message={success} type="success" />

        <Field
          label="Full Name"
          value={fullName}
          onChange={setFullName}
          placeholder="John Doe"
          autoFocus
          autoComplete="name"
          error={nameErr}
          disabled={loading}
        />
        <div onBlur={() => setTouched(t => ({ ...t, fullName: true }))} />

        <Field
          label="Email Address"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          error={emailErr}
          disabled={loading}
        />
        <div onBlur={() => setTouched(t => ({ ...t, email: true }))} />

        <Field
          label="Password"
          type={showPwd ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          placeholder="Min 6 chars, uppercase & number"
          autoComplete="new-password"
          error={passwordErr}
          disabled={loading}
          suffix={
            <button
              type="button"
              onClick={() => setShowPwd(s => !s)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <Field
          label="Repeat Password"
          type={showCfm ? 'text' : 'password'}
          value={confirm}
          onChange={setConfirm}
          placeholder="Repeat your password"
          autoComplete="new-password"
          error={confirmErr}
          disabled={loading}
          suffix={
            <button
              type="button"
              onClick={() => setShowCfm(s => !s)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showCfm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <SubmitButton
          label="Register"
          loading={loading}
          disabled={!canSubmit}
          loadingLabel="Sending verification code…"
        />
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-primary hover:underline font-medium">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
