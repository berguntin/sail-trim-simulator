/**
 * aerodynamics.ts — Sail Geometry → Cl, Cd
 *
 * Maps SailShape + WindState to aerodynamic coefficients.
 * All functions are pure and deterministic.
 *
 * Physical basis:
 *  - Thin aerofoil theory for sail cross-sections (Marchaj, "Aero-Hydrodynamics
 *    of Sailing"; Fossati, "Aero-Hydrodynamics and the Performance of Sailing
 *    Yachts")
 *  - Lift curve: dCl/dα ≈ 2π per radian for a thin section; we use a reduced
 *    slope to account for finite aspect ratio and sail porosity, with a
 *    piecewise model to capture stall and under-sheeting.
 *  - Camber adds lift independently of AoA (a cambered section has a negative
 *    zero-lift angle: ΔCl ≈ 4π·f/c in thin-aerofoil theory; we use a reduced
 *    effective slope).
 *  - Drag: sum of parasitic (profile) drag and induced drag (Cl²/π·AR·e),
 *    with AR and e set per sail (SailAeroParams: mainsail vs genoa).
 */

import type { SailShape, WindState, AeroCoefficients } from './types'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ---------------------------------------------------------------------------
// Per-sail aero parameters
// ---------------------------------------------------------------------------

/**
 * Induced-drag geometry per sail. The Cl(α) curve, camber lift and twist
 * penalty are shared (same cloth physics); what differs between main and
 * genoa is the induced-drag denominator π·AR·e.
 *
 *  - Mainsail: AR ≈ 5 (span²/area of a fractional main), e ≈ 0.9 with the
 *    boom acting as a partial end-plate.
 *  - Genoa: geometric AR is lower (the overlap adds area low down), but the
 *    deck-sweeping foot seals the gap to the deck — the end-plate effect the
 *    ORC models via its effective-height factor (kheff, VPP doc §5.3) — and
 *    the clean luff (no mast turbulence) helps. Net: AR ≈ 4.5, e ≈ 0.95,
 *    slightly more induced drag per unit Cl than the main.
 */
export interface SailAeroParams {
  aspectRatio: number
  oswald: number
}

export const MAINSAIL_AERO: SailAeroParams = { aspectRatio: 5, oswald: 0.9 }
export const GENOA_AERO: SailAeroParams = { aspectRatio: 4.5, oswald: 0.95 }

// ---------------------------------------------------------------------------
// Optimal twist by wind speed
// ---------------------------------------------------------------------------

/**
 * Optimal twist for a given true wind speed.
 *
 * At low wind: keep the sail powered up with less twist (all sections working).
 * At high wind: allow more twist to reduce heeling moment and keep the upper
 * leech from stalling under load. (Source: Speed & Smarts #88 — optimal twist
 * increases ~0.5°/knot of TWS in the upwind range.)
 *
 * Range: 7° at 6 kts → 16° at 25 kts.
 */
function optimalTwistDeg(trueWindSpeedKts: number): number {
  const TWS_LOW = 6, TWS_HIGH = 25
  const TWIST_LOW = 7, TWIST_HIGH = 16
  const t = (trueWindSpeedKts - TWS_LOW) / (TWS_HIGH - TWS_LOW)
  return TWIST_LOW + clamp(t, 0, 1) * (TWIST_HIGH - TWIST_LOW)
}

// ---------------------------------------------------------------------------
// Base Cl from angle of attack
// ---------------------------------------------------------------------------

/**
 * Post-stall normal-force coefficient of a flat plate (Hoerner, "Fluid
 * Dynamic Drag"; same regime the ORC tables cover past β ≈ 60°). In deep
 * stall the sail acts like a plate square-ish to the flow:
 *   Cl ≈ CN·sinα·cosα (→ 0 at 90°),  pressure drag ≈ CN·sin²α (→ CN at 90°).
 * This is what makes downwind sailing work in the model — drive comes from
 * drag once the boom/sheet limits force the sail past stall.
 */
const CN_POST_STALL = 1.15

function flatPlateCl(angleOfAttackDeg: number): number {
  const a = (angleOfAttackDeg * Math.PI) / 180
  return CN_POST_STALL * Math.sin(a) * Math.cos(a)
}

