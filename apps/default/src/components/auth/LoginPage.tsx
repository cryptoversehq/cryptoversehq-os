/**
 * LoginPage.tsx — /login
 *
 * Passwordless sign-in (Phase 0.5 · frontend Batch A):
 * 1. Validate the email address
 * 2. POST /api/auth/email-otp/send-verification-otp  { email, type: 'sign-in' }
 * 3. Redirect → /verify-otp?email=…&mode=login
 *
 * There is no password field any more: the OTP is the only credential, and the
 * session is minted by Better Auth in VerifyOtpPage. Nothing credential-shaped is
 * ever generated or stored in the browser.
 *
 * Note: the backend issues the code for any address (no account enumeration), so
 * this page never reveals whether an email has an account.
 */
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout, Alert, Field, SubmitButton } from './AuthLayout';
import { sendSignInOtp, AuthRequestError } from '../../lib/betterAuthClient';

/** Turns an auth failure into something the user can act on. */
function describeAuthError(err: unknown): React.ReactNode {
  if (err instanceof AuthRequestError) {
    if (err.status === 429) {
      return 'Too many code requests. Please wait a minute and try again.';
    }
    if (err.status === 0 || err.status >= 500) {
      return (
        <span>
          We couldn&apos;t send the code right now. Nothing was changed on your
          account — please try again in a moment.
        </span>
      );
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<React.ReactNode>('');
  const [success, setSuccess] = useState('');

  // Synchronous in-flight guard: a fast double-click/submit can fire before
  // React's async `loading` state flushes, which would send two code requests and
  // earn a 429 from the provider.
  const submittingRef = useRef(false);

  const [touched, setTouched] = useState({ email: false });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailErr   = touched.email && !emailValid ? 'Enter a valid email.' : '';
  const canSubmit  = !loading && emailValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true });
    if (submittingRef.current) return;
    if (!canSubmit) return;

    submittingRef.current = true;
    setLoading(true);
    setError('');
    setSuccess('');

    const normalizedEmail = email.toLowerCase().trim();

    try {
      await sendSignInOtp(normalizedEmail, 'sign-in');

      setSuccess('Verification code sent to your email.');
      setTimeout(() => {
        navigate(`/verify-otp?email=${encodeURIComponent(normalizedEmail)}&mode=login`);
      }, 600);
    } catch (err) {
      console.error('[LoginPage]', err);
      setError(describeAuthError(err));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in with a one-time code sent to your email."
    >
      <form onSubmit={handleSubmit} noValidate>
        <Alert message={error}   type="error"   />
        <Alert message={success} type="success" />

        <Field
          label="Email Address"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoFocus
          autoComplete="email"
          error={emailErr}
          disabled={loading}
        />

        <p className="text-xs text-muted-foreground mb-3">
          No password needed — we&apos;ll email you a 6-digit code.
        </p>

        <SubmitButton
          label="Send verification code"
          loading={loading}
          disabled={!canSubmit}
          loadingLabel="Sending verification code…"
        />
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Don't have an account?{' '}
        <Link to="/signup" className="text-primary hover:underline font-medium">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
