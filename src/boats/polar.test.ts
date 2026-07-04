import { describe, it, expect } from 'vitest'
import {
  allowanceToKts,
  interp1,
  beatAngleDeg,
  beatVMGKts,
  beatSpeedKts,
  targetSpeedKts,
  gybeAngleDeg,
  runSpeedKts,
  courseTargetSpeedKts,
  courseApparentWindAngleDeg,
  apparentWindAngleDeg,
  upwindApparentWindAngleDeg,
  powerSaturation,
  boatTuning,
} from './polar'
import { PRESET_BOATS } from './presets'
import type { OrcPolar } from './types'

// Minimal synthetic polar with easy-to-verify numbers
const SYNTHETIC: OrcPolar = {
  windSpeedsKts: [6, 12, 20],
  windAnglesDeg: [52, 90, 150],
  speedsKts: [
    [4.0, 6.0, 7.0],
    [5.0, 7.0, 8.0],
    [3.0, 6.0, 9.0],
  ],
  beatAnglesDeg: [45, 40, 38],
  beatVMGKts: [3.0, 4.5, 5.0],
  gybeAnglesDeg: [140, 150, 165],
  runVMGKts: [2.5, 4.5, 6.5],
}

describe('polar — allowance conversion', () => {
  it('converts seconds/mile to knots', () => {
    expect(allowanceToKts(600)).toBeCloseTo(6.0)
    expect(allowanceToKts(3600)).toBeCloseTo(1.0)
  })

  it('returns 0 for non-positive allowances', () => {
    expect(allowanceToKts(0)).toBe(0)
    expect(allowanceToKts(-10)).toBe(0)
  })
})

describe('polar — interp1', () => {
  const xs = [4, 8, 16]
  const ys = [1, 3, 7]

  it('is exact at grid points', () => {
    expect(interp1(xs, ys, 4)).toBe(1)
    expect(interp1(xs, ys, 8)).toBe(3)
    expect(interp1(xs, ys, 16)).toBe(7)
  })

  it('interpolates linearly between points', () => {
    expect(interp1(xs, ys, 6)).toBeCloseTo(2)
    expect(interp1(xs, ys, 12)).toBeCloseTo(5)
  })

  it('clamps at the edges instead of extrapolating', () => {
    expect(interp1(xs, ys, 0)).toBe(1)
    expect(interp1(xs, ys, 30)).toBe(7)
  })
})

describe('polar — beat targets', () => {
  it('interpolates beat angle and VMG over wind speed', () => {
    expect(beatAngleDeg(SYNTHETIC, 9)).toBeCloseTo(42.5)
    expect(beatVMGKts(SYNTHETIC, 9)).toBeCloseTo(3.75)
  })

  it('beat speed = VMG / cos(beat angle)', () => {
    const expected = 4.5 / Math.cos((40 * Math.PI) / 180)
    expect(beatSpeedKts(SYNTHETIC, 12)).toBeCloseTo(expected)
  })
})

describe('polar — targetSpeedKts (bilinear)', () => {
  it('is exact at grid points', () => {
    expect(targetSpeedKts(SYNTHETIC, 52, 6)).toBeCloseTo(4.0)
    expect(targetSpeedKts(SYNTHETIC, 150, 20)).toBeCloseTo(9.0)
  })

  it('interpolates in both axes', () => {
    // Midway 52-90° at TWS 6: (4.0 + 5.0) / 2
    expect(targetSpeedKts(SYNTHETIC, 71, 6)).toBeCloseTo(4.5)
    // At 90° midway 6-12 kts: (5.0 + 7.0) / 2
    expect(targetSpeedKts(SYNTHETIC, 90, 9)).toBeCloseTo(6.0)
  })

  it('clamps outside the grid', () => {
    expect(targetSpeedKts(SYNTHETIC, 30, 3)).toBeCloseTo(4.0)
    expect(targetSpeedKts(SYNTHETIC, 170, 30)).toBeCloseTo(9.0)
  })
})

