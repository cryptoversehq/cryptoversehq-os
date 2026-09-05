// CryptoVerse HQ API client for the optional Supabase/Render backend.
// Set VITE_API_URL in Taskade Secrets before using these remote endpoints.

const API_URL = '{{VITE_API_URL}}';

const getToken = () => {
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

const parseResponse = async (response, fallbackMessage) => {
  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || text || fallbackMessage);
  }

  return payload;
};

const request = async (path, options = {}, fallbackMessage = 'API request failed') => {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(options.headers || {}),
      },
    });

    return await parseResponse(response, fallbackMessage);
  } catch (error) {
    console.error(`${fallbackMessage}:`, error);
    throw error instanceof Error ? error : new Error(fallbackMessage);
  }
};

export const api = {
  payments: {
    create: (data) => request(
      '/payments/create',
      { method: 'POST', body: JSON.stringify(data) },
      'Failed to create payment',
    ),
    verify: (id) => request(
      `/payments/verify/${encodeURIComponent(id)}`,
      {},
      'Failed to verify payment',
    ),
    history: () => request('/payments/history', {}, 'Failed to fetch payment history'),
  },

  auth: {
    sendOTP: (email) => request(
      '/auth/send-otp',
      { method: 'POST', body: JSON.stringify({ email }) },
      'Failed to send OTP',
    ),
    verifyOTP: async (email, code) => {
      const data = await request(
        '/auth/verify-otp',
        { method: 'POST', body: JSON.stringify({ email, code }) },
        'Failed to verify OTP',
      );

      if (data?.token) {
        localStorage.setItem('token', data.token);
      }

      return data;
    },
    logout: async () => {
      try {
        return await request('/auth/logout', { method: 'POST' }, 'Failed to logout');
      } finally {
        localStorage.removeItem('token');
      }
    },
    me: () => request('/auth/me', {}, 'Failed to get user info'),
  },

  health: () => request('/health', {}, 'Health check failed'),
  test: () => request('/test', {}, 'Test endpoint failed'),
};

export default api;
