---
name: verify
description: Run this project's definition-of-done checks (coverage-gated tests and type-checked build) plus a risk scan of the diff, and report a ✅/❌/⏭️ table. Use before declaring any task done. Reports only; never fixes.
allowed-tools: Bash(pnpm test:coverage), Bash(pnpm test), Bash(pnpm build), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git merge-base:*), Bash(git fetch:*), Bash(git rev-parse:*), Bash(grep:*), Read, Grep, Glob
---

# verify

There is no CI in this repository. The checks below are the definition of
done from `AGENTS.md` → **Commands**. Run them all, in order, **without
stopping at the first failure**. Do not edit any file and do not try to fix
anything: report only.

## 1. Work out the diff

```sh
git fetch origin
git merge-base HEAD origin/main
git diff --name-only <merge-base>   # committed + uncommitted changes vs main
git status --short                  # also list untracked files
```

Classify the changed files:

- **code**: anything under `src/`, `index.html`, `vite.config.ts`,
  `tsconfig.json`, `package.json`, `pnpm-lock.yaml`
- **docs-only**: only `*.md`, `docs/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`

## 2. Run the checks

| # | Check | Command | Skip when |
|---|---|---|---|
| 1 | Tests + physics coverage ≥ 85 % | `pnpm test:coverage` | diff is docs-only |
| 2 | Type-check + production build | `pnpm build` | diff is docs-only |

Both are fast (seconds), so only skip them for a docs-only diff, and say so.
If `node_modules/` is missing, report ❌ with "run `pnpm install`" instead of
installing.

For failures, keep only the relevant lines: failing test names and assertion
messages, coverage metrics below threshold, `vue-tsc` errors with
`file:line`. For the build, the "chunks larger than 500 kB" warning is known
debt: report it only if the JS chunk grew noticeably (today ≈ 790 kB).

## 3. Scan the diff for project risks

Run on the diff against the merge base (added lines only, `^+`), excluding
`*.test.ts` where noted:

| Risk | What to look for |
|---|---|
| Type escape | `any`, `as any`, `@ts-ignore`, `@ts-expect-error` in `src/` |
| Debug output | `console.` in `src/` (excluding tests) |
| Unsafe rendering | `v-html`, `innerHTML`, `eval(`, `new Function(` |
| Layering | Vue/Pinia/Three/i18n/DOM imports added under `src/physics/`; non-type imports from `../physics` under `src/boats/` |
| Physics consistency | `BoatTuning` / `HeadsailTrimParams` gained a field but the `rigGridSearch` cache key in `performance.ts` did not; `applyGenoaBlanketing` or `tuningFor` changed in only one of store / optimizer / `headsails.test.ts` |
| Generated data | hand edits to `src/boats/presets.ts` |
| i18n | new key in only one of `src/i18n/locales/en.ts` / `es.ts`; new literal user-facing text in `.vue` templates |
| 3D leaks | new `new THREE.*Geometry` / `Material` inside per-frame or update code without a matching `dispose()` |
| Lockfiles / secrets | `package-lock.json`, `yarn.lock`, `.env*`, tokens or keys, `.claude/settings.local.json` staged |
| Weakened tests | deleted tests or widened tolerances (`toBeCloseTo` digits, thresholds) in `*.test.ts`, or lowered thresholds in `vite.config.ts` |

For i18n key parity, compare the key structure of both locale files when
either one changed.

Ignore items already listed under **Known current state** in `AGENTS.md`
unless the diff makes them worse.

## 4. Report

Reply in Spanish with one table, then the details of every ❌:

| Check | Result | Notes |
|---|---|---|
| Tests + coverage | ✅ / ❌ / ⏭️ | e.g. 386 passed; branches 88.9 % |
| Build (vue-tsc + vite) | ✅ / ❌ / ⏭️ | |
| Risk scan | ✅ / ❌ | one line per finding, `file:line` |

⏭️ always carries the reason it was skipped. End with a one-line verdict:
"Listo" only if nothing is ❌.
