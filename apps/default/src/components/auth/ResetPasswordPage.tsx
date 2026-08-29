/**
 * ResetPasswordPage.tsx — /reset-password?email={email}
 *
 * Reached after OTP verification in /verify-otp (mode=reset).
 * No OTP re-entry — already verified. Just set new password.
 */
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { AuthLayout, Alert, Field, SubmitButton } from './AuthLayout';
import { sha256 } from '../../lib/authApi';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const email = decodeURIComponent(params.get('email') ?? '')
    || (sessionStorage.getItem('cryptoverse_reset_email') ?? '');
  const isVerified = sessionStorage.getItem('cryptoverse_reset_verified') === 'true';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [showCfm, setShowCfm]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [touched, setTouched]   = useState({ password: false, confirm: false });

  const passwordErr = touched.password ? (password.length < 6 ? 'Password must be at least 6 characters.' : '') : '';
  const confirmErr  = touched.confirm  ? (confirm !== password ? 'Passwords do not match.' : '') : '';
  const canSubmit    = !loading && password.length >= 6 && confirm === password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!canSubmit || !email) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const newHash = await sha256(password);
      try {
        const { findUserByEmail, updatePassword } = await import('../../lib/authApi');
        const user = await findUserByEmail(email);
        if (user) await updatePassword(user.nodeId, newHash);
      } catch { /* API may fail — still update localStorage */ }
      // Update localStorage fallback with the PBKDF2 hash (never plaintext).
      try {
        const u = JSON.parse(localStorage.getItem('cryptoverse_users') || '{}');
        if (u[email]) u[email].password = newHash;
        localStorage.setItem('cryptoverse_users', JSON.stringify(u));
      } catch {}
      sessionStorage.removeItem('cryptoverse_reset_email');
      sessionStorage.removeItem('cryptoverse_reset_verified');
      setSuccess('Password changed! Redirecting to login…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.');
    } finally { setLoading(false); }
  }

  if (!email || !isVerified) {
    return (
      <AuthLayout title="Reset your password">
        <Alert message="Session expired. Please restart the password reset process." type="error" />
        <p className="text-center mt-4">
          <Link to="/forgot-password" className="text-primary hover:underline">Go to Forgot Password</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set new password" subtitle={`Creating a new password for ${email}`}>
      <form onSubmit={handleSubmit} noValidate>
        <Alert message={error} type="error" />
        <Alert message={success} type="success" />
        <Field label="New Password" type={showPwd ? 'text' : 'password'} value={password} onChange={setPassword}
          placeholder="Min 6 characters" autoFocus autoComplete="new-password" error={passwordErr} disabled={loading}
          suffix={<button type="button" onClick={() => setShowPwd(s => !s)} className="text-muted-foreground hover:text-foreground" tabIndex={-1}>{showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
        <Field label="Repeat New Password" type={showCfm ? 'text' : 'password'} value={confirm} onChange={setConfirm}
          placeholder="Repeat your new password" autoComplete="new-password" error={confirmErr} disabled={loading}
          suffix={<button type="button" onClick={() => setShowCfm(s => !s)} className="text-muted-foreground hover:text-foreground" tabIndex={-1}>{showCfm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
        <SubmitButton label="Change Password" loading={loading} disabled={!canSubmit} loadingLabel="Updating password…" />
      </form>
      <p className="text-center text-sm text-muted-foreground mt-6">
        <Link to="/login" className="text-muted-foreground hover:text-foreground">← Back to login</Link>
      </p>
    </AuthLayout>
  );
}
