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

// ==================== HEALTH ====================
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'OK', service: 'cryptoverse-api', requestId: req.requestId });
});

// ==================== AUTH ====================
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

// ==================== PAYMENTS ====================
function normalizeDecimal(value) {
  const text = String(value ?? '').trim();
  return /^\\d+(?:\\.\\d+)?$/.test(text) ? text.replace(/\\.?0+$/, '') : null;
}

const nowPaymentsBaseUrl = (process.env.NOWPAYMENTS_API_BASE_URL || 'https://api.nowpayments.io/v1').replace(/\/$/, '');
const nowPaymentsCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL
  || `${process.env.PUBLIC_API_BASE_URL || ''}/api/webhooks/payment`;

async function nowPaymentsRequest(path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${nowPaymentsBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NOWPAYMENTS_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) {
      const providerError = body?.message || body?.error || 'NOWPayments request failed';
      throw new Error(providerError);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function getPaymentProduct(productType, productId) {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('id,product_type,product_id,name,description,amount,currency,cp_amount')
    .eq('product_type', productType)
    .eq('product_id', productId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fulfillCompletedPayment(payment) {
  if (payment.product_type === 'subscription') {
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('subscription_entitlements').upsert({
      user_id: payment.user_id,
      plan_id: payment.plan_id,
      payment_id: payment.id,
      starts_at: startsAt,
      ends_at: endsAt,
      status: 'active',
    }, { onConflict: 'payment_id', ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  if (payment.product_type === 'cp_purchase') {
    const { error } = await supabase.from('cp_ledger').upsert({
      user_id: payment.user_id,
      payment_id: payment.id,
      amount: payment.cp_amount,
      entry_type: 'purchase',
      reference_key: `payment:${payment.id}`,
    }, { onConflict: 'payment_id', ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  throw new Error('Unsupported payment product type');
}

app.get('/api/payments/catalog', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payment_settings')
      .select('product_type,product_id,name,description,amount,currency,cp_amount')
      .eq('active', true)
      .order('product_type', { ascending: true })
      .order('product_id', { ascending: true });
    if (error) throw error;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, products: data || [], requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_catalog_failed', requestId: req.requestId, error: error?.message }));
    return res.status(503).json({ error: 'CATALOG_UNAVAILABLE', message: 'Payment catalog is temporarily unavailable.', requestId: req.requestId });
  }
});

app.get('/api/cp/balance', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cp_ledger')
      .select('amount')
      .eq('user_id', req.user.id);
    if (error) throw error;
    const balance = (data || []).reduce((total, entry) => total + Number(entry.amount || 0), 0);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, balance, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cp_balance_failed', requestId: req.requestId, userId: req.user.id, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch CP balance.', requestId: req.requestId });
  }
});

app.get('/api/cp/ledger', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cp_ledger')
      .select('id,amount,entry_type,reference_key,payment_id,created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, entries: data || [], requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cp_ledger_failed', requestId: req.requestId, userId: req.user.id, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch CP ledger.', requestId: req.requestId });
  }
});

app.post('/api/payments/create', authenticate, async (req, res) => {
  const productType = req.body?.purchaseType === 'cp_purchase' ? 'cp_purchase' : req.body?.purchaseType === 'subscription' ? 'subscription' : '';
  const productId = typeof req.body?.productId === 'string' ? req.body.productId.trim() : '';
  const requestedPayCurrency = typeof req.body?.payCurrency === 'string' ? req.body.payCurrency.trim().toLowerCase() : '';
  const idempotencyKey = req.get('Idempotency-Key');
  if (!productType || !productId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid purchase type and product are required.', requestId: req.requestId });
  }
  const allowedPayCurrencies = new Set(['usdttrc20', 'usdterc20', 'usdtbsc', 'btc', 'eth', 'bnbbsc']);
  if (!allowedPayCurrencies.has(requestedPayCurrency)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unsupported payment currency.', requestId: req.requestId });
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A valid Idempotency-Key is required.', requestId: req.requestId });
  }
  if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET || !process.env.NOWPAYMENTS_PAY_CURRENCY || !/^https:\/\//.test(nowPaymentsCallbackUrl)) {
    return res.status(503).json({ error: 'PAYMENT_NOT_CONFIGURED', message: 'Payments are not configured in this staging environment.', requestId: req.requestId });
  }
  try {
    const plan = await getPaymentProduct(productType, productId);
    const amount = plan && normalizeDecimal(plan.amount);
    const currency = plan && typeof plan.currency === 'string' ? plan.currency.trim().toUpperCase() : null;
    if (!plan || !amount || !currency || (productType === 'cp_purchase' && (!Number.isInteger(plan.cp_amount) || plan.cp_amount <= 0))) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown payment product.', requestId: req.requestId });
    }
    const { data: existing, error: existingError } = await supabase
      .from('payments')
      .select('id,status,external_payment_id')
      .eq('user_id', req.user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return res.json({ success: true, paymentId: existing.id, status: existing.status, providerPaymentId: existing.external_payment_id, requestId: req.requestId });

    const paymentId = crypto.randomUUID();
    const { error: insertError } = await supabase.from('payments').insert({
      id: paymentId,
      user_id: req.user.id,
      amount,
      currency,
      plan_id: productId,
      product_type: productType,
      cp_amount: productType === 'cp_purchase' ? plan.cp_amount : null,
      idempotency_key: idempotencyKey,
      status: 'pending',
    });
    if (insertError) {
      if (insertError.code === '23505') {
        const { data: raced } = await supabase.from('payments').select('id,status,external_payment_id').eq('user_id', req.user.id).eq('idempotency_key', idempotencyKey).maybeSingle();
        if (raced) return res.json({ success: true, paymentId: raced.id, status: raced.status, providerPaymentId: raced.external_payment_id, requestId: req.requestId });
      }
      throw insertError;
    }

    const payment = await nowPaymentsRequest('/payment', {
      price_amount: Number(amount),
      price_currency: currency,
      pay_currency: requestedPayCurrency,
      ipn_callback_url: nowPaymentsCallbackUrl,
      order_id: paymentId,
      order_description: plan.description || `CryptoVerse ${productId}`,
      success_url: process.env.PAYMENT_SUCCESS_URL || undefined,
      cancel_url: process.env.PAYMENT_CANCEL_URL || undefined,
    });
    const providerPaymentId = String(payment?.payment_id || '').trim();
    if (!providerPaymentId) throw new Error('NOWPayments returned no payment identifier');
    const { error: updateError } = await supabase.from('payments').update({
      status: 'waiting',
      external_payment_id: providerPaymentId,
      updated_at: new Date().toISOString(),
    }).eq('id', paymentId);
    if (updateError) throw updateError;
    return res.status(201).json({
      success: true,
      paymentId,
      status: 'waiting',
      providerPaymentId,
      payAddress: payment.pay_address || null,
      payAmount: payment.pay_amount || null,
      payCurrency: payment.pay_currency || requestedPayCurrency,
      checkoutUrl: payment.payment_url || null,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_create_failed', requestId: req.requestId, userId: req.user.id, error: error?.message }));
    return res.status(502).json({ error: 'PAYMENT_PROVIDER_ERROR', message: 'Payment provider is temporarily unavailable.', requestId: req.requestId });
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
      .select('id,user_id,amount,currency,status,external_payment_id,product_type,plan_id,cp_amount')
      .eq('id', orderId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!payment) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.', requestId: req.requestId });
    if (normalizeDecimal(payment.amount) !== normalizeDecimal(req.body.price_amount)
      || String(payment.currency).toLowerCase() !== String(req.body.price_currency || '').toLowerCase()) {
      return res.status(409).json({ error: 'PAYMENT_MISMATCH', message: 'Payment data does not match the order.', requestId: req.requestId });
    }
    const nextStatus = providerStatus === 'finished' ? 'completed' : providerStatus;
    const statusRank = { pending: 0, waiting: 10, confirming: 20, partially_paid: 25, confirmed: 30, sending: 40, completed: 50, failed: 100, expired: 100, refunded: 100 };
    const currentRank = statusRank[payment.status] ?? -1;
    const nextRank = statusRank[nextStatus] ?? -1;
    if (payment.external_payment_id === providerPaymentId && payment.status === nextStatus) {
      return res.json({ accepted: true, duplicate: true, requestId: req.requestId });
    }
    if (['completed', 'failed', 'expired', 'refunded'].includes(payment.status) || nextRank < currentRank) {
      return res.json({ accepted: true, ignored: true, status: payment.status, requestId: req.requestId });
    }
    if (nextStatus === 'completed') {
      await fulfillCompletedPayment(payment);
    }
    const { error: updateError } = await supabase
      .from('payments')
      .update({ status: nextStatus, external_payment_id: providerPaymentId, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', payment.status);
    if (updateError) throw updateError;
    return res.json({ accepted: true, status: nextStatus, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_webhook_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Webhook processing failed.', requestId: req.requestId });
  }
});

// ==================== EXCHANGE ENDPOINTS ====================

// 1. List connections (GET)
app.get('/api/exchange/connections', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('exchange_connections')
      .select('id, exchange, label, status, masked_key, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, connections: data || [], requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_list_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch connections.', requestId: req.requestId });
  }
});

// 2. Connect exchange (POST)
app.post('/api/exchange/connect', authenticate, async (req, res) => {
  const { exchange, apiKey, apiSecret, label, isDemo = false } = req.body;
  
  // Validation
  if (!exchange || typeof exchange !== 'string' || exchange.trim().length < 2) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid exchange is required.', requestId: req.requestId });
  }
  
  if (!isDemo) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid API key is required for live connections.', requestId: req.requestId });
    }
    if (!apiSecret || typeof apiSecret !== 'string' || apiSecret.trim().length < 8) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid API secret is required for live connections.', requestId: req.requestId });
    }
  }
  
  // Allowlist exchanges
  const allowedExchanges = ['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'gateio', 'kucoin'];
  if (!allowedExchanges.includes(exchange.trim().toLowerCase())) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unsupported exchange.', requestId: req.requestId });
  }
  
  try {
    const maskedKey = isDemo ? 'demo' : `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
    
    const { data, error } = await supabase
      .from('exchange_connections')
      .insert({
        user_id: req.user.id,
        exchange: exchange.trim().toLowerCase(),
        label: label || `${exchange} Account`,
        api_key: isDemo ? 'demo' : apiKey,
        api_secret: isDemo ? 'demo' : apiSecret,
        status: isDemo ? 'demo' : 'connected',
        masked_key: maskedKey,
        is_demo: isDemo || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    res.json({ success: true, connection: data, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_connect_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to connect exchange.', requestId: req.requestId });
  }
});

// 3. Disconnect (DELETE)
app.delete('/api/exchange/connections/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  
  try {
    const { error } = await supabase
      .from('exchange_connections')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ success: true, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_disconnect_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to disconnect.', requestId: req.requestId });
  }
});

// 4. Get balance (GET)
app.get('/api/exchange/balance/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  
  try {
    // First verify the connection belongs to this user
    const { data: connection, error: connError } = await supabase
      .from('exchange_connections')
      .select('exchange, api_key, is_demo')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    
    if (connError || !connection) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Connection not found.', requestId: req.requestId });
    }
    
    // For demo connections, return mock data
    if (connection.is_demo) {
      return res.json({
        success: true,
        connectionId: id,
        balances: [
          { asset: 'BTC', free: 0.5, locked: 0.1, total: 0.6, usdValue: 36000 },
          { asset: 'ETH', free: 5.0, locked: 0.5, total: 5.5, usdValue: 13750 },
          { asset: 'USDT', free: 10000, locked: 0, total: 10000, usdValue: 10000 },
        ],
        totalUsdValue: 59750,
        updatedAt: new Date().toISOString(),
        requestId: req.requestId
      });
    }
    
    // For live connections, fetch from exchange API
    // TODO: Implement actual exchange API integration
    
    res.json({
      success: true,
      connectionId: id,
      balances: [],
      totalUsdValue: 0,
      updatedAt: new Date().toISOString(),
      requestId: req.requestId,
      message: 'Live balance fetch not yet implemented'
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_balance_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch balance.', requestId: req.requestId });
  }
});

// 5. Sync portfolio (POST)
app.post('/api/exchange/sync/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  
  try {
    const { data: connection, error: connError } = await supabase
      .from('exchange_connections')
      .select('exchange, is_demo')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    
    if (connError || !connection) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Connection not found.', requestId: req.requestId });
    }
    
    // For demo connections, return success
    if (connection.is_demo) {
      return res.json({
        success: true,
        syncedAt: new Date().toISOString(),
        requestId: req.requestId,
        message: 'Demo sync completed'
      });
    }
    
    // For live connections, sync with exchange API
    // TODO: Implement actual exchange API integration
    
    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      requestId: req.requestId,
      message: 'Sync initiated (live implementation pending)'
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_sync_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to sync.', requestId: req.requestId });
  }
});

// 6. Execute order (POST)
app.post('/api/exchange/order', authenticate, async (req, res) => {
  const { connectionId, symbol, side, quantity, orderType = 'market', price } = req.body;
  
  if (!connectionId || !symbol || !side || !quantity) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Missing required fields: connectionId, symbol, side, quantity.', requestId: req.requestId });
  }
  
  if (!['buy', 'sell'].includes(side.toLowerCase())) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Side must be buy or sell.', requestId: req.requestId });
  }
  
  try {
    const { data: connection, error: connError } = await supabase
      .from('exchange_connections')
      .select('exchange, is_demo')
      .eq('id', connectionId)
      .eq('user_id', req.user.id)
      .single();
    
    if (connError || !connection) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Connection not found.', requestId: req.requestId });
    }
    
    // For demo connections, return mock order
    if (connection.is_demo) {
      return res.json({
        success: true,
        orderId: `demo-${Date.now()}`,
        status: 'filled',
        symbol,
        side,
        quantity,
        price: price || (side === 'buy' ? 100 : 110),
        filledAt: new Date().toISOString(),
        requestId: req.requestId,
        message: 'Demo order executed'
      });
    }
    
    // For live connections, execute via exchange API
    // TODO: Implement actual exchange API integration
    
    res.status(501).json({
      error: 'NOT_IMPLEMENTED',
      message: 'Live order execution not yet implemented.',
      requestId: req.requestId
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_order_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to execute order.', requestId: req.requestId });
  }
});

// ==================== ERROR HANDLING ====================
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
