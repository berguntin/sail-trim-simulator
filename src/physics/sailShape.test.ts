import { describe, it, expect } from 'vitest'
import {
  computeSailShape,
  mainBoomAngleDeg,
  MAX_BOOM_ANGLE_DEG,
  MIN_BOOM_ANGLE_DEG,
} from './sailShape'
import type { TrimControls, WindState } from './types'

const DEFAULT_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }

const NEUTRAL_CONTROLS: TrimControls = {
  mainsheet: 50,
  traveler: 0,
  cunningham: 0,
  backstay: 0,
  outhaul: 50,
}

describe('sailShape — boom angle (boat frame)', () => {
  it('the sheet swings the boom through its full arc, independent of the wind', () => {
    expect(mainBoomAngleDeg({ mainsheet: 0, traveler: 0 })).toBe(MAX_BOOM_ANGLE_DEG)
    expect(mainBoomAngleDeg({ mainsheet: 100, traveler: 0 })).toBe(0)
  })

  it('the traveler shifts the boom ±8° and can drag it past the centreline', () => {
    expect(mainBoomAngleDeg({ mainsheet: 100, traveler: 50 })).toBe(MIN_BOOM_ANGLE_DEG)
    expect(mainBoomAngleDeg({ mainsheet: 50, traveler: -50 })).toBeCloseTo(42.5 + 8)
  })
})

describe('sailShape — angle of attack', () => {
  it('windward traveler (+50) produces higher AoA than centered traveler (0)', () => {
    const centered = computeSailShape(NEUTRAL_CONTROLS, DEFAULT_WIND)
    const windward = computeSailShape({ ...NEUTRAL_CONTROLS, traveler: 50 }, DEFAULT_WIND)
    expect(windward.angleOfAttackDeg).toBeGreaterThan(centered.angleOfAttackDeg)
  })

  it('leeward traveler (-50) produces lower AoA than centered traveler (0)', () => {
    const centered = computeSailShape(NEUTRAL_CONTROLS, DEFAULT_WIND)
    const leeward = computeSailShape({ ...NEUTRAL_CONTROLS, traveler: -50 }, DEFAULT_WIND)
    expect(leeward.angleOfAttackDeg).toBeLessThan(centered.angleOfAttackDeg)
  })

  it('mainsheet fully trimmed (100) vs fully eased (0) — trimmed AoA should be higher', () => {
    const eased = computeSailShape({ ...NEUTRAL_CONTROLS, mainsheet: 0 }, DEFAULT_WIND)
    const trimmed = computeSailShape({ ...NEUTRAL_CONTROLS, mainsheet: 100 }, DEFAULT_WIND)
    expect(trimmed.angleOfAttackDeg).toBeGreaterThan(eased.angleOfAttackDeg)
  })
})

describe('sailShape — the wind does not re-trim the sail', () => {
  // Beat trim: boom ≈ 13° off centreline
  const BEAT_TRIM: TrimControls = { ...NEUTRAL_CONTROLS, mainsheet: 85 }
  const aoaAt = (awa: number, controls: TrimControls = BEAT_TRIM) =>
    computeSailShape(controls, { trueWindSpeedKts: 12, apparentWindAngleDeg: awa }).angleOfAttackDeg

  it('with the controls cleated, the AoA follows the AWA one-for-one', () => {
    expect(aoaAt(45) - aoaAt(30)).toBeCloseTo(15)
  })

  it('bearing away with the sheet pinned drives the sail past stall', () => {
    expect(aoaAt(30)).toBeGreaterThan(5)
    expect(aoaAt(30)).toBeLessThan(20)      // working range on the beat
    expect(aoaAt(70)).toBeGreaterThan(35)   // deep stall — no one eased
  })

  it('heading up with the sheet eased backwinds the sail (negative AoA = luffing)', () => {
    const eased: TrimControls = { ...NEUTRAL_CONTROLS, mainsheet: 20 } // boom 68°
    expect(aoaAt(30, eased)).toBeLessThan(0)
  })
})

