/**
 * ForgotPasswordPage.tsx — /forgot-password
 *
 * Flow:
 * 1. User enters email
 * 2. Check email exists in Users project
 * 3. Generate OTP, update user node, send email
 * 4. Redirect → /verify-otp?email={email}&mode=reset
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout, Alert, Field, SubmitButton } from './AuthLayout';
import { findUserByEmail, generateOtp, sendOtpEmail, updateUserOtp } from '../../lib/authApi';

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const emailValid  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit   = !loading && emailValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const user = await findUserByEmail(email.toLowerCase().trim());
      if (!user) {
        // Security: don't reveal whether email exists; show generic message
        setSuccess('If that email is registered, a recovery code has been sent.');
        setLoading(false);
        return;
      }

      const otpCode      = generateOtp();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await updateUserOtp(user.nodeId, otpCode, otpExpiresAt);
      await sendOtpEmail({
        email: user.email,
        name:  user.fullName || user.email,
        code:  otpCode,
      });

      setSuccess('Recovery code sent! Check your email.');
      setTimeout(() => {
        navigate(`/verify-otp?email=${encodeURIComponent(user.email)}&mode=reset`);
      }, 1000);
    } catch (err: any) {
      console.error('[ForgotPasswordPage]', err);
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a verification code."
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
          disabled={loading}
          error={email && !emailValid ? 'Enter a valid email address.' : ''}
        />

        <SubmitButton
          label="Send Recovery Code"
          loading={loading}
          disabled={!canSubmit}
          loadingLabel="Sending…"
        />
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Remembered your password?{' '}
        <Link to="/login" className="text-primary hover:underline font-medium">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
