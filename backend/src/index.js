require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const secureCookies = process.env.COOKIE_SECURE === undefined
  ? isProduction
  : process.env.COOKIE_SECURE === 'true';
const sessionCookieName = process.env.SESSION_COOKIE_NAME || (secureCookies ? '__Host-cv_session' : 'cv_session');
const csrfCookieName = process.env.CSRF_COOKIE_NAME || (secureCookies ? '__Host-cv_csrf' : 'cv_csrf');
const refreshCookieName = process.env.REFRESH_COOKIE_NAME || (secureCookies ? '__Host-cv_refresh' : 'cv_refresh');
const sessionMaxAgeMs = Number(process.env.SESSION_MAX_AGE_MS || 30 * 60 * 1000);
const cookieSameSite = process.env.COOKIE_SAME_SITE || 'lax';
if (!['lax', 'strict', 'none'].includes(cookieSameSite) || (cookieSameSite === 'none' && !secureCookies)) {
  throw new Error('COOKIE_SAME_SITE must be lax, strict, or secure none');
}
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const paymentPlans = (() => {
  try {
    const plans = JSON.parse(process.env.PAYMENT_PLANS_JSON || '{}');
    return plans && typeof plans === 'object' ? plans : {};
  } catch {
    throw new Error('PAYMENT_PLANS_JSON must be valid JSON');
  }
})();

if (!Number.isInteger(sessionMaxAgeMs) || sessionMaxAgeMs < 5 * 60 * 1000 || sessionMaxAgeMs > 24 * 60 * 60 * 1000) {
  throw new Error('SESSION_MAX_AGE_MS must be between 5 minutes and 24 hours');
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey || !supabaseAnonKey) {
  throw new Error('Missing required Supabase server configuration');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-ID'],
  maxAge: 600,
}));
app.use(cookieParser());
app.use(express.json({
  limit: '100kb',
  verify(req, res, buffer) {
    if (req.originalUrl === '/api/webhooks/payment') req.rawBody = Buffer.from(buffer);
  },
}));

const requestId = (req, res, next) => {
  const supplied = req.get('X-Request-ID');
  req.requestId = supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};
app.use(requestId);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many authentication requests.' },
});
app.use('/api/auth', authLimiter);

const cookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: cookieSameSite,
  path: '/',
  maxAge: sessionMaxAgeMs,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: cookieSameSite,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: secureCookies,
  sameSite: cookieSameSite,
  path: '/',
  maxAge: sessionMaxAgeMs,
};

function safeUser(user) {
  return {
    id: user.id,
    email: user.email || null,
    role: user.app_metadata?.role || user.user_metadata?.role || 'user',
  };
}

function timingSafeEqualText(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.path === '/api/webhooks/payment') return next();
  const cookieToken = req.cookies[csrfCookieName];
  const headerToken = req.get('X-CSRF-Token');
  if (!timingSafeEqualText(cookieToken, headerToken)) {
    return res.status(403).json({ error: 'CSRF_INVALID', message: 'CSRF validation failed.', requestId: req.requestId });
  }
  return next();
}
app.use(csrfProtection);

async function authenticate(req, res, next) {
  const token = req.cookies[sessionCookieName];
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.', requestId: req.requestId });
  }
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.clearCookie(sessionCookieName, { ...cookieOptions, maxAge: undefined });
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.', requestId: req.requestId });
    }
    req.user = data.user;
    return next();
  } catch (error) {
    console.error(JSON.stringify({ event: 'auth_lookup_failed', requestId: req.requestId, error: error?.message }));
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.', requestId: req.requestId });
  }
}

app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'OK', service: 'cryptoverse-api', requestId: req.requestId });
});

app.get('/api/auth/csrf', (req, res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  res.cookie(csrfCookieName, token, csrfCookieOptions);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ csrfToken: token, requestId: req.requestId });
});

app.post('/api/auth/send-otp', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid email is required.', requestId: req.requestId });
  }
  try {
    const { error } = await supabaseAuth.auth.signInWithOtp({ email });
    if (error) throw error;
    return res.status(202).json({ accepted: true, message: 'If the address is eligible, a verification code will be sent.', requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'otp_send_failed', requestId: req.requestId, error: error?.message }));
    return res.status(202).json({ accepted: true, message: 'If the address is eligible, a verification code will be sent.', requestId: req.requestId });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const token = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email) || !/^\\d{6}$/.test(token)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid verification request.', requestId: req.requestId });
  }
  try {
    const { data, error } = await supabaseAuth.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.session) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired verification code.', requestId: req.requestId });
    }
    res.cookie(sessionCookieName, data.session.access_token, cookieOptions);
    res.cookie(refreshCookieName, data.session.refresh_token, refreshCookieOptions);
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    res.cookie(csrfCookieName, csrfToken, csrfCookieOptions);
    return res.json({ user: safeUser(data.user), requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'otp_verify_failed', requestId: req.requestId, error: error?.message }));
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired verification code.', requestId: req.requestId });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies[refreshCookieName];
  if (!refreshToken) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.', requestId: req.requestId });
  try {
    const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw error || new Error('No session');
    res.cookie(sessionCookieName, data.session.access_token, cookieOptions);
    res.cookie(refreshCookieName, data.session.refresh_token, refreshCookieOptions);
    return res.json({ user: safeUser(data.user), requestId: req.requestId });
  } catch (error) {
    res.clearCookie(sessionCookieName, { ...cookieOptions, maxAge: undefined });
    res.clearCookie(refreshCookieName, { ...refreshCookieOptions, maxAge: undefined });
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.', requestId: req.requestId });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user: safeUser(req.user), requestId: req.requestId });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(sessionCookieName, { ...cookieOptions, maxAge: undefined });
  res.clearCookie(refreshCookieName, { ...refreshCookieOptions, maxAge: undefined });
  res.clearCookie(csrfCookieName, { ...csrfCookieOptions, maxAge: undefined });
  res.status(204).end();
});