describe('sailShape — twist', () => {
  it('mainsheet trimmed (100) produces clearly less twist than eased (0)', () => {
    const eased = computeSailShape({ ...NEUTRAL_CONTROLS, mainsheet: 0 }, DEFAULT_WIND)
    const trimmed = computeSailShape({ ...NEUTRAL_CONTROLS, mainsheet: 100 }, DEFAULT_WIND)
    // "Clearly less" = at least 5° difference
    expect(eased.twistDeg - trimmed.twistDeg).toBeGreaterThanOrEqual(5)
  })

  it('high TWS (22 kts) produces more twist than low TWS (8 kts) at same controls', () => {
    const lowWind: WindState = { trueWindSpeedKts: 8, apparentWindAngleDeg: 30 }
    const highWind: WindState = { trueWindSpeedKts: 22, apparentWindAngleDeg: 30 }
    const atLow = computeSailShape(NEUTRAL_CONTROLS, lowWind)
    const atHigh = computeSailShape(NEUTRAL_CONTROLS, highWind)
    expect(atHigh.twistDeg).toBeGreaterThan(atLow.twistDeg)
  })

  it('backstay tension increases twist (opens upper leech)', () => {
    const noBackstay = computeSailShape({ ...NEUTRAL_CONTROLS, backstay: 0 }, DEFAULT_WIND)
    const fullBackstay = computeSailShape({ ...NEUTRAL_CONTROLS, backstay: 100 }, DEFAULT_WIND)
    expect(fullBackstay.twistDeg).toBeGreaterThan(noBackstay.twistDeg)
  })
})

describe('sailShape — draft position', () => {
  it('cunningham at max (100) places draft more forward than cunningham at 0', () => {
    const noCunningham = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 0 }, DEFAULT_WIND)
    const fullCunningham = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 100 }, DEFAULT_WIND)
    expect(fullCunningham.draftPositionRatio).toBeLessThan(noCunningham.draftPositionRatio)
  })

  it('more wind drags the draft aft at the same cunningham setting', () => {
    const light = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 30 },
      { trueWindSpeedKts: 6, apparentWindAngleDeg: 28 })
    const heavy = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 30 },
      { trueWindSpeedKts: 25, apparentWindAngleDeg: 35 })
    expect(heavy.draftPositionRatio).toBeGreaterThan(light.draftPositionRatio)
  })

  it('backstay (mast bend) shifts the draft aft — the cunningham interplay', () => {
    const noBend = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 30, backstay: 0 }, DEFAULT_WIND)
    const fullBend = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 30, backstay: 100 }, DEFAULT_WIND)
    expect(fullBend.draftPositionRatio).toBeGreaterThan(noBend.draftPositionRatio)
    // and cunningham can pull it back forward
    const compensated = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 90, backstay: 100 }, DEFAULT_WIND)
    expect(compensated.draftPositionRatio).toBeLessThan(fullBend.draftPositionRatio)
  })
})

describe('sailShape — camber', () => {
  it('backstay at max (100) produces a flatter sail than backstay at 0', () => {
    const noBackstay = computeSailShape({ ...NEUTRAL_CONTROLS, backstay: 0 }, DEFAULT_WIND)
    const fullBackstay = computeSailShape({ ...NEUTRAL_CONTROLS, backstay: 100 }, DEFAULT_WIND)
    expect(fullBackstay.camberRatio).toBeLessThan(noBackstay.camberRatio)
  })

  it('cunningham tension slightly reduces camber', () => {
    const noCunn = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 0 }, DEFAULT_WIND)
    const fullCunn = computeSailShape({ ...NEUTRAL_CONTROLS, cunningham: 100 }, DEFAULT_WIND)
    expect(fullCunn.camberRatio).toBeLessThanOrEqual(noCunn.camberRatio)
  })

  it('outhaul leaves the mid/upper camber alone — its depth lives in footFullness', () => {
    // The aero folds footFullnessRatio into the effective camber
    // (aerodynamics camberForLift/camberForDrag); feeding the outhaul into
    // camberRatio as well double-counted it in the 3D view and made it a
    // weak duplicate of the backstay.
    const eased = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 0 }, DEFAULT_WIND)
    const tensioned = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 100 }, DEFAULT_WIND)
    expect(tensioned.camberRatio).toBe(eased.camberRatio)
  })
})

