require('dotenv').config();

const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { createClient: createTursoClient } = require('@libsql/client');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const { betterAuth } = require('better-auth');
const { emailOTP } = require('better-auth/plugins');
const { toNodeHandler } = require('better-auth/node');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// ==================== NEON POSTGRES ====================
const pgPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

// ==================== TURSO ====================
const tursoClient = (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN)
  ? createTursoClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  : null;

// ==================== SUPABASE (payments/CP/exchange only) ====================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ==================== RESEND ====================
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ==================== BETTER AUTH ====================
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'https://cryptoversehq-os.onrender.com',
  database: pgPool,
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
  },
  advanced: {
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
      httpOnly: true,
    },
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'],
    },
  },
  trustedOrigins: allowedOrigins,
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (!resend) {
          console.error(JSON.stringify({ event: 'resend_not_configured', email }));
          throw new Error('Email service is not configured.');
        }
        try {
          await resend.emails.send({
            from: 'CryptoVerse HQ <noreply@cryptoversehq.com>',
            to: email,
            subject: 'Your CryptoVerse HQ Verification Code',
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #111;">CryptoVerse HQ</h2>
                <p>Your one-time verification code is:</p>
                <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; background: #f4f4f4; padding: 16px; border-radius: 8px; text-align: center; color: #111;">${otp}</p>
                <p style="color: #666; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
              </div>
            `,
          });
        } catch (error) {
          console.error(JSON.stringify({ event: 'otp_email_failed', email, error: error?.message }));
          throw new Error('Failed to send verification email.');
        }
      },
      otpLength: 6,
      expiresIn: 300,
    }),
  ],
});

// ==================== APP CONFIG ====================
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
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'Idempotency-Key'
  ],
  maxAge: 600,
}));

// ⚠️ CRITICAL: Better Auth MUST be mounted BEFORE express.json() and cookieParser()
app.all('/api/auth/*', toNodeHandler(auth));

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

// ==================== NEON USER LOOKUP ====================
const neonUserCache = new Map();
const NEON_USER_CACHE_TTL = 60 * 1000;

async function getOrCreateNeonUser(email) {
  if (!email || !pgPool) return null;
  const key = email.toLowerCase();
  const cached = neonUserCache.get(key);
  if (cached && Date.now() - cached.at < NEON_USER_CACHE_TTL) {
    return cached.user;
  }
  try {
    const { rows } = await pgPool.query(
      'select id, email, role, plan from public.users where lower(email) = lower($1) limit 1',
      [email]
    );
    let user;
    if (rows.length > 0) {
      user = rows[0];
    } else {
      const { rows: inserted } = await pgPool.query(
        `insert into public.users (email, role, plan)
         values ($1, 'user', 'free')
         returning id, email, role, plan`,
        [email]
      );
      user = inserted[0];
    }
    neonUserCache.set(key, { user, at: Date.now() });
    return user;
  } catch (err) {
    console.error(JSON.stringify({ event: 'neon_user_lookup_failed', error: err?.message }));
    return null;
  }
}

// ==================== AUTHENTICATE MIDDLEWARE (Better Auth) ====================
async function authenticate(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user || !session.user.email) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
        requestId: req.requestId,
      });
    }

    const appUser = await getOrCreateNeonUser(session.user.email);
    if (!appUser) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'User record unavailable.',
        requestId: req.requestId,
      });
    }

    req.user = {
      id: appUser.id,
      email: appUser.email,
      role: appUser.role,
      plan: appUser.plan,
      betterAuthId: session.user.id,
    };
    return next();
  } catch (error) {
    console.error(JSON.stringify({ event: 'auth_lookup_failed', requestId: req.requestId, error: error?.message }));
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required.',
      requestId: req.requestId,
    });
  }
}

// ==================== ADMIN AUTHORIZATION ====================
const ADMIN_READ_ROLES = new Set(['developer', 'subscription_admin', 'support_admin']);
const ADMIN_WRITE_ROLES = new Set(['developer', 'subscription_admin']);

function requireAdminRead(req, res, next) {
  if (!req.user || !ADMIN_READ_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required.', requestId: req.requestId });
  }
  next();
}

function requireAdminWrite(req, res, next) {
  if (!req.user || !ADMIN_WRITE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Subscription admin access required.', requestId: req.requestId });
  }
  next();
}

async function writeAuditLog(entry) {
  try {
    await pgPool.query(
      `insert into public.subscription_audit_log
       (actor_id, actor_email, actor_role, target_user_id, plan_id, action, result, note, error, before_state, after_state, ip_address, user_agent, request_id, idempotency_key, entitlement_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        entry.actor_id, entry.actor_email, entry.actor_role,
        entry.target_user_id, entry.plan_id, entry.action,
        entry.result, entry.note || null, entry.error || null,
        entry.before_state ? JSON.stringify(entry.before_state) : null,
        entry.after_state ? JSON.stringify(entry.after_state) : null,
        entry.ip_address || null, entry.user_agent || null,
        entry.request_id || null, entry.idempotency_key || null,
        entry.entitlement_id || null,
      ]
    );
  } catch (err) {
    console.error(JSON.stringify({ event: 'audit_log_failed', error: err?.message }));
  }
}

