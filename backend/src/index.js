/**
 * CryptoVerse HQ API — index.js
 * Phase 0.5 "Identity Freeze" — Batch 3
 * CommonJS. Express + Better Auth (Neon Postgres).
 *
 * What Batch 3 adds
 *   · authenticate() is now a real session guard: it checks the DB session row for
 *     revocation/expiry, blocks banned/suspended accounts, and auto-provisions the
 *     app user (orphan policy). Every existing route keeps working through it, so
 *     the whole API is revocation-aware without touching any route definition.
 *   · GET/PATCH /api/me, POST /api/me/xp/update, POST /api/me/onboarding,
 *     GET /api/me/sessions, POST /api/me/sessions/revoke-all
 *   · POST /api/admin/users/:userId/level, POST /api/admin/users/:userId/sessions/revoke,
 *     GET /api/admin/notifications, POST /api/admin/notifications/read
 *   · Better Auth databaseHooks: single-session (revoke-then-insert) + banned refusal.
 *   · Payment provider failures now log the upstream status/body (diagnostics).
 *
 * Batch C2 additions (server-backed admin surface)
 *   · GET  /api/admin/users                 → + display_name/status/language, ?email=/?q=, total/has_more
 *   · GET  /api/admin/users/:userId         → one account (+ active subscription, live-session count)
 *   · POST /api/admin/users/:userId/status  → { active|suspended|banned } — the column authenticate() enforces
 *   · POST /api/admin/view-as               → audit row only (read-only guarantee preserved)
 *
 * Response shape is backwards compatible: { error, message, requestId } and now also
 * carries a machine-readable `code`:
 *   401 unauthenticated | session_revoked | session_expired
 *   403 account_banned  | account_suspended | forbidden
 *
 * REQUIRES the idempotent DDL in BATCH3_DDL.sql (see handoff notes).
 */

require('dotenv').config();

// ==================== SENTRY (error monitoring) ====================
// Initialized before any route is registered so a failure inside a handler is
// reported with its stack and request context. The DSN lives in Render's
// environment (SENTRY_DSN) — a DSN is send-only, but keeping it out of source means
// rotating it needs no redeploy of the repository.
//
// @sentry/node v8+ has no Handlers.requestHandler()/errorHandler(): the SDK
// instruments Express automatically, and the error handler below reports explicitly
// with captureException().
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0.1,
});


const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { createClient: createTursoClient } = require('@libsql/client');
const { Resend } = require('resend');
const { betterAuth } = require('better-auth');
const { emailOTP } = require('better-auth/plugins');
const { toNodeHandler } = require('better-auth/node');

// Optional: only needed so the login hook can refuse banned accounts with a typed
// error. If this subpath is not require-able in the installed version we fall back
// to a plain Error (the ban is still enforced by the session guard on every route).
let APIError = null;
try {
  ({ APIError } = require('better-auth/api'));
} catch (err) {
  console.warn(JSON.stringify({ event: 'better_auth_api_error_unavailable' }));
}

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const trustedOrigins = (process.env.TRUSTED_ORIGINS || process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// ==================== NEON ====================
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

// ==================== RESEND ====================
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ==================== BATCH 3: CONSTANTS ====================
const TIER_RANK = { free: 0, pro: 1, pro_plus: 2 };

const REVOKE = {
  NEW_LOGIN: 'new_login',
  ADMIN: 'admin_revoked',
  USER: 'user_revoked',
  BANNED: 'banned',
  EXPIRED: 'expired',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Academy rank names already shipped in the client (academyStore). Display only.
const RANKS = [
  [120000, 'Transcendent'], [80000, 'Mythic'], [55000, 'Legend'], [35000, 'Grandmaster'],
  [20000, 'Master'], [10000, 'Elite'], [5000, 'Pro Trader'], [2500, 'Analyst'],
  [1000, 'Apprentice'], [0, 'Novice'],
];

function rankForXp(xp) {
  const value = Number(xp) || 0;
  for (const [min, name] of RANKS) if (value >= min) return name;
  return 'Novice';
}

// Server-authoritative XP. The client names an event; it never sends an amount.
const XP_EVENTS = {
  daily_login: { amount: 10, dailyCap: 1 },
  lesson_completed: { amount: 100, dailyCap: 10 },
  quiz_passed: { amount: 50, dailyCap: 10 },
  trade_opened: { amount: 5, dailyCap: 20 },
  profile_completed: { amount: 20, dailyCap: 1 },
  watchlist_added: { amount: 5, dailyCap: 10 },
};
const DAILY_XP_CAP = 500;

const ONBOARDING_KEYS = ['profile', 'watchlist', 'first_trade', 'first_lesson'];

// ==================== BATCH 3: RESPONSE HELPERS ====================
// Keeps the legacy { error, message, requestId } contract and adds `code` so the
// frontend can tell "signed in elsewhere" apart from "network blip".
function apiError(req, res, status, error, code, message, extra) {
  return res.status(status).json({
    error,
    code,
    message,
    requestId: req.requestId,
    ...(extra || {}),
  });
}

function unauthenticated(req, res) {
  return apiError(req, res, 401, 'UNAUTHORIZED', 'unauthenticated', 'Authentication required.');
}

function clientIpFrom(req) {
  return req.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.get('x-real-ip')
    || req.ip
    || null;
}

function deviceLabelFrom(req) {
  const ua = req.get('user-agent');
  return ua ? String(ua).slice(0, 120) : null;
}

// Presence writes are best-effort and throttled in memory, so a missing
// last_seen_at column can never break authentication.
const presenceThrottle = new Map();
const PRESENCE_INTERVAL_MS = 60 * 1000;

function shouldTouchPresence(sessionId) {
  const last = presenceThrottle.get(sessionId) || 0;
  if (Date.now() - last < PRESENCE_INTERVAL_MS) return false;
  presenceThrottle.set(sessionId, Date.now());
  if (presenceThrottle.size > 5000) presenceThrottle.clear();
  return true;
}

// ==================== BATCH 3: SESSION + ENTITLEMENT HELPERS ====================
function revokeSessionsByAuthUserId(authUserId, reason, exceptSessionId = null) {
  return pgPool.query(
    `update public.session
        set revoked_at = now(), revoked_reason = $2
      where "userId" = $1
        and revoked_at is null
        and ($3::text is null or id <> $3)
      returning id`,
    [authUserId, reason, exceptSessionId]
  ).then((r) => r.rowCount ?? r.rows.length);
}

function revokeSessionsByAppUserId(appUserId, reason) {
  return pgPool.query(
    `update public.session s
        set revoked_at = now(), revoked_reason = $2
      where s.revoked_at is null
        and s."userId" in (
              select u.id
                from public."user" u
                join public.users a on lower(a.email) = lower(u.email)
               where a.id = $1)
      returning s.id`,
    [appUserId, reason]
  ).then((r) => r.rowCount ?? r.rows.length);
}

/**
 * Entitlements are DERIVED from public.subscriptions — there is no parallel
 * entitlements table. Shape: ['free', ...active plans]; `plan` is the best tier.
 * If the table/columns are unavailable this degrades to free instead of 500-ing.
 */
async function loadEntitlements(appUserId) {
  try {
    const { rows } = await pgPool.query(
      `select plan_id, ends_at
         from public.subscriptions
        where user_id = $1
          and status = 'active'
          and (ends_at is null or ends_at > now())`,
      [appUserId]
    );
    const plans = [...new Set(rows.map((r) => r.plan_id).filter((p) => TIER_RANK[p] !== undefined))];
    plans.sort((a, b) => TIER_RANK[b] - TIER_RANK[a]);
    const best = plans[0] ?? 'free';
    const bestRow = rows.find((r) => r.plan_id === best);
    return {
      entitlements: ['free', ...plans.filter((p) => p !== 'free')],
      plan: best,
      plan_expires_at: bestRow?.ends_at ?? null,
    };
  } catch (err) {
    console.error(JSON.stringify({ event: 'entitlements_failed', appUserId, error: err?.message }));
    return { entitlements: ['free'], plan: 'free', plan_expires_at: null };
  }
}

// ==================== BETTER AUTH ====================
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'https://cryptoversehq-os.onrender.com',
  database: pgPool,
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
      httpOnly: true,
    },
  },
  trustedOrigins: trustedOrigins,
  /**
   * BATCH 3 — single-session policy + banned refusal.
   *
   * Runs on EVERY session creation (email-OTP verify, token rotation, ...), so it
   * covers every sign-in path without patching individual endpoints. The revoke
   * happens BEFORE the insert, which is what makes
   *   uq_session_one_live_per_user on session("userId") where revoked_at is null
   * satisfiable. Requesting an OTP does not create a session, so asking for a code
   * never signs the user out on another device.
   */
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          try {
            if (!pgPool || !session || !session.userId) return { data: session };

            const { rows } = await pgPool.query(
              `select a.status, a.email
                 from public."user" u
                 left join public.users a on lower(a.email) = lower(u.email)
                where u.id = $1
                limit 1`,
              [session.userId]
            );
            const appUser = rows[0];

            if (appUser && (appUser.status === 'banned' || appUser.status === 'suspended')) {
              console.warn(JSON.stringify({
                event: 'login_refused_account_status',
                status: appUser.status,
                email: appUser.email,
              }));
              const message = appUser.status === 'banned'
                ? 'This account has been banned.'
                : 'This account is suspended.';
              if (APIError) throw new APIError('FORBIDDEN', { message });
              throw new Error(message);
            }

            const revoked = await revokeSessionsByAuthUserId(session.userId, REVOKE.NEW_LOGIN);
            if (revoked > 0) {
              console.log(JSON.stringify({
                event: 'single_session_enforced',
                userId: session.userId,
                revoked,
              }));
            }
          } catch (err) {
            // A ban refusal MUST propagate; anything else must not block a valid login.
            const message = String(err && err.message ? err.message : '');
            if ((err && err.status === 'FORBIDDEN') || /banned|suspended/i.test(message)) throw err;
            console.error(JSON.stringify({ event: 'session_hook_failed', error: message }));
          }
          return { data: session };
        },
      },
    },
  },
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
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.error(JSON.stringify({ event: 'cors_denied', origin, allowedOrigins }));
    return callback(new Error('CORS origin denied'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Idempotency-Key'],
  maxAge: 600,
}));

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

