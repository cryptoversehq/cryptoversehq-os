# __batch_c2_backend__ — Batch C2 backend deliverable (TEMPORARY)

Exported copy of the C2 server changes. **Delete this folder after the deploy.**

## Why a patcher instead of an `index.js` to drop in

Your repo's `backend/src/index.js` is **ahead** of the copy the C2 patch was authored on:

- it carries Postgres type fixes ours does not — `::integer` casts in **5 places** on the XP
  ledger/level queries (`coalesce(sum(amount), 0)::integer`, `$4::integer`, `(select xp from
  upd)::integer` …), which is what keeps XP totals arriving as JSON numbers instead of strings;
- it has 22 extra blank lines;
- it is **LF** (2 221 lines), while the authoring copy was CRLF.

Dropping the authoring file in would silently revert those casts and produce a 2 400-line
whitespace diff. So the delivered artifact is the **C2 delta only** (10 372 characters of new
text), applied in place by an anchored, idempotent script.

## Verified before handover (dry run on a copy of your file)

`node c2-apply.mjs` was run against a copy of `backend/src/index.js` (97 129 bytes) with exactly
the files in this folder:

```
PATCHED backend/src/index.js
  bytes : 97129 -> 107497
  eol   : LF (preserved)
  lines : 2221 -> 2453
PASS  GET  /api/admin/users  (1 occurrence)
PASS  GET  /api/admin/users/:userId  (1 occurrence)
PASS  POST /api/admin/users/:userId/status  (1 occurrence)
PASS  POST /api/admin/view-as  (1 occurrence)
PASS  old roster SELECT removed
PASS  node --check
# second run:
Already applied — nothing changed
```

A line-by-line diff of the patched result against the verified authoring file showed 28 hunks,
**all accounted for**: 22 blank-line-only, 5 `::integer` (your fixes, preserved — not reverted),
1 indentation-only, **0 unexpected**. So your `git diff` will show the C2 additions and nothing
else.


## Steps — pick ONE (both produce the identical file)

### Option A — `git apply` (no Node needed; git itself validates the patch, self-checking)

```bash
# from the repo root (cryptoversehq-os)
git apply --check apps/default/src/__batch_c2_backend__/c2.patch   # must be clean
git apply         apps/default/src/__batch_c2_backend__/c2.patch
node --check backend/src/index.js            # 2 seconds of insurance
git diff --stat backend/src/index.js         # expect +240 -8, one file, 3 hunks
git add backend/src/index.js
git commit -m "Batch C2: server-backed admin roster, account status, view-as audit"
git push
```

The result is byte-identical to the file that was verified end-to-end:

- **sha256** `ba72abf6bf7ab81f16c911c1c8bc01329522bcdd1489cd0ffea6d0b9f1fc071c`
- 2 453 lines · LF · 107 602 bytes
- check with `Get-FileHash -Algorithm SHA256 backend/src/index.js` (Windows) or
  `sha256sum backend/src/index.js`

Proven with real git 2.54.0 on a copy of your file: `git apply --check` clean, applied
result byte-exact against that hash, and re-applying is refused (no double-apply).

**If `git apply --check` errors**, your `backend/src/index.js` has moved on since the
snapshot I patched — use Option B (or send me the file).

### Option B — the patcher (works no matter how far the file has drifted, needs Node)

```bash
# from the repo root (cryptoversehq-os)
node apps/default/src/__batch_c2_backend__/c2-apply.mjs

# → patches backend/src/index.js in place, keeps LF, then runs `node --check`
git diff --stat backend/src/index.js        # expect roughly +400 lines, no mass deletions
git add backend/src/index.js
git commit -m "Batch C2: server-backed admin roster, account status, view-as audit"
git push
```

The script:

- locates `backend/src/index.js` by walking up from its own folder, or takes a path argument:
  `node c2-apply.mjs /path/to/repo/backend/src/index.js`;
- **aborts without writing** unless all three anchors match exactly once — a drifted or
  already-patched file can never be half-modified;
- is idempotent: a second run prints `Already applied` and changes nothing.

## Files

| File | What |
|---|---|
| `c2-apply.mjs` | the patcher (reads the five `.txt` blocks next to it) |
| `anchor-users-route.txt` | the pre-patch `GET /api/admin/users` route — the replacement anchor |
| `block-users-route.txt` | the new roster route (+ display_name/status/language, `?email=`, `?q=`, `total`, `has_more`) |
| `block-routes-a.txt` | new `GET /api/admin/users/:userId` |
| `block-routes-b.txt` | new `POST /api/admin/users/:userId/status` |
| `block-routes-c.txt` | new `POST /api/admin/view-as` |

After the Render deploy is live, the smoke test is `frontend-batch-c/BatchC2-STARTED.md`
§ "Test plan", and C2.2 + C2.4 unblock.
