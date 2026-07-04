/**
 * performance.ts — Cl/Cd → Qualitative Performance Estimate
 *
 * IMPORTANT: All numbers produced here are QUALITATIVE and ILLUSTRATIVE.
 * They are NOT predictions of real VMG, heel angle, or boat speed for any
 * real vessel. They exist solely to give the user intuitive feedback about
 * the direction and magnitude of trim changes. Do NOT use for navigation or
 * racing decisions.
 *
 * Physical basis for the objective function:
 *  Upwind, total aerodynamic force decomposes in boat axes (Marchaj ch.5,
 *  Fossati ch.4) with β = apparent wind angle:
 *    Cx (drive) = Cl·sin(β) − Cd·cos(β)   → pushes the boat forward
 *    Cy (heel)  = Cl·cos(β) + Cd·sin(β)   → heels the boat, mostly wasted
 *
 *  Good trim is NOT simply max Cl/Cd:
 *   - In light air the boat is nowhere near its heel limit, so the best trim
 *     maximises drive force (powered-up: full camber, high Cl).
 *   - In heavy air heeling force becomes the constraint; the best trim gives
 *     up drive to keep heel manageable (flat sail, more twist, lower AoA).
 *
 *  We model this with a single score used EVERYWHERE — the grid search that
 *  defines "optimal trim", the relativeVMG normalisation, and the power
 *  balance badge all derive from the same numbers, so the UI can never
 *  disagree with itself:
 *
 *    score = driveForce − penalty(heel above comfort limit)
 */

import type {
  AeroCoefficients,
  WindState,
  PerformanceEstimate,
  TrimControls,
  GenoaControls,
  BoatTuning,
} from './types'
import { computeSailShape } from './sailShape'
import { computeGenoaShape } from './genoaShape'
import {
  computeAeroCoefficients,
  applyGenoaBlanketing,
  MAINSAIL_AERO,
  GENOA_AERO,
  type SailAeroParams,
} from './aerodynamics'

// ---------------------------------------------------------------------------
// Drive / heel force decomposition
// ---------------------------------------------------------------------------

export interface DriveHeel {
  /** Drive force coefficient along boat heading (can be negative when luffing) */
  driveCoef: number
  /** Heeling force coefficient, perpendicular to heading */
  heelCoef: number
}

export function computeDriveHeel(aero: AeroCoefficients, wind: WindState): DriveHeel {
  const beta = (wind.apparentWindAngleDeg * Math.PI) / 180
  return {
    driveCoef: aero.cl * Math.sin(beta) - aero.cd * Math.cos(beta),
    heelCoef: aero.cl * Math.cos(beta) + aero.cd * Math.sin(beta),
  }
}

// ---------------------------------------------------------------------------
// relativeHeel
// ---------------------------------------------------------------------------

/**
 * Qualitative heel estimate: 0-100.
 *
 * Heeling force ∝ Cy × TWS². Normalised against the theoretical maximum
 * (Cy ≈ 1.5 at TWS = 25 kts) to give a 0-100 scale.
 *
 * This is a gross simplification — real heel depends on righting moment,
 * displacement, waterline beam, etc. Here it is purely qualitative.
 */
const MAX_HEEL_FORCE = 1.5 * 25 ** 2 // = 937.5

function computeRelativeHeel(aero: AeroCoefficients, wind: WindState): number {
  const { heelCoef } = computeDriveHeel(aero, wind)
  const heelForce = heelCoef * wind.trueWindSpeedKts ** 2
  return Math.max(0, Math.min(100, (heelForce / MAX_HEEL_FORCE) * 100))
}

// ---------------------------------------------------------------------------
// Trim score — THE single objective function
// ---------------------------------------------------------------------------

/**
 * Default heel comfort fraction: heel force (0-1 of the theoretical max)
 * above which extra heeling force starts to cost VMG: rail down, excessive
 * leeway, rudder drag. With the current model a fully powered sail crosses
 * this around 16 kts TWS, which matches when a typical keelboat starts
 * working the backstay and flattening the main upwind.
 *
 * Per-boat tuning (boats/polar.ts) replaces this with a value derived from
 * the boat's ORC polar: ~0.30 for a tender sportboat that must depower
 * early, up to ~0.50 for a stiff keelboat that carries power longer.
 *
 * The rig fields default to the historical fixed values; per-boat values
 * come from the certificate's sail areas (boats/rig.ts deriveRig).
 */