/**
 * Piecewise Cl(α) curve for a sail section at reference camber (0.10).
 *
 * Four regions (continuous at the joins):
 *  1. Under-sheeted (α < 5°): sail is luffing or barely filling — Cl rises
 *     from 0 linearly at ~0.05/degree. (Very low AoA = sail not working.)
 *  2. Linear (5° ≤ α ≤ 20°): the sailing "money zone". dCl/dα ≈ 0.083/degree,
 *     from Cl = 0.25 at 5° to the peak Cl ≈ 1.5 at 20°. (Thin aerofoil gives
 *     2π/rad ≈ 0.11/deg; the reduction accounts for finite AR and porosity.)
 *  3. Soft stall (20° < α ≤ 35°): flow separation grows; the linear
 *     fall-off (0.10/deg — Marchaj ch.4, fabric sails stall softly) blends
 *     into the flat-plate curve.
 *  4. Deep stall (α > 35°): flat-plate regime, Cl = CN·sinα·cosα — the
 *     reaching/running end of the polar.
 */
function baseCl(angleOfAttackDeg: number): number {
  const AoA = angleOfAttackDeg

  if (AoA < 5) {
    // Luffing region: Cl rises from ~0 at AoA=0. Negative AoA (backwinded,
    // flogging cloth — the sheets were left eased and the course closed)
    // produces no lift at all.
    return clamp(AoA * 0.05, 0, 0.25)
  } else if (AoA <= 20) {
    // Linear region: Cl = 0.25 at 5°, rising to the 1.5 peak at 20°
    return 0.25 + (AoA - 5) * (1.25 / 15)
  } else if (AoA <= 35) {
    // Soft stall blending into the flat plate
    const t = (AoA - 20) / 15
    const softStall = 1.5 - (AoA - 20) * 0.10
    return (1 - t) * softStall + t * flatPlateCl(AoA)
  } else {
    // Deep stall: flat plate
    return clamp(flatPlateCl(AoA), 0, 1.5)
  }
}

// ---------------------------------------------------------------------------
// Effective camber — vertical depth distribution
// ---------------------------------------------------------------------------

/**
 * Share of the sail area whose depth follows the foot controls (outhaul on
 * the main, lead car on the genoa): the lower third carries the longest
 * chords (≈ 5/9 of a triangular sail's area), moderated by the same
 * boom-to-mid-height blend the 3D view draws — net ≈ 35 % of the cloth.
 *
 * The weight differs slightly for lift and drag. The foot region works in
 * the worst air on the sail — the bottom of the wind gradient, behind
 * mast/boom turbulence, with the open shelf running at high local depth
 * where the leeward flow separates readily — so depth added at the foot
 * converts to lift a touch below its area share (0.35) and to drag a touch
 * above it (0.40). The asymmetry is deliberately mild: strong enough that
 * when the heel limit binds, boarding the foot flat is the best
 * drag-and-heel-shed per unit of drive lost (the outhaul is the FIRST
 * depowering step), yet weak enough that below the limit a full foot still
 * pays (eased outhaul = cheap power in light air). That flip at the
 * overpowering point is the trim-guide ordering. (North U Trim Guide,
 * outhaul/lead chapters; Speed & Smarts outhaul tables. Previously
 * footFullnessRatio was drawn but generated no force at all, which let the
 * optimizer recommend a fully eased outhaul at 20+ kts.)
 */
const FOOT_LIFT_WEIGHT = 0.35
const FOOT_DRAG_WEIGHT = 0.40

/** Camber the lift model sees: mid/upper camber (mast bend, luff tension,
 *  stay sag) with the foot-controlled share scaled by footFullnessRatio. */
export function camberForLift(shape: SailShape): number {
  return shape.camberRatio * (1 + FOOT_LIFT_WEIGHT * (shape.footFullnessRatio - 1))
}

/** Camber the profile-drag model sees — foot depth weighs heavier here. */
export function camberForDrag(shape: SailShape): number {
  return shape.camberRatio * (1 + FOOT_DRAG_WEIGHT * (shape.footFullnessRatio - 1))
}

// ---------------------------------------------------------------------------
// Camber contribution to Cl
// ---------------------------------------------------------------------------

/**
 * Extra lift from camber, relative to the reference camber (0.10) baked into
 * baseCl. Thin-aerofoil theory for a circular-arc section gives
 * ΔCl = 4π·Δ(f/c) ≈ 12.6 per unit camber; real sails achieve far less due to
 * twist, porosity and separation — we use 3.0. This is what makes a full sail
 * "powered up" (more lift AND more drag) and a flat sail "depowered".
 * (Source: Marchaj ch.3 — lift vs. camber curves for soft sails.)
 */
const REFERENCE_CAMBER = 0.10
const CL_PER_CAMBER = 3.0

function camberClDelta(camberRatio: number): number {
  return (camberRatio - REFERENCE_CAMBER) * CL_PER_CAMBER
}

// ---------------------------------------------------------------------------
// Twist penalty on Cl
// ---------------------------------------------------------------------------

