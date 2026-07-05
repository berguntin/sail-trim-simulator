/**
 * genoaShape.ts — Genoa Controls → Sail Geometry
 *
 * Maps the 3 genoa trim controls + forestay tension (backstay) + wind state to
 * the same simplified 2D sail shape used for the main (SailShape).
 * All functions are pure and deterministic.
 *
 * Sources / reasoning for each coefficient:
 *  - Speed & Smarts issues on jib/genoa trim (D. Dellenbaugh)
 *  - North U Trim Guide (headsail chapter: sheet, lead, halyard, headstay sag)
 *  - Arvel Gentry — the main's circulation creates UPWASH at the jib, so the
 *    genoa flies at a higher effective angle of attack than the boom angle
 *    alone would suggest (gentrysailing.com essays)
 *
 * The forestay is the genoa's "mast": its tension comes from the backstay
 * (there is no independent forestay control on most fractional rigs), which
 * couples the two sails — cranking the backstay flattens BOTH the main
 * (mast bend) and the genoa (less headstay sag).
 */

import type { GenoaControls, WindState, SailShape } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Normalize a 0-100 control to [0, 1]. */
function norm(value: number): number {
  return value / 100
}

// ---------------------------------------------------------------------------
// Angle of Attack
// ---------------------------------------------------------------------------

/**
 * Genoa sheeting limit: eased much past ~80° off centreline the clew fouls
 * the spreaders/shrouds and the sail collapses against the rig (there is no
 * pole in this model). Like the boom limit on the main, this forces deep
 * courses into the stalled drag regime.
 */
export const MAX_GENOA_SHEET_ANGLE_DEG = 80

/**
 * Inboard sheeting limit: the clew is pinned (laterally) on the line down
 * to the lead car, so the chord can never rotate closer to the centreline
 * than the track's sheeting angle — a sheet can pull, not push. Winching
 * past that point stops rotating the sail and only tensions the leech,
 * which is why an over-sheeted jib shows a closed, hooked leech instead of
 * a boom-style over-rotation (the main has no such limit: its traveler
 * can drag the boom through centreline). ~8-10° on an inboard-tracked
 * racer, ~15° on a cruiser; we use 13° to match the deck layout drawn by
 * the 3D view, which places the track on this same line.
 */
export const GENOA_MIN_SHEET_ANGLE_DEG = 13

/**
 * Compute effective angle of attack (AoA) of the genoa vs. apparent wind.
 *
 * Primary (and only) driver: jib sheet.
 *  Unlike the main — where traveler and sheet split angle vs. leech duties —
 *  the genoa has ONE line doing everything: sheeting in both closes the angle
 *  to the wind and tensions the leech. (Source: North U — "the jib sheet is
 *  90 % of jib trim.") ±7° upwind; like the mainsheet, its authority grows
 *  as the wind goes aft and the sheet swings through a bigger arc.
 *
 * Baseline: ~40 % of the apparent wind angle, slightly HIGHER than the main's
 * 35 %. The genoa flies in the main's upwash, which locally rotates the flow
 * and raises its effective AoA — the reason the jib can be sheeted closer to
 * centreline without luffing. (Source: Gentry, "The Origins of Lift" and the
 * slot-effect essays.) Off the wind the sheeting limit binds, exactly like
 * the main's boom limit; hard on the wind the INBOARD limit binds instead —
 * the chord can never point inside the lead-track line, so max AoA is
 * AWA − GENOA_MIN_SHEET_ANGLE (winching harder past that only closes the
 * leech — see computeTwist).
 */