// ==================== HELPERS ====================
function timingSafeEqualText(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeDecimal(value) {
  const text = String(value ?? '').trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? text.replace(/\.?0+$/, '') : null;
}

// ==================== USER LOOKUP ====================
const userCache = new Map();
const USER_CACHE_TTL = 30 * 1000;

/**
 * BATCH 3 — auto-provisioning made schema-safe.
 *
 * The old insert named only (email, role, plan), which fails against the
 * post-migration users table (NOT NULL columns such as status/skill_level) and
 * never lowercased the email. Two-step insert: full column set first, then a
 * minimal fallback, so a schema drift can never lock a new user out.
 * Pass { fresh: true } to bypass the 30s cache (used by GET /api/me so XP/plan
 * mutations are never masked by a stale cache entry).
 */
async function getOrCreateNeonUser(email, options) {
  if (!email || !pgPool) return null;
  const fresh = Boolean(options && options.fresh);
  const key = email.toLowerCase();

  if (!fresh) {
    const cached = userCache.get(key);
    if (cached && Date.now() - cached.at < USER_CACHE_TTL) {
      return cached.user;
    }
  }

  try {
    const { rows } = await pgPool.query(
      'select * from public.users where lower(email) = lower($1) limit 1',
      [email]
    );
    let user = rows[0] || null;
    if (!user) user = await provisionAppUser(key);
    if (user) userCache.set(key, { user, at: Date.now() });
    return user;
  } catch (err) {
    console.error(JSON.stringify({ event: 'user_lookup_failed', error: err?.message }));
    return null;
  }
}

async function provisionAppUser(normalizedEmail) {
  try {
    const { rows } = await pgPool.query(
      `insert into public.users (email, role, plan, status, xp, skill_level, level_label, onboarding)
       select $1, 'user', 'free', 'active', 0, 1, public.level_label_for(1), '{}'::jsonb
        where not exists (select 1 from public.users where lower(email) = $1)
       returning *`,
      [normalizedEmail]
    );
    if (rows.length > 0) {
      console.log(JSON.stringify({ event: 'user_auto_provisioned', email: normalizedEmail }));
      return rows[0];
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'provision_full_failed', error: err?.message }));
    try {
      const { rows } = await pgPool.query(
        `insert into public.users (email, role, plan)
         select $1, 'user', 'free'
          where not exists (select 1 from public.users where lower(email) = $1)
         returning *`,
        [normalizedEmail]
      );
      if (rows.length > 0) {
        console.log(JSON.stringify({ event: 'user_auto_provisioned_minimal', email: normalizedEmail }));
        return rows[0];
      }
    } catch (err2) {
      console.error(JSON.stringify({ event: 'provision_min_failed', error: err2?.message }));
    }
  }

  // Either we lost a race or the insert was refused — read back.
  const { rows } = await pgPool.query(
    'select * from public.users where lower(email) = $1 limit 1',
    [normalizedEmail]
  );
  return rows[0] || null;
}

/** Drop the 30s user cache entry after any write to that user. */
function invalidateUserCache(email) {
  if (email) userCache.delete(String(email).toLowerCase());
}

// ==================== AUTH MIDDLEWARE (BATCH 3 SESSION GUARD) ====================
/**
 * authenticate() is the single authentication boundary of the API.
 *
 * Batch 3 upgrades it in place, so every existing route becomes revocation-aware
 * without editing a single route definition:
 *   1. Better Auth resolves the cookie session.
 *   2. The DB session row is the authority for revocation/expiry.
 *   3. The app user (public.users, uuid) is resolved by email — or auto-provisioned.
 *   4. banned/suspended accounts are refused and their sessions revoked.
 *   5. Session presence (ip / device / last_seen) is refreshed, throttled, best-effort.
 *
 * req.user keeps its old shape (id, email, role, plan, balance, betterAuthId) so
 * nothing downstream breaks, and gains status/sessionId. req.auth carries the full
 * rows for new endpoints.
 *
 * Failure codes returned: unauthenticated | session_revoked | session_expired |
 * account_banned | account_suspended.
 */
async function authenticate(req, res, next) {
  try {
    if (!pgPool) return unauthenticated(req, res);

    const authSession = await auth.api.getSession({ headers: req.headers });
    if (!authSession || !authSession.user || !authSession.user.email || !authSession.session) {
      return unauthenticated(req, res);
    }

    // (2) DB session row — the authority, not the cookie.
    // Wrapped separately: if the migration columns are missing we must NOT lock
    // every user out of the app. We degrade to cookie-only auth and shout about it.
    let dbSession = null;
    try {
      const { rows } = await pgPool.query(
        `select id, "userId", "expiresAt", revoked_at, revoked_reason, device_name, ip, "createdAt"
           from public.session
          where id = $1
          limit 1`,
        [authSession.session.id]
      );
      dbSession = rows[0] || null;
    } catch (err) {
      console.error(JSON.stringify({
        event: 'session_row_unavailable_degraded_auth',
        error: err?.message,
        hint: 'Apply BATCH3_DDL.sql (session.revoked_at / revoked_reason / device_name / ip / last_seen_at).',
      }));
    }

    if (dbSession) {
      if (dbSession.revoked_at) {
        return apiError(req, res, 401, 'UNAUTHORIZED', 'session_revoked',
          'This session was ended. Please sign in again.',
          { reason: dbSession.revoked_reason || 'revoked' });
      }
      if (new Date(dbSession.expiresAt).getTime() <= Date.now()) {
        pgPool.query(
          'update public.session set revoked_at = now(), revoked_reason = $2 where id = $1',
          [dbSession.id, REVOKE.EXPIRED]
        ).catch(() => {});
        return apiError(req, res, 401, 'UNAUTHORIZED', 'session_expired',
          'Your session expired. Please sign in again.');
      }
    }

    // (3) App user + orphan auto-provisioning.
    const appUser = await getOrCreateNeonUser(authSession.user.email);
    if (!appUser) return unauthenticated(req, res);

    // (4) Account status beats everything.
    if (appUser.status === 'banned' || appUser.status === 'suspended') {
      if (dbSession) {
        revokeSessionsByAuthUserId(authSession.user.id, REVOKE.BANNED).catch(() => {});
      }
      return apiError(req, res, 403,
        appUser.status === 'banned' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED',
        appUser.status === 'banned' ? 'account_banned' : 'account_suspended',
        appUser.status === 'banned'
          ? 'This account has been banned.'
          : 'This account is suspended.');
    }

    // (5) Presence — throttled, fire-and-forget, never blocking.
    const clientIp = clientIpFrom(req);
    if (dbSession && shouldTouchPresence(dbSession.id)) {
      pgPool.query(
        `update public.session
            set last_seen_at = now(),
                ip = coalesce(ip, $1),
                device_name = coalesce(device_name, $2)
          where id = $3`,
        [clientIp, deviceLabelFrom(req), dbSession.id]
      ).catch(() => {});

      pgPool.query(
        'update public.users set last_seen_at = now(), last_seen_ip = $1 where id = $2',
        [clientIp, appUser.id]
      ).catch(() => {});
    }

    req.user = {
      id: appUser.id,
      email: appUser.email,
      role: appUser.role,
      plan: appUser.plan,
      balance: Number(appUser.balance || 0),
      betterAuthId: authSession.user.id,
      status: appUser.status || 'active',
      sessionId: dbSession ? dbSession.id : authSession.session.id,
    };
    req.auth = {
      user: appUser,
      session: {
        id: dbSession ? dbSession.id : authSession.session.id,
        betterAuthUserId: authSession.user.id,
        device_name: dbSession ? dbSession.device_name : null,
        ip: dbSession ? dbSession.ip : clientIp,
        createdAt: dbSession ? dbSession.createdAt : authSession.session.createdAt,
        expiresAt: dbSession ? dbSession.expiresAt : authSession.session.expiresAt,
      },
    };
    return next();
  } catch (error) {
    console.error(JSON.stringify({ event: 'auth_lookup_failed', requestId: req.requestId, error: error?.message }));
    return unauthenticated(req, res);
  }
}

// ==================== ADMIN AUTHORIZATION ====================
const ADMIN_READ_ROLES = new Set(['developer', 'founder', 'super_admin', 'subscription_admin', 'support_admin']);
const ADMIN_WRITE_ROLES = new Set(['developer', 'founder', 'super_admin', 'subscription_admin']);
const ALLOWED_ADMIN_ROLES = new Set(['developer', 'founder', 'super_admin', 'subscription_admin', 'support_admin', 'user']);
// Owner tier — security-sensitive actions (revoking ANOTHER user's sessions).
const OWNER_ROLES = new Set(['developer', 'founder', 'super_admin']);

