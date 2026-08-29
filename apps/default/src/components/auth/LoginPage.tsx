/**
 * LoginPage.tsx — /login
 *
 * Flow:
 * 1. Validate email + password fields
 * 2. Find user in Users project
 * 3. Compare SHA-256(password) with stored hash
 * 4. If match: generate OTP, update node, send email, redirect /verify-otp?mode=login
 * 5. If mismatch: show error
 */
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { AuthLayout, Alert, Field, SubmitButton } from './AuthLayout';
import { verifyPassword, generateOtp, findUserByEmail, sendOtpEmail, updateUserOtp } from '../../lib/authApi';

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Synchronous in-flight guard: prevents duplicate login submissions (a fast
  // double-click/submit can fire before React's async `loading` state flushes,
  // which would issue duplicate findUserByEmail GETs + webhook calls → 429).
  const submittingRef = useRef(false);

  const [touched, setTouched] = useState({ email: false, password: false });

  const emailErr    = touched.email    ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Enter a valid email.') : '';
  const passwordErr = touched.password ? (password.length < 6 ? 'Password must be at least 6 characters.' : '') : '';

  const canSubmit =
    !loading &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true });
    // Reject duplicate/unauthenticated submits synchronously (see ref above).
    if (submittingRef.current) return;
    if (!canSubmit) return;

    submittingRef.current = true;
    setLoading(true);
    setError('');
    setSuccess('');

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // 1. Find user via API (Taskade project)
      const user = await findUserByEmail(normalizedEmail);
      if (user) {
        // 2. Verify password via PBKDF2 (with legacy SHA-256 fallback)
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          setError('Email or password is incorrect.');
          setLoading(false);
          return;
        }

        // 3. Generate OTP and update user record
        const otpCode      = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        console.info('[LoginPage] OTP generated for delivery', { email: normalizedEmail });
        await updateUserOtp(user.nodeId, otpCode, otpExpiresAt);

        // 4. Send OTP email
        await sendOtpEmail({
          email: user.email,
          name:  user.fullName || user.email,
          code:  otpCode,
        });

        setSuccess('Verification code sent to your email.');
        setTimeout(() => {
          navigate(`/verify-otp?email=${encodeURIComponent(user.email)}&mode=login`);
        }, 800);
      } else {
        setError('Email or password is incorrect.');
      }
    } catch (err: any) {
      console.error('[LoginPage]', err);
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your CryptoVerse HQ account."
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

        <Field
          label="Password"
          type={showPwd ? 'text' : 'password'}
          value={password}
          onChange={setPassword}
          placeholder="Your password"
          autoComplete="current-password"
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

        <div className="flex justify-end mb-2">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <SubmitButton
          label="Login"
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