function normalizeDecimal(value) {
  const text = String(value ?? '').trim();
  return /^\\d+(?:\\.\\d+)?$/.test(text) ? text.replace(/\\.?0+$/, '') : null;
}

app.post('/api/payments/create', authenticate, async (req, res) => {
  const planId = typeof req.body?.planId === 'string' ? req.body.planId.trim() : '';
  const idempotencyKey = req.get('Idempotency-Key');
  const plan = planId ? paymentPlans[planId] : null;
  if (!plan || typeof plan !== 'object' || !normalizeDecimal(plan.amount) || typeof plan.currency !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown payment plan.', requestId: req.requestId });
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid Idempotency-Key is required.', requestId: req.requestId });
  }
  if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET) {
    return res.status(503).json({ error: 'PAYMENT_NOT_CONFIGURED', message: 'Payments are not configured in this staging environment.', requestId: req.requestId });
  }
  try {
    const { data: existing, error: existingError } = await supabase
      .from('payments')
      .select('id,status,external_payment_id')
      .eq('user_id', req.user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return res.json({ success: true, paymentId: existing.id, status: existing.status, requestId: req.requestId });
    return res.status(501).json({ error: 'PAYMENT_NOT_IMPLEMENTED', message: 'Provider payment creation is gated until staging schema and provider contract are configured.', requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_create_failed', requestId: req.requestId, userId: req.user.id, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create payment.', requestId: req.requestId });
  }
});

app.get('/api/payments/verify/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id,status,created_at,updated_at')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.', requestId: req.requestId });
    return res.json({ verified: data.status === 'completed', status: data.status, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_verify_failed', requestId: req.requestId, userId: req.user.id, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Verification failed.', requestId: req.requestId });
  }
});

app.get('/api/payments/history', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id,amount,currency,status,created_at,plan_id')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, payments: data || [], requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_history_failed', requestId: req.requestId, userId: req.user.id, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch payment history.', requestId: req.requestId });
  }
});

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = sortObject(value[key]);
    return result;
  }, {});
}

function verifyNowPaymentsSignature(payload, signature) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(JSON.stringify(sortObject(payload))).digest('hex');
  return timingSafeEqualText(expected, signature.trim().toLowerCase());
}

app.post('/api/webhooks/payment', async (req, res) => {
  const signature = req.get('x-nowpayments-sig');
  if (!verifyNowPaymentsSignature(req.body, signature)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid webhook signature.', requestId: req.requestId });
  }
  const providerPaymentId = String(req.body?.payment_id || '').trim();
  const orderId = String(req.body?.order_id || '').trim();
  const providerStatus = String(req.body?.payment_status || '').trim().toLowerCase();
  const allowedStatuses = new Set(['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired']);
  if (!providerPaymentId || !orderId || !allowedStatuses.has(providerStatus)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid webhook payload.', requestId: req.requestId });
  }
  try {
    const { data: payment, error: lookupError } = await supabase
      .from('payments')
      .select('id,amount,currency,status,external_payment_id')
      .eq('id', orderId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!payment) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.', requestId: req.requestId });
    if (normalizeDecimal(payment.amount) !== normalizeDecimal(req.body.price_amount)
      || String(payment.currency).toLowerCase() !== String(req.body.price_currency || '').toLowerCase()) {
      return res.status(409).json({ error: 'PAYMENT_MISMATCH', message: 'Payment data does not match the order.', requestId: req.requestId });
    }
    const nextStatus = providerStatus === 'finished' ? 'completed' : providerStatus;
    if (payment.external_payment_id === providerPaymentId && payment.status === nextStatus) {
      return res.json({ accepted: true, duplicate: true, requestId: req.requestId });
    }
    const { error: updateError } = await supabase
      .from('payments')
      .update({ status: nextStatus, external_payment_id: providerPaymentId, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .neq('status', 'completed');
    if (updateError) throw updateError;
    return res.json({ accepted: true, status: nextStatus, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_webhook_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Webhook processing failed.', requestId: req.requestId });
  }
});

app.use((err, req, res, next) => {
  console.error(JSON.stringify({ event: 'request_failed', requestId: req.requestId, error: err?.message }));
  if (res.headersSent) return next(err);
  if (err?.message === 'CORS origin denied') {
    return res.status(403).json({ error: 'CORS_DENIED', message: 'Origin is not allowed.', requestId: req.requestId });
  }
  return res.status(500).json({ error: 'SERVER_ERROR', message: 'Request failed.', requestId: req.requestId });
});

app.listen(port, () => {
  console.log(JSON.stringify({ event: 'server_started', port, environment: process.env.NODE_ENV || 'development' }));
});
