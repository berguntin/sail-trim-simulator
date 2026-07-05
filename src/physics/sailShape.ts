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
// Angle of Attack
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
 * Compute effective angle of attack (AoA) of the sail vs. apparent wind.
 *
 * Primary driver: traveler (upwind).
 *  - Windward traveler (+50) pulls the boom toward centerline, presenting a
 *    larger angle to the apparent wind → higher AoA.
 *  - Leeward traveler (-50) opens the sail away → lower AoA.
 *  Linear mapping: traveler ±50 → ΔAoA ±8°, centered at a baseline derived
 *  from apparent wind angle. (Source: Speed & Smarts — "traveler controls
 *  mainsail angle without changing leech tension." A full traveler swing
 *  moves the boom well past 10° on a keelboat.)
 *
 * Secondary driver: mainsheet.
 *  Easing the sheet opens the boom outward even if the traveler is fixed,
 *  reducing AoA. Upwind the effect is about half the traveler's (the sheet
 *  mostly pulls DOWN at close angles — North U: "sheet tensions the leech;
 *  traveler sets the angle"). As the wind goes aft the sheet is the only
 *  angle control left and a full swing covers tens of degrees, so its
 *  authority scales with AWA (±4° at AWA 30 → ±20° at AWA 150).
 *
 * Baseline (mid controls):
 *  - Upwind: ~35 % of AWA (thin-aerofoil optimum for a cambered sail is
 *    5-12°; at AWA ~30° the boom sits ≈ 20° off centreline → AoA ~10°).
 *  - Off the wind the 0.35·AWA rule would need the boom eased past the
 *    rigging: the boom limit binds and the baseline becomes AWA − 80
 *    (mid-controls boom near, not at, the 85° stop).
 *
 * Clamps: AoA can never be below AWA − MAX_BOOM (boom against the shrouds)
 * nor above AWA + 5 (boom pinned a touch to windward of centreline); 90° is
 * a fully stalled sail square to the flow.
 */
function computeAngleOfAttack(controls: TrimControls, wind: WindState): number {
  const { mainsheet, traveler } = controls
  const { apparentWindAngleDeg } = wind

  // Baseline AoA when traveler centered and sheet at 50 %
  const baseline = Math.max(
    apparentWindAngleDeg * 0.35,               // upwind regime: ≈ 10-12° at AWA 30°
    apparentWindAngleDeg - MAX_BOOM_ANGLE_DEG + 5, // boom-limit regime off the wind
  )

  // Traveler contribution: linear ±8° across full range
  const travelerNorm = normalizeTraveler(traveler) // 0-1
  const travelerEffect = (travelerNorm - 0.5) * 16 // ±8°

  // Mainsheet contribution: ±4° upwind, growing with AWA as the sheet
  // becomes the sole angle control (±20° at AWA 150)
  const sheetAuthority = clamp(apparentWindAngleDeg / 30, 1, 5)
  const sheetEffect = (norm(mainsheet) - 0.5) * 8 * sheetAuthority

  const aoa = baseline + travelerEffect + sheetEffect
  return clamp(
    aoa,
    Math.max(2, apparentWindAngleDeg - MAX_BOOM_ANGLE_DEG),
    Math.min(90, apparentWindAngleDeg + 5),
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
