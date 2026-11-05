@AGENTS.md

## Claude Code specifics

- Run `/verify` before saying a task is done, and report its table.
- Run the `reviewer` subagent on the diff before every commit.
- Also run each specialised reviewer whose area the diff touches:
  - `physics-reviewer`: `src/physics/`, `src/boats/polar.ts`,
    `src/boats/rig.ts`, `src/boats/headsails.ts`, derived physics in
    `src/stores/trimStore.ts`.
  - `orc-data-reviewer`: `src/boats/orcApi.ts`, `src/boats/parse.ts`,
    `src/boats/presets.ts`, `src/boats/types.ts`, file upload in
    `BoatSelector.vue`.
  - `rendering-reviewer`: `src/components/SailVisualization3D.vue`,
    `TrimDock.vue`, anything touching Three.js, the render loop or bundle size.
  - `ui-i18n-reviewer`: any `.vue` component, `src/i18n/`, user-facing copy.
- The dev server for the browser preview is `trim-simulator` in
  `.claude/launch.json`.
