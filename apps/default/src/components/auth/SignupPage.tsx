/**
 * SignupPage.tsx — /signup
 *
 * Passwordless registration (Phase 0.5 · frontend Batch A):
 * 1. Validate the name + email
 * 2. Keep the optional referral code captured from ?ref=
 * 3. POST /api/auth/email-otp/send-verification-otp  { email, type: 'sign-in' }
 * 4. Stash the display name; VerifyOtpPage applies it with PATCH /api/me once the
 *    session exists (the OTP endpoints only carry an email)
 * 5. Redirect → /verify-otp?email=…&mode=signup
 *
 * The account itself is created by Better Auth on successful verification and the
 * app row is auto-provisioned by the API on the first /api/me call — so the browser
 * no longer writes a pending-user record, a password hash, or an OTP.
 *
 * `type: 'sign-in'` is deliberate for signup too: 'email-verification' requires the
 * account to already exist and would reject a brand-new address.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout, Alert, Field, SubmitButton } from './AuthLayout';
import { sendSignInOtp, AuthRequestError } from '../../lib/betterAuthClient';
import { referralService } from '@/lib/referralService';

/** Display name captured before the account exists (applied post-verification). */
const PENDING_NAME_KEY = 'cv_pending_display_name';

function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Please enter a valid email address.';
}

/** Turns an auth failure into something the user can act on. */
function describeAuthError(err: unknown): React.ReactNode {
  if (err instanceof AuthRequestError) {
    if (err.status === 429) {
      return 'Too many code requests. Please wait a minute and try again.';
    }
    if (err.status === 409 || err.status === 400 || err.status === 422) {
      return (
        <span>
          <span>This email can&apos;t be registered right now.</span>{' '}
          <Link to="/login" className="text-primary underline font-medium">Log in instead</Link>
          {' '}if you already have an account.
        </span>
      );
    }
    if (err.status === 0 || err.status >= 500) {
      return (
        <span>
          We couldn&apos;t reach the account service, so no account was created.
          {' '}Please check your connection and try again in a moment.
        </span>
      );
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export function SignupPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<React.ReactNode>('');
  const [success, setSuccess]   = useState('');

  const submittingRef = useRef(false);
  const [touched, setTouched] = useState({ fullName: false, email: false });

  // ── P2-1: Capture referral code from URL on mount (behaviour preserved) ──
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

  const nameErr  = touched.fullName && fullName.trim().length < 2 ? 'Please enter your full name.' : '';
  const emailErr = touched.email ? validateEmail(email) : '';
  const canSubmit = !loading && fullName.trim().length >= 2 && validateEmail(email) === '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ fullName: true, email: true });
    if (submittingRef.current) return;
    if (!canSubmit) return;

    submittingRef.current = true;
    setLoading(true);
    setError('');
    setSuccess('');

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedName     = fullName.trim();

    try {
      await sendSignInOtp(normalizedEmail, 'sign-in');

      // Applied by VerifyOtpPage after the session exists.
      try { sessionStorage.setItem(PENDING_NAME_KEY, trimmedName); } catch { /* private mode */ }

      setSuccess('A verification code has been sent to your email.');

      setTimeout(() => {
        navigate(`/verify-otp?email=${encodeURIComponent(normalizedEmail)}&mode=signup`);
      }, 600);
    } catch (err) {
      console.error('[SignupPage]', err);
      setError(describeAuthError(err));
    } finally {
      submittingRef.current = false;
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

        <p className="text-xs text-muted-foreground mb-3">
          No password to create — we&apos;ll email you a 6-digit code to confirm
          your address.
        </p>

        <SubmitButton
          label="Create account"
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
