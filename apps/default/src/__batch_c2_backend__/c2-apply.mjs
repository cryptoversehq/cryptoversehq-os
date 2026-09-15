#!/usr/bin/env node
/**
 * c2-apply.mjs — apply the Batch C2 backend patch to backend/src/index.js.
 *
 *   node apps/default/src/__batch_c2_backend__/c2-apply.mjs [path/to/backend/src/index.js]
 *
 * Patches IN PLACE and preserves the target file's own EOL. Refuses to write
 * unless every anchor matches exactly once, so a drifted or already-patched file
 * can never be half-modified. Idempotent. Runs `node --check` when done.
 *
 * Why a patch and not a drop-in file: the repo's backend/src/index.js is ahead of
 * the copy this was authored on (it already has the `::integer` XP casts and is
 * LF), so overwriting it would silently revert those. See README.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const block = (name) =>
  readFileSync(join(HERE, name), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

function findTarget() {
  if (process.argv[2]) return resolve(process.argv[2]);
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'backend', 'src', 'index.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const TARGET = findTarget();
if (!TARGET) {
  console.error('Could not locate backend/src/index.js — pass it explicitly:');
  console.error('  node c2-apply.mjs /path/to/repo/backend/src/index.js');
  process.exit(1);
}

const ANCHOR_USERS_OLD = block('anchor-users-route.txt');
const BLOCK_USERS_NEW  = block('block-users-route.txt');
const BLOCK_ROUTES = ['block-routes-a.txt', 'block-routes-b.txt', 'block-routes-c.txt']
  .map(block).join('\n\n') + '\n\n';

const MARKER = 'Batch C2 additions (server-backed admin surface)';
const ROLE_ANCHOR = '// ==================== ADMIN: ROLE ====================';
const HEADER_ANCHOR = ' *   \u00b7 Payment provider failures now log the upstream status/body (diagnostics).';
const HEADER_ADDITION = [
  ' *',
  ' * Batch C2 additions (server-backed admin surface)',
  ' *   \u00b7 GET  /api/admin/users                 \u2192 + display_name/status/language, ?email=/?q=, total/has_more',
  ' *   \u00b7 GET  /api/admin/users/:userId         \u2192 one account (+ active subscription, live-session count)',
  ' *   \u00b7 POST /api/admin/users/:userId/status  \u2192 { active|suspended|banned } — the column authenticate() enforces',
  ' *   \u00b7 POST /api/admin/view-as               \u2192 audit row only (read-only guarantee preserved)',
].join('\n');

const count = (haystack, needle) => haystack.split(needle).length - 1;

const raw = readFileSync(TARGET, 'utf8');
const crlf = raw.includes('\r\n');
let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;

if (count(src, MARKER) === 1) {
  console.log('Already applied — nothing changed: ' + TARGET);
  process.exit(0);
}

const problems = [];
for (const [label, needle] of [
  ['old GET /api/admin/users route', ANCHOR_USERS_OLD],
  ['ADMIN: ROLE section anchor', ROLE_ANCHOR],
  ['module header doc line', HEADER_ANCHOR],
]) {
  const hits = count(src, needle);
  if (hits !== 1) problems.push(label + ' matched ' + hits + ' time(s), expected exactly 1');
}
for (const route of [
  "app.get('/api/admin/users/:userId'",
  "app.post('/api/admin/users/:userId/status'",
  "app.post('/api/admin/view-as'",
]) {
  if (count(src, route) > 0) problems.push('already present: ' + route);
}
if (problems.length) {
  console.error('ABORT — nothing was written:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

src = src.replace(HEADER_ANCHOR, HEADER_ANCHOR + '\n' + HEADER_ADDITION);
src = src.replace(ANCHOR_USERS_OLD, BLOCK_USERS_NEW);
src = src.replace(ROLE_ANCHOR, BLOCK_ROUTES + ROLE_ANCHOR);

const out = crlf ? src.replace(/\n/g, '\r\n') : src;
writeFileSync(TARGET, out, 'utf8');

console.log('PATCHED ' + TARGET);
console.log('  bytes : ' + raw.length + ' -> ' + out.length);
console.log('  eol   : ' + (crlf ? 'CRLF (preserved)' : 'LF (preserved)'));
console.log('  lines : ' + (raw.split(/\r?\n/).length - 1) + ' -> ' + (out.split(/\r?\n/).length - 1));
console.log('');

let ok = true;
for (const [label, needle] of [
  ['GET  /api/admin/users', "app.get('/api/admin/users', authenticate, requireAdminRead"],
  ['GET  /api/admin/users/:userId', "app.get('/api/admin/users/:userId', authenticate, requireAdminRead"],
  ['POST /api/admin/users/:userId/status', "app.post('/api/admin/users/:userId/status', authenticate, requireAdminWrite"],
  ['POST /api/admin/view-as', "app.post('/api/admin/view-as', authenticate, requireAdminRead"],
]) {
  const hits = count(out, needle);
  if (hits !== 1) ok = false;
  console.log((hits === 1 ? 'PASS  ' : 'FAIL  ') + label + '  (' + hits + ' occurrence)');
}

if (count(out, 'select id, email, role, plan, balance, last_seen_at, last_seen_ip, created_at') === 0) {
  console.log('PASS  old roster SELECT removed');
} else {
  ok = false;
  console.log('FAIL  old roster SELECT still present');
}

try {
  execFileSync(process.execPath, ['--check', TARGET], { stdio: 'pipe' });
  console.log('PASS  node --check');
} catch (err) {
  ok = false;
  console.log('FAIL  node --check: ' + String(err.stderr || err.message).split('\n').slice(0, 4).join(' | '));
}

console.log('');
console.log(ok
  ? 'ALL GOOD — git diff, commit backend/src/index.js and push.'
  : 'SOMETHING FAILED — do not commit; send me this output.');
process.exit(ok ? 0 : 1);