function requireAdminRead(req, res, next) {
  if (!req.user || !ADMIN_READ_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', code: 'forbidden', message: 'Admin access required.', requestId: req.requestId });
  }
  next();
}

function requireAdminWrite(req, res, next) {
  if (!req.user || !ADMIN_WRITE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', code: 'forbidden', message: 'Subscription admin access required.', requestId: req.requestId });
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.user || !OWNER_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'FORBIDDEN', code: 'forbidden', message: 'Owner access required.', requestId: req.requestId });
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
  if (!tursoClient) return res.status(503).json({ success: false, error: 'Turso not configured' });
  try {
    const result = await tursoClient.execute('SELECT sqlite_version() AS version');
    return res.json({ success: true, version: result.rows[0].version });
  } catch (error) {
    console.error(JSON.stringify({ event: 'turso_test_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ success: false, error: 'Turso connection failed' });
  }
});

// ==================== CURRENT USER (BATCH 3 CONTRACT) ====================
/**
 * GET /api/me — the single hydration endpoint for the client.
 *
 * Fresh read (bypasses the 30s user cache) so XP/plan/level changes are never
 * masked. `entitlements` is derived from public.subscriptions and is THE
 * authorization input for the frontend; `plan` is a convenience projection of the
 * best active tier; skill_level/xp/rank are UX-only and must never gate access.
 */
app.get('/api/me', authenticate, async (req, res) => {
  try {
    const appUser = await getOrCreateNeonUser(req.user.email, { fresh: true });
    if (!appUser) {
      return apiError(req, res, 401, 'UNAUTHORIZED', 'unauthenticated', 'User record unavailable.');
    }

    const entitlements = await loadEntitlements(appUser.id);

    // CP balance comes from the ledger (cp_ledger), which is the existing source.
    let cpBalance = null;
    try {
      const { rows } = await pgPool.query(
        'select coalesce(sum(amount), 0)::int as balance from public.cp_ledger where user_id = $1',
        [appUser.id]
      );
      cpBalance = rows[0] ? rows[0].balance : null;
    } catch (err) {
      console.error(JSON.stringify({ event: 'cp_balance_failed', requestId: req.requestId, error: err?.message }));
    }

    // Session detail (device/ip/last_seen) — best effort, never blocks /api/me.
    let session = {
      id: req.auth.session.id,
      device_name: req.auth.session.device_name ?? null,
      ip: req.auth.session.ip ?? null,
      created_at: req.auth.session.createdAt ?? null,
      last_seen_at: null,
      expires_at: req.auth.session.expiresAt ?? null,
    };
    try {
      const { rows } = await pgPool.query(
        `select device_name, ip, last_seen_at, "createdAt", "expiresAt"
           from public.session where id = $1 limit 1`,
        [req.auth.session.id]
      );
      if (rows[0]) {
        session = {
          id: req.auth.session.id,
          device_name: rows[0].device_name ?? null,
          ip: rows[0].ip ?? null,
          created_at: rows[0].createdAt ?? null,
          last_seen_at: rows[0].last_seen_at ?? null,
          expires_at: rows[0].expiresAt ?? null,
        };
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'session_detail_failed', requestId: req.requestId, error: err?.message }));
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      user: {
        id: appUser.id,
        email: appUser.email,
        role: appUser.role,
        display_name: appUser.display_name ?? null,
        language: appUser.language ?? 'en',
        plan: entitlements.plan,
        plan_expires_at: entitlements.plan_expires_at,
        entitlements: entitlements.entitlements,
        skill_level: appUser.skill_level ?? 1,
        level_label: appUser.level_label ?? null,
        xp: appUser.xp ?? 0,
        rank: rankForXp(appUser.xp),
        status: appUser.status ?? 'active',
        sections: Array.isArray(appUser.sections) ? appUser.sections : (appUser.sections ?? []),
        balance: Number(appUser.balance || 0),
        cp_balance: cpBalance,
        onboarding: appUser.onboarding ?? {},
        created_at: appUser.created_at ?? null,
        last_seen_at: appUser.last_seen_at ?? null,
      },
      session,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'me_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to load profile.', requestId: req.requestId });
  }
});

/**
 * PATCH /api/me — display name + language only. Role, plan, level, xp and status
 * are deliberately NOT writable here: they are server-authoritative.
 */
app.patch('/api/me', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.display_name !== undefined) {
      const name = String(body.display_name ?? '').trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_display_name', message: 'display_name must be 2-60 characters.', requestId: req.requestId });
      }
      patch.display_name = name;
    }

    if (body.language !== undefined) {
      const language = String(body.language ?? '').trim();
      if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(language)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_language', message: 'language must look like "en" or "en-US".', requestId: req.requestId });
      }
      patch.language = language;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'nothing_to_update', message: 'Nothing to update.', requestId: req.requestId });
    }

    const { rows } = await pgPool.query(
      `update public.users
          set display_name = coalesce($1, display_name),
              language     = coalesce($2, language),
              updated_at   = now()
        where id = $3
        returning id, display_name, language`,
      [patch.display_name ?? null, patch.language ?? null, req.user.id]
    );

    userCache.delete(String(req.user.email).toLowerCase());
    return res.json({ success: true, user: rows[0], requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'me_patch_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to update profile.', requestId: req.requestId });
  }
});

// ==================== XP (BATCH 3) ====================
/**
 * POST /api/me/xp/update — { type, ref? }
 *
 * The client names an event; it NEVER sends an amount. Amounts, per-type daily
 * caps and a global daily cap (500) are enforced here, so XP is unfarmable from
 * devtools even though the trigger is client-driven. `ref` makes an event
 * idempotent (lesson id, or the UTC date for daily_login).
 *
 * Level/label are computed by the DB triggers from xp — this endpoint only adds.
 */
app.post('/api/me/xp/update', authenticate, async (req, res) => {
  try {
    const type = req.body ? req.body.type : undefined;
    const spec = XP_EVENTS[type];
    if (!spec) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        code: 'unknown_xp_event',
        message: 'Unknown XP event type.',
        allowed: Object.keys(XP_EVENTS),
        requestId: req.requestId,
      });
    }

    const userId = req.user.id;
    let ref = req.body && req.body.ref != null ? String(req.body.ref).slice(0, 120) : null;
    if (!ref && type === 'daily_login') ref = `day:${new Date().toISOString().slice(0, 10)}`;

    const currentState = async () => {
      const { rows } = await pgPool.query(
        'select xp, skill_level, level_label from public.users where id = $1 limit 1',
        [userId]
      );
      const row = rows[0] || { xp: 0, skill_level: 1, level_label: null };
      return { xp: row.xp ?? 0, skill_level: row.skill_level ?? 1, level_label: row.level_label ?? null };
    };

    // Explicit duplicate check first, so the response can say WHY nothing changed.
    if (ref) {
      const { rows: dup } = await pgPool.query(
        'select 1 from public.xp_events where user_id = $1 and type = $2 and ref = $3 limit 1',
        [userId, type, ref]
      );
      if (dup.length > 0) {
        const state = await currentState();
        return res.json({
          success: true, applied: false, reason: 'duplicate_event',
          xp: state.xp, skill_level: state.skill_level, level_label: state.level_label,
          rank: rankForXp(state.xp), requestId: req.requestId,
        });
      }
    }

    const before = await currentState();

    // One atomic statement: per-type cap + global daily cap → dedupe insert → xp update.
        const { rows } = await pgPool.query(
      `with today as (
         select coalesce(sum(amount), 0)::integer as total
           from public.xp_events
          where user_id = $1 and created_at >= date_trunc('day', now())
       ), today_type as (
         select coalesce(sum(amount), 0)::integer as total
           from public.xp_events
          where user_id = $1 and type = $2 and created_at >= date_trunc('day', now())
       ), ins as (
         insert into public.xp_events (user_id, type, ref, amount)
         select $1, $2, $3, $4::integer
          where (select total from today) + $4::integer <= $5::integer
            and (select total from today_type) + $4::integer <= $6::integer
         on conflict (user_id, type, ref) where ref is not null do nothing
         returning amount
       ), upd as (
         update public.users u
            set xp = u.xp + (select coalesce(sum(amount), 0)::integer from ins),
                updated_at = now()
          where u.id = $1 and exists (select 1 from ins)
         returning u.xp, u.skill_level, u.level_label
       )
       select
         (select count(*) from ins)::integer     as applied,
         (select total from today)::integer      as xp_today,
         (select total from today_type)::integer as xp_today_type,
         (select xp from upd)                    as xp,
         (select skill_level from upd)           as skill_level,
         (select level_label from upd)           as level_label`,
      [userId, type, ref, spec.amount, DAILY_XP_CAP, spec.amount * spec.dailyCap]
    );
    const row = rows[0] || {};
    const applied = Number(row.applied) > 0;
    userCache.delete(String(req.user.email).toLowerCase());

    if (!applied) {
      const state = await currentState();
      const overGlobal = Number(row.xp_today || 0) + spec.amount > DAILY_XP_CAP;
      return res.json({
        success: true, applied: false,
        reason: overGlobal ? 'daily_cap_reached' : 'event_cap_reached',
        xp: state.xp, skill_level: state.skill_level, level_label: state.level_label,
        rank: rankForXp(state.xp), xp_today: Number(row.xp_today || 0),
        requestId: req.requestId,
      });
    }

    return res.json({
      success: true,
      applied: true,
      reason: null,
      xp: row.xp,
      skill_level: row.skill_level,
      level_label: row.level_label,
      rank: rankForXp(row.xp),
      xp_today: Number(row.xp_today || 0),
      awarded: spec.amount,
      level_changed: before.skill_level !== row.skill_level,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'xp_update_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to record XP.', requestId: req.requestId });
  }
});

