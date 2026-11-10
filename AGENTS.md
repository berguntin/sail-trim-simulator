# AGENTS.md

Rules for coding agents working in this repository. Detail lives in
[README.md](README.md) and [docs/PHYSICS_SOURCES.md](docs/PHYSICS_SOURCES.md);
this file is what you must follow.

## What this is

Browser-only, educational sail trim simulator. The user moves trim controls
(main + headsail) and sees the sail shape change in 3D and the effect on
heel, VMG and speed. Boat behaviour comes from real ORC certificate polars.
No backend: the app is a static Vite build.

## Stack

- Vue 3 (`<script setup>`, Composition API) + TypeScript (`strict`) + Pinia
- Three.js for the 3D view (`three/addons/controls/OrbitControls.js`)
- vue-i18n (composition mode, `legacy: false`), locales EN and ES
- Vite 8 build, `vue-tsc` type-check, Vitest 4 (`environment: 'node'`)
- Package manager: **pnpm** (`packageManager: pnpm@11.1.1`). Never use npm or
  yarn, and never commit a `package-lock.json` / `yarn.lock`.

## Commands

```sh
pnpm install
pnpm dev             # Vite dev server (port from $PORT, default 5173)
pnpm test            # vitest run
pnpm test:coverage   # vitest run --coverage (thresholds enforced)
pnpm build           # vue-tsc && vite build → dist/
```

There is **no CI workflow** in this repo and no linter or formatter config.
The definition of done is that both of these pass locally:

1. `pnpm test:coverage` — all tests green and coverage of `src/physics/**`
   ≥ 85 % for lines, functions, branches and statements (`vite.config.ts`).
2. `pnpm build` — `vue-tsc` type-check (strict, `noUnusedLocals`,
   `noUnusedParameters`) plus the production build.

The build prints a "chunks larger than 500 kB" warning today (Three.js in one
bundle). That warning is known; do not make the bundle meaningfully larger.

Deployment: Vercel deploys `main` to production and builds previews for
branches (seen in the GitHub deployments of the repo). Anything merged to
`main` ships.

## Architecture

```
src/
  main.ts            app bootstrap (Pinia + i18n)
  physics/           pure trim model: shape → aero coefficients → performance
  boats/             boat data: ORC polars, presets, parsing, rig, headsails
  stores/trimStore.ts  the single Pinia store; wires boats + physics
  components/        Vue UI (App.vue is the root)
  i18n/              vue-i18n setup + locales/en.ts, locales/es.ts
```

Import rules (current code follows them; keep it that way):

- `src/physics/` imports only from `src/physics/`. No Vue, Pinia, Three.js,
  DOM or i18n. Everything there is a pure, deterministic function testable in
  Node.
- `src/boats/` imports from `src/boats/` and **types only** from
  `src/physics/types`. No Vue, no DOM, except `orcApi.ts` which uses `fetch`.
- `src/stores/trimStore.ts` is the only place that combines boats and physics
  into reactive state. New derived physics state goes here, not in components.
- Components read state from `useTrimStore()`. They may call pure helpers from
  `physics/` or `boats/` for presentation (e.g. `computeLocalFlow` for
  telltales), but must not re-implement physics or duplicate store logic.
- Physics inputs/outputs are typed in `src/physics/types.ts`; boat types in
  `src/boats/types.ts`. Extend these instead of using ad-hoc shapes.

## Physics model rules

Sources and modelling decisions: [docs/PHYSICS_SOURCES.md](docs/PHYSICS_SOURCES.md).
Read it before changing anything under `src/physics/` or `src/boats/polar.ts`.

- **One objective function.** `trimScore` in `src/physics/performance.ts`
  drives the optimizer (`findOptimalRig`), the relative VMG and the
  power-balance badge. Never add a second scoring path; the "Show optimal
  trim" button must always land on VMG 100 and the `optimal` badge.
- **Store and optimizer must see the same physics.** Anything applied to the
  live aero in `trimStore.ts` (e.g. `applyGenoaBlanketing`) must also be
  applied in the optimizer path in `performance.ts` (`genoaAeroFor`), and
  vice versa. The same goes for the store's `tuningFor`, which
  `src/boats/headsails.test.ts` copies: change both together.
- **Optimizer cache key.** `rigGridSearch` caches by a string key built from
  wind and every `BoatTuning` / `HeadsailTrimParams` field. If you add a field
  to either type, add it to that key, or the optimizer returns stale results.
- Control ranges are fixed by `src/physics/types.ts` and
  `src/components/trimControlDefs.ts` (0–100, traveler −50…+50). Keep both in
  sync.
- `src/boats/presets.ts` numbers are generated from ORC certificates. Do not
  hand-edit them; refresh from the source URL in the file header.
- Speed output is qualitative (polar target × trim proximity). Do not present
  it in UI copy as a prediction.

How to validate a physics change (with tests, not by eye):

- Add or update tests in the matching `*.test.ts` next to the module.
- Existing invariants live in `src/physics/performance.test.ts` (optimal rig →
  VMG 100 + `optimal` badge across TWS and AWA, controls within range, AoA
  band, downwind drive). They must keep passing; do not loosen their
  tolerances to make a change pass without explaining why in the PR.