// ==================== HEALTH ====================
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'OK', service: 'cryptoverse-api', requestId: req.requestId });
});

app.get('/api/db-test', async (req, res) => {
  if (!pgPool) return res.status(503).json({ success: false, error: 'DATABASE_URL is not configured' });
  try {
    const client = await pgPool.connect();
    const result = await client.query('SELECT version()');
    client.release();
    return res.json({ success: true, version: result.rows[0].version });
  } catch (error) {
    console.error(JSON.stringify({ event: 'db_test_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ success: false, error: 'Database connection failed' });
  }
});

app.get('/api/db-tables', async (req, res) => {
  if (!pgPool) return res.status(503).json({ success: false, error: 'DATABASE_URL is not configured' });
  try {
    const result = await pgPool.query(`
      select table_name from information_schema.tables where table_schema = 'public' order by table_name
    `);
    return res.json({ success: true, tables: result.rows.map(r => r.table_name) });
  } catch (error) {
    console.error(JSON.stringify({ event: 'db_tables_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ success: false, error: 'Failed to fetch tables' });
  }
});

app.get('/api/turso-test', async (req, res) => {
  if (!tursoClient) return res.status(503).json({ success: false, error: 'Turso environment variables are not configured' });
  try {
    const result = await tursoClient.execute('SELECT sqlite_version() AS version');
    return res.json({ success: true, version: result.rows[0].version });
  } catch (error) {
    console.error(JSON.stringify({ event: 'turso_test_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ success: false, error: 'Turso connection failed' });
  }
});

// ==================== CURRENT USER ====================
app.get('/api/me', authenticate, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user: req.user, requestId: req.requestId });
});

// ==================== ADMIN SUBSCRIPTION ENDPOINTS ====================

app.get('/api/admin/users', authenticate, requireAdminRead, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const result = await pgPool.query(
      `select id, email, role, plan, created_at from public.users order by created_at desc limit $1 offset $2`,
      [limit, offset]
    );
    const { rows: countRows } = await pgPool.query('select count(*)::int as total from public.users');
    return res.json({
      success: true,
      users: result.rows,
      total: countRows[0].total,
      limit,
      offset,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_users_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch users.', requestId: req.requestId });
  }
});

app.post('/api/admin/subscriptions/grant', authenticate, requireAdminWrite, async (req, res) => {
  const { target_user_id, plan_id, duration_days, note } = req.body || {};
  const idempotencyKey = req.get('Idempotency-Key');
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  if (!target_user_id || !plan_id) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'target_user_id and plan_id required.', requestId: req.requestId });
  }
  if (!['pro', 'pro_plus'].includes(plan_id)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid plan_id.', requestId: req.requestId });
  }
  const days = Number(duration_days) || 30;
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'duration_days must be 1-3650.', requestId: req.requestId });
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid Idempotency-Key required.', requestId: req.requestId });
  }

  try {
    const { rows: existing } = await pgPool.query(
      `select id from public.subscription_audit_log where idempotency_key = $1 and action = 'grant' and result = 'success' limit 1`,
      [idempotencyKey]
    );
    if (existing.length > 0) {
      return res.json({ success: true, duplicate: true, requestId: req.requestId });
    }

    const { rows: targetRows } = await pgPool.query(
      'select id, email, role, plan from public.users where id = $1',
      [target_user_id]
    );
    if (targetRows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Target user not found.', requestId: req.requestId });
    }
    const targetUser = targetRows[0];
    const beforeState = { plan: targetUser.plan };

    const { rows: activeSubs } = await pgPool.query(
      `select id, ends_at from public.subscriptions where user_id = $1 and status = 'active' and ends_at > now() order by ends_at desc limit 1`,
      [target_user_id]
    );

    let entitlementId;
    if (activeSubs.length > 0) {
      const newEndsAt = new Date(new Date(activeSubs[0].ends_at).getTime() + days * 86400000);
      await pgPool.query(
        `update public.subscriptions set ends_at = $1, plan_id = $2, updated_at = now() where id = $3`,
        [newEndsAt.toISOString(), plan_id, activeSubs[0].id]
      );
      entitlementId = activeSubs[0].id;
    } else {
      const endsAt = new Date(Date.now() + days * 86400000).toISOString();
      const { rows: inserted } = await pgPool.query(
        `insert into public.subscriptions (user_id, plan_id, status, starts_at, ends_at, granted_by)
         values ($1, $2, 'active', now(), $3, $4) returning id`,
        [target_user_id, plan_id, endsAt, req.user.id]
      );
      entitlementId = inserted[0].id;
    }

    await pgPool.query('update public.users set plan = $1, updated_at = now() where id = $2', [plan_id, target_user_id]);

    await writeAuditLog({
      actor_id: req.user.id,
      actor_email: req.user.email,
      actor_role: req.user.role,
      target_user_id,
      plan_id,
      action: 'grant',
      result: 'success',
      note: note || null,
      before_state: beforeState,
      after_state: { plan: plan_id, ends_at: new Date(Date.now() + days * 86400000).toISOString() },
      ip_address: ipAddress,
      user_agent: userAgent,
      request_id: req.requestId,
      idempotency_key: idempotencyKey,
      entitlement_id: entitlementId,
    });

    return res.json({
      success: true,
      entitlement_id: entitlementId,
      target_user_id,
      plan_id,
      duration_days: days,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'grant_failed', requestId: req.requestId, error: error?.message }));
    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: target_user_id || null, plan_id: plan_id || null,
      action: 'grant', result: 'failure', error: error?.message,
      ip_address: ipAddress, user_agent: userAgent, request_id: req.requestId,
      idempotency_key: idempotencyKey,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Grant failed.', requestId: req.requestId });
  }
});

