/**
 * AuthRoutes.tsx — the app's public auth routes (Phase 0.5 · Batch C)
 *
 * Passwordless by construction: Better Auth (Neon) owns identity and every
 * sign-in is an email OTP confirmed on /verify-otp.
 *
 *   · /forgot-password and /reset-password are GONE — there is no password to
 *     reset. A stale bookmark now falls through the router instead of landing
 *     on a form that can never succeed. (The page files are deleted in Batch D.)
 *   · /auth → /login. AuthPage.tsx was password-era code wired to store actions
 *     (loginWithGoogle/Apple/Biometric) that no longer exist; this keeps old
 *     links working without keeping the dead page.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { SignupPage } from '../components/auth/SignupPage';
import { LoginPage } from '../components/auth/LoginPage';
import { VerifyOtpPage } from '../components/auth/VerifyOtpPage';

export function AuthRoutes() {
  return (
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-otp" element={<VerifyOtpPage />} />
      <Route path="/auth" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
