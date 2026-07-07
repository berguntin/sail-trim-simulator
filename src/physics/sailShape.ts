/**
 * sailShape.ts — Controls → Sail Geometry
 *
 * Maps the 4 trim controls + wind state to a simplified 2D sail shape.
 * All functions are pure and deterministic.
 *
 * Sources / reasoning for each coefficient:
 *  - Speed & Smarts issues on mainsail trim (D. Dellenbaugh)
 *  - North U Trim Guide (mainsail chapter)
 *  - SailZing trim reference tables
 */

import type { TrimControls, WindState, SailShape } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Normalize traveler from [-50, +50] to [0, 1].
 * 0 = full leeward, 0.5 = centered, 1 = full windward.
 */
function normalizeTraveler(traveler: number): number {
  return (traveler + 50) / 100
}

/** Normalize a 0-100 control to [0, 1]. */
function norm(value: number): number {
  return value / 100
}

// ---------------------------------------------------------------------------
// Boom angle & Angle of Attack
// ---------------------------------------------------------------------------

/**
 * Boom swing limit off centreline: shrouds and the boom vang geometry stop
 * the boom around 85° even with everything released. This is what forces
 * deep-downwind sailing into the drag regime — at TWA 150+ the sail CANNOT
 * present a small angle of attack, so it stalls and drives by drag (exactly
 * what the ORC coefficient tables show past β ≈ 60°).
 */
export const MAX_BOOM_ANGLE_DEG = 85

/**
 * Windward-most boom angle: the traveler hauled fully to windward drags the
 * boom a few degrees PAST the centreline (negative = boom to windward).
 */
export const MIN_BOOM_ANGLE_DEG = -8

/** Traveler authority on the boom angle: ±8° across its ±50 range.
 *  (Speed & Smarts — "traveler controls mainsail angle without changing
 *  leech tension"; a full swing moves the boom well past 10° on a keelboat.) */
const TRAVELER_SWING_DEG = 16

/**
 * Sheeted boom angle off the centreline, degrees (0 = amidships, positive =
 * eased to leeward). THIS is what the crew actually sets: sheet and traveler
 * position the boom relative to the BOAT — the trim knows nothing about the
 * wind. Fully eased, the sheet lets the boom out to the 85° rigging stop;
 * block-to-block it holds the boom on the centreline, and the traveler
 * shifts that whole arc ±8°.
 */
export function mainBoomAngleDeg(
  controls: Pick<TrimControls, 'mainsheet' | 'traveler'>,
): number {
  const sheetAngle = (1 - norm(controls.mainsheet)) * MAX_BOOM_ANGLE_DEG
  const travelerShift = -(normalizeTraveler(controls.traveler) - 0.5) * TRAVELER_SWING_DEG
  return clamp(sheetAngle + travelerShift, MIN_BOOM_ANGLE_DEG, MAX_BOOM_ANGLE_DEG)
}

/**
 * Lower AoA clamp: at −30° the sail is fully backwinded and flogging like a
 * flag — easing further changes nothing aerodynamically, so deeper negative
 * angles carry no extra information.
 */
export const LUFFING_AOA_FLOOR_DEG = -30

/**
 * Effective angle of attack (AoA) of the sail vs. apparent wind.
 *
 * The AoA is EMERGENT, not directly controlled:
 *
 *   AoA = AWA − boom angle
 *
 * The controls set the boom angle in the boat's frame (mainBoomAngleDeg);
 * the wind then meets the sail wherever the wind happens to be. This is the
 * key realism property: when the course (and therefore the AWA) changes,
 * the sail does NOT re-trim itself —
 *  - bear away with the sheets pinned and the AoA grows past stall
 *    (over-trimmed, dragging, heeling), until the crew eases;
 *  - head up with the sheets eased and the AoA collapses through zero: the
 *    wind gets onto the leeward side of the cloth and the sail luffs
 *    (negative AoA = backwinded, flogging), until the crew trims.
 *
 * Clamps: LUFFING_AOA_FLOOR (fully flogging) to 90° (a sail square to the
 * flow — courses deeper than that present no more cloth to the wind).
 */