app.post('/api/admin/subscriptions/revoke', authenticate, requireAdminWrite, async (req, res) => {
  const { target_user_id, note } = req.body || {};
  const idempotencyKey = req.get('Idempotency-Key');
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  if (!target_user_id) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'target_user_id required.', requestId: req.requestId });
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid Idempotency-Key required.', requestId: req.requestId });
  }

  try {
    const { rows: existing } = await pgPool.query(
      `select id from public.subscription_audit_log where idempotency_key = $1 and action = 'revoke' and result = 'success' limit 1`,
      [idempotencyKey]
    );
    if (existing.length > 0) {
      return res.json({ success: true, duplicate: true, requestId: req.requestId });
    }

    const { rows: activeSubs } = await pgPool.query(
      `select id, plan_id, ends_at from public.subscriptions where user_id = $1 and status = 'active' and ends_at > now() order by ends_at desc limit 1`,
      [target_user_id]
    );
    if (activeSubs.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'No active subscription found.', requestId: req.requestId });
    }

    const sub = activeSubs[0];
    await pgPool.query(
      `update public.subscriptions set status = 'revoked', ends_at = now(), updated_at = now() where id = $1`,
      [sub.id]
    );
    await pgPool.query('update public.users set plan = $1, updated_at = now() where id = $2', ['free', target_user_id]);

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id, plan_id: sub.plan_id, action: 'revoke', result: 'success',
      note: note || null,
      before_state: { plan: sub.plan_id, ends_at: sub.ends_at },
      after_state: { plan: 'free', ends_at: new Date().toISOString() },
      ip_address: ipAddress, user_agent: userAgent,
      request_id: req.requestId, idempotency_key: idempotencyKey,
      entitlement_id: sub.id,
    });

    return res.json({ success: true, target_user_id, previous_plan: sub.plan_id, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'revoke_failed', requestId: req.requestId, error: error?.message }));
    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: target_user_id || null, plan_id: null,
      action: 'revoke', result: 'failure', error: error?.message,
      ip_address: ipAddress, user_agent: userAgent, request_id: req.requestId,
      idempotency_key: idempotencyKey,
    });
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Revoke failed.', requestId: req.requestId });
  }
});

