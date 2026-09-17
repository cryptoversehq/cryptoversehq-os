#!/usr/bin/env node
/**
 * sentry-apply.mjs — add Sentry error reporting to backend/src/index.js.
 *
 *   node apps/default/src/__sentry_backend__/sentry-apply.mjs [path/to/backend/src/index.js]
 *
 * Default target: backend/src/index.js. Idempotent (a second run writes nothing),
 * writes index.js.bak before modifying, and preserves the file's own EOL.
 *
 * Why a script rather than a fully patched copy of the 2,433-line file, the exact
 * two insertions it makes, and how to verify them: see README.md in this folder.
 */
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] ?? path.join('backend', 'src', 'index.js');

// ── The blocks this script inserts ────────────────────────────────────────────
// Anchors are REGEXES, not literals: the exact spacing in a hand-edited file is not
// knowable, and a literal anchor silently failing is worse than no script at all.
const DOTENV_RE = /require\(\s*['"]dotenv['"]\s*\)\s*\.\s*config\(\s*\)\s*;/;
const ERROR_HANDLER_RE = /app\s*\.\s*use\s*\(\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)\s*=>\s*\{/;

const SENTRY_INIT = `
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
`;

const ERROR_HANDLER_CAPTURE = `
  // Report to Sentry before the response is written. Guarded in a try/catch so a
  // monitoring outage can never turn a handled 500 into an unhandled crash.
  try { Sentry.captureException(err, { tags: { requestId: req.requestId } }); } catch (_) { /* ignore */ }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function withEol(text, eol) {
  return eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

// ── Read ──────────────────────────────────────────────────────────────────────
if (!fs.existsSync(target)) {
  fail(`No such file: ${target}\n  Usage: node sentry-apply.mjs [path/to/backend/src/index.js]`);
}

const raw = fs.readFileSync(target, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let source = raw.replace(/\r\n/g, '\n');

console.log(`\nsentry-apply — target: ${target}`);
console.log(`  ${raw.split('\n').length} lines, EOL ${eol === '\r\n' ? 'CRLF' : 'LF'}`);

if (source.includes("require('@sentry/node')") || source.includes('require("@sentry/node")')) {
  console.log('\n✓ Already patched — @sentry/node is already required. Nothing written.\n');
  process.exit(0);
}

// ── Insertion 1: Sentry require + init, right after dotenv ────────────────────
const dotenvMatch = DOTENV_RE.exec(source);
if (!dotenvMatch) {
  fail(`Anchor not found: require('dotenv').config()\n  Expected near the top of index.js, after the header comment block.`);
}
const afterDotenv = dotenvMatch.index + dotenvMatch[0].length;
source = source.slice(0, afterDotenv) + '\n' + SENTRY_INIT + source.slice(afterDotenv);
const initLine = lineOf(source, afterDotenv + 2);

// ── Insertion 2: captureException as the first statement of the error handler ─
const handlerMatch = ERROR_HANDLER_RE.exec(source);
if (!handlerMatch) {
  fail(`Anchor not found: app.use((err, req, res, next) => {)\n  Expected in the ERROR HANDLING section at the end of index.js.`);
}
const afterHandlerOpen = handlerMatch.index + handlerMatch[0].length;
source = source.slice(0, afterHandlerOpen) + ERROR_HANDLER_CAPTURE + source.slice(afterHandlerOpen);
const captureLine = lineOf(source, afterHandlerOpen + 2);

// ── Write (with a backup of the original) ─────────────────────────────────────
const backup = `${target}.bak`;
fs.writeFileSync(backup, raw, 'utf8');
fs.writeFileSync(target, withEol(source, eol), 'utf8');

const added = SENTRY_INIT.split('\n').length + ERROR_HANDLER_CAPTURE.split('\n').length - 2;
console.log(`\n✓ Patched in place (original saved as ${path.basename(backup)}).`);
console.log(`  + ~${initLine}: const Sentry = require('@sentry/node'); Sentry.init({ … })`);
console.log(`  + ~${captureLine}: Sentry.captureException(err, { tags: { requestId } })`);
console.log(`  ${added} lines added, nothing else touched.`);
console.log('\nNext:');
console.log('  1. Add "@sentry/node" to backend/package.json dependencies (see package.json in this folder).');
console.log('  2. Add SENTRY_DSN to Render → Environment (the BACKEND DSN, project 4512103470596176).');
console.log('  3. git diff — expect exactly two hunks.');
console.log('  4. Optionally add the /api/sentry-test route from sentry-checklist.txt to verify end-to-end,');
console.log('     then remove it before the real release.\n');
