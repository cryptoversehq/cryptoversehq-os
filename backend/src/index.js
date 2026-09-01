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
