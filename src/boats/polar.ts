/**
 * polar.ts — ORC polar interpolation and boat-derived physics tuning.
 *
 * All functions are pure. Interpolation is linear and clamped at the grid
 * edges (ORC allowances cover 4-24 kts; the simulator's wind slider may go
 * slightly beyond — we hold the edge value rather than extrapolate).
 */

import type { OrcPolar } from './types'
import type { BoatTuning } from '../physics/types'

/** ORC allowances are seconds per nautical mile; speed in knots = 3600 / s. */
export function allowanceToKts(secondsPerMile: number): number {
  return secondsPerMile > 0 ? 3600 / secondsPerMile : 0
}

/** Clamped linear interpolation of ys over ascending xs. */
export function interp1(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  for (let i = 0; i < xs.length - 1; i++) {
    if (x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i])
      return ys[i] + t * (ys[i + 1] - ys[i])
    }
  }
  return ys[ys.length - 1]
}

/** Optimum beat angle (degrees from true wind) at the given wind speed. */
export function beatAngleDeg(polar: OrcPolar, twsKts: number): number {
  return interp1(polar.windSpeedsKts, polar.beatAnglesDeg, twsKts)
}

/** Optimum upwind VMG (knots) at the given wind speed. */
export function beatVMGKts(polar: OrcPolar, twsKts: number): number {
  return interp1(polar.windSpeedsKts, polar.beatVMGKts, twsKts)
}

/** Boat speed through the water on the optimum beat: VMG / cos(beat angle). */
export function beatSpeedKts(polar: OrcPolar, twsKts: number): number {
  const angleRad = (beatAngleDeg(polar, twsKts) * Math.PI) / 180
  const cos = Math.cos(angleRad)
  return cos > 0 ? beatVMGKts(polar, twsKts) / cos : 0
}

/**
 * Target boat speed at an arbitrary true wind angle/speed, bilinear over the
 * polar grid, clamped at the edges.
 */
export function targetSpeedKts(polar: OrcPolar, twaDeg: number, twsKts: number): number {
  const columns = polar.windAnglesDeg.map((_, i) =>
    interp1(polar.windSpeedsKts, polar.speedsKts[i], twsKts),
  )
  return interp1(polar.windAnglesDeg, columns, twaDeg)
}

/** Optimum gybe (downwind) angle at the given wind speed. */
export function gybeAngleDeg(polar: OrcPolar, twsKts: number): number {
  return interp1(polar.windSpeedsKts, polar.gybeAnglesDeg, twsKts)
}

/** Boat speed through the water on the optimum run: VMG / cos(180° − gybe angle). */
export function runSpeedKts(polar: OrcPolar, twsKts: number): number {
  const vmg = interp1(polar.windSpeedsKts, polar.runVMGKts, twsKts)
  const cos = Math.cos(((180 - gybeAngleDeg(polar, twsKts)) * Math.PI) / 180)
  return cos > 0 ? vmg / cos : vmg
}

/**
 * Target boat speed for an arbitrary COURSE (true wind angle), anchoring the
 * ends of the ORC grid (52-150°) with the certificate's own optima:
 *
 *  - below 52° the grid has no rows, but the beat optimum (angle + VMG) is a
 *    real point on the polar — interpolate grid ↔ beat, clamp tighter than
 *    the beat angle (pinching is not modelled);
 *  - above 150° append the run optimum (gybe angle + run VMG) when the gybe
 *    angle lies beyond the grid, clamp deeper than it.
 */
export function courseTargetSpeedKts(polar: OrcPolar, twaDeg: number, twsKts: number): number {
  const xs: number[] = [beatAngleDeg(polar, twsKts)]
  const ys: number[] = [beatSpeedKts(polar, twsKts)]

  for (let i = 0; i < polar.windAnglesDeg.length; i++) {
    if (polar.windAnglesDeg[i] <= xs[xs.length - 1]) continue
    xs.push(polar.windAnglesDeg[i])
    ys.push(interp1(polar.windSpeedsKts, polar.speedsKts[i], twsKts))
  }

  const gybeA = gybeAngleDeg(polar, twsKts)
  if (gybeA > xs[xs.length - 1]) {
    xs.push(gybeA)
    ys.push(runSpeedKts(polar, twsKts))
  }

  return interp1(xs, ys, twaDeg)
}

