/**
 * @deprecated DEAD CODE — not imported or routed anywhere in App.tsx.
 * Superseded by the OTP-based auth flow in components/auth/ (LoginPage,
 * SignupPage, VerifyOtpPage), which is backed by the shared Taskade
 * Database instead of localStorage. Kept only so history isn't lost;
 * safe to remove the file entirely next time this space supports file
 * deletion. Do not import from here.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Eye, EyeOff, Mail, Lock, User, ArrowRight, ArrowLeft,
  Chrome, CheckCircle2, RefreshCcw, ShieldCheck, AlertCircle,
  Loader2, KeyRound, Fingerprint, Smartphone, Scan,
} from 'lucide-react';
import { CryptoVerseLogo } from '@/components/CryptoVerseLogo';
import { useAuthStore } from '@/lib/authStore';
import {
  isBiometricAvailable,
  hasBiometricCredential,
  getAllBiometricCredentials,
  registerBiometric,
  authenticateWithBiometric,
} from '@/lib/biometricStore';

// ─── Password strength scorer ─────────────────────────────────────────────────
type StrengthLevel = 'empty' | 'weak' | 'fair' | 'strong' | 'very-strong';

interface PasswordStrength {
  level:   StrengthLevel;
  score:   number;          // 0-4
  label:   string;
  color:   string;          // tailwind bg-* class
  textColor: string;        // tailwind text-* class
  rules: {
    minLength:   boolean;   // ≥ 6 chars
    goodLength:  boolean;   // ≥ 10 chars
    hasLower:    boolean;
    hasUpper:    boolean;
    hasNumber:   boolean;
    hasSymbol:   boolean;
  };
}

function getPasswordStrength(pwd: string): PasswordStrength {
  const rules = {
    minLength:  pwd.length >= 6,
    goodLength: pwd.length >= 10,
    hasLower:   /[a-z]/.test(pwd),
    hasUpper:   /[A-Z]/.test(pwd),
    hasNumber:  /[0-9]/.test(pwd),
    hasSymbol:  /[^a-zA-Z0-9]/.test(pwd),
  };

  if (pwd.length === 0) {
    return { level: 'empty', score: 0, label: '', color: 'bg-white/10', textColor: 'text-muted-foreground', rules };
  }

  const score = [
    rules.minLength,
    rules.goodLength,
    rules.hasUpper && rules.hasLower,
    rules.hasNumber,
    rules.hasSymbol,
  ].filter(Boolean).length;

  if (score <= 1) return { level: 'weak',       score: 1, label: 'Weak',        color: 'bg-red-500',    textColor: 'text-red-400',    rules };
  if (score === 2) return { level: 'fair',       score: 2, label: 'Fair',        color: 'bg-orange-400', textColor: 'text-orange-400', rules };
  if (score === 3) return { level: 'fair',       score: 3, label: 'Fair',        color: 'bg-yellow-400', textColor: 'text-yellow-400', rules };
  if (score === 4) return { level: 'strong',     score: 4, label: 'Strong',      color: 'bg-green-400',  textColor: 'text-green-400',  rules };
  return              { level: 'very-strong', score: 5, label: 'Very Strong', color: 'bg-emerald-400',textColor: 'text-emerald-400',rules };
}

// ─── Password Strength Bar component ─────────────────────────────────────────
function PasswordStrengthBar({ password, showForLogin }: { password: string; showForLogin?: boolean }) {
  const strength = getPasswordStrength(password);

  if (password.length === 0) return null;
  // In login mode we only show a minimal bar, no rule checklist
  const isLogin = showForLogin;

  const segments = 4;
  const filled = strength.score === 5 ? 4 : Math.min(strength.score, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="space-y-2 pt-1"
    >
      {/* ── Segmented bar ── */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full overflow-hidden bg-white/10"
            >
              <motion.div
                className={cn('h-full rounded-full', i < filled ? strength.color : '')}
                initial={{ width: 0 }}
                animate={{ width: i < filled ? '100%' : '0%' }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
              />
            </div>
          ))}
        </div>
        <span className={cn('text-xs font-semibold w-20 text-right', strength.textColor)}>
          {strength.label}
        </span>
      </div>

      {/* ── Rule checklist (register only) ── */}
      {!isLogin && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {[
            { label: '6+ characters',    ok: strength.rules.minLength  },
            { label: 'Uppercase letter', ok: strength.rules.hasUpper   },
            { label: 'Number (0–9)',     ok: strength.rules.hasNumber  },
            { label: 'Symbol (!@#…)',    ok: strength.rules.hasSymbol  },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn(
                'w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300',
                ok ? 'bg-green-500/20' : 'bg-white/5',
              )}>
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors duration-300',
                  ok ? 'bg-green-400' : 'bg-white/20',
                )} />
              </div>
              <span className={cn(
                'text-[10px] transition-colors duration-300',
                ok ? 'text-green-400/80' : 'text-muted-foreground/60',
              )}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
import {
  sendVerificationEmail,
  sendPasswordChangedEmail,
  verifyOtp,
  getLockoutStatus,
  isValidEmail,
  type OtpPurpose,
} from '@/lib/emailVerification';
import { cn } from '@/lib/utils';

// ─── Apple Icon ───────────────────────────────────────────────────────────────
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z" />
  </svg>
);

// ─── OTP Input (6 individual boxes) ──────────────────────────────────────────
function OtpInput({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  hasError: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.padEnd(6, '').split('').slice(0, 6);

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = value.slice(0, i) + '' + value.slice(i + 1);
      onChange(next.trimEnd() || value.slice(0, Math.max(0, i)));
      if (i > 0) inputsRef.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const arr = value.padEnd(6, '').split('').slice(0, 6);
    arr[i] = digit;
    const joined = arr.join('').replace(/\s/g, '');
    onChange(joined);
    if (i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    const nextIdx = Math.min(pasted.length, 5);
    inputsRef.current[nextIdx]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d === ' ' ? '' : d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={cn(
            'w-11 h-14 text-center text-xl font-bold rounded-xl border-2 bg-secondary/40',
            'focus:outline-none transition-all duration-200',
            hasError
              ? 'border-red-500 text-red-400 focus:border-red-400 shake'
              : d && d !== ' '
                ? 'border-yellow-400/70 text-yellow-300 focus:border-yellow-400'
                : 'border-white/10 text-foreground focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/20',
          )}
        />
      ))}
    </div>
  );
}

