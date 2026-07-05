import { describe, it, expect } from 'vitest'
import { computeGenoaShape, GENOA_MIN_SHEET_ANGLE_DEG } from './genoaShape'
import type { GenoaControls, WindState } from './types'

const DEFAULT_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }
const NO_BACKSTAY = 0
const MID_BACKSTAY = 50

const NEUTRAL_CONTROLS: GenoaControls = {
  jibsheet: 50,
  car: 50,
  halyard: 0,
}

describe('genoaShape — angle of attack', () => {
  it('sheeting in (100) produces higher AoA than easing (0)', () => {
    const eased = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const trimmed = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(trimmed.angleOfAttackDeg).toBeGreaterThan(eased.angleOfAttackDeg)
  })

  it('genoa baseline AoA exceeds 35 % of AWA (flies in the main upwash)', () => {
    const shape = computeGenoaShape(NEUTRAL_CONTROLS, MID_BACKSTAY, DEFAULT_WIND)
    expect(shape.angleOfAttackDeg).toBeGreaterThan(DEFAULT_WIND.apparentWindAngleDeg * 0.35)
  })

  it('lead car does not affect angle of attack', () => {
    const fwd = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const aft = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(fwd.angleOfAttackDeg).toBe(aft.angleOfAttackDeg)
  })

  it('winching hard can never rotate the chord inside the lead-track line', () => {
    // The clew hangs on the sheet: a rope pulls, it cannot push the sail
    // inboard past the car. Chord angle off centreline = AWA − AoA must
    // stay at or outside the track's sheeting angle however hard you trim.
    for (const awa of [20, 25, 30, 40]) {
      const wind: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: awa }
      const hard = computeGenoaShape(
        { ...NEUTRAL_CONTROLS, jibsheet: 100, car: 0 }, MID_BACKSTAY, wind)
      expect(awa - hard.angleOfAttackDeg).toBeGreaterThanOrEqual(GENOA_MIN_SHEET_ANGLE_DEG)
    }
  })
})

describe('genoaShape — twist', () => {
  it('sheet trimmed (100) produces clearly less twist than eased (0)', () => {
    const eased = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const trimmed = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(eased.twistDeg - trimmed.twistDeg).toBeGreaterThanOrEqual(5)
  })

  it('car aft (100) opens the leech — more twist than car forward (0)', () => {
    const fwd = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const aft = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(aft.twistDeg).toBeGreaterThan(fwd.twistDeg)
  })

  it('high TWS (22 kts) produces more twist than low TWS (8 kts) at same controls', () => {
    const lowWind: WindState = { trueWindSpeedKts: 8, apparentWindAngleDeg: 30 }
    const highWind: WindState = { trueWindSpeedKts: 22, apparentWindAngleDeg: 30 }
    const atLow = computeGenoaShape(NEUTRAL_CONTROLS, MID_BACKSTAY, lowWind)
    const atHigh = computeGenoaShape(NEUTRAL_CONTROLS, MID_BACKSTAY, highWind)
    expect(atHigh.twistDeg).toBeGreaterThan(atLow.twistDeg)
  })
})

describe('genoaShape — camber (forestay sag)', () => {
  it('backstay tension (tight forestay) flattens the genoa', () => {
    const slack = computeGenoaShape(NEUTRAL_CONTROLS, 0, DEFAULT_WIND)
    const tight = computeGenoaShape(NEUTRAL_CONTROLS, 100, DEFAULT_WIND)
    expect(tight.camberRatio).toBeLessThan(slack.camberRatio)
  })

  it('hard sheet stretches the sail slightly flatter', () => {
    const soft = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const hard = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(hard.camberRatio).toBeLessThan(soft.camberRatio)
  })

  it('halyard tension slightly reduces camber', () => {
    const noHalyard = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const fullHalyard = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(fullHalyard.camberRatio).toBeLessThanOrEqual(noHalyard.camberRatio)
  })
})