/**
 * Apparent wind angle sailing the polar target speed on the given course —
 * what the trim simulator presents to the sails at any wind angle.
 */
export function courseApparentWindAngleDeg(
  polar: OrcPolar,
  twsKts: number,
  twaDeg: number,
): number {
  return apparentWindAngleDeg(twsKts, twaDeg, courseTargetSpeedKts(polar, twaDeg, twsKts))
}

/**
 * Apparent wind angle from the true wind triangle:
 * boat moving at boatSpeedKts, true wind twsKts at twaDeg off the bow.
 */
export function apparentWindAngleDeg(
  twsKts: number,
  twaDeg: number,
  boatSpeedKts: number,
): number {
  const twaRad = (twaDeg * Math.PI) / 180
  const ax = twsKts * Math.cos(twaRad) + boatSpeedKts // along heading
  const ay = twsKts * Math.sin(twaRad) // abeam
  return (Math.atan2(ay, ax) * 180) / Math.PI
}

/**
 * Apparent wind angle sailing the optimum beat at the given wind speed —
 * the AWA the trim simulator should present to the sail. Real polars give
 * ≈22° (big fast boats, light air) to ≈35° (small boats, heavy air), which
 * sits inside the aerodynamic model's valid upwind range.
 */
export function upwindApparentWindAngleDeg(polar: OrcPolar, twsKts: number): number {
  return apparentWindAngleDeg(twsKts, beatAngleDeg(polar, twsKts), beatSpeedKts(polar, twsKts))
}

// ---------------------------------------------------------------------------
// Boat-derived physics tuning
// ---------------------------------------------------------------------------

/**
 * Power saturation: how much upwind boat speed the boat still gains from
 * 12 → 20 kts TWS, relative to what it gained from 6 → 12 kts.
 *
 * ORC polars encode righting moment through the VPP: a stiff, powerful boat
 * (big crew weight on the rail, heavy bulb) keeps converting wind into speed
 * in a breeze, while a light sportboat hits its heel limit early and its
 * upwind speed curve flattens. Measured on real 2026 certificates:
 * Platu 25 ≈ 0.12, J/80 ≈ 0.15, Dufour 34 ≈ 0.16, X-35 ≈ 0.18,
 * First 36.7 ≈ 0.21, Swan 42 ≈ 0.21.
 */
export function powerSaturation(polar: OrcPolar): number {
  const v6 = beatSpeedKts(polar, 6)
  const v12 = beatSpeedKts(polar, 12)
  const v20 = beatSpeedKts(polar, 20)
  const earlyGain = v12 - v6
  if (earlyGain <= 0) return 0
  return Math.max(0, (v20 - v12) / earlyGain)
}

/**
 * Map the polar's power saturation to the trim-score heel comfort fraction.
 *
 * Boats that saturate early (sportboats) must depower sooner → lower comfort
 * fraction; stiff boats carry full power longer → higher. The mapping spans
 * sat 0.10-0.22 → comfort 0.30-0.50, chosen so the preset fleet lands where
 * the original single-boat model put a "typical keelboat" (0.40): with the
 * default 12 kts the optimal trim stays powered for every boat, and the wind
 * speed where the optimizer starts flattening ranges ~13 kts (Platu 25) to
 * ~18 kts (Swan 42).
 */
export function boatTuning(polar: OrcPolar): Pick<BoatTuning, 'heelComfortFrac'> {
  const sat = powerSaturation(polar)
  const frac = 0.30 + ((sat - 0.10) / 0.12) * 0.20
  return { heelComfortFrac: Math.min(0.52, Math.max(0.28, frac)) }
}
