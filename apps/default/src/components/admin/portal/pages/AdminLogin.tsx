/**
 * AdminLogin.tsx — /admin/login   (admin OTP sign-in)
 *
 * Passwordless admin sign-in backed by Better Auth (email OTP via Resend):
 *   1. sendOtp(email)            → POST /api/auth/email-otp/send-verification-otp
 *   2. verifyOtp(email, code)    → POST /api/auth/sign-in/email-otp (sets the cookie)
 *   3. redirect to /admin/subscriptions
 *
 * No CSRF token is generated here and no token is ever stored — Better Auth's
 * HttpOnly cookie is the session. The code step is shown only after the server
 * confirms the send.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, ChevronRight, KeyRound, Loader2, Mail, RefreshCw, Shield } from 'lucide-react';
import { CryptoVerseLogo } from '@/components/CryptoVerseLogo';
import { ApiForbiddenError, RENDER_API_BASE, clearAdminSessionCache, sendOtp, verifyOtp } from '@/lib/adminApi';

const RESEND_COOLDOWN_SECONDS = 30;

export function AdminLogin() {
  const navigate = useNavigate();

  const [step, setStep]       = useState<'email' | 'code'>('email');
  const [email, setEmail]     = useState('');
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [notice, setNotice]   = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const codeValid  = /^\d{6}$/.test(code.trim());

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Surface why the previous admin session was rejected (written by
  // ServerAdminGuard just before it bounced us here), then clear it.
  useEffect(() => {
    try {
      const reason = sessionStorage.getItem('cv_admin_denied_reason');
      if (reason) {
        setError(reason);
        sessionStorage.removeItem('cv_admin_denied_reason');
      }
    } catch { /* ignore */ }
  }, []);

  /** Request a code. Returns true only when the server confirmed the send. */
  const sendCode = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendOtp(normalizedEmail);
      if (result?.success === false) {
        setError('The server could not send the code.');
        return false;
      }
      setNotice(`A 6-digit code was sent to ${normalizedEmail}.`);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch (err) {
      setError(
        err instanceof ApiForbiddenError
          ? 'This email is not permitted to sign in to the admin panel.'
          : (err as Error).message,
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!emailValid || loading) return;
    if (await sendCode()) setStep('code');
  };

  const handleResend = async () => {
    if (loading || cooldown > 0) return;
    await sendCode();
  };

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!codeValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(normalizedEmail, code.trim());
      // Drop any identity cached before login (e.g. a "not signed in" read from an
      // earlier /admin page load) so the guard and the portal layout re-read the
      // fresh session instead of a stale value.
      clearAdminSessionCache();
      navigate('/admin/subscriptions', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiForbiddenError
          ? 'Invalid, expired, or unauthorized code.'
          : (err as Error).message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md relative"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4"><CryptoVerseLogo size={64} /></div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CryptoVerse HQ Admin</h1>
          <p className="text-sm text-white/40 mt-1">Secure administrative portal</p>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          {step === 'email' ? (
            <form
              data-genesis-form="admin-login-email"
              onSubmit={handleSendCode}
              className="space-y-5"
            >
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Admin sign in</h2>
                <p className="text-sm text-white/50">We&apos;ll email you a one-time code. No password required.</p>
              </div>

              <div data-genesis-field="email" className="space-y-1.5">
                <label htmlFor="admin-email" className="text-xs font-medium text-white/50 uppercase tracking-wide">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                data-genesis-submit
                disabled={loading || !emailValid}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {loading ? 'Sending…' : 'Send Code'}
              </button>
            </form>
          ) : (
            <form
              data-genesis-form="admin-login-code"
              onSubmit={handleVerify}
              className="space-y-5"
            >
              <div>
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setError(null); }}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 mb-3"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change email
                </button>
                <h2 className="text-lg font-semibold text-white mb-1">Enter your code</h2>
                <p className="text-sm text-white/50">{notice ?? `Check ${normalizedEmail} for the 6-digit code.`}</p>
              </div>

              <div data-genesis-field="code" className="space-y-1.5">
                <label htmlFor="admin-code" className="text-xs font-medium text-white/50 uppercase tracking-wide">One-time code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <input
                    id="admin-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="123456"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm tracking-[0.3em] font-mono focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                data-genesis-submit
                disabled={loading || !codeValid}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {loading ? 'Verifying…' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => { void handleResend(); }}
                disabled={loading || cooldown > 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white/40 hover:text-white/70 text-xs transition-all disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-center text-[10px] text-white/25 mt-6">
          <Shield className="h-3 w-3" />
          Unauthorized access is prohibited and logged · All activity is audited.
        </div>
        <p className="text-center text-[10px] text-white/15 mt-2 break-all">API: {RENDER_API_BASE}</p>
      </motion.div>
    </div>
  );
}

export default AdminLogin;