export const DEFAULT_TUNING: BoatTuning = {
  heelComfortFrac: 0.40,
  mainAreaFrac: 0.55,
  mainAspectRatio: MAINSAIL_AERO.aspectRatio,
  genoaAspectRatio: GENOA_AERO.aspectRatio,
}

/** Fill missing tuning fields with the defaults — callers may tune only the
 *  heel comfort (boats/polar.ts) or only the rig (boats/rig.ts). */
function resolveTuning(tuning: Partial<BoatTuning>): BoatTuning {
  return { ...DEFAULT_TUNING, ...tuning }
}

/** Quadratic penalty gain past the comfort limit. */
const HEEL_PENALTY_GAIN = 8.0

/**
 * VMG proxy: drive force scaled by dynamic pressure, minus a quadratic
 * penalty once heeling force exceeds the comfort limit.
 *
 * In light air the penalty term is zero (heel force is tiny even fully
 * powered), so the score reduces to "maximise drive". In heavy air the
 * penalty dominates and rewards depowering. Both regimes emerge from the
 * same formula — no special cases. The boat only enters through
 * tuning.heelComfortFrac: the same trim depowers a sportboat at a wind
 * speed where a stiff keelboat still wants full power.
 */
export function trimScore(
  aero: AeroCoefficients,
  wind: WindState,
  tuning: Partial<BoatTuning> = DEFAULT_TUNING,
): number {
  const { driveCoef } = computeDriveHeel(aero, wind)
  const q = (wind.trueWindSpeedKts / 25) ** 2 // normalised dynamic pressure
  const driveForce = driveCoef * q

  const heelFrac = computeRelativeHeel(aero, wind) / 100
  const excess = Math.max(0, heelFrac - (tuning.heelComfortFrac ?? DEFAULT_TUNING.heelComfortFrac))

  return driveForce - HEEL_PENALTY_GAIN * excess * excess
}

// ---------------------------------------------------------------------------
// Rig combination — mainsail + genoa
// ---------------------------------------------------------------------------

/**
 * Default main share of upwind sail area. A typical fractional
 * cruiser-racer sail plan upwind carries slightly more area in the main
 * than in the genoa (ORC certificates for the preset fleet give main
 * ≈ 52-60 % of upwind cloth). Per-boat values come from the certificate
 * areas via tuning.mainAreaFrac.
 */
export const MAIN_AREA_FRAC = 0.55

/**
 * Area-weighted rig coefficients. Deliberately first-order: no slot bonus.
 * Gentry showed the "slot magic" is mostly myth — the two sails largely
 * share one circulation field and the total force is close to the area
 * sum; the real interactions (upwash raising the genoa's effective AoA,
 * backstay coupling both sails' depth) are modelled where they belong, in
 * the shape functions.
 */
export function combineRigAero(
  main: AeroCoefficients,
  genoa: AeroCoefficients,
  mainFrac: number = MAIN_AREA_FRAC,
): AeroCoefficients {
  const genoaFrac = 1 - mainFrac
  const cl = main.cl * mainFrac + genoa.cl * genoaFrac
  const cd = main.cd * mainFrac + genoa.cd * genoaFrac
  return { cl, cd, efficiency: cd > 0 ? cl / cd : 0 }
}

/** Induced-drag params per sail: boat-specific aspect ratio from the tuning,
 *  Oswald factors fixed per sail (boom end-plate vs deck-sweeping foot). */
export function mainAeroParams(tuning: BoatTuning): SailAeroParams {
  return { aspectRatio: tuning.mainAspectRatio, oswald: MAINSAIL_AERO.oswald }
}
export function genoaAeroParams(tuning: BoatTuning): SailAeroParams {
  return { aspectRatio: tuning.genoaAspectRatio, oswald: GENOA_AERO.oswald }
}

