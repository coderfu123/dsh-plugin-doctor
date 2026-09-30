# TASK-001 — implement the installability checks

**File to edit:** `src/checks/installability.ts`
**Tests that define "done":** `tests/installability.test.ts`
**Fixtures:** `tests/fixtures/{good-plugin,bad-plugin,half-baked}`

---

## Why this task exists

A public audit of 1,883 rejected DSH plugin submissions found that **93% were
rejected for one reason: the plugin cannot be installed the way DSH installs
plugins.** Most of those repositories contain working code — they just never
declared what `dsh plugin add` looks for.

`dsh-dependency` is already implemented as a reference. Your job is the other
five checks. Each one has failing tests; make them pass **without editing the
tests**.

## Ground rules

1. **Never edit `tests/` or `src/types.ts` to make a test pass.** If a test
   looks wrong, it is a conversation, not an edit.
2. **A check must never throw.** Return a `fail` result with the reason. A crash
   is a bug in the doctor, not in the plugin under test.
3. **Failures must be actionable.** `details` should tell the author what to add,
   with the literal key name. Compare the reference check's failure output.
4. **No network, no shelling out.** Use only `ctx.readFile`, `ctx.exists`,
   `ctx.listDir`, and `ctx.manifest`.
5. Run `npm test -- --run` after each check. Red → green, one at a time.

---

## TASK-001a — `bundle-declared`

The single highest-value check in the project.

`dsh plugin add <pkg>` only recognises a package as a DSH bundle when its
`package.json` declares a patch layer:

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

| Fixture | Expected |
|---|---|
| `good-plugin` | `pass` — patch is `"./cordis.patch.yml"` |
| `bad-plugin` | `fail` — no `dsh.bundle` at all |

Failure `details` must contain the words `dsh`, `bundle` and `patch` — i.e. paste
the exact snippet the author has to add.

**Traps to handle:** `dsh` present but `bundle` missing; `bundle` present but
`patch` missing; `patch` present but not a string; `patch` present but `""`.

---

## TASK-001b — `patch-file-exists`

Catches a declaration that lies. Declaring `dsh.bundle.patch` is not enough: the
file has to be inside the published package.

| Fixture | Expected | Why |
|---|---|---|
| `good-plugin` | `pass` | `cordis.patch.yml` exists |
| `half-baked` | `fail` | declares `./cordis.patch.yml`, file is absent |
| `bad-plugin` | `warn` | nothing declared — **do not** fail it twice |

**Key idea:** `bundle-declared` already reports the missing declaration. A second
`fail` for the same root cause inflates the failure count and makes the score
meaningless. `warn` means "nothing to verify here".

Use `ctx.exists(ctx.manifest.dsh?.bundle?.patch)`.

---

## TASK-001c — `entry-resolvable`

DSH imports the package by name. If `main` points at a file that is not in the
package, the plugin loads nothing and fails later with a far worse error message.

| Fixture | Expected |
|---|---|
| `good-plugin` | `pass` — `./lib/index.js` exists |
| `bad-plugin` | `fail` — `./lib/missing.js` does not exist |
| `half-baked` | `warn` — no `main` declared |

Use `ctx.manifest.main`.
Note: `main` is conventionally `./lib/index.js`, so it starts with `./` — your
`ctx.exists` already resolves relative paths, so pass it through as-is.

---

## TASK-001d — `publishable-name`

npm is the only distribution channel a plugin has. A package that cannot be
published cannot be installed, no matter how good its code is.

Fail when **any** of these is true:

- `private` is `true`
- `name` is missing, empty, or whitespace
- `version` is missing, empty, or whitespace

On success, put the exact `name@version` in `details` — that is what will be
published, and seeing it is genuinely useful.

| Fixture | Expected |
|---|---|
| `good-plugin` | `pass` → `good-plugin@1.0.0` |
| `bad-plugin` | `fail` — `private: true` |

---

## TASK-001e — `client-half-valid`

A plugin may ship a browser half:

```json
"dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings"] } }
```

`platform` is the surface the browser half targets. **Today the only value DSH
serves is `"web"`** — anything else silently never loads, which is exactly the
kind of failure that costs an afternoon to debug.

| Condition | Expected |
|---|---|
| no `dsh.client` at all | `pass` — a host-only plugin is perfectly valid |
| `platform === 'web'`, `inject` an array of non-empty strings | `pass` |
| `platform` missing or not `'web'` | `fail` |
| `inject` present but not an array | `fail` |
| `inject` is an array containing a non-string or empty string | `fail` |

| Fixture | Expected |
|---|---|
| `bad-plugin` | `pass` (no browser half) |
| `good-plugin` | `pass` |
| `half-baked` | `fail` — `platform: "desktop"` **and** `inject: [""]` |

Failure `details` must mention `platform` or `inject`.

---

## Definition of done

```bash
npm run typecheck   # no errors
npm test            # all green
npm run build       # dist/ produced
node dist/index.js tests/fixtures/good-plugin    # exits 0, score 100
node dist/index.js tests/fixtures/bad-plugin     # exits 1, shows the failures
```

Then, as a sanity check, point it at a real installed DSH plugin:

```bash
node dist/index.js "$USERPROFILE/.dsh/profiles/web/node_modules/dshmarket"
```

If the doctor gives a real, published plugin a low score, either the plugin is
genuinely unusual or your checks are wrong. Work out which — that instinct is
the actual skill this task is teaching.

## When you are done

1. Commit with a message like `feat: implement installability checks (TASK-001)`
2. Ask for a review — the reviewer will look for: double-counting, non-actionable
   messages, and unhandled manifest shapes.
