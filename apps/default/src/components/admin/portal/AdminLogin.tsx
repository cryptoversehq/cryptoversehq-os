import React, { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ChevronRight, Eye, EyeOff, Loader2, Lock, Mail, Shield } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { CryptoVerseLogo } from '@/components/CryptoVerseLogo';

const ADMIN_ROLES = new Set(['admin', 'senior_admin', 'super_admin', 'founder', 'developer']);

export function AdminLogin() {
  const user = useAuthStore(state => state.user);
  const login = useAuthStore(state => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = !!user && ADMIN_ROLES.has(user.role);

  if (isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await login(email, password);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error || 'Invalid credentials. Please try again.');
      return;
    }

    const loggedInUser = useAuthStore.getState().user;
    if (!loggedInUser || !ADMIN_ROLES.has(loggedInUser.role)) {
      setError('This account does not have admin access.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4"><CryptoVerseLogo size={64} /></div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CryptoVerse HQ Admin</h1>
          <p className="text-sm text-white/40 mt-1">Secure administrative portal</p>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Sign in</h2>
              <p className="text-sm text-white/50">Use your CryptoVerse HQ account credentials, the same email and password as the main app.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="text-xs font-medium text-white/50 uppercase tracking-wide">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input id="admin-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="text-xs font-medium text-white/50 uppercase tracking-wide">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required className="w-full pl-10 pr-11 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all" />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 p-2">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-red-500/20 disabled:opacity-60">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              {isLoading ? 'Logging in...' : 'Continue'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm">
            <Link to="/forgot-password" className="text-[#FFD700] hover:underline">Forgot password?</Link>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-center text-[10px] text-white/25 mt-6">
          <Shield className="h-3 w-3" />
          Unauthorized access is prohibited and logged · All activity is audited.
        </div>
      </motion.div>
    </div>
  );
}