function computeAngleOfAttack(controls: TrimControls, wind: WindState): number {
  return clamp(
    wind.apparentWindAngleDeg - mainBoomAngleDeg(controls),
    LUFFING_AOA_FLOOR_DEG,
    90,
  )
}

// ---------------------------------------------------------------------------
// Twist
// ---------------------------------------------------------------------------

/**
 * Compute twist (difference in angle between foot and head of the sail).
 *
 * Primary driver: mainsheet.
 *  Trimming the sheet tensions the leech and reduces twist. The relationship
 *  is non-linear — the last 20 % of sheet travel has diminishing return on
 *  twist reduction because the leech is already quite tight. (Source: Speed &
 *  Smarts #88 — "sheet tension is the primary twist control.")
 *  Range: sheet = 0 → max twist; sheet = 100 → min twist. We use a square-root
 *  curve to model the non-linear/diminishing return.
 *
 * Secondary driver: backstay.
 *  Tensioning the backstay bends the mast, which opens the leech at the top
 *  (mast head falls off), increasing twist. Effect ≈ 20 % of sheet's range.
 *  (Source: North U — "backstay opens the upper leech and flattens the sail.")
 *
 * Wind-load contribution: at higher TWS the sail loads up; if the sheet is not
 *  compensating, the leech sags off → more twist. We add a small wind-speed
 *  offset that grows linearly from 0 at 6 kts to +4° at 25 kts, representing
 *  mast/boom deflection under load. (Source: empirical — racers ease the sheet
 *  upwind as breeze builds to avoid stalling the upper leech.)
 */
function computeTwist(controls: TrimControls, wind: WindState): number {
  const { mainsheet, backstay } = controls
  const { trueWindSpeedKts } = wind

  // Sheet: maps 0-100 to maxTwist-minTwist via sqrt curve (diminishing return)
  const MAX_TWIST = 25 // degrees, sheet fully eased
  const MIN_TWIST = 5  // degrees, sheet fully trimmed
  const sheetFraction = norm(mainsheet) // 0=eased, 1=trimmed
  // sqrt gives fast initial reduction, slow end (matches reality)
  const twistFromSheet = MAX_TWIST - (MAX_TWIST - MIN_TWIST) * Math.sqrt(sheetFraction)

  // Backstay opens upper leech → adds twist (max +4°)
  const backstayEffect = norm(backstay) * 4

  // Wind-load sag: +4° across 6-25 kts range (before sheet compensation)
  const windSag = ((trueWindSpeedKts - 6) / 19) * 4

  const twist = twistFromSheet + backstayEffect + windSag
  return clamp(twist, 5, 25)
}

// ---------------------------------------------------------------------------
// Camber Ratio
// ---------------------------------------------------------------------------

/**
 * Compute camber ratio (depth/chord).
 *
 * Primary driver: backstay.
 *  Backstay tension bends the mast forward, which flattens the sail's overall
 *  camber by straightening the luff wire / pre-bend. This is the main
 *  depowering tool in fractional rigs. (Source: North U — "backstay is the
 *  primary camber control on a fractional rig.")
 *  Full backstay → camber ≈ 0.06 (near-flat). No backstay → camber ≈ 0.15.
 *
 * Secondary driver: cunningham.
 *  Cunningham tension stretches the luff, moving the draft forward AND slightly
 *  reducing overall depth by redistributing cloth tension. Effect on camber is
 *  secondary — mainly ~0.02 reduction across full range. (Source: Speed &
 *  Smarts — "cunningham primarily moves draft, secondarily flattens slightly.")
 *
 * NOT a driver: outhaul.
 *  camberRatio is the MID/UPPER camber. The outhaul owns the depth of the
 *  LOWER third through footFullnessRatio (computeFootFullness below); the
 *  aerodynamics fold that into the area-weighted effectiveCamber, and the
 *  3D view scales the lower chords with it. Feeding the outhaul into
 *  camberRatio as well (as this function once did) counted it twice in the
 *  visualization and made it a weak duplicate of the backstay in the aero.
 */