describe('genoaShape — draft position', () => {
  it('halyard at max (100) places draft more forward than halyard at 0', () => {
    const slack = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const tight = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(tight.draftPositionRatio).toBeLessThan(slack.draftPositionRatio)
  })

  it('more wind drags the draft aft at the same halyard setting', () => {
    const light = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 30 }, MID_BACKSTAY,
      { trueWindSpeedKts: 6, apparentWindAngleDeg: 28 })
    const heavy = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 30 }, MID_BACKSTAY,
      { trueWindSpeedKts: 25, apparentWindAngleDeg: 35 })
    expect(heavy.draftPositionRatio).toBeGreaterThan(light.draftPositionRatio)
  })

  it('backstay (tight stay, flat entry) shifts draft aft — the halyard interplay', () => {
    const slackStay = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 30 }, 0, DEFAULT_WIND)
    const tightStay = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 30 }, 100, DEFAULT_WIND)
    expect(tightStay.draftPositionRatio).toBeGreaterThan(slackStay.draftPositionRatio)
    // and the halyard can pull it back forward
    const compensated = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 90 }, 100, DEFAULT_WIND)
    expect(compensated.draftPositionRatio).toBeLessThan(tightStay.draftPositionRatio)
  })
})

describe('genoaShape — foot fullness (lead car)', () => {
  it('car forward (0) gives a deep foot, car aft (100) a flat one', () => {
    const fwd = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const aft = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(fwd.footFullnessRatio).toBeGreaterThan(1)
    expect(aft.footFullnessRatio).toBeLessThan(1)
    expect(fwd.footFullnessRatio).toBeGreaterThan(aft.footFullnessRatio)
  })

  it('mid car (50) is neutral', () => {
    const mid = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 50 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(mid.footFullnessRatio).toBeCloseTo(1.0, 5)
  })

  it('halyard does not affect twist or angle of attack', () => {
    const slack = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const tight = computeGenoaShape({ ...NEUTRAL_CONTROLS, halyard: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(slack.twistDeg).toBe(tight.twistDeg)
    expect(slack.angleOfAttackDeg).toBe(tight.angleOfAttackDeg)
  })
})

describe('genoaShape — off the wind (sheeting limit)', () => {
  const RUN_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 150 }

  it('deep downwind the sheeting limit forces the genoa past stall', () => {
    const eased = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 0 }, MID_BACKSTAY, RUN_WIND)
    expect(eased.angleOfAttackDeg).toBeGreaterThanOrEqual(150 - 80)
  })

  it('AoA never exceeds 90°', () => {
    const hard = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 100 }, MID_BACKSTAY, RUN_WIND)
    expect(hard.angleOfAttackDeg).toBeLessThanOrEqual(90)
  })

  it('the jib sheet has more angle authority on a run than on a beat', () => {
    const swingAt = (wind: WindState) =>
      computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 100 }, MID_BACKSTAY, wind).angleOfAttackDeg -
      computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 0 }, MID_BACKSTAY, wind).angleOfAttackDeg
    // (the 90° AoA clamp and the sheeting-limit floor eat part of the swing)
    expect(swingAt(RUN_WIND)).toBeGreaterThan(swingAt(DEFAULT_WIND))
  })
})

describe('genoaShape — output range invariants', () => {
  const winds: WindState[] = [
    { trueWindSpeedKts: 6, apparentWindAngleDeg: 28 },
    { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 },
    { trueWindSpeedKts: 18, apparentWindAngleDeg: 32 },
    { trueWindSpeedKts: 25, apparentWindAngleDeg: 35 },
  ]
  const controls: GenoaControls[] = [
    { jibsheet: 0, car: 0, halyard: 0 },
    { jibsheet: 50, car: 50, halyard: 50 },
    { jibsheet: 100, car: 100, halyard: 100 },
    { jibsheet: 20, car: 80, halyard: 90 },
    { jibsheet: 75, car: 10, halyard: 15 },
  ]
  const backstays = [0, 50, 100]

  for (const w of winds) {
    for (const c of controls) {
      for (const b of backstays) {
        it(`valid ranges for jibsheet=${c.jibsheet} car=${c.car} backstay=${b} TWS=${w.trueWindSpeedKts}`, () => {
          const s = computeGenoaShape(c, b, w)
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
  }
})

describe('genoaShape — purity', () => {
  it('same inputs always produce same outputs', () => {
    const result1 = computeGenoaShape(NEUTRAL_CONTROLS, NO_BACKSTAY, DEFAULT_WIND)
    const result2 = computeGenoaShape(NEUTRAL_CONTROLS, NO_BACKSTAY, DEFAULT_WIND)
    expect(result1).toEqual(result2)
  })
})