/**
 * Penalty factor [0, 1] applied to Cl based on how far twist is from optimal.
 *
 * Twist that's too low (over-sheeted upper leech) stalls the head section.
 * Twist that's too high (lazy leech) means the upper portions aren't
 * contributing lift efficiently. Penalty is symmetric around the optimum,
 * growing quadratically with deviation. Max penalty 30 % at ±10° deviation.
 * (Source: empirical / SailZing — "2° either side of optimal matters at the
 * top level; 5° is clearly visible in boat speed.")
 */
function twistPenaltyFactor(twistDeg: number, trueWindSpeedKts: number): number {
  const optimal = optimalTwistDeg(trueWindSpeedKts)
  const deviation = Math.abs(twistDeg - optimal)
  // Penalty = 0 at deviation = 0, grows to 0.30 at deviation = 10°
  const penalty = Math.min(0.30, (deviation / 10) ** 2 * 0.30)
  return 1 - penalty
}

// ---------------------------------------------------------------------------
// Drag coefficient
// ---------------------------------------------------------------------------

/**
 * Compute total Cd = profile drag + induced drag.
 *
 * Profile drag (Cd0):
 *  Minimum ≈ 0.015 for a well-trimmed sail at optimal camber.
 *  Excess camber (> 0.12) adds significant profile drag — the leeward surface
 *  has steeper adverse pressure gradients. (+0.006 per 0.01 of excess camber.)
 *  Draft displaced aft of 0.50 also increases drag (adverse gradient at leech).
 *  (Source: Fossati, ch.6 — profile drag sensitivity to camber position.)
 *
 * Separation drag:
 *  On a cambered soft sail the leeward boundary layer starts detaching well
 *  before the Cl peak — a separation bubble grows from ~12° AoA and costs
 *  increasing pressure drag. This is what makes "pinching up to max power"
 *  slow in practice, and pushes the real optimum AoA to ~13-16° instead of
 *  the Cl peak at 20°. (Marchaj ch.4 — trailing-edge separation on sails.)
 *
 * Induced drag (Cdi):
 *  Cdi = Cl² / (π × AR × e), with AR ≈ 5 for a mainsail (span²/area of a
 *  typical fractional main) and e (Oswald factor) ≈ 0.9 including the
 *  end-plate effect of the boom. Cdi is the dominant drag source upwind.
 */
function computeCd(shape: SailShape, cl: number, params: SailAeroParams): number {
  const { draftPositionRatio, angleOfAttackDeg } = shape
  const camber = camberForDrag(shape)

  // Profile drag baseline
  let cd0 = 0.015

  // Camber penalty: optimal range 0.08-0.12; excess adds drag
  const CAMBER_OPT = 0.10
  if (camber > CAMBER_OPT) {
    cd0 += (camber - CAMBER_OPT) * 0.6  // +0.006 per 0.01 excess camber
  } else if (camber < CAMBER_OPT) {
    // A flat sail costs lift, not drag — only a token friction term here.
    // (Flattening is the correct heavy-air response; the price is paid in Cl.)
    cd0 += (CAMBER_OPT - camber) * 0.05
  }

  // Draft position penalty: optimal 0.40-0.50; aft draft ↑ leech drag
  const DRAFT_OPT = 0.45
  const draftDeviation = Math.abs(draftPositionRatio - DRAFT_OPT)
  cd0 += draftDeviation * 0.12

  // Open-shelf drag: foot cloth fuller than the boarded-flat shape rounds
  // the lower leech and, opened further, becomes a shape discontinuity —
  // the shelf seam runs a separated pocket and the bulge squeezes the slot
  // against the genoa. Quadratic from just below neutral so a slightly
  // eased foot is nearly free (light-air power) but a fully open shelf
  // costs real drag — no one sails upwind in a breeze with the shelf open —
  // and boarding the foot out flat is always worth a token drag saving.
  cd0 += 0.20 * Math.max(0, shape.footFullnessRatio - 0.9) ** 2

  // Flogging drag: below ~2° the entry backwinds and the cloth starts to
  // flail — a luffing sail is not a clean zero-drag flag, it beats and
  // bangs and drags the rig through the air. Grows with how far backwinded.
  if (angleOfAttackDeg < 2) {
    cd0 += Math.min(0.12, (2 - angleOfAttackDeg) * 0.015)
  }

  // Separation drag: grows quadratically from 12° AoA toward stall, capped
  // at the flat-plate pressure-drag ceiling (CN·sin²α ≈ 1.2 square to the
  // flow) so deep-stall Cd lands where the ORC tables put a run (~1.3).
  const SEP_ONSET_DEG = 12
  if (angleOfAttackDeg > SEP_ONSET_DEG) {
    cd0 += Math.min(0.24 * ((angleOfAttackDeg - SEP_ONSET_DEG) / 8) ** 2, 1.215)
  }

  // Induced drag: Cdi = Cl² / (π × AR × e), AR and e per sail (see SailAeroParams)
  const cdi = (cl * cl) / (Math.PI * params.aspectRatio * params.oswald)

  return clamp(cd0 + cdi, 0.010, 1.600)
}