/** Genoa aero for a given genoa trim + backstay (forestay tension) + wind,
 *  including the main's blanketing on deep courses. */
function genoaAeroFor(
  genoa: GenoaControls,
  backstay: number,
  wind: WindState,
  tuning: BoatTuning,
): AeroCoefficients {
  return applyGenoaBlanketing(
    computeAeroCoefficients(computeGenoaShape(genoa, backstay, wind), wind, genoaAeroParams(tuning)),
    wind,
  )
}

/** Main aero for a given main trim + wind. */
function mainAeroFor(main: TrimControls, wind: WindState, tuning: BoatTuning): AeroCoefficients {
  return computeAeroCoefficients(computeSailShape(main, wind), wind, mainAeroParams(tuning))
}

// ---------------------------------------------------------------------------
// Grid search shared logic
// ---------------------------------------------------------------------------

// 9-step grid over four main controls plus a coarser 5-step outhaul axis
// gives 9^4 × 5 = 32 805 evals per sweep; the genoa grid is 9 × 9 × 5 = 405.
// The joint space (13 M) is out of reach, so we alternate coordinate-descent
// sweeps: optimise the main with the genoa held, then the genoa with the
// main held. The sails only couple through the shared heel budget and the
// backstay, both mild, so 3 rounds converge in practice — and the result is
// deterministic (fixed start, fixed order), which the UI relies on.
const STEPS = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]
const TRAVELER_STEPS = [-50, -37.5, -25, -12.5, 0, 12.5, 25, 37.5, 50]
const OUTHAUL_STEPS = [0, 25, 50, 75, 100]
const HALYARD_STEPS = [0, 25, 50, 75, 100]
const DESCENT_ROUNDS = 3

export interface OptimalRig {
  main: TrimControls
  genoa: GenoaControls
}

interface RigGridResult {
  maxScore: number
  best: OptimalRig
  /** relativeHeel produced by the optimal rig — the reference for powerBalance */
  optimalHeel: number
}

/**
 * Coordinate-descent search for the rig trim (main + genoa) that maximises
 * the trim score for a given wind state and boat tuning.
 *
 * Cached by TWS (1 kt), AWA (0.1°) and heel comfort — the search is cheap
 * but we avoid rerunning it on every reactive tick.
 */
const _gridCache = new Map<string, RigGridResult>()

function rigGridSearch(wind: WindState, tuning: BoatTuning = DEFAULT_TUNING): RigGridResult {
  const key =
    `${Math.round(wind.trueWindSpeedKts)}|${wind.apparentWindAngleDeg.toFixed(1)}` +
    `|${tuning.heelComfortFrac.toFixed(3)}|${tuning.mainAreaFrac.toFixed(3)}` +
    `|${tuning.mainAspectRatio.toFixed(2)}|${tuning.genoaAspectRatio.toFixed(2)}`
  const cached = _gridCache.get(key)
  if (cached) return cached

  let maxScore = -Infinity
  let bestMain: TrimControls = { mainsheet: 50, traveler: 0, cunningham: 50, backstay: 50, outhaul: 50 }
  let bestGenoa: GenoaControls = { jibsheet: 50, car: 50, halyard: 25 }

  for (let round = 0; round < DESCENT_ROUNDS; round++) {
    // --- Main sweep, genoa controls held. The genoa's aero still varies
    // with the backstay (forestay sag), so precompute it per backstay step.
    const genoaAeroByBackstay = new Map<number, AeroCoefficients>()
    for (const backstay of STEPS) {
      genoaAeroByBackstay.set(backstay, genoaAeroFor(bestGenoa, backstay, wind, tuning))
    }

    for (const mainsheet of STEPS) {
      for (const traveler of TRAVELER_STEPS) {
        for (const cunningham of STEPS) {
          for (const backstay of STEPS) {
            const genoaAero = genoaAeroByBackstay.get(backstay)!
            for (const outhaul of OUTHAUL_STEPS) {
              const controls = { mainsheet, traveler, cunningham, backstay, outhaul }
              const aero = mainAeroFor(controls, wind, tuning)
              const score = trimScore(combineRigAero(aero, genoaAero, tuning.mainAreaFrac), wind, tuning)
              if (score > maxScore) {
                maxScore = score
                bestMain = controls
              }
            }
          }
        }
      }
    }

    // --- Genoa sweep, main held.
    const mainAero = mainAeroFor(bestMain, wind, tuning)
    for (const jibsheet of STEPS) {
      for (const car of STEPS) {
        for (const halyard of HALYARD_STEPS) {
          const genoa = { jibsheet, car, halyard }
          const genoaAero = genoaAeroFor(genoa, bestMain.backstay, wind, tuning)
          const score = trimScore(combineRigAero(mainAero, genoaAero, tuning.mainAreaFrac), wind, tuning)
          if (score > maxScore) {
            maxScore = score
            bestGenoa = genoa
          }
        }
      }
    }
  }

  const optimalAero = combineRigAero(
    mainAeroFor(bestMain, wind, tuning),
    genoaAeroFor(bestGenoa, bestMain.backstay, wind, tuning),
    tuning.mainAreaFrac,
  )
  const result: RigGridResult = {
    maxScore,
    best: { main: bestMain, genoa: bestGenoa },
    optimalHeel: computeRelativeHeel(optimalAero, wind),
  }
  _gridCache.set(key, result)
  return result
}

