import { Route, Routes } from 'react-router-dom';
import { SignupPage } from '../components/auth/SignupPage';
import { LoginPage } from '../components/auth/LoginPage';
import { VerifyOtpPage } from '../components/auth/VerifyOtpPage';
import { ForgotPasswordPage } from '../components/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../components/auth/ResetPasswordPage';

export function AuthRoutes() {
  return (
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-otp" element={<VerifyOtpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>
  );
}