// ─── Countdown hook (resend timer) ───────────────────────────────────────────
function useResendTimer(initial: number) {
  const [seconds, setSeconds] = useState(0);
  const start = useCallback(() => setSeconds(initial), [initial]);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);
  return { seconds, start, canResend: seconds <= 0 };
}

// ─── OTP Expiry Countdown ─────────────────────────────────────────────────────
const OTP_EXPIRY_SECONDS = 300; // 5 minutes

function useOtpExpiry() {
  const [remaining, setRemaining] = useState(0);
  const [active, setActive] = useState(false);

  const startExpiry = useCallback(() => {
    setRemaining(OTP_EXPIRY_SECONDS);
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active || remaining <= 0) return;
    const id = setTimeout(() => setRemaining(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, active]);

  const isExpired = active && remaining <= 0;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const label = `${minutes}:${String(secs).padStart(2, '0')}`;
  // 0–1 progress for the SVG arc (1 = full, 0 = empty)
  const progress = remaining / OTP_EXPIRY_SECONDS;

  return { remaining, label, progress, isExpired, startExpiry };
}

// ─── Circular Expiry Timer ────────────────────────────────────────────────────
function OtpExpiryTimer({ label, progress, isExpired }: { label: string; progress: number; isExpired: boolean }) {
  const SIZE = 72;
  const STROKE = 4;
  const R = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const offset = CIRCUMFERENCE * (1 - progress);

  const isUrgent = progress < 0.2; // last minute — turn red

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-1.5"
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          {/* Track */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-white/10"
          />
          {/* Progress arc */}
          <motion.circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className={cn(
              'transition-colors duration-1000',
              isExpired ? 'stroke-red-500' : isUrgent ? 'stroke-red-400' : 'stroke-yellow-400',
            )}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 1s' }}
          />
        </svg>
        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isExpired ? (
            <AlertCircle className="h-5 w-5 text-red-400" />
          ) : (
            <span className={cn(
              'font-mono font-bold tabular-nums leading-none',
              isUrgent ? 'text-red-400 text-sm' : 'text-foreground text-sm',
            )}>
              {label}
            </span>
          )}
        </div>
      </div>
      <p className={cn(
        'text-[11px] font-medium',
        isExpired ? 'text-red-400' : isUrgent ? 'text-red-400/80' : 'text-muted-foreground',
      )}>
        {isExpired ? 'Code expired' : 'Code expires in'}
      </p>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type SocialProvider = 'google' | 'apple';
type Step = 'credentials' | 'social_email' | 'otp' | 'forgot_email' | 'forgot_otp' | 'forgot_newpass' | 'forgot_success' | 'biometric_enroll';

export function AuthPage() {
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [step, setStep]         = useState<Step>('credentials');

  // Credentials step
  const [email, setEmail]       = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [showPass, setShowPass]             = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmRegPass, setShowConfirmRegPass] = useState(false);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // OTP step
  const [otp, setOtp]               = useState('');
  const [otpError, setOtpError]     = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpLocked, setOtpLocked]   = useState(false);
  const [otpLockedMs, setOtpLockedMs] = useState(0);

  // Social (Google/Apple) OTP gate
  const [pendingSocialProvider, setPendingSocialProvider]   = useState<SocialProvider | null>(null);
  const [socialEmail, setSocialEmail]                       = useState('');
  const [socialEmailInput, setSocialEmailInput]             = useState('');
  const [socialEmailError, setSocialEmailError]             = useState('');
  const [socialDisplayName, setSocialDisplayName]           = useState('');
  const [socialLoading, setSocialLoading]                   = useState<SocialProvider | null>(null);

  // Forgot password flow
  const [forgotEmail, setForgotEmail]           = useState('');
  const [forgotEmailTouched, setForgotEmailTouched] = useState(false);
  const [forgotEmailLoading, setForgotEmailLoading] = useState(false);
  const [forgotEmailError, setForgotEmailError] = useState('');
  const [forgotOtp, setForgotOtp]               = useState('');
  const [forgotOtpError, setForgotOtpError]     = useState('');
  const [forgotOtpLoading, setForgotOtpLoading] = useState(false);
  const [newPassword, setNewPassword]           = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPass, setShowNewPass]           = useState(false);
  const [showConfirmPass, setShowConfirmPass]   = useState(false);
  const [newPassError, setNewPassError]         = useState('');
  const [newPassLoading, setNewPassLoading]     = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable]   = useState(false);
  const [biometricLoading, setBiometricLoading]       = useState(false);
  const [biometricError, setBiometricError]           = useState('');
  const [storedCreds, setStoredCreds]                 = useState(getAllBiometricCredentials());
  // pendingEnrollUser: set after successful login/OAuth, triggers enroll prompt
  const [pendingEnrollUser, setPendingEnrollUser]     = useState<{
    userId: string; email: string; displayName: string; provider: 'email' | 'google' | 'apple';
  } | null>(null);

  const { login, register, loginWithGoogle, loginWithApple, loginWithBiometric, resetPassword } = useAuthStore();
  const { seconds: resendSeconds, start: startResend, canResend } = useResendTimer(300);
  const { label: expiryLabel, progress: expiryProgress, isExpired: otpExpired, startExpiry } = useOtpExpiry();

  // ── Derived email validity ─────────────────────────────────────────────────
  const emailValid   = isValidEmail(email);
  const emailInvalid = emailTouched && email.length > 0 && !emailValid;

  // ── Password minimum check ─────────────────────────────────────────────────
  const passwordOk = password.length >= 6;

  // ── Submit credentials → send real OTP email ──────────────────────────────
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid || !passwordOk) return;

    setFormError('');
    setFormLoading(true);

    if (mode === 'register' && password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      setFormLoading(false);
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setFormError('Passwords do not match.');
      setFormLoading(false);
      return;
    }

    // Send real OTP via Taskade Gmail automation
    const displayName = mode === 'register' ? name.trim() : '';
    const result = await sendVerificationEmail(email, 'verification', displayName);

    if (!result.ok) {
      setFormError(result.error ?? 'Failed to send verification email.');
      setFormLoading(false);
      return;
    }

    setOtp('');
    setOtpError('');
    startResend();
    startExpiry();
    setStep('otp');
    setFormLoading(false);
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend) return;
    const resendEmail       = pendingSocialProvider ? socialEmail : email;
    const resendDisplayName = pendingSocialProvider ? socialDisplayName : (mode === 'register' ? name.trim() : '');
    await sendVerificationEmail(resendEmail, 'verification', resendDisplayName);
    setOtp('');
    setOtpError('');
    setOtpLocked(false);
    startResend();
    startExpiry();
  };

  // ── Verify OTP → finalize auth ────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6 || otpLoading || otpLocked) return;
    setOtpError('');
    setOtpLoading(true);

    await new Promise(r => setTimeout(r, 300));

    // The email to verify against depends on whether this is a social flow
    const verifyEmail = pendingSocialProvider ? socialEmail : email;

    const { valid, reason, locked, remainingMs } = verifyOtp(verifyEmail, otp, 'verification');

    if (!valid) {
      if (locked) {
        setOtpLocked(true);
        setOtpLockedMs(remainingMs ?? 15 * 60 * 1000);
      }
      setOtpError(reason ?? 'Invalid code. Please try again.');
      setOtpLoading(false);
      return;
    }

    // OTP passed — run actual auth
    let result: { success: boolean; error?: string };

    if (pendingSocialProvider === 'google') {
      const r = loginWithGoogle(socialEmail);
      result = { success: r.success };
    } else if (pendingSocialProvider === 'apple') {
      const r = loginWithApple(socialEmail);
      result = { success: r.success };
    } else if (mode === 'login') {
      result = login(email, password);
    } else {
      result = register(email, password, name);
    }

    setOtpLoading(false);

    if (!result.success) {
      setOtpError(result.error ?? 'Authentication failed.');
    } else {
      const { user } = useAuthStore.getState();
      if (user) {
        const provider = pendingSocialProvider ?? 'email';
        offerBiometricEnroll(user.id, user.email, user.displayName, provider);
      }
      // Clear social pending state
      setPendingSocialProvider(null);
      setSocialEmail('');
      setSocialDisplayName('');
    }
  };

  // ── FORGOT PASSWORD — Step 1: enter email ─────────────────────────────────
  const handleForgotEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe = forgotEmail.trim();
    if (!isValidEmail(fe)) {
      setForgotEmailError('Please enter a valid email address.');
      return;
    }
    setForgotEmailError('');
    setForgotEmailLoading(true);

    const result = await sendVerificationEmail(fe, 'reset');
    setForgotEmailLoading(false);

    if (!result.ok) {
      setForgotEmailError(result.error ?? 'Failed to send reset email.');
      return;
    }

    setForgotOtp('');
    setForgotOtpError('');
    startResend();
    setStep('forgot_otp');
  };

  // ── FORGOT PASSWORD — Step 2: verify OTP ─────────────────────────────────
  const handleForgotOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotOtp.length < 6) return;
    setForgotOtpError('');
    setForgotOtpLoading(true);

    await new Promise(r => setTimeout(r, 300));

    const { valid, reason } = verifyOtp(forgotEmail.trim(), forgotOtp, 'reset');
    setForgotOtpLoading(false);

    if (!valid) {
      setForgotOtpError(reason ?? 'Invalid code.');
      return;
    }

    setNewPassword('');
    setNewPasswordConfirm('');
    setNewPassError('');
    setStep('forgot_newpass');
  };

  // ── FORGOT PASSWORD — Resend reset OTP ────────────────────────────────────
  const handleForgotResend = async () => {
    if (!canResend) return;
    await sendVerificationEmail(forgotEmail.trim(), 'reset');
    setForgotOtp('');
    setForgotOtpError('');
    startResend();
  };

  // ── FORGOT PASSWORD — Step 3: set new password ────────────────────────────
  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setNewPassError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setNewPassError('Passwords do not match.');
      return;
    }
    setNewPassError('');
    setNewPassLoading(true);

    const result = resetPassword(forgotEmail.trim(), newPassword);
    if (!result.success) {
      setNewPassError(result.error ?? 'Failed to reset password.');
      setNewPassLoading(false);
      return;
    }

    // Send confirmation email (fire-and-forget)
    sendPasswordChangedEmail(forgotEmail.trim());

    setNewPassLoading(false);
    setStep('forgot_success');
  };

  // Check biometric availability on mount
  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
    setStoredCreds(getAllBiometricCredentials());
  }, []);

  // NOTE: Auto-submit removed intentionally.
  // Users must press the Verify button to prevent accidental submissions
  // and to allow them to review the code they entered.

  // ── Switch mode ────────────────────────────────────────────────────────────
  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setStep('credentials');
    setFormError('');
    setOtpError('');
    setOtp('');
    setOtpLocked(false);
    setConfirmPassword('');
    setPendingSocialProvider(null);
    setSocialEmail('');
    setSocialEmailInput('');
    setSocialEmailError('');
    setSocialDisplayName('');
    setForgotEmail('');
    setForgotEmailError('');
    setForgotOtp('');
    setForgotOtpError('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setNewPassError('');
  };

  // ── Enter forgot-password flow ─────────────────────────────────────────────
  const enterForgotFlow = () => {
    setForgotEmail(email); // pre-fill if user already typed email
    setForgotEmailTouched(false);
    setForgotEmailError('');
    setForgotOtp('');
    setForgotOtpError('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setNewPassError('');
    setStep('forgot_email');
  };

  // ── Back to login from forgot flow ────────────────────────────────────────
  const backToLogin = () => {
    setStep('credentials');
    setForgotEmail('');
    setForgotEmailTouched(false);
    setForgotEmailError('');
    setForgotOtp('');
    setForgotOtpError('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setNewPassError('');
    setPendingSocialProvider(null);
    setSocialEmail('');
    setSocialEmailInput('');
    setSocialEmailError('');
    setSocialDisplayName('');
    setOtpLocked(false);
    setOtp('');
    setOtpError('');
  };

  // ── Helper: offer biometric enrollment after any successful login ──────────
  const offerBiometricEnroll = useCallback((
    userId: string, email: string, displayName: string,
    provider: 'email' | 'google' | 'apple',
  ) => {
    if (!biometricAvailable) return;
    if (hasBiometricCredential(userId)) return; // already enrolled
    setPendingEnrollUser({ userId, email, displayName, provider });
    setStep('biometric_enroll');
  }, [biometricAvailable]);

  // ── Social logins — show email input first, then send OTP ───────────────
  const openSocialEmailStep = (provider: SocialProvider) => {
    setPendingSocialProvider(provider);
    setSocialEmailInput('');
    setSocialEmailError('');
    setBiometricError('');
    setStep('social_email');
  };

  const handleSocialEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputEmail = socialEmailInput.trim();
    if (!isValidEmail(inputEmail)) {
      setSocialEmailError('Please enter a valid email address.');
      return;
    }

    const provider = pendingSocialProvider!;
    const displayName = provider === 'google' ? 'Google User' : 'Apple User';

    setSocialLoading(provider);
    setSocialEmailError('');

    // Check lockout before sending
    const lockout = getLockoutStatus(inputEmail);
    if (lockout.locked) {
      const mins = Math.ceil(lockout.remainingMs / 60_000);
      setSocialEmailError(`Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
      setSocialLoading(null);
      return;
    }

    const result = await sendVerificationEmail(inputEmail, 'verification', displayName);
    setSocialLoading(null);

    if (!result.ok) {
      setSocialEmailError(result.error ?? 'Failed to send verification email. Please try again.');
      return;
    }

    // Store pending social context and go to OTP step
    setSocialEmail(inputEmail);
    setSocialDisplayName(displayName);
    setOtp('');
    setOtpError('');
    setOtpLocked(false);
    startResend();
    startExpiry();
    setStep('otp');
  };

  const handleGoogle = () => openSocialEmailStep('google');
  const handleApple  = () => openSocialEmailStep('apple');

  // ── Biometric login ────────────────────────────────────────────────────────
  const handleBiometricLogin = async (credentialId?: string) => {
    setBiometricLoading(true);
    setBiometricError('');
    const authResult = await authenticateWithBiometric(credentialId);
    if (!authResult.ok || !authResult.email) {
      setBiometricError(authResult.error ?? 'Biometric authentication failed.');
      setBiometricLoading(false);
      return;
    }
    const result = loginWithBiometric(authResult.email);
    setBiometricLoading(false);
    if (!result.success) {
      setBiometricError(result.error ?? 'Login failed.');
    }
    // Redirect happens automatically via isAuthenticated change in App.tsx
  };

  // ── Biometric enrollment ───────────────────────────────────────────────────
  const handleBiometricEnroll = async () => {
    if (!pendingEnrollUser) return;
    setBiometricLoading(true);
    setBiometricError('');
    const result = await registerBiometric(pendingEnrollUser);
    setBiometricLoading(false);
    if (!result.ok) {
      setBiometricError(result.error ?? 'Enrollment failed.');
      return;
    }
    setStoredCreds(getAllBiometricCredentials());
    setPendingEnrollUser(null);
    // Auth store already has user set — App.tsx will render dashboard
  };

  const skipBiometricEnroll = () => {
    setPendingEnrollUser(null);
    // isAuthenticated is already true — App.tsx unmounts AuthPage
  };

  // ── Can submit credentials ─────────────────────────────────────────────────
  const canSubmit = emailValid && passwordOk && (mode === 'register' ? (name.trim().length > 0 && confirmPassword === password && confirmPassword.length > 0) : true);

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">

      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#0d1117] via-[#111827] to-[#0d1117] flex-col items-center justify-center p-12 overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-yellow-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="relative z-10 w-full max-w-md">
          <div className="flex items-center gap-4 mb-10">
            <CryptoVerseLogo size={48} />
            <div>
              <h1 className="text-2xl font-bold text-white">CryptoVerse HQ</h1>
              <p className="text-yellow-400/80 text-sm font-medium">Trade. Learn. Compete.</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 backdrop-blur-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-white/40 text-xs">BTC / USDT</p>
                <p className="text-white text-2xl font-bold font-mono">$67,420.50</p>
              </div>
              <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2 py-1 rounded-lg">+4.82%</span>
            </div>
            <svg viewBox="0 0 200 60" className="w-full h-16" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,50 L20,45 L40,38 L60,42 L80,30 L100,25 L120,28 L140,18 L160,12 L180,8 L200,5" fill="none" stroke="#f59e0b" strokeWidth="2" />
              <path d="M0,50 L20,45 L40,38 L60,42 L80,30 L100,25 L120,28 L140,18 L160,12 L180,8 L200,5 L200,60 L0,60Z" fill="url(#chartGrad)" />
            </svg>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Virtual Balance', value: '$100K', color: 'text-yellow-400' },
              { label: 'Win Rate',         value: '68.4%', color: 'text-green-400' },
              { label: 'Global Rank',      value: '#247',  color: 'text-blue-400'  },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
                <p className="text-white/40 text-[10px] mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-white/30 text-xs text-center mt-8">
            Join 50,000+ traders worldwide · No real money · All the experience
          </p>
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-12 bg-background">

        {/* Mobile logo */}
        <div className="flex items-center gap-3 mb-10 lg:hidden">
          <CryptoVerseLogo size={40} />
          <span className="text-xl font-bold">CryptoVerse <span className="text-[#FFD700]">HQ</span></span>
        </div>

        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">

            {/* ═══════════════ STEP 1: CREDENTIALS ═══════════════ */}
            {step === 'credentials' && (
              <motion.div
                key={`creds-${mode}`}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                <h2 className="text-3xl font-bold mb-1">
                  {mode === 'login' ? 'Welcome back' : 'Create account'}
                </h2>
                <p className="text-muted-foreground text-sm mb-8">
                  {mode === 'login'
                    ? 'Sign in to continue trading.'
                    : 'Start your trading journey today.'}
                </p>

                {/* ── Biometric quick-login (if credentials exist) ── */}
                <AnimatePresence>
                  {storedCreds.length > 0 && biometricAvailable && mode === 'login' && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mb-4"
                    >
                      {storedCreds.map(cred => (
                        <button
                          key={cred.credentialId}
                          onClick={() => handleBiometricLogin(cred.credentialId)}
                          disabled={biometricLoading}
                          className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-yellow-400/30 bg-yellow-400/5 hover:bg-yellow-400/10 hover:border-yellow-400/50 transition-all group mb-2"
                        >
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-yellow-400/20 to-orange-500/20 border border-yellow-400/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                            {biometricLoading
                              ? <Loader2 className="h-5 w-5 text-yellow-400 animate-spin" />
                              : <Fingerprint className="h-5 w-5 text-yellow-400" />
                            }
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-foreground">
                              Sign in as {cred.email.replace('oauth.google@cryptoversehq.com', 'Google Account').replace('oauth.apple@cryptoversehq.com', 'Apple Account').replace('oauth.google@cryptoplay.ai', 'Google Account').replace('oauth.apple@cryptoplay.ai', 'Apple Account')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Scan className="h-3 w-3" />
                              Touch ID · Face ID · Passkey
                            </p>
                          </div>
                          <div className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="h-4 w-4 text-yellow-400" />
                          </div>
                        </button>
                      ))}

                      {biometricError && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs text-red-400 flex items-center gap-1.5 pl-1 mt-1"
                        >
                          <AlertCircle className="h-3 w-3" /> {biometricError}
                        </motion.p>
                      )}

                      <div className="flex items-center gap-3 mt-4">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-muted-foreground text-xs">or sign in another way</span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Social login */}
                <div className="flex flex-col gap-3 mb-6">
                  <button
                    onClick={handleGoogle}
                    disabled={socialLoading !== null}
                    className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-white/10 bg-secondary/30 hover:bg-secondary/60 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {socialLoading === 'google'
                      ? <Loader2 className="h-5 w-5 animate-spin text-[#4285F4]" />
                      : <Chrome className="h-5 w-5 text-[#4285F4]" />
                    }
                    {socialLoading === 'google' ? 'Sending verification code…' : 'Continue with Google'}
                  </button>
                  <button
                    onClick={handleApple}
                    disabled={socialLoading !== null}
                    className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-white/10 bg-secondary/30 hover:bg-secondary/60 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {socialLoading === 'apple'
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <AppleIcon />
                    }
                    {socialLoading === 'apple' ? 'Sending verification code…' : 'Continue with Apple'}
                  </button>
                  {biometricAvailable && storedCreds.length === 0 && mode === 'login' && (
                    <button
                      onClick={() => handleBiometricLogin()}
                      disabled={biometricLoading}
                      className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-white/10 bg-secondary/30 hover:bg-secondary/60 transition-colors text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      {biometricLoading
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <Fingerprint className="h-5 w-5 text-yellow-400/70" />
                      }
                      Continue with Passkey / Biometrics
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-muted-foreground text-xs">or continue with email</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Form */}
                <form onSubmit={handleCredentialsSubmit} className="space-y-4" noValidate>

                  {/* Display name (register only) */}
                  {mode === 'register' && (
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Display Name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/40 border border-white/10 text-sm focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                  )}

                  {/* ── Email field with real-time validation ── */}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Mail className={cn(
                        'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
                        emailInvalid ? 'text-red-400' : emailValid ? 'text-green-400' : 'text-muted-foreground',
                      )} />
                      <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setEmailTouched(true); }}
                        onBlur={() => setEmailTouched(true)}
                        className={cn(
                          'w-full pl-10 pr-10 py-3 rounded-xl bg-secondary/40 text-sm focus:outline-none transition-all placeholder:text-muted-foreground',
                          emailInvalid
                            ? 'border-2 border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-500/30 text-red-300'
                            : emailValid
                              ? 'border-2 border-green-500/60 focus:border-green-400/80 focus:ring-1 focus:ring-green-400/20'
                              : 'border border-white/10 focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30',
                        )}
                      />
                      {/* Right icon: valid/invalid */}
                      {email.length > 0 && emailTouched && (
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                          {emailValid
                            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                            : <AlertCircle className="h-4 w-4 text-red-400" />}
                        </div>
                      )}
                    </div>

                    {/* Inline email error message */}
                    <AnimatePresence>
                      {emailInvalid && (
                        <motion.p
                          initial={{ opacity: 0, y: -4, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -4, height: 0 }}
                          className="text-xs text-red-400 flex items-center gap-1.5 pl-1 overflow-hidden"
                        >
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                          Please enter a valid email address (e.g. name@domain.com)
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ── Password ── */}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type={showPass ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-10 pr-11 py-3 rounded-xl bg-secondary/40 border border-white/10 text-sm focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30 transition-all placeholder:text-muted-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(s => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* ── Password strength bar ── */}
                    <AnimatePresence>
                      {password.length > 0 && (
                        <PasswordStrengthBar
                          password={password}
                          showForLogin={mode === 'login'}
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ── Confirm Password (register only) ── */}
                  {mode === 'register' && (
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type={showConfirmRegPass ? 'text' : 'password'}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setFormError(''); }}
                        className={cn(
                          'w-full pl-10 pr-11 py-3 rounded-xl bg-secondary/40 text-sm focus:outline-none transition-all placeholder:text-muted-foreground',
                          confirmPassword.length > 0
                            ? confirmPassword === password
                              ? 'border-2 border-green-500/60 focus:border-green-400/80 focus:ring-1 focus:ring-green-400/20'
                              : 'border-2 border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-500/30'
                            : 'border border-white/10 focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30',
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmRegPass(s => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmRegPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      {confirmPassword.length > 0 && (
                        <div className="absolute right-10 top-1/2 -translate-y-1/2">
                          {confirmPassword === password
                            ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                            : <AlertCircle className="h-4 w-4 text-red-400" />
                          }
                        </div>
                      )}
                    </div>
                  )}

                  {mode === 'login' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={enterForgotFlow}
                        className="text-xs text-muted-foreground hover:text-yellow-400 transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {/* General error */}
                  <AnimatePresence>
                    {formError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2"
                      >
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        {formError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Submit button — disabled until email is valid ── */}
                  <button
                    type="submit"
                    disabled={!canSubmit || formLoading}
                    className={cn(
                      'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                      canSubmit && !formLoading
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-yellow-500/20 cursor-pointer'
                        : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                    )}
                  >
                    {formLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        {mode === 'login' ? 'Continue' : 'Create Account'}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {/* Helper text when button disabled due to invalid email */}
                  {!emailValid && email.length > 0 && (
                    <p className="text-xs text-center text-muted-foreground/60">
                      Enter a valid email to continue
                    </p>
                  )}
                </form>

                <p className="text-center text-sm text-muted-foreground mt-6">
                  {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                  <button
                    onClick={switchMode}
                    className="text-yellow-400 font-semibold hover:underline"
                  >
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                  </button>
                </p>

                <p className="text-center text-xs text-muted-foreground/50 mt-6">
                  By continuing, you agree to our Terms of Service and Privacy Policy.
                </p>
              </motion.div>
            )}

            {/* ═══════════════ STEP: SOCIAL EMAIL INPUT ═══════════════ */}
            {step === 'social_email' && (
              <motion.div
                key="social_email"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                <button
                  onClick={backToLogin}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </button>

                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                    {pendingSocialProvider === 'google'
                      ? <Chrome className="h-10 w-10 text-yellow-400" />
                      : <AppleIcon />
                    }
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-2">
                  Continue with {pendingSocialProvider === 'google' ? 'Google' : 'Apple'}
                </h2>
                <p className="text-muted-foreground text-sm text-center mb-8">
                  Enter the email address linked to your{' '}
                  {pendingSocialProvider === 'google' ? 'Google' : 'Apple'} account.
                  We'll send a verification code there.
                </p>

                <form onSubmit={handleSocialEmailSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Mail className={cn(
                        'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
                        socialEmailError ? 'text-red-400' : isValidEmail(socialEmailInput) ? 'text-green-400' : 'text-muted-foreground',
                      )} />
                      <input
                        type="email"
                        placeholder={`Your ${pendingSocialProvider === 'google' ? 'Google' : 'Apple'} email`}
                        value={socialEmailInput}
                        onChange={e => { setSocialEmailInput(e.target.value); setSocialEmailError(''); }}
                        autoFocus
                        className={cn(
                          'w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/40 text-sm focus:outline-none transition-all placeholder:text-muted-foreground',
                          socialEmailError
                            ? 'border-2 border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-500/30'
                            : 'border border-white/10 focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30',
                        )}
                      />
                    </div>
                    {socialEmailError && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5 pl-1">
                        <AlertCircle className="h-3 w-3" /> {socialEmailError}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!isValidEmail(socialEmailInput) || !!socialLoading}
                    className={cn(
                      'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                      isValidEmail(socialEmailInput) && !socialLoading
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-yellow-500/20'
                        : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                    )}
                  >
                    {socialLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send Verification Code
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ═══════════════ STEP 2: OTP VERIFICATION ═══════════════ */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                {/* Icon */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                      {otpLocked
                        ? <KeyRound className="h-10 w-10 text-red-400" />
                        : <ShieldCheck className="h-10 w-10 text-yellow-400" />
                      }
                    </div>
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                      <Mail className="h-2.5 w-2.5 text-white" />
                    </span>
                  </div>
                </div>

                {otpLocked ? (
                  <>
                    <h2 className="text-2xl font-bold text-center mb-2 text-red-400">Account Locked</h2>
                    <p className="text-muted-foreground text-sm text-center mb-6">
                      Too many failed attempts. Please wait 15 minutes before trying again or request a new code.
                    </p>
                    <button
                      onClick={() => {
                        setOtpLocked(false);
                        setOtp('');
                        setOtpError('');
                        handleResend();
                      }}
                      disabled={!canResend}
                      className={cn(
                        'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                        canResend
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90'
                          : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                      )}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      {canResend ? 'Send New Code' : `Wait ${resendSeconds}s to resend`}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-center mb-2">Check your inbox</h2>
                    <p className="text-muted-foreground text-sm text-center mb-2">
                      We sent a 6-digit verification code to
                    </p>
                    <p className="text-center font-semibold text-yellow-400 text-sm mb-1 break-all">
                      {pendingSocialProvider ? socialEmail : email}
                    </p>
                    {pendingSocialProvider && (
                      <p className="text-center text-xs text-muted-foreground mb-4">
                        via {pendingSocialProvider === 'google' ? 'Google' : 'Apple'} sign-in
                      </p>
                    )}
                    {!pendingSocialProvider && <div className="mb-4" />}

                    {/* ── Expiry countdown ── */}
                    <div className="flex justify-center mb-5">
                      <OtpExpiryTimer
                        label={expiryLabel}
                        progress={expiryProgress}
                        isExpired={otpExpired}
                      />
                    </div>

                    {/* Expired banner */}
                    <AnimatePresence>
                      {otpExpired && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 justify-center"
                        >
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          This code has expired. Please request a new one.
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* OTP boxes */}
                    <form onSubmit={handleOtpSubmit} className="space-y-5">
                      <OtpInput
                        value={otp}
                        onChange={v => { setOtp(v); setOtpError(''); }}
                        hasError={!!otpError || otpExpired}
                      />

                      {/* OTP error */}
                      <AnimatePresence>
                        {otpError && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 text-center justify-center"
                          >
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                            {otpError}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Verify button */}
                      <button
                        type="submit"
                        disabled={otp.length < 6 || otpLoading || otpExpired}
                        className={cn(
                          'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                          otp.length === 6 && !otpLoading && !otpExpired
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-yellow-500/20'
                            : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                        )}
                      >
                        {otpLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" />
                            {pendingSocialProvider
                              ? `Verify & Sign in with ${pendingSocialProvider === 'google' ? 'Google' : 'Apple'}`
                              : `Verify & ${mode === 'login' ? 'Sign In' : 'Create Account'}`
                            }
                          </>
                        )}
                      </button>
                    </form>

                    {/* Resend */}
                    <div className="mt-5 text-center">
                      <p className="text-sm text-muted-foreground">
                        Didn't receive it?{' '}
                        {canResend ? (
                          <button
                            onClick={handleResend}
                            className="text-yellow-400 font-semibold hover:underline inline-flex items-center gap-1"
                          >
                            <RefreshCcw className="h-3 w-3" /> Resend code
                          </button>
                        ) : (
                          <span className="text-muted-foreground/60 font-mono text-xs">
                            Resend in {resendSeconds}s
                          </span>
                        )}
                      </p>
                    </div>
                  </>
                )}

                {/* Back */}
                <div className="mt-4 text-center">
                  <button
                    onClick={() => {
                      setStep('credentials');
                      setOtpError('');
                      setOtpLocked(false);
                      setOtp('');
                      setPendingSocialProvider(null);
                      setSocialEmail('');
                      setSocialDisplayName('');
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← {pendingSocialProvider ? 'Cancel and go back' : 'Change email address'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══════════════ FORGOT — STEP 1: ENTER EMAIL ═══════════════ */}
            {step === 'forgot_email' && (
              <motion.div
                key="forgot_email"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                {/* Back */}
                <button
                  onClick={backToLogin}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </button>

                {/* Icon */}
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                    <KeyRound className="h-10 w-10 text-yellow-400" />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-2">Forgot password?</h2>
                <p className="text-muted-foreground text-sm text-center mb-8">
                  Enter the email associated with your account and we'll send you a reset code.
                </p>

                <form onSubmit={handleForgotEmailSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Mail className={cn(
                        'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
                        forgotEmailError ? 'text-red-400' : isValidEmail(forgotEmail) ? 'text-green-400' : 'text-muted-foreground',
                      )} />
                      <input
                        type="email"
                        placeholder="Your email address"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setForgotEmailTouched(true); setForgotEmailError(''); }}
                        onBlur={() => setForgotEmailTouched(true)}
                        autoFocus
                        className={cn(
                          'w-full pl-10 pr-4 py-3 rounded-xl bg-secondary/40 text-sm focus:outline-none transition-all placeholder:text-muted-foreground',
                          forgotEmailError
                            ? 'border-2 border-red-500 focus:border-red-400 focus:ring-1 focus:ring-red-500/30'
                            : 'border border-white/10 focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30',
                        )}
                      />
                    </div>
                    <AnimatePresence>
                      {forgotEmailError && (
                        <motion.p
                          initial={{ opacity: 0, y: -4, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -4, height: 0 }}
                          className="text-xs text-red-400 flex items-center gap-1.5 pl-1 overflow-hidden"
                        >
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                          {forgotEmailError}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    type="submit"
                    disabled={!isValidEmail(forgotEmail) || forgotEmailLoading}
                    className={cn(
                      'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                      isValidEmail(forgotEmail) && !forgotEmailLoading
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-yellow-500/20 cursor-pointer'
                        : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                    )}
                  >
                    {forgotEmailLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>Send reset code <ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ═══════════════ FORGOT — STEP 2: ENTER OTP ═══════════════ */}
            {step === 'forgot_otp' && (
              <motion.div
                key="forgot_otp"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                {/* Icon */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                      <ShieldCheck className="h-10 w-10 text-yellow-400" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background flex items-center justify-center">
                      <Mail className="h-2.5 w-2.5 text-white" />
                    </span>
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-2">Check your inbox</h2>
                <p className="text-muted-foreground text-sm text-center mb-2">
                  We emailed a 6-digit reset code to
                </p>
                <p className="text-center font-semibold text-yellow-400 text-sm mb-6 break-all">
                  {forgotEmail}
                </p>

                <form onSubmit={handleForgotOtpSubmit} className="space-y-5">
                  <OtpInput
                    value={forgotOtp}
                    onChange={v => { setForgotOtp(v); setForgotOtpError(''); }}
                    hasError={!!forgotOtpError}
                  />

                  <AnimatePresence>
                    {forgotOtpError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 justify-center"
                      >
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        {forgotOtpError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={forgotOtp.length < 6 || forgotOtpLoading}
                    className={cn(
                      'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                      forgotOtp.length === 6 && !forgotOtpLoading
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-yellow-500/20'
                        : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                    )}
                  >
                    {forgotOtpLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <><ShieldCheck className="h-4 w-4" /> Verify Code</>
                    )}
                  </button>
                </form>

                <div className="mt-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive it?{' '}
                    {canResend ? (
                      <button
                        onClick={handleForgotResend}
                        className="text-yellow-400 font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <RefreshCcw className="h-3 w-3" /> Resend code
                      </button>
                    ) : (
                      <span className="text-muted-foreground/60 font-mono text-xs">
                        Resend in {resendSeconds}s
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setStep('forgot_email')}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Change email address
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══════════════ FORGOT — STEP 3: NEW PASSWORD ═══════════════ */}
            {step === 'forgot_newpass' && (
              <motion.div
                key="forgot_newpass"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                {/* Icon */}
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
                    <Lock className="h-10 w-10 text-yellow-400" />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-center mb-2">Create new password</h2>
                <p className="text-muted-foreground text-sm text-center mb-8">
                  Choose a strong password for your account.
                </p>

                <form onSubmit={handleNewPasswordSubmit} className="space-y-4" noValidate>
                  {/* New password */}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        placeholder="New password"
                        value={newPassword}
                        onChange={e => { setNewPassword(e.target.value); setNewPassError(''); }}
                        autoFocus
                        className="w-full pl-10 pr-11 py-3 rounded-xl bg-secondary/40 border border-white/10 text-sm focus:outline-none focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30 transition-all placeholder:text-muted-foreground"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(s => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <AnimatePresence>
                      {newPassword.length > 0 && (
                        <PasswordStrengthBar password={newPassword} />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Confirm password */}
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={newPasswordConfirm}
                      onChange={e => { setNewPasswordConfirm(e.target.value); setNewPassError(''); }}
                      className={cn(
                        'w-full pl-10 pr-11 py-3 rounded-xl bg-secondary/40 text-sm focus:outline-none transition-all placeholder:text-muted-foreground',
                        newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
                          ? 'border-2 border-red-500/60 focus:border-red-400 focus:ring-1 focus:ring-red-400/20'
                          : newPasswordConfirm.length > 0 && newPassword === newPasswordConfirm
                            ? 'border-2 border-green-500/60 focus:border-green-400'
                            : 'border border-white/10 focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/30',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(s => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <AnimatePresence>
                    {newPassError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2"
                      >
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        {newPassError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {(() => {
                    const pwOk = newPassword.length >= 6;
                    const matchOk = newPassword === newPasswordConfirm && newPasswordConfirm.length > 0;
                    const canReset = pwOk && matchOk;
                    return (
                      <button
                        type="submit"
                        disabled={!canReset || newPassLoading}
                        className={cn(
                          'w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg',
                          canReset && !newPassLoading
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-yellow-500/20 cursor-pointer'
                            : 'bg-secondary/40 text-muted-foreground border border-white/10 cursor-not-allowed opacity-60',
                        )}
                      >
                        {newPassLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <><CheckCircle2 className="h-4 w-4" /> Reset Password</>
                        )}
                      </button>
                    );
                  })()}
                </form>
              </motion.div>
            )}

            {/* ═══════════════ FORGOT — STEP 4: SUCCESS ═══════════════ */}
            {step === 'forgot_success' && (
              <motion.div
                key="forgot_success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                {/* Animated checkmark */}
                <motion.div
                  className="flex justify-center mb-6"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
                >
                  <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center">
                    <CheckCircle2 className="h-12 w-12 text-green-400" />
                  </div>
                </motion.div>

                <motion.h2
                  className="text-2xl font-bold mb-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Password reset!
                </motion.h2>
                <motion.p
                  className="text-muted-foreground text-sm mb-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  Your password has been updated successfully.
                </motion.p>
                <motion.p
                  className="text-muted-foreground/60 text-xs mb-8"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  A confirmation email has been sent to{' '}
                  <span className="text-yellow-400">{forgotEmail}</span>
                </motion.p>

                <motion.button
                  onClick={backToLogin}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight className="h-4 w-4" /> Back to Sign In
                </motion.button>
              </motion.div>
            )}

            {/* ═══════════════ BIOMETRIC ENROLLMENT ═══════════════ */}
            {step === 'biometric_enroll' && (
              <motion.div
                key="biometric_enroll"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="text-center"
              >
                {/* Animated fingerprint icon */}
                <motion.div
                  className="flex justify-center mb-6"
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.05 }}
                >
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400/20 to-orange-500/20 border-2 border-yellow-400/30 flex items-center justify-center">
                      <Fingerprint className="h-12 w-12 text-yellow-400" />
                    </div>
                    {/* Pulse rings */}
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-yellow-400/20"
                      animate={{ scale: [1, 1.3, 1.3], opacity: [0.6, 0, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-yellow-400/10"
                      animate={{ scale: [1, 1.5, 1.5], opacity: [0.4, 0, 0] }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>

                <motion.h2
                  className="text-2xl font-bold mb-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  Enable Biometric Login
                </motion.h2>
                <motion.p
                  className="text-muted-foreground text-sm mb-2 leading-relaxed"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Skip passwords forever. Sign in instantly with your device's built-in security.
                </motion.p>

                {/* Device method icons */}
                <motion.div
                  className="flex items-center justify-center gap-4 mb-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  {[
                    { icon: Fingerprint, label: 'Touch ID' },
                    { icon: Scan,        label: 'Face ID' },
                    { icon: Smartphone,  label: 'Passkey' },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex flex-col items-center gap-1.5">
                      <div className="h-10 w-10 rounded-xl bg-secondary/50 border border-white/10 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-yellow-400/80" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </motion.div>

                {/* Feature bullets */}
                <motion.div
                  className="space-y-2 mb-6 text-left"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {[
                    { icon: '🔒', text: 'Your biometric data never leaves your device' },
                    { icon: '⚡', text: 'One touch to sign in — no password needed' },
                    { icon: '🛡️', text: 'FIDO2 / WebAuthn — military-grade security' },
                  ].map(({ icon, text }) => (
                    <div key={text} className="flex items-center gap-3 bg-white/3 border border-white/6 rounded-xl px-4 py-2.5">
                      <span className="text-base">{icon}</span>
                      <span className="text-xs text-muted-foreground font-medium">{text}</span>
                    </div>
                  ))}
                </motion.div>

                {biometricError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2"
                  >
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {biometricError}
                  </motion.div>
                )}

                <motion.div
                  className="space-y-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.38 }}
                >
                  <button
                    onClick={handleBiometricEnroll}
                    disabled={biometricLoading}
                    className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:opacity-90 shadow-lg shadow-yellow-500/20 transition-all disabled:opacity-60"
                  >
                    {biometricLoading
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <><Fingerprint className="h-4 w-4" /> Enable Biometric Login</>
                    }
                  </button>

                  <button
                    onClick={skipBiometricEnroll}
                    className="w-full py-3 rounded-xl font-medium text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
                  >
                    Maybe later
                  </button>
                </motion.div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
