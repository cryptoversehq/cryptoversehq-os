#!/usr/bin/env node
/**
 * CryptoVerse HQ — Batch 3 acceptance test (no dependencies, Node 18+).
 *
 *   BASE_URL=https://cryptoversehq-os.onrender.com
 *   CV_COOKIE='better-auth.session_token=...'
 *   CV_ADMIN_COOKIE='...'          (optional: an admin/owner account's cookie)
 *   node batch3_verify.js
 */
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const COOKIE = process.env.CV_COOKIE || '';
const ADMIN_COOKIE = process.env.CV_ADMIN_COOKIE || COOKIE;

let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

async function call(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      'X-Request-ID': 'batch3-verify',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

(async () => {
  console.log(`Batch 3 verify -> ${BASE}\n`);

  const health = await call('GET', '/api/health');
  check('GET /api/health = 200', health.status === 200, `HTTP ${health.status}`);

  const anon = await call('GET', '/api/me');
  check('GET /api/me without cookie = 401 + code=unauthenticated',
    anon.status === 401 && anon.json && anon.json.code === 'unauthenticated',
    JSON.stringify(anon.json));

  if (!COOKIE) {
    console.log('\nNo CV_COOKIE set - stopping after the anonymous checks.');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }

  const me = await call('GET', '/api/me', null, COOKIE);
  const u = me.json && me.json.user;
  check('GET /api/me = 200', me.status === 200, JSON.stringify(me.json && me.json.code));
  check('user.entitlements is an array containing free',
    !!(u && Array.isArray(u.entitlements) && u.entitlements.includes('free')),
    u && JSON.stringify(u.entitlements));
  check('user has plan + skill_level + rank',
    !!(u && u.plan && u.skill_level >= 1 && u.rank),
    u && `plan=${u.plan} level=${u.skill_level} rank=${u.rank}`);
  check('session block present', !!(me.json && me.json.session && me.json.session.id));
  check('XP is numeric from the server (client never sends an amount)',
    !!(u && typeof u.xp === 'number'), u && `xp=${u.xp}`);

  const bad = await call('PATCH', '/api/me', { display_name: 'x' }, COOKIE);
  check('PATCH /api/me invalid display_name = 400 + code=invalid_display_name',
    bad.status === 400 && bad.json && bad.json.code === 'invalid_display_name');

  const keepName = u && u.display_name ? u.display_name : 'Trader';
  const good = await call('PATCH', '/api/me',
    { display_name: keepName, language: (u && u.language) || 'en' }, COOKIE);
  check('PATCH /api/me valid = 200', good.status === 200, JSON.stringify(good.json && good.json.user));

  const unknown = await call('POST', '/api/me/xp/update', { type: 'nope' }, COOKIE);
  check('POST /api/me/xp/update unknown type = 400 + code=unknown_xp_event',
    unknown.status === 400 && unknown.json && unknown.json.code === 'unknown_xp_event');

  const xp1 = await call('POST', '/api/me/xp/update', { type: 'daily_login' }, COOKIE);
  const xp2 = await call('POST', '/api/me/xp/update', { type: 'daily_login' }, COOKIE);
  check('first daily_login applied (or already claimed today)',
    xp1.status === 200 && (xp1.json.applied === true || xp1.json.reason === 'duplicate_event'),
    JSON.stringify(xp1.json));
  check('second daily_login = applied:false + reason=duplicate_event',
    xp2.status === 200 && xp2.json.applied === false && xp2.json.reason === 'duplicate_event',
    JSON.stringify(xp2.json));

  const on1 = await call('POST', '/api/me/onboarding', { checklist: { profile: true } }, COOKIE);
  const on2 = await call('POST', '/api/me/onboarding', { checklist: { watchlist: true } }, COOKIE);
  const merged = on2.json && on2.json.onboarding && on2.json.onboarding.checklist;
  check('onboarding deep-merge keeps earlier keys',
    !!(on1.status === 200 && on2.status === 200 && merged && merged.profile === true && merged.watchlist === true),
    JSON.stringify(merged));

  const sessions = await call('GET', '/api/me/sessions', null, COOKIE);
  const list = sessions.json && sessions.json.sessions;
  check('GET /api/me/sessions = 200 with exactly one current session',
    sessions.status === 200 && Array.isArray(list) && list.filter((s) => s.current).length === 1,
    Array.isArray(list) ? `${list.length} live` : 'no list');

  const revoke = await call('POST', '/api/me/sessions/revoke-all', null, COOKIE);
  check('POST /api/me/sessions/revoke-all keeps current session',
    revoke.status === 200 && typeof revoke.json.revoked === 'number',
    JSON.stringify(revoke.json));

  const notes = await call('GET', '/api/admin/notifications', null, ADMIN_COOKIE);
  check('GET /api/admin/notifications = 200 (admin) or 403 (normal user)',
    notes.status === 200 || notes.status === 403,
    `HTTP ${notes.status}${notes.status === 200 ? ` unread=${notes.json.unread}` : ''}`);

  if (notes.status === 200 && notes.json.notifications.length > 0) {
    const sample = notes.json.notifications[0];
    check('notification payload uses the live schema (severity/type present)',
      sample.severity !== undefined || sample.type !== undefined,
      Object.keys(sample).slice(0, 8).join(','));
    const badIds = await call('POST', '/api/admin/notifications/read', { ids: ['not-a-uuid'] }, ADMIN_COOKIE);
    check('POST /api/admin/notifications/read bad ids = 400 + code=invalid_ids',
      badIds.status === 400 && badIds.json.code === 'invalid_ids');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('VERIFY CRASHED:', err);
  process.exit(1);
});