describe('polar — course targets (any TWA)', () => {
  it('equals the beat optimum at the beat angle', () => {
    // tws 12: beat angle 40°, beat speed = 4.5 / cos 40°
    const expected = 4.5 / Math.cos((40 * Math.PI) / 180)
    expect(courseTargetSpeedKts(SYNTHETIC, 40, 12)).toBeCloseTo(expected)
  })

  it('clamps tighter than the beat angle (no pinching model)', () => {
    expect(courseTargetSpeedKts(SYNTHETIC, 30, 12)).toBeCloseTo(
      courseTargetSpeedKts(SYNTHETIC, 40, 12))
  })

  it('matches the grid inside 52-150°', () => {
    expect(courseTargetSpeedKts(SYNTHETIC, 90, 12)).toBeCloseTo(7.0)
    expect(courseTargetSpeedKts(SYNTHETIC, 150, 12)).toBeCloseTo(6.0)
  })

  it('interpolates between the beat point and the 52° grid row', () => {
    const beatV = 4.5 / Math.cos((40 * Math.PI) / 180)
    const mid = courseTargetSpeedKts(SYNTHETIC, 46, 12)
    expect(mid).toBeGreaterThan(Math.min(beatV, 6.0) - 1e-9)
    expect(mid).toBeLessThan(Math.max(beatV, 6.0) + 1e-9)
  })

  it('anchors beyond 150° with the run optimum when the gybe is deeper', () => {
    // tws 20: gybe 165°, run speed = 6.5 / cos 15°
    const runV = 6.5 / Math.cos((15 * Math.PI) / 180)
    expect(gybeAngleDeg(SYNTHETIC, 20)).toBeCloseTo(165)
    expect(runSpeedKts(SYNTHETIC, 20)).toBeCloseTo(runV)
    expect(courseTargetSpeedKts(SYNTHETIC, 165, 20)).toBeCloseTo(runV)
    // between the 150° grid row (9.0) and the run point
    const mid = courseTargetSpeedKts(SYNTHETIC, 157.5, 20)
    expect(mid).toBeLessThan(9.0)
    expect(mid).toBeGreaterThan(runV - 1e-9)
  })

  it('every preset gives plausible speeds across the whole range', () => {
    for (const b of PRESET_BOATS) {
      for (const tws of [6, 12, 20]) {
        for (const twa of [45, 60, 90, 120, 150, 165]) {
          const v = courseTargetSpeedKts(b.polar, twa, tws)
          expect(v).toBeGreaterThan(1)
          expect(v).toBeLessThan(15)
        }
      }
    }
  })
})

describe('polar — apparent wind', () => {
  it('AWA is tighter than TWA when the boat moves forward', () => {
    const awa = apparentWindAngleDeg(12, 40, 6)
    expect(awa).toBeLessThan(40)
    expect(awa).toBeGreaterThan(0)
  })

  it('AWA equals TWA for a stationary boat', () => {
    expect(apparentWindAngleDeg(12, 40, 0)).toBeCloseTo(40)
  })

  it('matches hand-computed wind triangle', () => {
    // TWS 10 at 90°, boat speed 10 → apparent at 45°
    expect(apparentWindAngleDeg(10, 90, 10)).toBeCloseTo(45)
  })

  it('course AWA is always tighter than TWA and widens monotonically', () => {
    for (const b of PRESET_BOATS) {
      let prev = 0
      for (const twa of [45, 70, 95, 120, 145, 165]) {
        const awa = courseApparentWindAngleDeg(b.polar, 12, twa)
        expect(awa).toBeLessThan(twa)
        expect(awa).toBeGreaterThan(prev)
        prev = awa
      }
    }
  })

  it('preset fleet beats at AWA within the aero model range (20-36°)', () => {
    for (const b of PRESET_BOATS) {
      for (const tws of [6, 12, 20, 25]) {
        const awa = upwindApparentWindAngleDeg(b.polar, tws)
        expect(awa).toBeGreaterThan(20)
        expect(awa).toBeLessThan(36)
      }
    }
  })
})

describe('polar — boat tuning', () => {
  it('tender sportboat saturates earlier than a stiff race boat', () => {
    const platu = PRESET_BOATS.find((b) => b.id === 'platu-25')!
    const swan = PRESET_BOATS.find((b) => b.id === 'swan-42')!
    expect(powerSaturation(platu.polar)).toBeLessThan(powerSaturation(swan.polar))
    expect(boatTuning(platu.polar).heelComfortFrac).toBeLessThan(
      boatTuning(swan.polar).heelComfortFrac,
    )
  })

  it('heelComfortFrac stays within its clamps for every preset', () => {
    for (const b of PRESET_BOATS) {
      const { heelComfortFrac } = boatTuning(b.polar)
      expect(heelComfortFrac).toBeGreaterThanOrEqual(0.28)
      expect(heelComfortFrac).toBeLessThanOrEqual(0.52)
    }
  })

  it('presets carry plausible upwind numbers', () => {
    for (const b of PRESET_BOATS) {
      for (const tws of [6, 12, 20]) {
        const vmg = beatVMGKts(b.polar, tws)
        const speed = beatSpeedKts(b.polar, tws)
        expect(vmg).toBeGreaterThan(2)
        expect(vmg).toBeLessThan(8)
        expect(speed).toBeGreaterThan(vmg)
        expect(speed).toBeLessThan(9)
      }
    }
  })
})