app.get('/api/admin/subscriptions/audit', authenticate, requireAdminRead, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const result = await pgPool.query(
      `select id, actor_id, actor_email, actor_role, target_user_id, plan_id, action, result, note, error, ip_address, created_at
       from public.subscription_audit_log order by created_at desc limit $1 offset $2`,
      [limit, offset]
    );
    return res.json({ success: true, entries: result.rows, limit, offset, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'audit_list_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch audit log.', requestId: req.requestId });
  }
});

app.get('/api/admin/subscriptions/user/:userId', authenticate, requireAdminRead, async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows: userRows } = await pgPool.query(
      'select id, email, role, plan, created_at from public.users where id = $1',
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.', requestId: req.requestId });
    }
    const { rows: subs } = await pgPool.query(
      `select id, plan_id, status, starts_at, ends_at, granted_by, created_at
       from public.subscriptions where user_id = $1 order by created_at desc limit 20`,
      [userId]
    );
    return res.json({ success: true, user: userRows[0], subscriptions: subs, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'user_sub_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch user subscriptions.', requestId: req.requestId });
  }
});

// ==================== ADMIN BALANCE ADJUSTMENT ====================
app.post('/api/admin/users/:userId/balance', authenticate, requireAdminWrite, async (req, res) => {
  const { userId } = req.params;
  const { delta, reason } = req.body || {};
  const idempotencyKey = req.get('Idempotency-Key');
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  // Validation
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ 
      error: 'VALIDATION_ERROR', 
      message: 'delta must be a non-zero integer.', 
      requestId: req.requestId 
    });
  }
  if (Math.abs(delta) > 1000000) {
    return res.status(400).json({ 
      error: 'VALIDATION_ERROR', 
      message: 'delta magnitude too large (max 1,000,000).', 
      requestId: req.requestId 
    });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ 
      error: 'VALIDATION_ERROR', 
      message: 'reason required (min 3 chars).', 
      requestId: req.requestId 
    });
  }

  try {
    // Check user exists
    const { rows: userRows } = await pgPool.query(
      'select id, email, balance from public.users where id = $1',
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ 
        error: 'NOT_FOUND', 
        message: 'User not found.', 
        requestId: req.requestId 
      });
    }
    const user = userRows[0];
    const beforeBalance = Number(user.balance || 0);
    const afterBalance = beforeBalance + delta;

    if (afterBalance < 0) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR', 
        message: 'Insufficient balance for this debit.', 
        requestId: req.requestId 
      });
    }

    // Update balance
    await pgPool.query(
      'update public.users set balance = $1, updated_at = now() where id = $2',
      [afterBalance, userId]
    );

    // Audit log (reuse the same table but with action = 'balance_adjust')
    // Note: The audit table's `action` check constraint only allows grant/revoke/expire/payment.
    // We'll use `payment` as action for balance adjustments with note explaining.
    await writeAuditLog({
      actor_id: req.user.id,
      actor_email: req.user.email,
      actor_role: req.user.role,
      target_user_id: userId,
      plan_id: null,
      action: 'payment', // closest allowed action
      result: 'success',
      note: `Balance adjustment: ${delta > 0 ? '+' : ''}${delta} | Reason: ${reason.trim()}`,
      before_state: { balance: beforeBalance },
      after_state: { balance: afterBalance },
      ip_address: ipAddress,
      user_agent: userAgent,
      request_id: req.requestId,
      idempotency_key: idempotencyKey,
      entitlement_id: null,
    });

    return res.json({
      success: true,
      user_id: userId,
      before_balance: beforeBalance,
      after_balance: afterBalance,
      delta,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: 'balance_adjust_failed', 
      requestId: req.requestId, 
      userId, 
      error: error?.message 
    }));
    return res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Balance adjustment failed.', 
      requestId: req.requestId 
    });
  }
});