/**
 * POST /api/me/onboarding — { first_login_completed?, checklist? }
 *
 * Deep-merges into users.onboarding in a single statement, so a client that only
 * knows about one checklist item can never wipe the others.
 */
app.post('/api/me/onboarding', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    const top = {};
    if (body.first_login_completed !== undefined) {
      top.first_login_completed = Boolean(body.first_login_completed);
    }

    let checklist = null;
    if (body.checklist && typeof body.checklist === 'object') {
      checklist = {};
      for (const key of ONBOARDING_KEYS) {
        if (body.checklist[key] !== undefined) checklist[key] = Boolean(body.checklist[key]);
      }
    }

    if (!Object.keys(top).length && !checklist) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'nothing_to_update', message: 'Nothing to update.', requestId: req.requestId });
    }

    const { rows } = await pgPool.query(
      `update public.users
          set onboarding = jsonb_set(
                coalesce(onboarding, '{}'::jsonb) || $1::jsonb,
                '{checklist}',
                coalesce(onboarding -> 'checklist', '{}'::jsonb) || $2::jsonb,
                true),
              updated_at = now()
        where id = $3
        returning onboarding`,
      [JSON.stringify(top), JSON.stringify(checklist || {}), req.user.id]
    );

    userCache.delete(String(req.user.email).toLowerCase());
    return res.json({ success: true, onboarding: rows[0] ? rows[0].onboarding : {}, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'onboarding_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to update onboarding.', requestId: req.requestId });
  }
});

// ==================== SESSIONS (BATCH 3) ====================
/** GET /api/me/sessions — live sessions for the signed-in user (single-session policy ⇒ normally one). */
app.get('/api/me/sessions', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      `select s.id, s.device_name, s.ip, s."createdAt" as created_at, s."expiresAt" as expires_at,
              s.last_seen_at
         from public.session s
         join public."user" u on u.id = s."userId"
        where lower(u.email) = lower($1)
          and s.revoked_at is null
        order by s."createdAt" desc
        limit 25`,
      [req.user.email]
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      sessions: rows.map((row) => ({ ...row, current: row.id === req.auth.session.id })),
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'sessions_list_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to list sessions.', requestId: req.requestId });
  }
});

/**
 * POST /api/me/sessions/revoke-all
 *
 * Default: sign out every OTHER device and keep the current one — revoking the
 * current session would immediately 401 the user who asked to be signed out
 * elsewhere. Pass ?include_current=true to end this session too.
 */
app.post('/api/me/sessions/revoke-all', authenticate, async (req, res) => {
  try {
    const includeCurrent = req.query.include_current === 'true';
    const revoked = await revokeSessionsByAuthUserId(
      req.auth.session.betterAuthUserId,
      REVOKE.USER,
      includeCurrent ? null : req.auth.session.id
    );
    return res.json({
      success: true,
      revoked,
      include_current: includeCurrent,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'revoke_all_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to revoke sessions.', requestId: req.requestId });
  }
});

// ==================== ADMIN: USERS ====================
/**
 * GET /api/admin/users — the admin roster (Batch C2).
 *
 * SCHEMA-SAFE BY CONSTRUCTION. The previous version named every column it wanted
 * (`... status, language, display_name, updated_at ...`), so a column that does
 * not exist on this database failed the WHOLE query:
 *
 *     error: column "status" does not exist     (Postgres 42703)
 *     -> the route answered 500 -> the roster rendered empty.
 *
 * Nothing caught it earlier because every pre-existing code path reads those
 * fields off the row object in JS (`select *` + `appUser.status ?? 'active'`),
 * so their absence was invisible. This version reads `select *` and projects in
 * JS, so a missing column degrades to a default instead of emptying the page.
 *
 * Query: limit (1-500) · offset · email (exact, case-insensitive) ·
 *        q (substring of email or display_name).
 * `total` / `has_more` describe the SAME filter, so the client can page.
 */
app.get('/api/admin/users', authenticate, requireAdminRead, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const filters = [];
    const filterParams = [];
    if (email) {
      filterParams.push(email.toLowerCase());
      filters.push(`lower(email) = $${filterParams.length}`);
    }
    if (q) {
      filterParams.push(`%${q.toLowerCase()}%`);
      filters.push(`(lower(email) like $${filterParams.length} or lower(coalesce(display_name, '')) like $${filterParams.length})`);
    }
    const whereSql = filters.length ? ` where ${filters.join(' and ')}` : '';

    const result = await pgPool.query(
      `select * from public.users${whereSql}
        order by created_at desc
        limit $${filterParams.length + 1} offset $${filterParams.length + 2}`,
      [...filterParams, limit, offset]
    );

    // Explicit projection: the client's contract stays stable whatever the table holds.
    const users = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      display_name: row.display_name ?? null,
      role: row.role ?? 'user',
      plan: row.plan ?? 'free',
      balance: Number(row.balance || 0),
      status: row.status ?? 'active',
      language: row.language ?? 'en',
      last_seen_at: row.last_seen_at ?? null,
      last_seen_ip: row.last_seen_ip ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    }));

    // The count only feeds the pager: it must never be able to break the roster.
    let total = null;
    try {
      const { rows: countRows } = await pgPool.query(
        `select count(*)::int as total from public.users${whereSql}`,
        filterParams
      );
      total = countRows[0] ? countRows[0].total : null;
    } catch (err) {
      console.error(JSON.stringify({ event: 'admin_users_count_failed', requestId: req.requestId, error: err?.message }));
    }

    return res.json({
      success: true,
      users,
      returned: users.length,
      total,
      limit,
      offset,
      has_more: total === null ? users.length >= limit : offset + users.length < total,
      requestId: req.requestId,
    });
  } catch (error) {
    // Surface the real database message to the caller (admin-only route) and the
    // Postgres code to the logs, so the next failure names its own cause instead
    // of showing "no users".
    console.error(JSON.stringify({ event: 'admin_users_failed', requestId: req.requestId, code: error?.code, error: error?.message }));
    return res.status(500).json({
      error: 'SERVER_ERROR',
      code: 'users_query_failed',
      message: `Failed to fetch users: ${error?.message || 'unknown error'}`,
      requestId: req.requestId,
    });
  }
});

/**
 * GET /api/admin/users/:userId — one account, in the list shape plus the active
 * subscription and the live-session count (Batch C2).
 *
 * SCHEMA-SAFE, same reason as the roster route: the row is read with `select *`
 * and projected in JS, so a column that is missing on this database degrades to
 * a default instead of a 500 that hides the account. Read-only.
 */
