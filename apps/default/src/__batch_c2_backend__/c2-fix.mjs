#!/usr/bin/env node
/**
 * c2-fix.mjs — replace the two admin-user GET routes with schema-safe versions,
 * in place, wherever they currently sit in backend/src/index.js.
 *
 *   node apps/default/src/__batch_c2_backend__/c2-fix.mjs [path/to/backend/src/index.js]
 *
 *   · GET /api/admin/users          — the roster; this is what emptied the panel
 *   · GET /api/admin/users/:userId  — same bug class; used by "view as user"
 *
 * WHY THIS SHAPE: the routes' current text on your side may differ from mine (you
 * edited the count query), so this relies on no patch context. It finds each route
 * by its signature, finds its closing `});` at column 0, and swaps the whole block
 * (doc comment included).
 *
 * Guards: aborts without writing unless every signature matches exactly once and a
 * column-0 `});` terminator is found after it; idempotent; runs `node --check`;
 * keeps the file's own EOL.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const block = (n) => readFileSync(join(HERE, n), 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

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
  console.error('  node c2-fix.mjs /path/to/repo/backend/src/index.js');
  process.exit(1);
}

const TERMINATOR = '\n});\n';

const raw = readFileSync(TARGET, 'utf8');
const crlf = raw.includes('\r\n');
let src = crlf ? raw.replace(/\r\n/g, '\n') : raw;
const count = (h, n) => h.split(n).length - 1;

const FIXES = [
  {
    label: 'GET  /api/admin/users',
    file: 'fix-users-route.txt',
    signature: "app.get('/api/admin/users', authenticate, requireAdminRead, async (req, res) => {",
    docAnchor: '/**\n * GET /api/admin/users — the admin roster',
    marker: 'SCHEMA-SAFE BY CONSTRUCTION',
  },
  {
    label: 'GET  /api/admin/users/:userId',
    file: 'fix-routes-a.txt',
    signature: "app.get('/api/admin/users/:userId', authenticate, requireAdminRead, async (req, res) => {",
    docAnchor: '/**\n * GET /api/admin/users/:userId — one account',
    marker: 'SCHEMA-SAFE, same reason',
  },
];

const applied = [];
const skipped = [];
const problems = [];

for (const fix of FIXES) {
  if (count(src, fix.marker) === 1) { skipped.push(fix.label); continue; }

  if (count(src, fix.signature) !== 1) {
    problems.push(fix.label + ': signature matched ' + count(src, fix.signature) + ' time(s), expected exactly 1');
    continue;
  }
  const sig = src.indexOf(fix.signature);
  const closeIdx = src.indexOf(TERMINATOR, sig);
  if (closeIdx === -1) {
    problems.push(fix.label + ': no column-0 "});" terminator found after the route');
    continue;
  }

  let start = sig;
  const docIdx = src.lastIndexOf(fix.docAnchor, sig);
  if (docIdx !== -1 && sig - docIdx < 1200) start = docIdx;

  const end = closeIdx + TERMINATOR.length;
  const blockText = block(fix.file);
  src = src.slice(0, start) + blockText + '\n' + src.slice(end);
  applied.push(fix.label + ' (' + raw.split(/\r?\n/).length + ' → now ' + src.split('\n').length + ' lines)');
}

if (problems.length) {
  console.error('ABORT — nothing was written:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

if (applied.length === 0) {
  console.log('Already fixed — nothing changed: ' + TARGET);
  process.exit(0);
}

writeFileSync(TARGET, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');

console.log('FIXED ' + TARGET);
for (const a of applied) console.log('  replaced : ' + a);
for (const s of skipped) console.log('  already  : ' + s);
console.log('  bytes    : ' + raw.length + ' → ' + Buffer.byteLength(src, 'utf8'));
console.log('  eol      : ' + (crlf ? 'CRLF (preserved)' : 'LF (preserved)'));
console.log('');

let ok = true;
const check = (label, pass, detail = '') => {
  if (!pass) ok = false;
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  (' + detail + ')' : ''));
};

check('no route still names the optional columns',
  count(src, 'select id, email, display_name, role, plan, balance, status, language') === 0);
check('roster route present exactly once', count(src, FIXES[0].signature) === 1);
check('detail route present exactly once', count(src, FIXES[1].signature) === 1);
check('both read with select *', count(src, 'select * from public.users') >= 2, count(src, 'select * from public.users') + ' occurrence(s)');
check('new 500 responses name the cause', count(src, 'users_query_failed') === 1 && count(src, 'user_query_failed') === 1);
check('route order: list before :userId',
  src.indexOf(FIXES[0].signature) < src.indexOf(FIXES[1].signature));

try {
  execFileSync(process.execPath, ['--check', TARGET], { stdio: 'pipe' });
  check('node --check', true);
} catch (err) {
  check('node --check', false, String(err.stderr || err.message).split('\n').slice(0, 4).join(' | '));
}

console.log('');
console.log(ok
  ? 'ALL GOOD — commit backend/src/index.js and push. If anything else fails, the panel banner now names the database message.'
  : 'SOMETHING FAILED — do not commit; send me this output.');
process.exit(ok ? 0 : 1);