- `pnpm test:coverage` must stay above the 85 % thresholds.

## ORC data and user-supplied files

- `src/boats/orcApi.ts` queries the public endpoint
  `https://data.orc.org/public/WPub.dll` directly from the browser (no key,
  20 s timeout). Keep `encodeURIComponent` on user input and keep the timeout.
- `src/boats/parse.ts` parses untrusted input (ORC JSON or `.pol/.csv/.txt`
  polar files uploaded by the user). Validate shape and numeric types before
  use and throw `Error` with a user-presentable message; never `eval`, never
  render file content as HTML.
- Changes to parsing need tests in `src/boats/parse.test.ts` /
  `src/boats/orcApi.test.ts` (fetch is mocked there; tests must not hit the
  network).

## 3D view and performance

`src/components/SailVisualization3D.vue` owns the Three.js scene and a
continuous `requestAnimationFrame` loop.

- Per-frame work (`animate`) must stay cheap: update existing
  `BufferGeometry` attributes in place (`needsUpdate = true`) instead of
  creating geometries or materials every frame.
- When replacing a geometry or removing an object, `dispose()` its geometry
  (and material if it is not shared).
- Everything registered in `onMounted` (rAF, `ResizeObserver`, window
  listeners, `OrbitControls`, renderer) must be released in
  `onBeforeUnmount`.
- Pixel ratio is capped at 2; keep it capped.

There is no automated test for the 3D view: check it in the running app
(`pnpm dev`) at desktop and phone widths, and say so in the PR.

## UI, i18n and accessibility

- Every user-facing string goes through vue-i18n (`t('…')`). Add each new key
  to **both** `src/i18n/locales/en.ts` and `src/i18n/locales/es.ts` with the
  same structure; EN is the fallback.
- Locale choice is persisted in `localStorage` under `trim-simulator-locale`
  and sets `<html lang>`. That is the only browser storage in use.
- Interactive controls must be reachable by keyboard and labelled (see the
  `aria-label` / `@keydown` handling in `TrimDock.vue`).
- The layout must work at phone width as well as desktop.

## Code rules

- TypeScript strict. No `any`, no `@ts-ignore` / `@ts-expect-error`; there are
  none in `src/` today.
- No `console.*` left in `src/`; there are none today.
- Tests live next to the code as `*.test.ts` and run in Node (no DOM).
- Code, comments, identifiers and commit messages in English. README is in
  Spanish; keep it that way when editing it.
- Match the surrounding style (single quotes, no semicolons, 2-space indent);
  there is no formatter to do it for you.

## Workflow

- Every task starts from an up-to-date `main`: `git fetch origin`, then branch
  from `origin/main`. If `main` moves before you open or update the PR, merge
  it into your branch first (no force push without asking).
- Changes reach `main` only through a pull request, never by direct commit or
  push. One branch per task.
- Branch names: `feature/<topic>` for features (history also has
  `docs/…`, `fix/…` is fine for fixes).
- Commits follow Conventional Commits as in `git log`: `feat: …`, `fix: …`,
  `chore: …`, `docs: …`, lowercase, imperative, short subject.
- Before declaring a task done, run the two commands in **Commands** and
  report their result.

## Files not to touch

- `pnpm-lock.yaml`: only changes via `pnpm add/remove/install`, never by hand.
- `src/boats/presets.ts`: regenerate from ORC, do not hand-edit numbers.
- `dist/`, `coverage/`, `node_modules/`, `.vercel/` are build output / local
  state and are git-ignored.
- `.claude/settings.local.json` is personal and must not be committed.
- There are no environment variables or secrets in this project (only `PORT`
  for the dev server). If a change seems to need one, stop and ask instead of
  adding a `.env`; anything in a Vite `VITE_*` variable ends up public in the
  bundle.

## Known current state

Debt where the code does not yet meet the rules above. Do not assume these
are fixed, and do not "fix" them as a side effect of an unrelated task.

- **No CI.** Nothing enforces tests or the build on PRs; run them yourself.
- **No linter/formatter.** Style is by convention only.
- **Direct commits on `main`.** The last four commits on `main` (6ecaba6 …
  b06a1ff) were pushed without a PR, and `main` has no branch protection.
- **Unused 2D component.** `src/components/SailVisualization.vue` is not
  imported anywhere, while the README still says the shape is shown "en 2D y
  3D".
- **Error messages not localized.** `src/boats/orcApi.ts` and
  `src/boats/parse.ts` throw English messages that `BoatSelector.vue` shows as
  is, so the Spanish UI shows them in English.
- **Wind arrows leak GPU memory.** `updateWindArrows` in
  `SailVisualization3D.vue` removes the old `ArrowHelper`s without disposing
  their geometry/material.
- **Unbounded optimizer cache.** `_gridCache` in `performance.ts` never
  evicts entries (bounded in practice by the 0.5° AWA rounding in the store).
- **Large bundle.** Single ~790 kB JS chunk (Vite warning on every build).
- **Untested store and UI.** Coverage thresholds apply only to
  `src/physics/**`. `src/boats/` has tests but no enforced threshold;
  `src/stores/trimStore.ts` and the components have no tests at all
  (`headsails.test.ts` re-implements the store's `tuningFor` to test it).