app.get('/api/admin/users/:userId', authenticate, requireAdminRead, async (req, res) => {
  const { userId } = req.params;

  if (!UUID_RE.test(String(userId))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_user_id', message: 'userId must be a UUID.', requestId: req.requestId });
  }

  try {
    const { rows } = await pgPool.query('select * from public.users where id = $1 limit 1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', code: 'not_found', message: 'User not found.', requestId: req.requestId });
    }
    const row = rows[0];
    const user = {
      id: row.id,
      email: row.email,
      display_name: row.display_name ?? null,
      role: row.role ?? 'user',
      plan: row.plan ?? 'free',
      balance: Number(row.balance || 0),
      status: row.status ?? 'active',
      language: row.language ?? 'en',
      last_seen_at: row.last_seen_at ?? null,
      last_seen_ip: row.last_seen_ip ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };

    // Enrichment only: a missing table/column must not 500 an otherwise fine page.
    const { rows: subRows } = await pgPool.query(
      `select id, plan_id, status, starts_at, ends_at, granted_by, created_at
         from public.subscriptions
        where user_id = $1 and status = 'active'
        order by created_at desc
        limit 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const { rows: sessionRows } = await pgPool.query(
      `select count(*)::int as live_sessions
         from public.session s
         join public."user" u on u.id = s."userId"
        where lower(u.email) = lower($1)
          and s.revoked_at is null
          and s."expiresAt" > now()`,
      [row.email]
    ).catch(() => ({ rows: [{ live_sessions: 0 }] }));

    return res.json({
      success: true,
      user,
      active_subscription: subRows[0] || null,
      live_sessions: sessionRows[0] ? sessionRows[0].live_sessions : 0,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_user_detail_failed', requestId: req.requestId, code: error?.code, error: error?.message }));
    return res.status(500).json({
      error: 'SERVER_ERROR',
      code: 'user_query_failed',
      message: `Failed to fetch the user: ${error?.message || 'unknown error'}`,
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/admin/users/:userId/status — { status, reason? }
 *
 * WHY THIS EXISTS (Batch C2): the panel's ban/suspend used to write the Taskade
 * users project (@cv_status) and localStorage only, while authenticate()
 * enforces public.users.status in Neon — so an admin "ban" never actually
 * blocked the API. This writes the column the API reads, ends the target's live
 * sessions when the account is restricted, and leaves exactly one audit row.
 */
const ACCOUNT_STATUSES = new Set(['active', 'suspended', 'banned']);

app.post('/api/admin/users/:userId/status', authenticate, requireAdminWrite, async (req, res) => {
  const { userId } = req.params;
  const body = req.body || {};
  const status = String(body.status || '').trim().toLowerCase();
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';

  if (!UUID_RE.test(String(userId))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_user_id', message: 'userId must be a UUID.', requestId: req.requestId });
  }
  if (!ACCOUNT_STATUSES.has(status)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      code: 'invalid_status',
      message: `status must be one of: ${Array.from(ACCOUNT_STATUSES).join(', ')}`,
      requestId: req.requestId,
    });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'self_status', message: 'You cannot change your own account status.', requestId: req.requestId });
  }

  try {
    const { rows } = await pgPool.query('select id, email, role, status from public.users where id = $1 limit 1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', code: 'not_found', message: 'User not found.', requestId: req.requestId });
    }
    const target = rows[0];
    const beforeStatus = target.status || 'active';

    // Acting on an owner-tier account is an owner-tier action.
    if (OWNER_ROLES.has(target.role) && !OWNER_ROLES.has(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        code: 'forbidden',
        message: "Only an owner-tier admin can change another owner's account status.",
        requestId: req.requestId,
      });
    }

    if (beforeStatus === status) {
      return res.json({
        success: true, duplicate: true, user_id: userId,
        before_status: beforeStatus, after_status: status, sessions_revoked: 0,
        requestId: req.requestId,
      });
    }

    await pgPool.query('update public.users set status = $1, updated_at = now() where id = $2', [status, userId]);
    invalidateUserCache(target.email);

    // A banned/suspended account must not keep a live session: the next request
    // would be refused anyway, but ending them here is what the admin expects.
    const sessionsRevoked = status === 'active'
      ? 0
      : await revokeSessionsByAppUserId(userId, REVOKE.BANNED).catch(() => 0);

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: userId, plan_id: null, action: 'status_change', result: 'success',
      note: `Account status: ${beforeStatus} → ${status}${reason ? ` | ${reason}` : ''}`,
      before_state: { status: beforeStatus },
      after_state: { status, sessions_revoked: sessionsRevoked },
      ip_address: req.ip, user_agent: req.get('User-Agent'),
      request_id: req.requestId, idempotency_key: null, entitlement_id: null,
    });

    return res.json({
      success: true,
      user_id: userId,
      email: target.email,
      before_status: beforeStatus,
      after_status: status,
      sessions_revoked: sessionsRevoked,
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_status_change_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Account status change failed.', requestId: req.requestId });
  }
});

/**
 * POST /api/admin/view-as — { target_user_id }
 *
 * "View as user" changes only what the ADMIN'S OWN BROWSER renders: no token
 * swap, no write on the target, nothing returned that the admin could not
 * already read through the roster/detail GETs. The read-only guarantee holds by
 * construction, and this endpoint exists purely so the action is auditable —
 * who looked at whom, from which address.
 */
app.post('/api/admin/view-as', authenticate, requireAdminRead, async (req, res) => {
  const body = req.body || {};
  const targetUserId = String(body.target_user_id || body.targetUserId || '').trim();

  if (!UUID_RE.test(targetUserId)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_user_id', message: 'target_user_id must be a UUID.', requestId: req.requestId });
  }

  try {
    const { rows } = await pgPool.query('select id, email from public.users where id = $1 limit 1', [targetUserId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', code: 'not_found', message: 'User not found.', requestId: req.requestId });
    }

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: targetUserId, plan_id: null, action: 'view_as_user', result: 'success',
      note: `View as user (read-only): ${rows[0].email}`,
      before_state: null, after_state: { read_only: true },
      ip_address: req.ip, user_agent: req.get('User-Agent'),
      request_id: req.requestId, idempotency_key: null, entitlement_id: null,
    });

    return res.json({ success: true, read_only: true, target_user_id: targetUserId, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_view_as_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to record the view-as-user action.', requestId: req.requestId });
  }
});

// ==================== ADMIN: ROLE ====================
app.post('/api/admin/users/:userId/role', authenticate, requireAdminWrite, async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body || {};
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  if (!role || typeof role !== 'string' || !ALLOWED_ADMIN_ROLES.has(role)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `role must be one of: ${Array.from(ALLOWED_ADMIN_ROLES).join(', ')}`,
      requestId: req.requestId,
    });
  }

  if (userId === req.user.id && role !== req.user.role) {
    const { rows: devCount } = await pgPool.query(
      `select count(*)::int as count from public.users where role = 'developer' and id != $1`,
      [req.user.id]
    );
    if (devCount[0].count === 0) {
      return res.status(400).json({ error: 'FORBIDDEN', message: 'Cannot demote the last developer.', requestId: req.requestId });
    }
  }

  try {
    const { rows: userRows } = await pgPool.query('select id, email, role from public.users where id = $1', [userId]);
    if (userRows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.', requestId: req.requestId });
    const targetUser = userRows[0];
    const beforeRole = targetUser.role;
    if (beforeRole === role) return res.json({ success: true, duplicate: true, requestId: req.requestId });

    await pgPool.query('update public.users set role = $1, updated_at = now() where id = $2', [role, userId]);
    userCache.delete(targetUser.email.toLowerCase());

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: userId, plan_id: null, action: 'payment', result: 'success',
      note: `Role change: ${beforeRole} → ${role}`,
      before_state: { role: beforeRole }, after_state: { role },
      ip_address: ipAddress, user_agent: userAgent, request_id: req.requestId,
      idempotency_key: null, entitlement_id: null,
    });

    return res.json({ success: true, user_id: userId, before_role: beforeRole, after_role: role, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'role_change_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Role change failed.', requestId: req.requestId });
  }
});

// ==================== ADMIN: BALANCE ====================
app.post('/api/admin/users/:userId/balance', authenticate, requireAdminWrite, async (req, res) => {
  const { userId } = req.params;
  const { delta, reason } = req.body || {};
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'delta must be non-zero integer.', requestId: req.requestId });
  }
  if (Math.abs(delta) > 1000000) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'delta too large.', requestId: req.requestId });
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason required.', requestId: req.requestId });
  }

  try {
    const { rows: userRows } = await pgPool.query('select id, email, balance from public.users where id = $1', [userId]);
    if (userRows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.', requestId: req.requestId });
    const user = userRows[0];
    const beforeBalance = Number(user.balance || 0);
    const afterBalance = beforeBalance + delta;
    if (afterBalance < 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Insufficient balance.', requestId: req.requestId });
    }
    await pgPool.query('update public.users set balance = $1, updated_at = now() where id = $2', [afterBalance, userId]);
    userCache.delete(user.email.toLowerCase());

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: userId, plan_id: null, action: 'payment', result: 'success',
      note: `Balance: ${delta > 0 ? '+' : ''}${delta} | ${reason.trim()}`,
      before_state: { balance: beforeBalance }, after_state: { balance: afterBalance },
      ip_address: ipAddress, user_agent: userAgent, request_id: req.requestId,
      idempotency_key: null, entitlement_id: null,
    });

    return res.json({ success: true, before_balance: beforeBalance, after_balance: afterBalance, delta, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'balance_adjust_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Balance adjustment failed.', requestId: req.requestId });
  }
});

// ==================== ADMIN: LEVEL OVERRIDE (BATCH 3) ====================
// Level labels are NOT hardcoded here: public.level_label_for() is the single
// source of truth (confirmed: level_label_for(4) = 'Expert'). If the DB function
// is ever absent, only this endpoint's label write is affected — the level itself
// still applies.

/**
 * POST /api/admin/users/:userId/level — { skill_level, reason? }
 *
 * xp is left untouched, so the xp→level trigger does not fight this. The history
 * row is attributed to the admin, and the automatic trigger row is suppressed for
 * this transaction via the cv.skip_level_log flag, so the audit trail has exactly
 * ONE row per change with the correct actor.
 */
app.post('/api/admin/users/:userId/level', authenticate, requireAdminWrite, async (req, res) => {
  const { userId } = req.params;
  const body = req.body || {};
  const level = Number(body.skill_level);
  const reason = typeof body.reason === 'string' && body.reason.trim().length >= 3
    ? body.reason.trim().slice(0, 200)
    : null;

  if (!UUID_RE.test(String(userId))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_user_id', message: 'userId must be a UUID.', requestId: req.requestId });
  }
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_level', message: 'skill_level must be 1-4.', requestId: req.requestId });
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      'select id, email, skill_level, xp from public.users where id = $1 for update',
      [userId]
    );
    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'NOT_FOUND', code: 'not_found', message: 'User not found.', requestId: req.requestId });
    }

    const target = userRows[0];
    const beforeLevel = target.skill_level ?? null;
    if (beforeLevel === level) {
      await client.query('ROLLBACK');
      return res.json({ success: true, duplicate: true, skill_level: level, requestId: req.requestId });
    }

    // Suppress the automatic history row for this transaction, then log our own.
    await client.query(`select set_config('cv.skip_level_log', '1', true)`);
    const { rows: updated } = await client.query(
      `update public.users
          set skill_level = $1,
              level_label = public.level_label_for($1),
              updated_at = now()
        where id = $2
        returning skill_level, level_label, xp`,
      [level, userId]
    );

    await client.query(
      `insert into public.user_level_history
         (user_id, from_level, to_level, xp_at_change, reason, actor_type, actor_id)
       values ($1, $2, $3, $4, $5, 'admin', $6)`,
      [userId, beforeLevel, level, target.xp ?? 0, reason || 'admin_level_override', req.user.id]
    );

    await client.query('COMMIT');
    invalidateUserCache(target.email);

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: userId, plan_id: null, action: 'level_change', result: 'success',
      note: `Level: ${beforeLevel} → ${level}${reason ? ` | ${reason}` : ''}`,
      before_state: { skill_level: beforeLevel, xp: target.xp },
      after_state: { skill_level: updated[0].skill_level, xp: updated[0].xp },
      ip_address: req.ip, user_agent: req.get('User-Agent'),
      request_id: req.requestId, idempotency_key: null, entitlement_id: null,
    });

    return res.json({
      success: true,
      user_id: userId,
      before_level: beforeLevel,
      after_level: updated[0].skill_level,
      level_label: updated[0].level_label,
      xp: updated[0].xp,
      requestId: req.requestId,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({ event: 'level_change_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Level change failed.', requestId: req.requestId });
  } finally {
    client.release();
  }
});

// ==================== ADMIN: REVOKE USER SESSIONS (BATCH 3) ====================
/**
 * POST /api/admin/users/:userId/sessions/revoke — owner tier only.
 * Ends every live session the target has (users.id → session."userId" through the
 * email join, because Better Auth user ids and app user ids are different).
 */
app.post('/api/admin/users/:userId/sessions/revoke', authenticate, requireOwner, async (req, res) => {
  const { userId } = req.params;

  if (!UUID_RE.test(String(userId))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_user_id', message: 'userId must be a UUID.', requestId: req.requestId });
  }

  try {
    const { rows } = await pgPool.query('select id, email from public.users where id = $1 limit 1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', code: 'not_found', message: 'User not found.', requestId: req.requestId });
    }

    const revoked = await revokeSessionsByAppUserId(userId, REVOKE.ADMIN);
    invalidateUserCache(rows[0].email);

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: userId, plan_id: null, action: 'sessions_revoked', result: 'success',
      note: `Admin revoked ${revoked} live session(s) for ${rows[0].email}`,
      before_state: null, after_state: { revoked },
      ip_address: req.ip, user_agent: req.get('User-Agent'),
      request_id: req.requestId, idempotency_key: null, entitlement_id: null,
    });

    return res.json({ success: true, user_id: userId, revoked, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_revoke_sessions_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to revoke sessions.', requestId: req.requestId });
  }
});

// ==================== ADMIN: NOTIFICATIONS (BATCH 3) ====================
/**
 * GET /api/admin/notifications — role-audience filtered inbox for the signed-in admin.
 *
 * Aligned to the EXISTING admin_notifications schema (type, severity, title, body,
 * audience_roles, target_user_id, link, payload, expires_at, created_at) and to
 * admin_notification_reads.admin_user_id.
 *
 * Audience rules:
 *   · audience_roles = '{}'  → broadcast to every admin
 *   · otherwise the caller's role must be in the array
 *   · target_user_id, when set, must be the caller (user-specific notice)
 * `audience_levels` is intentionally NOT used: the legacy admin-seniority levels no
 * longer exist (the portal authorizes by server role) and skill_level is a USER
 * gamification value, so filtering admins on it would be wrong.
 */
app.get('/api/admin/notifications', authenticate, requireAdminRead, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const unreadOnly = req.query.unread_only === 'true';
    const sinceRaw = typeof req.query.since === 'string' ? req.query.since.trim() : '';
    const since = /^\d{4}-\d{2}-\d{2}T/.test(sinceRaw) ? sinceRaw : null;

    const { rows } = await pgPool.query(
      `select n.id, n.type, n.severity, n.title, n.body, n.audience_roles,
              n.target_user_id, n.link, n.payload, n.created_at, n.expires_at,
              (r.read_at is not null) as read, r.read_at
         from public.admin_notifications n
         left join public.admin_notification_reads r
                on r.notification_id = n.id and r.admin_user_id = $1
        where (cardinality(coalesce(n.audience_roles, '{}'::text[])) = 0
               or $2 = any(n.audience_roles))
          and (n.target_user_id is null or n.target_user_id = $1)
          and (n.expires_at is null or n.expires_at > now())
          and ($3::timestamptz is null or n.created_at > $3::timestamptz)
          and ($4::boolean = false or r.read_at is null)
        order by n.created_at desc
        limit $5`,
      [req.user.id, req.user.role, since, unreadOnly, limit]
    );

    const { rows: counts } = await pgPool.query(
      `select count(*)::int as unread
         from public.admin_notifications n
         left join public.admin_notification_reads r
                on r.notification_id = n.id and r.admin_user_id = $1
        where (cardinality(coalesce(n.audience_roles, '{}'::text[])) = 0
               or $2 = any(n.audience_roles))
          and (n.target_user_id is null or n.target_user_id = $1)
          and (n.expires_at is null or n.expires_at > now())
          and r.read_at is null`,
      [req.user.id, req.user.role]
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      notifications: rows,
      unread: counts[0] ? counts[0].unread : 0,
      server_time: new Date().toISOString(),
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_notifications_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to fetch notifications.', requestId: req.requestId });
  }
});

/** POST /api/admin/notifications/read — { ids: [uuid] } marks those read for the caller. */
app.post('/api/admin/notifications/read', authenticate, requireAdminRead, async (req, res) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id) => UUID_RE.test(String(id))).slice(0, 200)
      : [];

    if (ids.length === 0) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', code: 'invalid_ids', message: 'ids must be a non-empty array of UUIDs.', requestId: req.requestId });
    }

    const { rows } = await pgPool.query(
      `insert into public.admin_notification_reads (notification_id, admin_user_id)
       select n.id, $1
         from public.admin_notifications n
        where n.id = any($2::uuid[])
          and (cardinality(coalesce(n.audience_roles, '{}'::text[])) = 0
               or $3 = any(n.audience_roles))
          and (n.target_user_id is null or n.target_user_id = $1)
       on conflict (notification_id, admin_user_id) do nothing
       returning notification_id`,
      [req.user.id, ids, req.user.role]
    );

    return res.json({ success: true, read: rows.length, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_notifications_read_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', code: 'internal_error', message: 'Failed to mark notifications read.', requestId: req.requestId });
  }
});

// ==================== ADMIN: DELETE USER ====================
app.delete('/api/admin/users/:userId', authenticate, requireAdminWrite, async (req, res) => {
  const { userId } = req.params;
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'FORBIDDEN', message: 'Cannot delete yourself.', requestId: req.requestId });
  }

  try {
    const { rows: userRows } = await pgPool.query('select id, email, role from public.users where id = $1', [userId]);
    if (userRows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.', requestId: req.requestId });
    const targetUser = userRows[0];

    if (targetUser.role === 'developer') {
      const { rows: devCount } = await pgPool.query(
        `select count(*)::int as count from public.users where role = 'developer' and id != $1`,
        [userId]
      );
      if (devCount[0].count === 0) {
        return res.status(400).json({ error: 'FORBIDDEN', message: 'Cannot delete last developer.', requestId: req.requestId });
      }
    }

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `delete from public.session where "userId" in (select id from public."user" where lower(email) = lower($1))`,
        [targetUser.email]
      );
      await client.query(
        `delete from public.account where "userId" in (select id from public."user" where lower(email) = lower($1))`,
        [targetUser.email]
      );
      await client.query('delete from public."user" where lower(email) = lower($1)', [targetUser.email]);
      await client.query('delete from public.subscriptions where user_id = $1', [userId]);
      await client.query('delete from public.users where id = $1', [userId]);
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    userCache.delete(targetUser.email.toLowerCase());

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id: null, plan_id: null, action: 'payment', result: 'success',
      note: `User deleted: ${targetUser.email}`,
      before_state: { email: targetUser.email }, after_state: { deleted: true },
      ip_address: ipAddress, user_agent: userAgent, request_id: req.requestId,
      idempotency_key: null, entitlement_id: null,
    });

    return res.json({ success: true, deleted_user_id: userId, deleted_email: targetUser.email, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'user_delete_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Delete failed.', requestId: req.requestId });
  }
});

// ==================== ADMIN: SUBSCRIPTIONS ====================
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
    if (existing.length > 0) return res.json({ success: true, duplicate: true, requestId: req.requestId });

    const { rows: targetRows } = await pgPool.query('select id, email, role, plan from public.users where id = $1', [target_user_id]);
    if (targetRows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Target user not found.', requestId: req.requestId });
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
    userCache.delete(targetUser.email.toLowerCase());

    await writeAuditLog({
      actor_id: req.user.id, actor_email: req.user.email, actor_role: req.user.role,
      target_user_id, plan_id, action: 'grant', result: 'success',
      note: note || null, before_state: beforeState,
      after_state: { plan: plan_id, ends_at: new Date(Date.now() + days * 86400000).toISOString() },
      ip_address: ipAddress, user_agent: userAgent, request_id: req.requestId,
      idempotency_key: idempotencyKey, entitlement_id: entitlementId,
    });

    return res.json({ success: true, entitlement_id: entitlementId, target_user_id, plan_id, duration_days: days, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'grant_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Grant failed.', requestId: req.requestId });
  }
});

app.post('/api/admin/subscriptions/revoke', authenticate, requireAdminWrite, async (req, res) => {
  const { target_user_id, note } = req.body || {};
  const idempotencyKey = req.get('Idempotency-Key');
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  if (!target_user_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'target_user_id required.', requestId: req.requestId });
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid Idempotency-Key required.', requestId: req.requestId });
  }

  try {
    const { rows: activeSubs } = await pgPool.query(
      `select id, plan_id, ends_at from public.subscriptions where user_id = $1 and status = 'active' and ends_at > now() order by ends_at desc limit 1`,
      [target_user_id]
    );
    if (activeSubs.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'No active subscription.', requestId: req.requestId });

    const sub = activeSubs[0];
    await pgPool.query(`update public.subscriptions set status = 'revoked', ends_at = now(), updated_at = now() where id = $1`, [sub.id]);
    await pgPool.query('update public.users set plan = $1, updated_at = now() where id = $2', ['free', target_user_id]);

    const { rows: uRows } = await pgPool.query('select email from public.users where id = $1', [target_user_id]);
    if (uRows.length > 0) userCache.delete(uRows[0].email.toLowerCase());

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
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch audit.', requestId: req.requestId });
  }
});

app.get('/api/admin/subscriptions/user/:userId', authenticate, requireAdminRead, async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows: userRows } = await pgPool.query(
      'select id, email, role, plan, balance, created_at from public.users where id = $1',
      [userId]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.', requestId: req.requestId });
    const { rows: subs } = await pgPool.query(
      `select id, plan_id, status, starts_at, ends_at, granted_by, created_at
       from public.subscriptions where user_id = $1 order by created_at desc limit 20`,
      [userId]
    );
    return res.json({ success: true, user: userRows[0], subscriptions: subs, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'user_sub_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch user subs.', requestId: req.requestId });
  }
});

// ==================== PAYMENTS (NOW on Neon) ====================
const nowPaymentsBaseUrl = (process.env.NOWPAYMENTS_API_BASE_URL || 'https://api.nowpayments.io/v1').replace(/\/$/, '');
const nowPaymentsCallbackUrl = process.env.NOWPAYMENTS_IPN_CALLBACK_URL
  || `${process.env.PUBLIC_API_BASE_URL || ''}/api/webhooks/payment`;

/**
 * BATCH 3 diagnostics: the previous version collapsed every upstream failure into
 * one opaque Error, which is why "Payment provider is temporarily unavailable" was
 * a dead end for a whole session. The upstream status and a truncated body now
 * travel with the error and are logged.
 */
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
      const providerError = body?.message || body?.error || `Payment provider returned HTTP ${response.status}`;
      const error = new Error(providerError);
      error.providerStatus = response.status;
      error.providerBody = text ? String(text).slice(0, 1000) : null;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function getPaymentProduct(productType, productId) {
  const { rows } = await pgPool.query(
    `select id, product_type, product_id, name, description, amount, currency, cp_amount
     from public.payment_settings
     where product_type = $1 and product_id = $2 and active = true
     limit 1`,
    [productType, productId]
  );
  return rows[0] || null;
}

async function fulfillCompletedPayment(payment) {
  if (payment.product_type === 'subscription') {
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await pgPool.query(
      `insert into public.subscriptions (user_id, plan_id, status, starts_at, ends_at, payment_id, granted_by)
       values ($1, $2, 'active', $3, $4, $5, null)
       on conflict (payment_id) do nothing`,
      [payment.user_id, payment.plan_id, startsAt, endsAt, payment.id]
    ).catch(async () => {
      // If unique constraint on payment_id doesn't exist, do a simple insert
      await pgPool.query(
        `insert into public.subscriptions (user_id, plan_id, status, starts_at, ends_at, granted_by)
         values ($1, $2, 'active', $3, $4, null)`,
        [payment.user_id, payment.plan_id, startsAt, endsAt]
      );
    });
    await pgPool.query('update public.users set plan = $1, updated_at = now() where id = $2', [payment.plan_id, payment.user_id]);
    return;
  }
  if (payment.product_type === 'cp_purchase') {
    await pgPool.query(
      `insert into public.cp_ledger (user_id, payment_id, amount, entry_type, reference_key)
       values ($1, $2, $3, 'purchase', $4)
       on conflict (reference_key) do nothing`,
      [payment.user_id, payment.id, payment.cp_amount, `payment:${payment.id}`]
    );
    return;
  }
  throw new Error('Unsupported payment product type');
}

app.get('/api/payments/catalog', async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      `select product_type, product_id, name, description, amount, currency, cp_amount
       from public.payment_settings
       where active = true
       order by product_type asc, product_id asc`
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, products: rows, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_catalog_failed', requestId: req.requestId, error: error?.message }));
    return res.status(503).json({ error: 'CATALOG_UNAVAILABLE', message: 'Catalog unavailable.', requestId: req.requestId });
  }
});

app.get('/api/cp/balance', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      'select coalesce(sum(amount), 0)::int as balance from public.cp_ledger where user_id = $1',
      [req.user.id]
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, balance: rows[0].balance, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cp_balance_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.get('/api/cp/ledger', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      `select id, amount, entry_type, reference_key, payment_id, created_at
       from public.cp_ledger where user_id = $1 order by created_at desc limit 100`,
      [req.user.id]
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, entries: rows, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cp_ledger_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.post('/api/payments/create', authenticate, async (req, res) => {
  const productType = req.body?.purchaseType === 'cp_purchase' ? 'cp_purchase' : req.body?.purchaseType === 'subscription' ? 'subscription' : '';
  const productId = typeof req.body?.productId === 'string' ? req.body.productId.trim() : '';
  const requestedPayCurrency = typeof req.body?.payCurrency === 'string' ? req.body.payCurrency.trim().toLowerCase() : '';
  const idempotencyKey = req.get('Idempotency-Key');

  if (!productType || !productId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Purchase type and product required.', requestId: req.requestId });
  }
  const allowedPayCurrencies = new Set(['usdttrc20', 'usdterc20', 'usdtbsc', 'btc', 'eth', 'bnbbsc']);
  if (!allowedPayCurrencies.has(requestedPayCurrency)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unsupported currency.', requestId: req.requestId });
  }
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid Idempotency-Key required.', requestId: req.requestId });
  }
  if (!process.env.NOWPAYMENTS_API_KEY || !process.env.NOWPAYMENTS_IPN_SECRET || !process.env.NOWPAYMENTS_PAY_CURRENCY || !/^https:\/\//.test(nowPaymentsCallbackUrl)) {
    return res.status(503).json({ error: 'PAYMENT_NOT_CONFIGURED', message: 'Payments not configured.', requestId: req.requestId });
  }

  try {
    const plan = await getPaymentProduct(productType, productId);
    const amount = plan && normalizeDecimal(plan.amount);
    const currency = plan && typeof plan.currency === 'string' ? plan.currency.trim().toUpperCase() : null;
    if (!plan || !amount || !currency || (productType === 'cp_purchase' && (!Number.isInteger(plan.cp_amount) || plan.cp_amount <= 0))) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unknown payment product.', requestId: req.requestId });
    }

    // Idempotency: check existing
    const { rows: existing } = await pgPool.query(
      `select id, status, external_payment_id from public.payments where user_id = $1 and idempotency_key = $2 limit 1`,
      [req.user.id, idempotencyKey]
    );
    if (existing.length > 0) {
      return res.json({
        success: true,
        paymentId: existing[0].id,
        status: existing[0].status,
        providerPaymentId: existing[0].external_payment_id,
        requestId: req.requestId,
      });
    }

    const paymentId = crypto.randomUUID();
    await pgPool.query(
      `insert into public.payments (id, user_id, amount, currency, plan_id, product_type, cp_amount, idempotency_key, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [paymentId, req.user.id, amount, currency, productId, productType,
       productType === 'cp_purchase' ? plan.cp_amount : null, idempotencyKey]
    );

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
    if (!providerPaymentId) throw new Error('Payment provider returned no payment identifier');

    await pgPool.query(
      `update public.payments set status = 'waiting', external_payment_id = $1, updated_at = now() where id = $2`,
      [providerPaymentId, paymentId]
    );

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
    // BATCH 3: log the upstream status/body so a provider misconfiguration is
    // diagnosable from the server log instead of a blind 502.
    const providerStatus = Number(error?.providerStatus) || null;
    console.error(JSON.stringify({
      event: 'payment_create_failed',
      requestId: req.requestId,
      userId: req.user.id,
      providerStatus,
      providerBody: error?.providerBody ?? null,
      nowPaymentsBaseUrl,
      hasApiKey: Boolean(process.env.NOWPAYMENTS_API_KEY),
      hasIpnSecret: Boolean(process.env.NOWPAYMENTS_IPN_SECRET),
      error: error?.message,
    }));

    const message = (providerStatus === 401 || providerStatus === 403)
      ? 'Payment provider rejected our credentials. Please try again later.'
      : (providerStatus === 400 || providerStatus === 404)
        ? 'Payment provider rejected the request. Please try again later.'
        : 'Payment provider is temporarily unavailable.';
    return res.status(502).json({ error: 'PAYMENT_PROVIDER_ERROR', message, requestId: req.requestId });
  }
});

