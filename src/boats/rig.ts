/**
 * rig.ts — Rig proportions derived from ORC certificate data.
 *
 * The public certificate (data.orc.org DownBoatRMS) carries real sail AREAS
 * (Area_Main, Area_Jib) and hull dimensions (LOA), but NOT the rig
 * measurements (P, E, J, IG) — those live in the full certificate PDF and
 * the DXT measurement files, which are not published through the API.
 *
 * So this module splits cleanly in two kinds of numbers:
 *
 *  - mainAreaFrac is EXACT: the main's share of upwind cloth, straight from
 *    the certificate areas.
 *  - Everything else is an ESTIMATE built on one empirical bridge,
 *    P ≈ 1.28 × LOA (mainsail hoist vs length overall; modern cruiser-racers
 *    span ~1.15-1.40 — TP52 1.34, Swan 42 1.37, Dufour 34 1.23). From that
 *    estimated hoist and the real areas follow aspect ratios and genoa
 *    overlap. Good enough to make a blade-jib racer look and behave unlike
 *    a genoa cruiser; NOT a reconstruction of any boat's actual sail plan.
 *
 * All outputs are clamped to sane ranges so a certificate with unusual
 * numbers degrades toward the defaults instead of producing a caricature.
 */

import type { BoatModel } from './types'

export interface RigGeometry {
  /** Main's share of upwind area (main + jib), 0-1. Exact when areas known. */
  mainAreaFrac: number
  /** Induced-drag aspect ratio (span²/area) of the mainsail. Estimated. */
  mainAspectRatio: number
  /** Induced-drag aspect ratio of the jib/genoa. Estimated. */
  genoaAspectRatio: number
  /** Genoa overlap, LP/J. 1.0 ≈ non-overlapping blade, 1.4+ ≈ big genoa. */
  genoaOverlapRatio: number
  /** Visual scale of the main's foot chord, 1 = the default hull. */
  mainChordScale: number
}

/** Matches the historical hard-coded values (performance.ts, aerodynamics.ts,
 *  SailVisualization3D.vue) so boats without certificate data are unchanged. */
export const DEFAULT_RIG: RigGeometry = {
  mainAreaFrac: 0.55,
  mainAspectRatio: 5,
  genoaAspectRatio: 4.5,
  genoaOverlapRatio: 1.28,
  mainChordScale: 1,
}

// Empirical bridges from the data we have to the dimensions we don't.
const HOIST_PER_LOA = 1.28   // P ≈ 1.28 × LOA (see module header)
const GENOA_SPAN_FRAC = 0.93 // genoa luff span ≈ 0.93 × P (fractional hounds)
const J_PER_LOA = 0.38       // foretriangle base J ≈ 0.38 × LOA

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Derive rig proportions from a boat's certificate data, falling back to
 * DEFAULT_RIG per field when the inputs are missing.
 */
export function deriveRig(boat: BoatModel): RigGeometry {
  const { areaMainM2: main, areaJibM2: jib, loaM: loa } = boat

  const rig = { ...DEFAULT_RIG }

  if (main !== null && jib !== null && main > 0 && jib > 0) {
    rig.mainAreaFrac = clamp(main / (main + jib), 0.40, 0.70)
  }

  if (loa !== null && loa > 0 && main !== null && main > 0) {
    const hoist = HOIST_PER_LOA * loa
    rig.mainAspectRatio = clamp((hoist * hoist) / main, 3.5, 6.5)
    // Visual AR is height/chord with a fixed on-screen height, so the foot
    // chord scales inversely with the estimated aspect ratio.
    rig.mainChordScale = clamp(DEFAULT_RIG.mainAspectRatio / rig.mainAspectRatio, 0.8, 1.25)

    if (jib !== null && jib > 0) {
      const genoaSpan = GENOA_SPAN_FRAC * hoist
      rig.genoaAspectRatio = clamp((genoaSpan * genoaSpan) / jib, 3.0, 7.0)
      // Genoa area ≈ ½ × luff × LP → LP ≈ 2·area/luff; overlap = LP/J.
      const lp = (2 * jib) / genoaSpan
      rig.genoaOverlapRatio = clamp(lp / (J_PER_LOA * loa), 1.0, 1.45)
    }
  }

  return rig
}
