# __sentry_backend__ — TEMPORARY backend Sentry patch

**This folder is a delivery vehicle, not application source.** Nothing here is
imported by the app. Once the patch is applied to the backend repo and `git diff`
has been reviewed, delete the folder (exactly as `__batch_c2_backend__` was deleted
after Batch C2).

Backend DSN (project `4512103470596176`):

```
https://75cc97998fa6ce5ba4bfa1bb35acb19f@o4512103258718208.ingest.de.sentry.io/4512103470596176
```

The DSN is **not** committed to source: `index.js` reads it from
`process.env.SENTRY_DSN`, which you set in Render → Environment. A Sentry DSN is
send-only, but keeping it in the environment means rotating it needs no repo change.

---

## Files

| File | What |
|---|---|
| `sentry-apply.mjs` | Patches `backend/src/index.js` in place (2 insertions). Idempotent, backs up, EOL-preserving. |
| `package.json` | Reference copy of `backend/package.json` with **one** line added: `"@sentry/node": "^10.75.0"`. |
| `sentry-checklist.txt` | Test checklist, including a temporary `/api/sentry-test` route and how to verify it in Sentry. |
| `README.md` | This file. |

---

## Why a patch script instead of a fully patched `index.js`

`backend/src/index.js` is **2,433 lines / ~120 KB**. Delivering a hand-copied
duplicate of it is the classic way to end up with a backend that silently diverges
from the repository — and a 120 KB "here is the whole file" drop cannot be reviewed
line by line. The script does the two edits, refuses to write if an anchor is
missing (so it can never half-apply), and prints what it changed. `git diff` then
shows **exactly two hunks** — that diff *is* the review.

If you would rather have the patched file itself: run the script in Codespaces (one
command, below) and the patched `index.js` is right there in your working tree.

---

## Copy instructions

```bash
# 1. Copy the folder out of the Taskade export into the repo (path shown in the VFS)
#    apps/default/src/__sentry_backend__/   →   already where it needs to be

# 2. Add the dependency (or copy this folder's package.json over backend/package.json,
#    after diffing — yours may have other changes)
cd backend && npm install @sentry/node@^10.75.0

# 3. Patch index.js in place
node apps/default/src/__sentry_backend__/sentry-apply.mjs backend/src/index.js

# 4. Review — expect exactly two hunks, +21 lines
git diff --stat backend/src/index.js
git diff backend/src/index.js
```

Then set `SENTRY_DSN` in Render and deploy.

---

## What the script inserts (the diff you should see)

**1. After `require('dotenv').config();`** (the backend copy in this repo prints this
at line ~34):

```js
// ==================== SENTRY (error monitoring) ====================
// Initialized before any route is registered so a failure inside a handler is
// reported with its stack and request context. …
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0.1,
});
```

**2. As the first statement of the final error handler** — i.e. immediately before
its existing `console.error`, which is what you asked for:

```js
app.use((err, req, res, next) => {
  // Report to Sentry before the response is written. Guarded in a try/catch so a
  // monitoring outage can never turn a handled 500 into an unhandled crash.
  try { Sentry.captureException(err, { tags: { requestId: req.requestId } }); } catch (_) { /* ignore */ }

  console.error(JSON.stringify({ event: 'request_failed', … }));
  …
});
```

### No `Sentry.Handlers` middleware — deliberately

`Sentry.Handlers.requestHandler()` and `Sentry.Handlers.errorHandler()` **do not
exist in `@sentry/node` v8 and later** (this is v10.75.0). Adding them would throw at
boot. The SDK instruments Express automatically once `init()` has run before the
routes are registered, and explicit `captureException()` in the existing handler is
both the supported and the sufficient approach — exactly as you specified.

---

## Verified before delivery

The script was run locally against a byte-copy of `backend/src/index.js`:

```
sentry-apply — target: index.js
  2434 lines, EOL CRLF
✓ Patched in place (original saved as index.js.bak).
  + ~34:   const Sentry = require('@sentry/node'); Sentry.init({ … })
  + ~2441: Sentry.captureException(err, { tags: { requestId } })
  21 lines added, nothing else touched.
```

- Second run: `✓ Already patched — nothing written` (idempotent).
- Line 2445 (was 2443) is the handler's `console.error` → capture is directly above it.
- EOL integrity: **2455 CRLF, 0 bare LF** — a CRLF file stays CRLF.
- Content diff: 22 lines differ (the 21 inserted + one final-newline normalization).
  No other line in the file changed.

## Caveat

The anchor search is whitespace-tolerant but content-exact: if your repo's
`index.js` has drifted from the copy used here (e.g. the error handler was
restructured), the script **exits 1 and prints the anchor it could not find** rather
than patching something unexpected. In that case send me the tail of the file and I
will re-anchor it.