describe('sailShape — foot fullness (outhaul)', () => {
  it('eased outhaul (0) gives a deep foot, max tension (100) a flat one', () => {
    const eased = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 0 }, DEFAULT_WIND)
    const tensioned = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 100 }, DEFAULT_WIND)
    expect(eased.footFullnessRatio).toBeGreaterThan(1)
    expect(tensioned.footFullnessRatio).toBeLessThan(1)
    expect(eased.footFullnessRatio).toBeGreaterThan(tensioned.footFullnessRatio)
  })

  it('mid outhaul (50) is neutral', () => {
    const mid = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 50 }, DEFAULT_WIND)
    expect(mid.footFullnessRatio).toBeCloseTo(1.0, 5)
  })

  it('outhaul does not affect twist or angle of attack', () => {
    const eased = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 0 }, DEFAULT_WIND)
    const tensioned = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 100 }, DEFAULT_WIND)
    expect(eased.twistDeg).toBe(tensioned.twistDeg)
    expect(eased.angleOfAttackDeg).toBe(tensioned.angleOfAttackDeg)
  })
})

describe('sailShape — off the wind (boom limit)', () => {
  const RUN_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 150 }

  it('deep downwind the boom limit forces the sail past stall', () => {
    // Even fully eased, AoA ≥ AWA − 85° → deep-stall drag regime
    const eased = computeSailShape(
      { ...NEUTRAL_CONTROLS, mainsheet: 0, traveler: -50 }, RUN_WIND)
    expect(eased.angleOfAttackDeg).toBeGreaterThanOrEqual(150 - 85)
  })

  it('AoA never exceeds 90° nor AWA − MIN_BOOM (boom pinned to windward)', () => {
    const strangled = computeSailShape(
      { ...NEUTRAL_CONTROLS, mainsheet: 100, traveler: 50 }, RUN_WIND)
    expect(strangled.angleOfAttackDeg).toBeLessThanOrEqual(90)
    const upwind = computeSailShape(
      { ...NEUTRAL_CONTROLS, mainsheet: 100, traveler: 50 },
      { trueWindSpeedKts: 12, apparentWindAngleDeg: 22 })
    expect(upwind.angleOfAttackDeg).toBeLessThanOrEqual(22 - MIN_BOOM_ANGLE_DEG)
  })
})

describe('sailShape — output range invariants', () => {
  const winds: WindState[] = [
    { trueWindSpeedKts: 6, apparentWindAngleDeg: 28 },
    { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 },
    { trueWindSpeedKts: 18, apparentWindAngleDeg: 32 },
    { trueWindSpeedKts: 25, apparentWindAngleDeg: 35 },
  ]
  const controls: TrimControls[] = [
    { mainsheet: 0, traveler: -50, cunningham: 0, backstay: 0, outhaul: 0 },
    { mainsheet: 50, traveler: 0, cunningham: 50, backstay: 50, outhaul: 50 },
    { mainsheet: 100, traveler: 50, cunningham: 100, backstay: 100, outhaul: 100 },
    { mainsheet: 20, traveler: 30, cunningham: 80, backstay: 10, outhaul: 90 },
    { mainsheet: 75, traveler: -30, cunningham: 10, backstay: 90, outhaul: 15 },
  ]

  for (const w of winds) {
    for (const c of controls) {
      it(`valid ranges for mainsheet=${c.mainsheet} traveler=${c.traveler} TWS=${w.trueWindSpeedKts}`, () => {
        const s = computeSailShape(c, w)
        expect(s.twistDeg).toBeGreaterThanOrEqual(5)
        expect(s.twistDeg).toBeLessThanOrEqual(25)
        // Negative AoA = luffing (eased sheet upwind); floor at −30
        expect(s.angleOfAttackDeg).toBeGreaterThanOrEqual(-30)
        expect(s.angleOfAttackDeg).toBeLessThanOrEqual(90)
        expect(s.camberRatio).toBeGreaterThanOrEqual(0.05)
        expect(s.camberRatio).toBeLessThanOrEqual(0.18)
        expect(s.draftPositionRatio).toBeGreaterThanOrEqual(0.30)
        expect(s.draftPositionRatio).toBeLessThanOrEqual(0.60)
        expect(s.footFullnessRatio).toBeGreaterThanOrEqual(0.70)
        expect(s.footFullnessRatio).toBeLessThanOrEqual(1.30)
      })
    }
  }
})

describe('sailShape — purity', () => {
  it('same inputs always produce same outputs', () => {
    const result1 = computeSailShape(NEUTRAL_CONTROLS, DEFAULT_WIND)
    const result2 = computeSailShape(NEUTRAL_CONTROLS, DEFAULT_WIND)
    expect(result1).toEqual(result2)
  })
})
