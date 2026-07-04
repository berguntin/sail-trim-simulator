// Boat model and ORC polar types.
//
// Polars follow the ORC certificate "Allowances" layout: a grid of target
// boat speeds over true wind speed × true wind angle, plus optimum beat/run
// angles and VMGs per wind speed. ORC publishes allowances in seconds/mile;
// everything here is already converted to knots (kts = 3600 / allowance).

export interface OrcPolar {
  /** True wind speeds of the grid columns, knots (ORC standard: 4-24) */
  windSpeedsKts: number[]
  /** True wind angles of the grid rows, degrees (ORC standard: 52-150) */
  windAnglesDeg: number[]
  /** speedsKts[angleIdx][twsIdx] = target boat speed in knots */
  speedsKts: number[][]
  /** Optimum beat (upwind) angle per wind speed, degrees from true wind */
  beatAnglesDeg: number[]
  /** Optimum upwind VMG per wind speed, knots */
  beatVMGKts: number[]
  /** Optimum gybe (downwind) angle per wind speed, degrees */
  gybeAnglesDeg: number[]
  /** Optimum downwind VMG per wind speed, knots */
  runVMGKts: number[]
}

export interface BoatModel {
  /** Stable unique id, kebab-case (also used as physics cache key) */
  id: string
  /** Display name, usually the class name */
  name: string
  /** One-line description shown in the boat selector */
  description: string
  /** Data provenance (certificate reference, file name, …) */
  source: string
  /** Length overall in meters, if known */
  loaM: number | null
  /** Sailing displacement in kg, if known */
  displacementKg: number | null
  /** Upwind sail area (main + jib) in m², if known */
  upwindSailAreaM2: number | null
  polar: OrcPolar
  /** True for user-loaded boats (not bundled presets) */
  custom?: boolean
}