// ---------------------------------------------------------------------------
// Genoa blanketing (downwind)
// ---------------------------------------------------------------------------

/**
 * Sailing deep, the mainsail sits between the wind and the genoa and takes
 * its air — without a pole the headsail hangs half-collapsed in the main's
 * wake. Linear fade from full effectiveness at AWA 120° down to 45 % at
 * 170°. (Any sailing text on wing-on-wing / poling out; qualitative.)
 */
export function genoaBlanketFactor(apparentWindAngleDeg: number): number {
  if (apparentWindAngleDeg <= 120) return 1
  return 1 - 0.55 * Math.min(1, (apparentWindAngleDeg - 120) / 50)
}

/** Scale a genoa's coefficients by the blanket factor (force ∝ factor). */
export function applyGenoaBlanketing(
  aero: AeroCoefficients,
  wind: WindState,
): AeroCoefficients {
  const f = genoaBlanketFactor(wind.apparentWindAngleDeg)
  if (f >= 1) return aero
  const cl = aero.cl * f
  const cd = aero.cd * f
  return { cl, cd, efficiency: cd > 0 ? cl / cd : 0 }
}

// ---------------------------------------------------------------------------
// Local flow state (telltale behaviour)
// ---------------------------------------------------------------------------

export type FlowRegime = 'luffing' | 'attached' | 'separated'

export interface LocalFlow {
  regime: FlowRegime
  /** Effective local angle of attack at this height, degrees */
  localAoADeg: number
}

/**
 * Apparent wind twist aloft: the wind gradient means the apparent wind is
 * stronger and further aft at the masthead than at the boom. Roughly 4° in
 * light air, up to 10° in a breeze. (Source: Marchaj ch.2 — wind gradient
 * and apparent wind twist.) This is exactly why sails need twist.
 */
function apparentWindTwistAloft(trueWindSpeedKts: number): number {
  const t = clamp((trueWindSpeedKts - 6) / 19, 0, 1)
  return 4 + t * 6
}

/**
 * Flow regime at a given height fraction u (0 = foot, 1 = head).
 *
 * The local AoA is the sail's overall AoA, reduced aloft by sail twist and
 * increased aloft by the apparent-wind twist. Telltales read this directly:
 *  - localAoA < 4°  → luffing: flow pushes on the leeward side of the entry;
 *    WINDWARD telltales lift and dance.
 *  - localAoA > 19° → separated: leeward boundary layer detaches;
 *    LEEWARD telltales stall, droop and swirl.
 *  - otherwise      → attached: both telltales stream aft.
 *
 * (Thresholds match baseCl regions: luffing below the 5° knee, separation
 * just short of the 20° stall peak — real leeward telltales break before
 * the whole sail stalls.)
 */
export function computeLocalFlow(shape: SailShape, wind: WindState, u: number): LocalFlow {
  const localAoADeg =
    shape.angleOfAttackDeg
    - u * shape.twistDeg
    + u * apparentWindTwistAloft(wind.trueWindSpeedKts)

  let regime: FlowRegime = 'attached'
  if (localAoADeg < 4) regime = 'luffing'
  else if (localAoADeg > 19) regime = 'separated'

  return { regime, localAoADeg }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeAeroCoefficients(
  shape: SailShape,
  wind: WindState,
  params: SailAeroParams = MAINSAIL_AERO,
): AeroCoefficients {
  // Camber only converts to lift while the sail is actually flying: fade
  // its contribution out below the 5° knee so a luffing/backwinded sail
  // (AoA ≤ 0) carries no camber lift — flogging cloth has no stable shape.
  const camberFade = clamp(shape.angleOfAttackDeg / 5, 0, 1)
  const clBase = baseCl(shape.angleOfAttackDeg) + camberClDelta(camberForLift(shape)) * camberFade
  const twistFactor = twistPenaltyFactor(shape.twistDeg, wind.trueWindSpeedKts)
  const cl = clamp(clBase * twistFactor, 0, 2.0)

  const cd = computeCd(shape, cl, params)
  const efficiency = cd > 0 ? cl / cd : 0

  return { cl, cd, efficiency }
}

// Export internals for testing
export { optimalTwistDeg, baseCl, twistPenaltyFactor, camberClDelta, apparentWindTwistAloft }
