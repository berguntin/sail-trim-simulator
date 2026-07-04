import { describe, it, expect } from 'vitest'
import { computeSailShape } from './sailShape'
import type { TrimControls, WindState } from './types'

const DEFAULT_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }

const NEUTRAL_CONTROLS: TrimControls = {
  mainsheet: 50,
  traveler: 0,
  cunningham: 0,
  backstay: 0,
  outhaul: 50,
}

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

  it('outhaul tension reduces mean camber', () => {
    const eased = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 0 }, DEFAULT_WIND)
    const tensioned = computeSailShape({ ...NEUTRAL_CONTROLS, outhaul: 100 }, DEFAULT_WIND)
    expect(tensioned.camberRatio).toBeLessThan(eased.camberRatio)
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

  it('AoA never exceeds 90° nor AWA + 5°', () => {
    const strangled = computeSailShape(
      { ...NEUTRAL_CONTROLS, mainsheet: 100, traveler: 50 }, RUN_WIND)
    expect(strangled.angleOfAttackDeg).toBeLessThanOrEqual(90)
    const upwind = computeSailShape(
      { ...NEUTRAL_CONTROLS, mainsheet: 100, traveler: 50 },
      { trueWindSpeedKts: 12, apparentWindAngleDeg: 22 })
    expect(upwind.angleOfAttackDeg).toBeLessThanOrEqual(22 + 5)
  })

  it('the mainsheet has more angle authority on a run than on a beat', () => {
    const swingAt = (wind: WindState) =>
      computeSailShape({ ...NEUTRAL_CONTROLS, mainsheet: 100 }, wind).angleOfAttackDeg -
      computeSailShape({ ...NEUTRAL_CONTROLS, mainsheet: 0 }, wind).angleOfAttackDeg
    expect(swingAt(RUN_WIND)).toBeGreaterThan(swingAt(DEFAULT_WIND) * 2)
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
        expect(s.angleOfAttackDeg).toBeGreaterThanOrEqual(2)
        expect(s.angleOfAttackDeg).toBeLessThanOrEqual(30)
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