function computeAngleOfAttack(controls: GenoaControls, wind: WindState): number {
  const { jibsheet } = controls
  const { apparentWindAngleDeg } = wind

  // Baseline AoA at sheet = 50 — upwash raises it vs. the main's 0.35
  const baseline = Math.max(
    apparentWindAngleDeg * 0.40,
    apparentWindAngleDeg - MAX_GENOA_SHEET_ANGLE_DEG + 5,
  )

  // Sheet contribution: ±7° upwind, growing with AWA
  const sheetAuthority = clamp(apparentWindAngleDeg / 30, 1, 4)
  const sheetEffect = (norm(jibsheet) - 0.5) * 14 * sheetAuthority

  const aoa = baseline + sheetEffect
  return clamp(
    aoa,
    Math.max(2, apparentWindAngleDeg - MAX_GENOA_SHEET_ANGLE_DEG),
    Math.min(90, Math.max(2, apparentWindAngleDeg - GENOA_MIN_SHEET_ANGLE_DEG)),
  )
}

// ---------------------------------------------------------------------------
// Twist
// ---------------------------------------------------------------------------

/**
 * Compute twist (difference in angle between foot and head of the genoa).
 *
 * Primary driver: jib sheet.
 *  Same non-linear behaviour as the mainsheet: trimming tensions the leech
 *  with diminishing return near the end of the travel (sqrt curve).
 *  (Source: Speed & Smarts — "jib sheet tension controls leech twist first,
 *  angle second".)
 *
 * Secondary driver: lead car.
 *  Moving the car AFT rotates the sheet pull toward the foot: the leech goes
 *  soft and opens (more twist) while the foot stretches flat. Moving it
 *  FORWARD does the opposite — closes the leech, rounds the foot. Effect
 *  ±4° around the mid-track position. (Source: North U — "lead position is
 *  the jib's twist control"; every jib-trim reference agrees on this one.)
 *
 * Wind-load contribution: same sag-under-load term as the main — the genoa
 *  leech opens as the breeze builds if the sheet doesn't compensate.
 */
function computeTwist(controls: GenoaControls, wind: WindState): number {
  const { jibsheet, car } = controls
  const { trueWindSpeedKts } = wind

  const MAX_TWIST = 24 // degrees, sheet fully eased
  const MIN_TWIST = 6  // degrees, sheet fully trimmed
  const sheetFraction = norm(jibsheet)
  const twistFromSheet = MAX_TWIST - (MAX_TWIST - MIN_TWIST) * Math.sqrt(sheetFraction)

  // Car aft of mid-track opens the leech (max +4°), forward closes it (−4°)
  const carEffect = (norm(car) - 0.5) * 8

  // Wind-load sag: +4° across 6-25 kts range (before sheet compensation)
  const windSag = ((trueWindSpeedKts - 6) / 19) * 4

  const twist = twistFromSheet + carEffect + windSag
  return clamp(twist, 5, 25)
}

// ---------------------------------------------------------------------------
// Camber Ratio
// ---------------------------------------------------------------------------

/**
 * Compute camber ratio (depth/chord).
 *
 * Primary driver: forestay sag, i.e. backstay tension.
 *  A sagging headstay falls off to leeward and BACK into the sail, pushing
 *  extra cloth depth into the genoa — powerful in light air, dragging in a
 *  breeze. Backstay tension straightens the stay and pulls that depth back
 *  out. This is the genoa's equivalent of mast bend. (Source: North U —
 *  "headstay sag is the biggest depth control on the genoa"; Speed & Smarts
 *  headstay-sag issue.)
 *  Slack stay (backstay 0) → camber ≈ 0.16. Tight stay (100) → ≈ 0.08.
 *
 * Secondary driver: jib sheet.
 *  Sheeting hard bends the clew area flat and stretches the exit of the sail
 *  — worth about −0.02 across the range vs. a soft sheet.
 *
 * Secondary driver: halyard.
 *  Like the cunningham on the main: mainly moves the draft, with a small
 *  (−0.01) flattening side effect from redistributing luff cloth.
 */
