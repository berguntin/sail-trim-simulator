import { describe, it, expect } from 'vitest'
import {
  computeGenoaShape,
  genoaSheetAngleDeg,
  genoaUpwashDeg,
  GENOA_MIN_SHEET_ANGLE_DEG,
  MAX_GENOA_SHEET_ANGLE_DEG,
  DEFAULT_HEADSAIL_TRIM,
} from './genoaShape'
import type { GenoaControls, WindState, HeadsailTrimParams } from './types'

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

  it('AoA is emergent: AWA + upwash − sheeted chord angle', () => {
    const trimmed = computeGenoaShape({ ...NEUTRAL_CONTROLS, jibsheet: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    const expected =
      DEFAULT_WIND.apparentWindAngleDeg +
      genoaUpwashDeg(DEFAULT_WIND.apparentWindAngleDeg) -
      genoaSheetAngleDeg({ jibsheet: 100 })
    expect(trimmed.angleOfAttackDeg).toBeCloseTo(expected, 6)
  })

  it('the main upwash raises the genoa AoA upwind, and dies off the wind', () => {
    expect(genoaUpwashDeg(28)).toBeGreaterThan(0)
    expect(genoaUpwashDeg(28)).toBeGreaterThan(genoaUpwashDeg(70))
    expect(genoaUpwashDeg(110)).toBe(0)
  })

  it('lead car does not affect angle of attack', () => {
    const fwd = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 0 }, MID_BACKSTAY, DEFAULT_WIND)
    const aft = computeGenoaShape({ ...NEUTRAL_CONTROLS, car: 100 }, MID_BACKSTAY, DEFAULT_WIND)
    expect(fwd.angleOfAttackDeg).toBe(aft.angleOfAttackDeg)
  })

  it('winching hard can never rotate the chord inside the lead-track line', () => {
    // The clew hangs on the sheet: a rope pulls, it cannot push the sail
    // inboard past the car — the sheeted chord angle bottoms out at the
    // track's sheeting angle however hard you trim.
    for (const jibsheet of [0, 50, 100]) {
      expect(genoaSheetAngleDeg({ jibsheet })).toBeGreaterThanOrEqual(GENOA_MIN_SHEET_ANGLE_DEG)
    }
    expect(genoaSheetAngleDeg({ jibsheet: 100 })).toBe(GENOA_MIN_SHEET_ANGLE_DEG)
  })

  it('eased fully, the clew reaches the rigging stop', () => {
    expect(genoaSheetAngleDeg({ jibsheet: 0 })).toBe(MAX_GENOA_SHEET_ANGLE_DEG)
  })

  it('cleated sheet + course change: bearing away raises AoA, heading up backwinds', () => {
    const cleated = { ...NEUTRAL_CONTROLS, jibsheet: 80 }
    const aoaAt = (awa: number) =>
      computeGenoaShape(cleated, MID_BACKSTAY, { trueWindSpeedKts: 12, apparentWindAngleDeg: awa })
        .angleOfAttackDeg
    expect(aoaAt(45)).toBeGreaterThan(aoaAt(30))   // bear away → stalls
    expect(aoaAt(18)).toBeLessThan(aoaAt(30))      // head up → luffs
    expect(aoaAt(10)).toBeLessThan(0)              // well past head-to-wind: backwinded
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

  it('the sheet sweeps the chord across the full track-to-rigging arc', () => {
    const swing = genoaSheetAngleDeg({ jibsheet: 0 }) - genoaSheetAngleDeg({ jibsheet: 100 })
    expect(swing).toBe(MAX_GENOA_SHEET_ANGLE_DEG - GENOA_MIN_SHEET_ANGLE_DEG)
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
          // AoA is emergent: an eased sheet at an upwind AWA legitimately
          // backwinds the sail (negative AoA, floored at −30)
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
  }
})

describe('genoaShape — per-headsail characteristics', () => {
  // A non-overlapping working jib, as boats/headsails.ts derives one
  const JIB_TRIM: HeadsailTrimParams = {
    camberSlackRatio: 0.135,
    camberTightRatio: 0.07,
    minSheetAngleDeg: 10,
    windStretchCamber: 0.015,
  }

  it('default sail params reproduce the historical genoa exactly', () => {
    const implicit = computeGenoaShape(NEUTRAL_CONTROLS, MID_BACKSTAY, DEFAULT_WIND)
    const explicit = computeGenoaShape(NEUTRAL_CONTROLS, MID_BACKSTAY, DEFAULT_WIND, DEFAULT_HEADSAIL_TRIM)
    expect(implicit).toEqual(explicit)
  })

  it('a flat-cut jib carries less camber than the genoa at every stay tension', () => {
    for (const backstay of [0, 50, 100]) {
      const genoa = computeGenoaShape(NEUTRAL_CONTROLS, backstay, DEFAULT_WIND)
      const jib = computeGenoaShape(NEUTRAL_CONTROLS, backstay, DEFAULT_WIND, JIB_TRIM)
      expect(jib.camberRatio).toBeLessThan(genoa.camberRatio)
    }
  })

  it('a jib swings less between slack and tight stay (less sag-depth to give)', () => {
    const swingFor = (sail: HeadsailTrimParams) =>
      computeGenoaShape(NEUTRAL_CONTROLS, 0, DEFAULT_WIND, sail).camberRatio -
      computeGenoaShape(NEUTRAL_CONTROLS, 100, DEFAULT_WIND, sail).camberRatio
    expect(swingFor(JIB_TRIM)).toBeLessThan(swingFor(DEFAULT_HEADSAIL_TRIM))
  })

  it('an inboard-tracked jib sheets closer — higher max AoA at the same AWA', () => {
    const hardSheet = { ...NEUTRAL_CONTROLS, jibsheet: 100 }
    const genoa = computeGenoaShape(hardSheet, MID_BACKSTAY, DEFAULT_WIND)
    const jib = computeGenoaShape(hardSheet, MID_BACKSTAY, DEFAULT_WIND, JIB_TRIM)
    expect(jib.angleOfAttackDeg).toBeGreaterThan(genoa.angleOfAttackDeg)
    expect(genoaSheetAngleDeg(hardSheet, JIB_TRIM)).toBe(JIB_TRIM.minSheetAngleDeg)
  })

  it('cloth stretch blows depth into the sail as the breeze builds — worst on the genoa', () => {
    const flatTrim = { ...NEUTRAL_CONTROLS }
    const FULL_BACKSTAY = 100
    const at = (tws: number, sail: HeadsailTrimParams) =>
      computeGenoaShape(flatTrim, FULL_BACKSTAY, { trueWindSpeedKts: tws, apparentWindAngleDeg: 30 }, sail)
        .camberRatio
    // No control can pull the stretch back out: even at full backstay the
    // genoa is deeper at 24 kts than at 8 — the reason crews change down
    expect(at(24, DEFAULT_HEADSAIL_TRIM)).toBeGreaterThan(at(8, DEFAULT_HEADSAIL_TRIM))
    // and the small flat jib holds its shape far better
    const genoaStretch = at(24, DEFAULT_HEADSAIL_TRIM) - at(8, DEFAULT_HEADSAIL_TRIM)
    const jibStretch = at(24, JIB_TRIM) - at(8, JIB_TRIM)
    expect(jibStretch).toBeLessThan(genoaStretch)
  })
})

describe('genoaShape — purity', () => {
  it('same inputs always produce same outputs', () => {
    const result1 = computeGenoaShape(NEUTRAL_CONTROLS, NO_BACKSTAY, DEFAULT_WIND)
    const result2 = computeGenoaShape(NEUTRAL_CONTROLS, NO_BACKSTAY, DEFAULT_WIND)
    expect(result1).toEqual(result2)
  })
})