// ---------------------------------------------------------------------------
// Public: find optimal rig
// ---------------------------------------------------------------------------

/**
 * Returns the rig trim (main + genoa) that maximises the trim score for the
 * given wind and boat tuning. Resolution is limited by the grid — values are
 * multiples of 12.5 (25 for outhaul/halyard). Intended for the "show optimal"
 * UI affordance, not navigation use.
 */
export function findOptimalRig(
  wind: WindState,
  tuning: Partial<BoatTuning> = DEFAULT_TUNING,
): OptimalRig {
  return rigGridSearch(wind, resolveTuning(tuning)).best
}

// ---------------------------------------------------------------------------
// powerBalance
// ---------------------------------------------------------------------------

/**
 * Three-state power classification, RELATIVE to the optimal trim for the
 * current wind (not absolute heel thresholds — those made the badge disagree
 * with the "Show Optimal Trim" button in light or heavy air).
 *
 *  - underpowered: generating clearly less heeling force than the optimum →
 *    sail is stalled, luffing, or over-flattened for the conditions.
 *  - overpowered: generating clearly more heeling force than the optimum →
 *    too much power for the conditions, time to depower.
 *  - optimal: within the band around what the optimal trim produces.
 *
 * By construction, applying findOptimalControls always classifies 'optimal'.
 */
function classifyPowerBalance(
  relativeHeel: number,
  optimalHeel: number,
): PerformanceEstimate['powerBalance'] {
  if (optimalHeel <= 0) return 'underpowered'
  const ratio = relativeHeel / optimalHeel
  if (ratio < 0.80) return 'underpowered'
  if (ratio > 1.25) return 'overpowered'
  return 'optimal'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rig-level performance estimate: the two sails' coefficients are combined
 * area-weighted and scored against the rig optimum from the same grid
 * search that powers findOptimalRig — the single-objective-function
 * invariant (score → VMG → badge from one formula) extends to two sails.
 */
export function estimateRigPerformance(
  mainAero: AeroCoefficients,
  genoaAero: AeroCoefficients,
  wind: WindState,
  tuning: Partial<BoatTuning> = DEFAULT_TUNING,
): PerformanceEstimate {
  const t = resolveTuning(tuning)
  const grid = rigGridSearch(wind, t)
  const combined = combineRigAero(mainAero, genoaAero, t.mainAreaFrac)
  const score = trimScore(combined, wind, t)

  const relativeVMG = grid.maxScore > 0
    ? Math.max(0, Math.min(100, (score / grid.maxScore) * 100))
    : 0

  const relativeHeel = computeRelativeHeel(combined, wind)
  const powerBalance = classifyPowerBalance(relativeHeel, grid.optimalHeel)

  return { relativeVMG, relativeHeel, powerBalance }
}

// Export internals for testing
export { computeRelativeHeel, classifyPowerBalance, rigGridSearch }