function computeCamber(controls: GenoaControls, backstay: number): number {
  const { jibsheet, halyard } = controls

  // Forestay sag: backstay 0-100 → 0.16 (deep) to 0.08 (flat), linear
  const camberFromStay = 0.16 - norm(backstay) * 0.08

  // Hard sheet stretches the exit flat: ±0.01 around mid-sheet
  const sheetEffect = (norm(jibsheet) - 0.5) * 0.02

  // Halyard secondary flattening: max −0.01
  const halyardEffect = norm(halyard) * 0.01

  const camber = camberFromStay - sheetEffect - halyardEffect
  return clamp(camber, 0.05, 0.18)
}

// ---------------------------------------------------------------------------
// Draft Position
// ---------------------------------------------------------------------------

/**
 * Compute draft position ratio (0 = luff, 1 = leech).
 *
 * Primary driver: halyard.
 *  Halyard (or jib cunningham) tension stretches the luff and pulls the draft
 *  forward — exactly the cunningham's role on the main. Scalloped wrinkles
 *  between hanks = too little; a hard vertical crease = too much. (Source:
 *  North U — "halyard tension positions the draft"; Speed & Smarts.)
 *  No tension → draft at ~0.55, full tension → ~0.35.
 *
 * Wind-load contribution: cloth stretch drags the draft aft as the breeze
 *  builds (+0.06 at 25 kts) — the reason you re-tension the halyard when the
 *  wind comes up. Same coefficient as the main (same cloth physics).
 *
 * Backstay contribution: tensioning the stay flattens the ENTRY of the genoa
 *  (the sag-depth lived in the front of the sail), which shifts the remaining
 *  depth aft — up to +0.04. Classic interplay: crank the backstay, then
 *  re-tension the halyard to bring the draft back forward. Mirrors the
 *  mast-bend ↔ cunningham coupling on the main.
 */
function computeDraftPosition(
  controls: GenoaControls,
  backstay: number,
  wind: WindState,
): number {
  const { halyard } = controls
  const { trueWindSpeedKts } = wind

  const AFT_LIMIT = 0.55   // draft position with a slack halyard (light air)
  const FWD_LIMIT = 0.35   // draft position at max halyard

  // Cloth stretch under load: 0 at 6 kts → +0.06 at 25 kts
  const loadShift = clamp((trueWindSpeedKts - 6) / 19, 0, 1) * 0.06

  // Tight forestay flattens the entry → draft aft: 0 → +0.04 at full backstay
  const stayShift = norm(backstay) * 0.04

  // Halyard counteracts the base aft position plus both shifts
  const aft = AFT_LIMIT + loadShift + stayShift
  const draftPos = aft - norm(halyard) * (aft - FWD_LIMIT)
  return clamp(draftPos, 0.30, 0.60)
}

// ---------------------------------------------------------------------------
// Foot Fullness (lead car)
// ---------------------------------------------------------------------------

/**
 * Compute foot fullness: how deep the lower third of the genoa is relative to
 * the overall camberRatio.
 *
 * Single driver: lead car.
 *  Car FORWARD: the sheet pulls mostly down — the foot goes round and deep
 *  (power), the leech closes. Car AFT: the sheet pulls mostly back — the foot
 *  stretches flat (depower first step), the leech opens. The genoa's outhaul
 *  and twist control are the same piece of hardware. (Source: North U Trim
 *  Guide — jib lead position diagrams; SailZing lead-position tables.)
 *  Linear: forward (0) → 1.25, aft (100) → 0.75.
 */
function computeFootFullness(controls: GenoaControls): number {
  return 1.25 - norm(controls.car) * 0.5
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Genoa shape from its controls + the backstay setting (forestay tension is
 * not an independent control — it IS the backstay on a fractional rig).
 */
export function computeGenoaShape(
  controls: GenoaControls,
  backstay: number,
  wind: WindState,
): SailShape {
  return {
    angleOfAttackDeg: computeAngleOfAttack(controls, wind),
    twistDeg: computeTwist(controls, wind),
    camberRatio: computeCamber(controls, backstay),
    draftPositionRatio: computeDraftPosition(controls, backstay, wind),
    footFullnessRatio: computeFootFullness(controls),
  }
}