function computeCamber(controls: TrimControls): number {
  const { backstay, cunningham } = controls

  // Backstay: maps 0-100 → 0.15 (full) to 0.06 (flat), linear
  const camberFromBackstay = 0.15 - norm(backstay) * 0.09

  // Cunningham secondary flattening: max −0.02
  const cunninghamEffect = norm(cunningham) * 0.02

  const camber = camberFromBackstay - cunninghamEffect
  return clamp(camber, 0.05, 0.18)
}

// ---------------------------------------------------------------------------
// Foot Fullness (outhaul)
// ---------------------------------------------------------------------------

/**
 * Compute foot fullness: how deep the lower third of the sail is relative to
 * the overall camberRatio.
 *
 * Single driver: outhaul.
 *  Easing the outhaul lets the clew slide forward along the boom, and the
 *  freed cloth falls into a deep lower shape (the "shelf" opens on sails that
 *  have one) — power for light air and reaching. Maximum tension boards the
 *  foot out flat, the first depowering step upwind. (Source: North U Trim
 *  Guide — "the outhaul is the depth control for the bottom third of the
 *  main"; Speed & Smarts — outhaul tables per wind band.)
 *  Linear: eased (0) → 1.30, max (100) → 0.70.
 */
function computeFootFullness(controls: TrimControls): number {
  return 1.3 - norm(controls.outhaul) * 0.6
}

// ---------------------------------------------------------------------------
// Draft Position
// ---------------------------------------------------------------------------

/**
 * Compute draft position ratio (0 = luff, 1 = leech).
 *
 * Primary driver: cunningham.
 *  Cunningham tension pulls the draft forward along the chord. Without tension
 *  the draft migrates aft due to cloth stretch under load. (Source: Speed &
 *  Smarts #45, North U — "cunningham moves the draft; it's the only upwind
 *  control for draft position.")
 *  No tension → draft at ~0.55 (stretched aft)
 *  Full tension → draft at ~0.35 (forward, near optimal)
 *  Linear mapping between those limits.
 *
 * Wind-load contribution: cloth stretch grows with wind pressure, dragging
 *  the draft further aft at the same cunningham setting — up to +0.06 at
 *  25 kts. This is why you pull more cunningham as the breeze builds.
 *  (Source: North U — "as wind increases, draft moves aft; add luff tension
 *  to restore it.")
 *
 * Backstay contribution (mast bend / overbend): bending the mast pulls cloth
 *  toward the luff, flattening the ENTRY of the sail — which shifts the
 *  remaining depth aft, up to +0.05 at full bend. This is the classic
 *  backstay ↔ cunningham interplay: crank the backstay, then add cunningham
 *  to pull the draft back forward. (Source: North U — "mast bend moves draft
 *  aft; compensate with cunningham"; overbend wrinkles point at this.)
 */
function computeDraftPosition(controls: TrimControls, wind: WindState): number {
  const { cunningham, backstay } = controls
  const { trueWindSpeedKts } = wind

  const AFT_LIMIT = 0.55   // draft position with zero cunningham (light air)
  const FWD_LIMIT = 0.35   // draft position at max cunningham

  // Cloth stretch under load: 0 at 6 kts → +0.06 at 25 kts
  const loadShift = clamp((trueWindSpeedKts - 6) / 19, 0, 1) * 0.06

  // Mast bend flattens the entry → draft aft: 0 → +0.05 at full backstay
  const bendShift = norm(backstay) * 0.05

  // Cunningham counteracts the base aft position plus both shifts
  const aft = AFT_LIMIT + loadShift + bendShift
  const draftPos = aft - norm(cunningham) * (aft - FWD_LIMIT)
  return clamp(draftPos, 0.30, 0.60)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeSailShape(controls: TrimControls, wind: WindState): SailShape {
  return {
    angleOfAttackDeg: computeAngleOfAttack(controls, wind),
    twistDeg: computeTwist(controls, wind),
    camberRatio: computeCamber(controls),
    draftPositionRatio: computeDraftPosition(controls, wind),
    footFullnessRatio: computeFootFullness(controls),
  }
}
