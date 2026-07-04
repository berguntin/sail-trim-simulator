import { describe, it, expect } from 'vitest'
import { deriveRig, DEFAULT_RIG } from './rig'
import { PRESET_BOATS } from './presets'
import type { BoatModel } from './types'

function makeBoat(over: Partial<BoatModel>): BoatModel {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    source: '',
    loaM: null,
    displacementKg: null,
    upwindSailAreaM2: null,
    areaMainM2: null,
    areaJibM2: null,
    polar: {
      windSpeedsKts: [6, 12],
      windAnglesDeg: [52, 150],
      speedsKts: [[5, 6], [4, 5]],
      beatAnglesDeg: [44, 40],
      beatVMGKts: [3, 4],
      gybeAnglesDeg: [140, 160],
      runVMGKts: [3, 5],
    },
    ...over,
  }
}

describe('deriveRig', () => {
  it('returns the defaults when no certificate data is available', () => {
    expect(deriveRig(makeBoat({}))).toEqual(DEFAULT_RIG)
  })

  it('defaults match the historical hard-coded physics values', () => {
    expect(DEFAULT_RIG.mainAreaFrac).toBe(0.55)
    expect(DEFAULT_RIG.mainAspectRatio).toBe(5)
    expect(DEFAULT_RIG.genoaAspectRatio).toBe(4.5)
  })

  it('computes the exact main area fraction from certificate areas', () => {
    // AIFOS (TP52): Area_Main 100.6, Area_Jib 64.48
    const rig = deriveRig(makeBoat({ areaMainM2: 100.6, areaJibM2: 64.48, loaM: 15.84 }))
    expect(rig.mainAreaFrac).toBeCloseTo(100.6 / 165.08, 3)
  })

  it('gives a racer with a blade jib higher genoa AR and lower overlap than a genoa cruiser', () => {
    // TP52-ish: big main, non-overlapping blade
    const racer = deriveRig(makeBoat({ areaMainM2: 100.6, areaJibM2: 64.48, loaM: 15.84 }))
    // Dufour 34-ish: near-even split, overlapping genoa
    const cruiser = deriveRig(makeBoat({ areaMainM2: 31.53, areaJibM2: 28.59, loaM: 10.3 }))

    expect(racer.mainAreaFrac).toBeGreaterThan(cruiser.mainAreaFrac)
    expect(racer.genoaAspectRatio).toBeGreaterThan(cruiser.genoaAspectRatio)
    expect(racer.genoaOverlapRatio).toBeLessThan(cruiser.genoaOverlapRatio)
  })

  it('scales the visual main chord inversely with aspect ratio', () => {
    const skinny = deriveRig(makeBoat({ areaMainM2: 20, areaJibM2: 15, loaM: 9 })) // high AR
    const fat = deriveRig(makeBoat({ areaMainM2: 45, areaJibM2: 30, loaM: 9 }))   // low AR
    expect(skinny.mainAspectRatio).toBeGreaterThan(fat.mainAspectRatio)
    expect(skinny.mainChordScale).toBeLessThan(fat.mainChordScale)
  })

  it('clamps degenerate certificate values toward sane ranges', () => {
    const tiny = deriveRig(makeBoat({ areaMainM2: 1, areaJibM2: 200, loaM: 30 }))
    expect(tiny.mainAreaFrac).toBeGreaterThanOrEqual(0.40)
    expect(tiny.mainAspectRatio).toBeLessThanOrEqual(6.5)
    expect(tiny.genoaOverlapRatio).toBeLessThanOrEqual(1.45)
    const huge = deriveRig(makeBoat({ areaMainM2: 500, areaJibM2: 1, loaM: 8 }))
    expect(huge.mainAreaFrac).toBeLessThanOrEqual(0.70)
    expect(huge.mainAspectRatio).toBeGreaterThanOrEqual(3.5)
    expect(huge.genoaOverlapRatio).toBeGreaterThanOrEqual(1.0)
  })

  it('ignores zero/negative areas instead of dividing by them', () => {
    expect(deriveRig(makeBoat({ areaMainM2: 0, areaJibM2: 20, loaM: 9 }))).toEqual(DEFAULT_RIG)
  })

  it('every preset stays within the clamp ranges (no preset is a caricature)', () => {
    for (const b of PRESET_BOATS) {
      const rig = deriveRig(b)
      expect(rig.mainAreaFrac).toBeGreaterThanOrEqual(0.40)
      expect(rig.mainAreaFrac).toBeLessThanOrEqual(0.70)
      expect(rig.mainAspectRatio).toBeGreaterThanOrEqual(3.5)
      expect(rig.mainAspectRatio).toBeLessThanOrEqual(6.5)
      expect(rig.genoaAspectRatio).toBeGreaterThanOrEqual(3.0)
      expect(rig.genoaAspectRatio).toBeLessThanOrEqual(7.0)
      expect(rig.mainChordScale).toBeGreaterThanOrEqual(0.8)
      expect(rig.mainChordScale).toBeLessThanOrEqual(1.25)
    }
  })

  it('presets carry the certificate sail areas', () => {
    for (const b of PRESET_BOATS) {
      expect(b.areaMainM2).toBeGreaterThan(0)
      expect(b.areaJibM2).toBeGreaterThan(0)
      // The recorded upwind total matches main + jib to rounding
      expect(b.areaMainM2! + b.areaJibM2!).toBeCloseTo(b.upwindSailAreaM2!, 0)
    }
  })
})