// ==================== PAYMENTS (Supabase - unchanged) ====================
function normalizeDecimal(value) {
  const text = String(value ?? '').trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? text.replace(/\.?0+$/, '') : null;
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
    const { data, error } = await supabase.from('cp_ledger').select('amount').eq('user_id', req.user.id);
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

function timingSafeEqualText(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

// ==================== EXCHANGE ENDPOINTS (Supabase - unchanged) ====================
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

app.post('/api/exchange/connect', authenticate, async (req, res) => {
  const { exchange, apiKey, apiSecret, label, isDemo = false } = req.body;
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

app.get('/api/exchange/balance/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: connection, error: connError } = await supabase
      .from('exchange_connections')
      .select('exchange, api_key, is_demo')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    if (connError || !connection) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Connection not found.', requestId: req.requestId });
    }
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
    if (connection.is_demo) {
      return res.json({ success: true, syncedAt: new Date().toISOString(), requestId: req.requestId, message: 'Demo sync completed' });
    }
    res.json({ success: true, syncedAt: new Date().toISOString(), requestId: req.requestId, message: 'Sync initiated (live implementation pending)' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_sync_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to sync.', requestId: req.requestId });
  }
});

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
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Live order execution not yet implemented.', requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_order_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to execute order.', requestId: req.requestId });
  }
});

// ==================== DAILY TRADE LIMIT (Supabase - unchanged) ====================
app.get('/api/trading/daily-limit', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('daily_trade_limits')
      .select('trades_used, max_trades')
      .eq('user_id', userId)
      .eq('trade_date', today)
      .maybeSingle();
    if (error) throw error;
    let tradesUsed = 0;
    let maxTrades = 10;
    if (data) {
      tradesUsed = data.trades_used;
      maxTrades = data.max_trades;
    }
    const remaining = Math.max(0, maxTrades - tradesUsed);
    res.json({
      success: true,
      limit: maxTrades,
      used: tradesUsed,
      remaining: remaining,
      resetAt: new Date(today + 'T00:00:00Z').toISOString(),
      requestId: req.requestId
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'daily_limit_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch daily limit.', requestId: req.requestId });
  }
});

app.post('/api/trading/daily-limit/consume', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];
    const { data: current, error: fetchError } = await supabase
      .from('daily_trade_limits')
      .select('trades_used, max_trades')
      .eq('user_id', userId)
      .eq('trade_date', today)
      .maybeSingle();
    if (fetchError) throw fetchError;
    let tradesUsed = 0;
    let maxTrades = 10;
    if (current) {
      tradesUsed = current.trades_used;
      maxTrades = current.max_trades;
    }
    if (tradesUsed >= maxTrades) {
      return res.status(429).json({
        error: 'LIMIT_REACHED',
        message: 'Daily trade limit reached.',
        limit: maxTrades,
        used: tradesUsed,
        remaining: 0,
        resetAt: new Date(today + 'T00:00:00Z').toISOString(),
        requestId: req.requestId
      });
    }
    const newTradesUsed = tradesUsed + 1;
    const { data, error } = await supabase
      .from('daily_trade_limits')
      .upsert({
        user_id: userId,
        trade_date: today,
        trades_used: newTradesUsed,
        max_trades: maxTrades,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    res.json({
      success: true,
      limit: maxTrades,
      used: newTradesUsed,
      remaining: Math.max(0, maxTrades - newTradesUsed),
      resetAt: new Date(today + 'T00:00:00Z').toISOString(),
      requestId: req.requestId
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'daily_limit_consume_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to consume trade.', requestId: req.requestId });
  }
});

// ==================== MARKET DATA PROXY ====================
app.get('/api/market/coingecko/*', async (req, res) => {
  const path = req.params[0] || '';
  const queryString = new URLSearchParams(req.query).toString();
  const url = `https://api.coingecko.com/api/v3/${path}${queryString ? `?${queryString}` : ''}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'CryptoVerseHQ/1.0' },
    });
    clearTimeout(timeout);
    const data = await response.json();
    if (response.headers.get('x-ratelimit-remaining')) {
      res.setHeader('X-RateLimit-Remaining', response.headers.get('x-ratelimit-remaining'));
    }
    if (response.headers.get('x-ratelimit-reset')) {
      res.setHeader('X-RateLimit-Reset', response.headers.get('x-ratelimit-reset'));
    }
    res.status(response.status).json(data);
  } catch (error) {
    console.error(JSON.stringify({ event: 'coingecko_proxy_failed', path, error: error?.message, requestId: req.requestId }));
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'TIMEOUT', message: 'CoinGecko request timed out', requestId: req.requestId });
    }
    res.status(502).json({ error: 'PROXY_ERROR', message: 'Failed to fetch from CoinGecko', requestId: req.requestId });
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
