import { describe, it, expect } from 'vitest'
import { deriveHeadsails, type Headsail } from './headsails'
import { deriveRig } from './rig'
import { boatTuning } from './polar'
import { PRESET_BOATS } from './presets'
import type { BoatModel } from './types'
import { optimalRigScore } from '../physics/performance'

const dufour = PRESET_BOATS.find((b) => b.id === 'dufour-34')!   // overlapping genoa
const j80 = PRESET_BOATS.find((b) => b.id === 'j-80')!           // non-overlapping blade

/** Boat with no certificate data at all (custom .pol file). */
const bareBoat: BoatModel = {
  ...dufour,
  id: 'bare',
  loaM: null,
  displacementKg: null,
  upwindSailAreaM2: null,
  areaMainM2: null,
  areaJibM2: null,
}

describe('deriveHeadsails — wardrobe composition', () => {
  it('genoa boat gets genoa + working jib + heavy jib', () => {
    const rig = deriveRig(dufour)
    expect(rig.genoaOverlapRatio).toBeGreaterThan(1.15) // premise: rated sail overlaps

    const sails = deriveHeadsails(dufour)
    expect(sails.map((s) => s.id)).toEqual(['certificate', 'working-jib', 'heavy-jib'])
    expect(sails.map((s) => s.kind)).toEqual(['genoa', 'jib', 'heavyJib'])
    expect(sails.map((s) => s.descKey)).toEqual(['ratedGenoa', 'workingJib', 'heavyJib'])
  })

  it('blade-jib boat skips the redundant working jib', () => {
    const rig = deriveRig(j80)
    expect(rig.genoaOverlapRatio).toBeLessThan(1.12) // premise: rated sail is a blade

    const sails = deriveHeadsails(j80)
    expect(sails.map((s) => s.id)).toEqual(['certificate', 'heavy-jib'])
    expect(sails[0].kind).toBe('jib')
    expect(sails[0].descKey).toBe('ratedJib')
  })

  it('boat without certificate data still gets a full default wardrobe', () => {
    const sails = deriveHeadsails(bareBoat)
    expect(sails.length).toBe(3) // DEFAULT_RIG overlap 1.28 = genoa
    expect(sails.every((s) => s.areaM2 === null)).toBe(true)
    expect(sails.every((s) => Number.isFinite(s.aspectRatio))).toBe(true)
  })

  it('the certificate sail is first and keeps the rated geometry', () => {
    const rig = deriveRig(dufour)
    const [cert] = deriveHeadsails(dufour)
    expect(cert.areaRatio).toBe(1)
    expect(cert.luffFrac).toBe(1)
    expect(cert.overlapRatio).toBeCloseTo(rig.genoaOverlapRatio, 10)
    expect(cert.aspectRatio).toBeCloseTo(rig.genoaAspectRatio, 10)
    expect(cert.areaM2).toBeCloseTo(dufour.areaJibM2!, 10)
  })
})

describe('deriveHeadsails — each sail behaves like itself', () => {
  const sails = deriveHeadsails(dufour)
  const [genoa, jib, heavy] = sails

  it('areas shrink down the wardrobe', () => {
    expect(jib.areaRatio).toBeLessThan(genoa.areaRatio)
    expect(heavy.areaRatio).toBeLessThan(jib.areaRatio)
    expect(jib.areaM2!).toBeLessThan(genoa.areaM2!)
  })

  it('overlap (LP/J) shrinks down the wardrobe — what the 3D view draws', () => {
    expect(genoa.overlapRatio).toBeGreaterThan(1.15)
    expect(jib.overlapRatio).toBeCloseTo(1.05, 5)
    expect(heavy.overlapRatio).toBeCloseTo(0.85, 5)
  })

  it('smaller sails are cut flatter (less slack-stay camber)', () => {
    expect(jib.trim.camberSlackRatio).toBeLessThan(genoa.trim.camberSlackRatio)
    expect(heavy.trim.camberSlackRatio).toBeLessThan(jib.trim.camberSlackRatio)
  })

  it('non-overlapping jib sheets closer inboard than the genoa', () => {
    expect(jib.trim.minSheetAngleDeg).toBeLessThan(genoa.trim.minSheetAngleDeg)
  })

  it('heavy jib hoists short with a high clew', () => {
    expect(heavy.luffFrac).toBeLessThan(0.9)
    expect(heavy.clewRise).toBeGreaterThan(0)
    expect(genoa.clewRise).toBe(0)
  })

  it('a shorter-LP jib on the same luff has a higher aspect ratio', () => {
    expect(jib.aspectRatio).toBeGreaterThan(genoa.aspectRatio)
  })
})

describe('deriveHeadsails — sail crossover emerges from the physics', () => {
  // Same tuning construction the store uses (trimStore tuningFor)
  function scoreFor(h: Headsail, tws: number): number {
    const rig = deriveRig(dufour)
    const rigPowerFrac = rig.mainAreaFrac + (1 - rig.mainAreaFrac) * h.areaRatio
    return optimalRigScore(
      { trueWindSpeedKts: tws, apparentWindAngleDeg: 28 },
      {
        ...boatTuning(dufour.polar),
        mainAreaFrac: rig.mainAreaFrac / rigPowerFrac,
        mainAspectRatio: rig.mainAspectRatio,
        genoaAspectRatio: h.aspectRatio,
        rigPowerFrac,
        headsail: h.trim,
      },
    )
  }

  const [genoa, jib, heavy] = deriveHeadsails(dufour)

  it('light air: the genoa outscores both jibs (area is king)', () => {
    expect(scoreFor(genoa, 8)).toBeGreaterThan(scoreFor(jib, 8))
    expect(scoreFor(jib, 8)).toBeGreaterThan(scoreFor(heavy, 8))
  })

  it('heavy air: the working jib overtakes the stretched-full genoa', () => {
    expect(scoreFor(jib, 24)).toBeGreaterThan(scoreFor(genoa, 24))
  })
})
