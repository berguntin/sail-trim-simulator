/**
 * headsails.ts — Headsail wardrobe derived from ORC certificate data.
 *
 * The public certificate (data.orc.org DownBoatRMS) rates ONE headsail:
 * Area_Jib, the largest jib/genoa the boat measures with. A real inventory
 * carries several: the rated sail plus the smaller flatter jibs the crew
 * changes down to as the breeze builds. Those aren't published through the
 * API, so this module derives a REPRESENTATIVE wardrobe from the rated sail
 * the same way a sailmaker would quote one — by target LP (the ORC "% of J"
 * a sail class is named after):
 *
 *   - the certificate sail itself (a genoa when its LP/J ≥ 115 %, otherwise
 *     already a non-overlapping jib),
 *   - a working jib at LP ≈ 105 % of J (only when the rated sail overlaps —
 *     otherwise it would duplicate it),
 *   - a heavy-weather jib at LP ≈ 85 % of J with a shortened luff and a
 *     high-cut clew.
 *
 * Everything a sail needs to BEHAVE like itself follows from those targets
 * and the rig estimates in rig.ts:
 *   - areaRatio (½·luff·LP scaling) drives the rig's power fraction and the
 *     main's share of upwind area,
 *   - aspect ratio (luff²/area) drives induced drag,
 *   - the trim params (camber range, inboard sheeting limit) come from the
 *     sail's category — a genoa is cut full and sheets outside the shrouds,
 *     a blade jib is flat and sheets close,
 *   - luffFrac / clewRise are the visual cues the 3D view draws.
 */

import type { BoatModel } from './types'
import type { HeadsailTrimParams } from '../physics/types'
import { deriveRig } from './rig'

export interface Headsail {
  /** Stable id within the wardrobe (also the <select>/button value) */
  id: string
  /** Display name, e.g. "Genoa 138%" — the percentage is LP/J */
  name: string
  /** Short label for stat overlays and table headings */
  shortName: string
  /** One-line description shown in the sail picker */
  description: string
  /** Sail area in m², when the certificate area is known */
  areaM2: number | null
  /** Area relative to the certificate's rated headsail, 0-1 */
  areaRatio: number
  /** LP/J — drives the foot chord (overlap) drawn by the 3D view */
  overlapRatio: number
  /** Luff length relative to the rated sail's (heavy jib hoists short) */
  luffFrac: number
  /** Extra clew height for the 3D view, scene metres (high-cut heavy jib) */
  clewRise: number
  /** Induced-drag aspect ratio (luff²/area) */
  aspectRatio: number
  /** Shape/trim characteristics the physics reads */
  trim: HeadsailTrimParams
}

// Trim characteristics per sail category. The genoa values match the
// historical hard-coded genoa physics (genoaShape.ts DEFAULT_HEADSAIL_TRIM);
// jibs are cut flatter (less sag-depth to give back) and sheet closer
// inboard (the lead track fits inside the shrouds once the clew stops
// overlapping the rig). Heavy-weather cloth is flatter still, but its
// high clew sheets a touch further out than a deck-sweeping blade.
const GENOA_TRIM: HeadsailTrimParams = {
  camberSlackRatio: 0.16,
  camberTightRatio: 0.08,
  minSheetAngleDeg: 13,
  windStretchCamber: 0.030,
}
const JIB_TRIM: HeadsailTrimParams = {
  camberSlackRatio: 0.135,
  camberTightRatio: 0.07,
  minSheetAngleDeg: 10,
  windStretchCamber: 0.015,
}
const HEAVY_JIB_TRIM: HeadsailTrimParams = {
  camberSlackRatio: 0.11,
  camberTightRatio: 0.06,
  minSheetAngleDeg: 11,
  windStretchCamber: 0.006,
}

/** A sail overlapping past this LP/J reads (and trims) as a genoa. */
const GENOA_OVERLAP_MIN = 1.15
/** Rated sails this close to the working-jib target make it redundant. */
const WORKING_JIB_MIN_GAP = 1.12

const WORKING_JIB_LP = 1.05
const HEAVY_JIB_LP = 0.85
const HEAVY_JIB_LUFF_FRAC = 0.82
/** Scene metres — matches the 3D view's clew-rise scale (GENOA_CLEW_RISE_*). */
const HEAVY_JIB_CLEW_RISE = 0.85

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function trimFor(overlapRatio: number, heavy: boolean): HeadsailTrimParams {
  if (heavy) return HEAVY_JIB_TRIM
  return overlapRatio >= GENOA_OVERLAP_MIN ? GENOA_TRIM : JIB_TRIM
}

/**
 * Derive the headsail wardrobe for a boat. Always returns at least the
 * certificate's rated sail (first) and a heavy-weather jib (last); an
 * intermediate working jib appears when the rated sail is an overlapping
 * genoa. The first entry is the default selection — it is the sail the
 * certificate polar was rated with.
 */
export function deriveHeadsails(boat: BoatModel): Headsail[] {
  const rig = deriveRig(boat)
  const certLP = rig.genoaOverlapRatio
  const certAR = rig.genoaAspectRatio
  const certArea = boat.areaJibM2

  /** Build one sail from its LP target and luff fraction (cert sail = 1, 1). */
  function make(
    id: string,
    targetLP: number,
    luffFrac: number,
    clewRise: number,
    heavy: boolean,
    description: string,
  ): Headsail {
    const lpRatio = targetLP / certLP
    // Triangle area ≈ ½ · luff · LP → area scales with both
    const areaRatio = lpRatio * luffFrac
    // AR = luff²/area → scales by luffFrac² / areaRatio = luffFrac / lpRatio
    const aspectRatio = clamp((certAR * luffFrac) / lpRatio, 3.0, 7.5)
    const trim = trimFor(targetLP, heavy)
    const isGenoa = !heavy && targetLP >= GENOA_OVERLAP_MIN
    const pct = Math.round(targetLP * 100)
    return {
      id,
      name: `${isGenoa ? 'Genoa' : heavy ? 'Heavy jib' : 'Jib'} ${pct}%`,
      shortName: isGenoa ? 'Genoa' : heavy ? 'Heavy jib' : 'Jib',
      description,
      areaM2: certArea !== null ? certArea * areaRatio : null,
      areaRatio,
      overlapRatio: targetLP,
      luffFrac,
      clewRise,
      aspectRatio,
      trim,
    }
  }

  const certIsGenoa = certLP >= GENOA_OVERLAP_MIN
  const sails: Headsail[] = [
    make(
      'certificate', certLP, 1, 0, false,
      certIsGenoa
        ? 'Rated headsail (génova) — full cut, maximum power, light-medium air'
        : 'Rated headsail (foque) — non-overlapping blade, flat cut',
    ),
  ]

  if (certLP >= WORKING_JIB_MIN_GAP) {
    sails.push(make(
      'working-jib', WORKING_JIB_LP, 0.97, 0.10, false,
      'Working jib (foque) — flatter cut, sheets inboard, for a building breeze',
    ))
  }

  sails.push(make(
    'heavy-jib', HEAVY_JIB_LP, HEAVY_JIB_LUFF_FRAC, HEAVY_JIB_CLEW_RISE, true,
    'Heavy-weather jib (foque de tiempo duro) — small, flat, high-clewed',
  ))

  return sails
}