app.get('/api/payments/verify/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      `select id, status, created_at, updated_at from public.payments where id = $1 and user_id = $2 limit 1`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.', requestId: req.requestId });
    return res.json({ verified: rows[0].status === 'completed', status: rows[0].status, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_verify_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.get('/api/payments/history', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      `select id, amount, currency, status, created_at, plan_id
       from public.payments where user_id = $1 order by created_at desc limit 10`,
      [req.user.id]
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, payments: rows, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_history_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

// ==================== PAYMENT WEBHOOK ====================
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
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid signature.', requestId: req.requestId });
  }
  const providerPaymentId = String(req.body?.payment_id || '').trim();
  const orderId = String(req.body?.order_id || '').trim();
  const providerStatus = String(req.body?.payment_status || '').trim().toLowerCase();
  const allowedStatuses = new Set(['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired']);
  if (!providerPaymentId || !orderId || !allowedStatuses.has(providerStatus)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid payload.', requestId: req.requestId });
  }

  try {
    const { rows: paymentRows } = await pgPool.query(
      `select id, user_id, amount, currency, status, external_payment_id, product_type, plan_id, cp_amount
       from public.payments where id = $1 limit 1`,
      [orderId]
    );
    if (paymentRows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Payment not found.', requestId: req.requestId });
    const payment = paymentRows[0];

    if (normalizeDecimal(payment.amount) !== normalizeDecimal(req.body.price_amount)
      || String(payment.currency).toLowerCase() !== String(req.body.price_currency || '').toLowerCase()) {
      return res.status(409).json({ error: 'PAYMENT_MISMATCH', message: 'Mismatch.', requestId: req.requestId });
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
      // The plan changed for this user — drop the cached row so /api/me reflects it.
      const { rows: owner } = await pgPool.query('select email from public.users where id = $1', [payment.user_id]);
      if (owner.length > 0) invalidateUserCache(owner[0].email);
    }

    await pgPool.query(
      `update public.payments set status = $1, external_payment_id = $2, updated_at = now()
       where id = $3 and status = $4`,
      [nextStatus, providerPaymentId, orderId, payment.status]
    );

    return res.json({ accepted: true, status: nextStatus, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'payment_webhook_failed', requestId: req.requestId, error: error?.message }));
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

// ==================== EXCHANGE (NOW on Neon) ====================
app.get('/api/exchange/connections', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      `select id, exchange, label, status, masked_key, created_at, updated_at
       from public.exchange_connections where user_id = $1 order by created_at desc`,
      [req.user.id]
    );
    res.json({ success: true, connections: rows, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_list_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.post('/api/exchange/connect', authenticate, async (req, res) => {
  const { exchange, apiKey, apiSecret, label, isDemo = false } = req.body;

  if (!exchange || typeof exchange !== 'string' || exchange.trim().length < 2) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Valid exchange required.', requestId: req.requestId });
  }
  if (!isDemo) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'API key required.', requestId: req.requestId });
    }
    if (!apiSecret || typeof apiSecret !== 'string' || apiSecret.trim().length < 8) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'API secret required.', requestId: req.requestId });
    }
  }
  const allowedExchanges = ['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'gateio', 'kucoin'];
  if (!allowedExchanges.includes(exchange.trim().toLowerCase())) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Unsupported exchange.', requestId: req.requestId });
  }

  try {
    const maskedKey = isDemo ? 'demo' : `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
    const { rows } = await pgPool.query(
      `insert into public.exchange_connections (user_id, exchange, label, api_key, api_secret, status, masked_key, is_demo)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [req.user.id, exchange.trim().toLowerCase(), label || `${exchange} Account`,
       isDemo ? 'demo' : apiKey, isDemo ? 'demo' : apiSecret,
       isDemo ? 'demo' : 'connected', maskedKey, isDemo || false]
    );
    res.json({ success: true, connection: rows[0], requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_connect_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.delete('/api/exchange/connections/:id', authenticate, async (req, res) => {
  try {
    await pgPool.query('delete from public.exchange_connections where id = $1 and user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true, requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_disconnect_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.get('/api/exchange/balance/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      'select exchange, api_key, is_demo from public.exchange_connections where id = $1 and user_id = $2 limit 1',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.', requestId: req.requestId });
    const connection = rows[0];

    if (connection.is_demo) {
      return res.json({
        success: true,
        connectionId: req.params.id,
        balances: [
          { asset: 'BTC', free: 0.5, locked: 0.1, total: 0.6, usdValue: 36000 },
          { asset: 'ETH', free: 5.0, locked: 0.5, total: 5.5, usdValue: 13750 },
          { asset: 'USDT', free: 10000, locked: 0, total: 10000, usdValue: 10000 },
        ],
        totalUsdValue: 59750,
        updatedAt: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
    res.json({ success: true, connectionId: req.params.id, balances: [], totalUsdValue: 0, requestId: req.requestId, message: 'Live not implemented' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_balance_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.post('/api/exchange/sync/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await pgPool.query(
      'select exchange, is_demo from public.exchange_connections where id = $1 and user_id = $2 limit 1',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.', requestId: req.requestId });
    res.json({ success: true, syncedAt: new Date().toISOString(), requestId: req.requestId, message: 'Sync initiated' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_sync_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.post('/api/exchange/order', authenticate, async (req, res) => {
  const { connectionId, symbol, side, quantity, price } = req.body;
  if (!connectionId || !symbol || !side || !quantity) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Missing fields.', requestId: req.requestId });
  }
  if (!['buy', 'sell'].includes(side.toLowerCase())) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid side.', requestId: req.requestId });
  }
  try {
    const { rows } = await pgPool.query(
      'select exchange, is_demo from public.exchange_connections where id = $1 and user_id = $2 limit 1',
      [connectionId, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Not found.', requestId: req.requestId });
    if (rows[0].is_demo) {
      return res.json({
        success: true,
        orderId: `demo-${Date.now()}`,
        status: 'filled',
        symbol, side, quantity,
        price: price || (side === 'buy' ? 100 : 110),
        filledAt: new Date().toISOString(),
        requestId: req.requestId,
      });
    }
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Live orders not implemented.', requestId: req.requestId });
  } catch (error) {
    console.error(JSON.stringify({ event: 'exchange_order_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

// ==================== DAILY TRADE LIMIT ====================
app.get('/api/trading/daily-limit', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pgPool.query(
      'select trades_used, max_trades from public.daily_trade_limits where user_id = $1 and trade_date = $2 limit 1',
      [req.user.id, today]
    );
    let tradesUsed = 0, maxTrades = 10;
    if (rows.length > 0) {
      tradesUsed = rows[0].trades_used;
      maxTrades = rows[0].max_trades;
    }
    res.json({
      success: true,
      limit: maxTrades,
      used: tradesUsed,
      remaining: Math.max(0, maxTrades - tradesUsed),
      resetAt: new Date(today + 'T00:00:00Z').toISOString(),
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'daily_limit_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

app.post('/api/trading/daily-limit/consume', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows: current } = await pgPool.query(
      'select trades_used, max_trades from public.daily_trade_limits where user_id = $1 and trade_date = $2 limit 1',
      [req.user.id, today]
    );
    let tradesUsed = 0, maxTrades = 10;
    if (current.length > 0) {
      tradesUsed = current[0].trades_used;
      maxTrades = current[0].max_trades;
    }
    if (tradesUsed >= maxTrades) {
      return res.status(429).json({
        error: 'LIMIT_REACHED', message: 'Daily limit reached.',
        limit: maxTrades, used: tradesUsed, remaining: 0,
        resetAt: new Date(today + 'T00:00:00Z').toISOString(),
        requestId: req.requestId,
      });
    }
    const newTradesUsed = tradesUsed + 1;
    await pgPool.query(
      `insert into public.daily_trade_limits (user_id, trade_date, trades_used, max_trades)
       values ($1, $2, $3, $4)
       on conflict (user_id, trade_date) 
       do update set trades_used = $3, updated_at = now()`,
      [req.user.id, today, newTradesUsed, maxTrades]
    );
    res.json({
      success: true,
      limit: maxTrades,
      used: newTradesUsed,
      remaining: Math.max(0, maxTrades - newTradesUsed),
      resetAt: new Date(today + 'T00:00:00Z').toISOString(),
      requestId: req.requestId,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'daily_limit_consume_failed', requestId: req.requestId, error: error?.message }));
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed.', requestId: req.requestId });
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
    console.error(JSON.stringify({ event: 'coingecko_proxy_failed', path, error: error?.message }));
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'TIMEOUT', message: 'Timed out.', requestId: req.requestId });
    }
    res.status(502).json({ error: 'PROXY_ERROR', message: 'Failed.', requestId: req.requestId });
  }
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  // Report to Sentry before the response is written. Guarded in a try/catch so a
  // monitoring outage can never turn a handled 500 into an unhandled crash.
  try { Sentry.captureException(err, { tags: { requestId: req.requestId } }); } catch (_) { /* ignore */ }

  console.error(JSON.stringify({ event: 'request_failed', requestId: req.requestId, error: err?.message }));
  if (res.headersSent) return next(err);
  if (err?.message === 'CORS origin denied') {
    return res.status(403).json({ error: 'CORS_DENIED', message: 'Origin not allowed.', requestId: req.requestId });
  }
  return res.status(500).json({ error: 'SERVER_ERROR', message: 'Request failed.', requestId: req.requestId });
});

app.listen(port, () => {
  console.log(JSON.stringify({ event: 'server_started', port, environment: process.env.NODE_ENV || 'development' }));
});
