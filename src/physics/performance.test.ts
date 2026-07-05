import { describe, it, expect } from 'vitest'
import {
  estimateRigPerformance,
  computeRelativeHeel,
  classifyPowerBalance,
  findOptimalRig,
  combineRigAero,
  computeDriveHeel,
  trimScore,
  type OptimalRig,
} from './performance'
import { computeSailShape } from './sailShape'
import { computeGenoaShape } from './genoaShape'
import { computeAeroCoefficients, applyGenoaBlanketing, GENOA_AERO } from './aerodynamics'
import type { AeroCoefficients, WindState } from './types'

const DEFAULT_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }

/** Same AWA approximation the store uses, so tests match app behaviour. */
function windAt(kts: number): WindState {
  return { trueWindSpeedKts: kts, apparentWindAngleDeg: 28 + ((kts - 6) / 19) * 7 }
}

function makeAero(cl: number, cd: number): AeroCoefficients {
  return { cl, cd, efficiency: cd > 0 ? cl / cd : 0 }
}

/**
 * Rig performance for a single synthetic aero: combining identical
 * coefficients for both sails is the identity (area fractions sum to 1),
 * so these property tests exercise the same math as before.
 */
function perfOf(aero: AeroCoefficients, wind: WindState, tuning?: { heelComfortFrac: number }) {
  return estimateRigPerformance(aero, aero, wind, tuning)
}

/** Combined rig aero produced by a full set of rig controls (blanketing
 *  included — same pipeline as the optimizer and the store). */
function rigAeroFor(rig: OptimalRig, wind: WindState): AeroCoefficients {
  const main = computeAeroCoefficients(computeSailShape(rig.main, wind), wind)
  const genoa = applyGenoaBlanketing(
    computeAeroCoefficients(
      computeGenoaShape(rig.genoa, rig.main.backstay, wind), wind, GENOA_AERO),
    wind,
  )
  return combineRigAero(main, genoa)
}

describe('performance — drive/heel decomposition', () => {
  it('lift contributes to both drive and heel; drag opposes drive', () => {
    const withDrag = computeDriveHeel(makeAero(1.0, 0.10), DEFAULT_WIND)
    const lessDrag = computeDriveHeel(makeAero(1.0, 0.05), DEFAULT_WIND)
    expect(lessDrag.driveCoef).toBeGreaterThan(withDrag.driveCoef)

    const moreLift = computeDriveHeel(makeAero(1.4, 0.05), DEFAULT_WIND)
    expect(moreLift.driveCoef).toBeGreaterThan(lessDrag.driveCoef)
    expect(moreLift.heelCoef).toBeGreaterThan(lessDrag.heelCoef)
  })

  it('zero lift with drag produces negative drive (parasitic only)', () => {
    const { driveCoef } = computeDriveHeel(makeAero(0, 0.05), DEFAULT_WIND)
    expect(driveCoef).toBeLessThan(0)
  })
})

describe('performance — combineRigAero', () => {
  it('is the identity when both sails carry the same coefficients', () => {
    const aero = makeAero(1.2, 0.08)
    const combined = combineRigAero(aero, aero)
    expect(combined.cl).toBeCloseTo(aero.cl, 10)
    expect(combined.cd).toBeCloseTo(aero.cd, 10)
  })

  it('rig totals move when either sail changes', () => {
    const base = combineRigAero(makeAero(1.0, 0.08), makeAero(1.0, 0.08))
    const mainUp = combineRigAero(makeAero(1.4, 0.08), makeAero(1.0, 0.08))
    const genoaUp = combineRigAero(makeAero(1.0, 0.08), makeAero(1.4, 0.08))
    expect(mainUp.cl).toBeGreaterThan(base.cl)
    expect(genoaUp.cl).toBeGreaterThan(base.cl)
  })

  it('weights the main slightly heavier than the genoa', () => {
    const mainUp = combineRigAero(makeAero(1.4, 0.08), makeAero(1.0, 0.08))
    const genoaUp = combineRigAero(makeAero(1.0, 0.08), makeAero(1.4, 0.08))
    expect(mainUp.cl).toBeGreaterThan(genoaUp.cl)
  })
})

describe('performance — relativeVMG', () => {
  it('below the heel limit, more lift at equal drag → higher relativeVMG', () => {
    const low = perfOf(makeAero(0.5, 0.05), DEFAULT_WIND)
    const high = perfOf(makeAero(1.0, 0.05), DEFAULT_WIND)
    expect(high.relativeVMG).toBeGreaterThan(low.relativeVMG)
  })

  it('at equal lift, less drag → higher relativeVMG', () => {
    const draggy = perfOf(makeAero(1.0, 0.20), DEFAULT_WIND)
    const clean = perfOf(makeAero(1.0, 0.08), DEFAULT_WIND)
    expect(clean.relativeVMG).toBeGreaterThan(draggy.relativeVMG)
  })

  it('relativeVMG = 0 for a luffing rig (no lift)', () => {
    const result = perfOf(makeAero(0, 0.05), DEFAULT_WIND)
    expect(result.relativeVMG).toBe(0)
  })

  it('in heavy air, excessive power costs VMG (heel penalty)', () => {
    const wind = windAt(25)
    // Fully powered (high cl) vs a depowered rig: powered heels far past
    // the comfort limit at 25 kts and must score lower. (cl 0.6 ≈ what the
    // optimizer actually carries at 24 kts — cl 0.9 is still overpowered.)
    const powered = perfOf(makeAero(1.5, 0.15), wind)
    const depowered = perfOf(makeAero(0.6, 0.06), wind)
    expect(depowered.relativeVMG).toBeGreaterThan(powered.relativeVMG)
  })
})

describe('performance — relativeHeel', () => {
  it('higher Cl produces higher heel at same wind speed', () => {
    const pairs: [number, number][] = [
      [0.2, 0.8],
      [0.5, 1.2],
      [0.0, 1.5],
    ]
    for (const [clLow, clHigh] of pairs) {
      const heelLow = computeRelativeHeel(makeAero(clLow, 0.05), DEFAULT_WIND)
      const heelHigh = computeRelativeHeel(makeAero(clHigh, 0.05), DEFAULT_WIND)
      expect(heelHigh).toBeGreaterThan(heelLow)
    }
  })

  it('same aero at higher TWS produces more heel than at lower TWS', () => {
    const heelLow = computeRelativeHeel(makeAero(1.0, 0.05), windAt(8))
    const heelHigh = computeRelativeHeel(makeAero(1.0, 0.05), windAt(20))
    expect(heelHigh).toBeGreaterThan(heelLow)
  })
})

describe('performance — powerBalance classification (relative to optimum)', () => {
  it('classifies underpowered well below the optimal heel', () => {
    expect(classifyPowerBalance(0, 50)).toBe('underpowered')
    expect(classifyPowerBalance(30, 50)).toBe('underpowered')
    expect(classifyPowerBalance(39, 50)).toBe('underpowered')
  })

  it('classifies optimal in the band around the optimal heel', () => {
    expect(classifyPowerBalance(45, 50)).toBe('optimal')
    expect(classifyPowerBalance(50, 50)).toBe('optimal')
    expect(classifyPowerBalance(60, 50)).toBe('optimal')
  })

  it('classifies overpowered well above the optimal heel', () => {
    expect(classifyPowerBalance(63, 50)).toBe('overpowered')
    expect(classifyPowerBalance(80, 50)).toBe('overpowered')
    expect(classifyPowerBalance(100, 50)).toBe('overpowered')
  })
})

describe('performance — UI consistency: optimal button ↔ readout', () => {
  // The regression this suite exists for: applying "Show Optimal Trim" must
  // always produce relativeVMG = 100 AND the 'optimal' badge, at every wind
  // speed. Both derive from the same rig grid search, so this holds by
  // construction — this test guards that construction.
  for (const kts of [6, 9, 12, 15, 18, 21, 25]) {
    it(`optimal rig at ${kts} kts → VMG 100 and 'optimal' badge`, () => {
      const wind = windAt(kts)
      const rig = findOptimalRig(wind)
      const mainAero = computeAeroCoefficients(computeSailShape(rig.main, wind), wind)
      const genoaAero = computeAeroCoefficients(
        computeGenoaShape(rig.genoa, rig.main.backstay, wind), wind, GENOA_AERO)
      const perf = estimateRigPerformance(mainAero, genoaAero, wind)
      expect(perf.relativeVMG).toBeCloseTo(100, 5)
      expect(perf.powerBalance).toBe('optimal')
    })
  }
})

describe('performance — findOptimalRig realism', () => {
  it('optimal controls are within valid ranges', () => {
    for (const kts of [8, 15, 22]) {
      const { main, genoa } = findOptimalRig(windAt(kts))
      expect(main.mainsheet).toBeGreaterThanOrEqual(0)
      expect(main.mainsheet).toBeLessThanOrEqual(100)
      expect(main.traveler).toBeGreaterThanOrEqual(-50)
      expect(main.traveler).toBeLessThanOrEqual(50)
      expect(main.cunningham).toBeGreaterThanOrEqual(0)
      expect(main.cunningham).toBeLessThanOrEqual(100)
      expect(main.backstay).toBeGreaterThanOrEqual(0)
      expect(main.backstay).toBeLessThanOrEqual(100)
      expect(main.outhaul).toBeGreaterThanOrEqual(0)
      expect(main.outhaul).toBeLessThanOrEqual(100)
      expect(genoa.jibsheet).toBeGreaterThanOrEqual(0)
      expect(genoa.jibsheet).toBeLessThanOrEqual(100)
      expect(genoa.car).toBeGreaterThanOrEqual(0)
      expect(genoa.car).toBeLessThanOrEqual(100)
      expect(genoa.halyard).toBeGreaterThanOrEqual(0)
      expect(genoa.halyard).toBeLessThanOrEqual(100)
    }
  })

  it('is deterministic — same wind always returns same rig', () => {
    expect(findOptimalRig(DEFAULT_WIND)).toEqual(findOptimalRig(DEFAULT_WIND))
  })

  it('light air optimum is powered up (fuller main than heavy air optimum)', () => {
    const light = computeSailShape(findOptimalRig(windAt(6)).main, windAt(6))
    const heavy = computeSailShape(findOptimalRig(windAt(25)).main, windAt(25))
    expect(light.camberRatio).toBeGreaterThan(heavy.camberRatio)
  })

  it('light air optimum carries a fuller genoa than heavy air optimum', () => {
    const lightRig = findOptimalRig(windAt(6))
    const heavyRig = findOptimalRig(windAt(25))
    const light = computeGenoaShape(lightRig.genoa, lightRig.main.backstay, windAt(6))
    const heavy = computeGenoaShape(heavyRig.genoa, heavyRig.main.backstay, windAt(25))
    expect(light.camberRatio).toBeGreaterThan(heavy.camberRatio)
  })

  it('heavy air optimum carries more twist than light air optimum', () => {
    const light = computeSailShape(findOptimalRig(windAt(6)).main, windAt(6))
    const heavy = computeSailShape(findOptimalRig(windAt(25)).main, windAt(25))
    expect(heavy.twistDeg).toBeGreaterThan(light.twistDeg)
  })

  it('optimal main AoA stays in the realistic upwind band (8-18°), clear of stall', () => {
    for (const kts of [6, 12, 18, 25]) {
      const shape = computeSailShape(findOptimalRig(windAt(kts)).main, windAt(kts))
      expect(shape.angleOfAttackDeg).toBeGreaterThanOrEqual(8)
      expect(shape.angleOfAttackDeg).toBeLessThanOrEqual(18)
    }
  })

  it('optimal heel grows with wind until powered up, then the crew holds it', () => {
    const heels = [6, 12, 18, 25].map((kts) => {
      const wind = windAt(kts)
      return computeRelativeHeel(rigAeroFor(findOptimalRig(wind), wind), wind)
    })
    // Below the depower point more wind = more heel…
    expect(heels[1]).toBeGreaterThan(heels[0])
    expect(heels[2]).toBeGreaterThan(heels[1])
    // …past it, depowering holds heel roughly constant (rail down, not more)
    expect(heels[3]).toBeGreaterThan(heels[2] * 0.85)
    expect(heels[3]).toBeLessThan(heels[2] * 1.15)
  })
})

describe('performance — findOptimalRig follows the trim-guide progression', () => {
  // Regression suite for the "eased outhaul at 21 kts" bug: the optimal
  // trims must follow the ordering every trim guide teaches. Bands, not
  // exact grid values, so legitimate retuning has room to move.

  it('light-to-medium air: outhaul carries shape but the shelf is never fully open upwind', () => {
    for (const kts of [6, 10, 14]) {
      const { main } = findOptimalRig(windAt(kts))
      expect(main.outhaul).toBeGreaterThanOrEqual(25)
      expect(main.outhaul).toBeLessThanOrEqual(75)
    }
  })

  it('in a breeze the outhaul goes tight — the first depowering step', () => {
    for (const kts of [18, 21, 24]) {
      expect(findOptimalRig(windAt(kts)).main.outhaul).toBeGreaterThanOrEqual(75)
    }
  })

  it('the outhaul boards flat before the backstay comes on hard', () => {
    const main = findOptimalRig(windAt(18)).main
    expect(main.outhaul).toBe(100)
    expect(main.backstay).toBeLessThanOrEqual(37.5)
  })

  it('backstay comes on progressively as the breeze builds', () => {
    const backstayAt = (kts: number) => findOptimalRig(windAt(kts)).main.backstay
    expect(backstayAt(12)).toBe(0)
    expect(backstayAt(21)).toBeGreaterThanOrEqual(50)
    expect(backstayAt(24)).toBeGreaterThanOrEqual(backstayAt(21))
  })

  it('traveler drops as the wind builds', () => {
    const travelerAt = (kts: number) => findOptimalRig(windAt(kts)).main.traveler
    expect(travelerAt(8)).toBeGreaterThanOrEqual(12.5)
    expect(travelerAt(24)).toBeLessThanOrEqual(-12.5)
  })

  it('genoa: the car moves aft and the halyard tension rises in a breeze', () => {
    const light = findOptimalRig(windAt(8)).genoa
    const breeze = findOptimalRig(windAt(21)).genoa
    expect(breeze.car).toBeGreaterThan(light.car)
    expect(breeze.halyard).toBeGreaterThanOrEqual(light.halyard)
  })

  it('in a breeze the optimum holds heel just under the comfort limit', () => {
    for (const kts of [18, 21, 24]) {
      const wind = windAt(kts)
      const heel = computeRelativeHeel(rigAeroFor(findOptimalRig(wind), wind), wind)
      expect(heel).toBeGreaterThanOrEqual(28) // powered, rail working
      expect(heel).toBeLessThanOrEqual(40)    // never past the comfort limit
    }
  })
})

describe('performance — trimScore sanity', () => {
  it('bad rig trims score below the optimum', () => {
    const wind = DEFAULT_WIND
    const optScore = trimScore(rigAeroFor(findOptimalRig(wind), wind), wind)

    const neutralGenoa = { jibsheet: 50, car: 50, halyard: 25 }
    const badTrims = [
      { mainsheet: 0, traveler: -50, cunningham: 0, backstay: 0, outhaul: 0 },      // all eased
      { mainsheet: 100, traveler: 50, cunningham: 0, backstay: 0, outhaul: 100 },   // strangled
      { mainsheet: 60, traveler: 0, cunningham: 50, backstay: 100, outhaul: 100 },  // flat in 12 kts
    ]
    for (const main of badTrims) {
      const aero = rigAeroFor({ main, genoa: neutralGenoa }, wind)
      expect(trimScore(aero, wind)).toBeLessThan(optScore)
    }
  })

  it('a badly trimmed genoa alone drags the rig score down', () => {
    const wind = DEFAULT_WIND
    const rig = findOptimalRig(wind)
    const optScore = trimScore(rigAeroFor(rig, wind), wind)
    const choked = trimScore(
      rigAeroFor({ main: rig.main, genoa: { jibsheet: 100, car: 0, halyard: 100 } }, wind), wind)
    const flogging = trimScore(
      rigAeroFor({ main: rig.main, genoa: { jibsheet: 0, car: 100, halyard: 0 } }, wind), wind)
    expect(choked).toBeLessThan(optScore)
    expect(flogging).toBeLessThan(optScore)
  })
})

describe('performance — off the wind', () => {
  // AWA the store would produce sailing a reach/run on a typical polar
  const REACH: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 75 }
  const RUN: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 145 }

  for (const wind of [REACH, RUN]) {
    it(`optimal rig at AWA ${wind.apparentWindAngleDeg}° → VMG 100 and 'optimal' badge`, () => {
      const rig = findOptimalRig(wind)
      const mainAero = computeAeroCoefficients(computeSailShape(rig.main, wind), wind)
      const genoaAero = computeAeroCoefficients(
        computeGenoaShape(rig.genoa, rig.main.backstay, wind), wind, GENOA_AERO)
      const perf = estimateRigPerformance(mainAero, applyGenoaBlanketing(genoaAero, wind), wind)
      expect(perf.relativeVMG).toBeCloseTo(100, 5)
      expect(perf.powerBalance).toBe('optimal')
    })
  }

  it('downwind the optimal rig still drives forward (drag regime)', () => {
    const aero = rigAeroFor(findOptimalRig(RUN), RUN)
    const { driveCoef } = computeDriveHeel(aero, RUN)
    expect(driveCoef).toBeGreaterThan(0)
  })

  it('downwind drive is drag-dominated: rig Cd is high and Cl modest', () => {
    const aero = rigAeroFor(findOptimalRig(RUN), RUN)
    expect(aero.cd).toBeGreaterThan(0.5)
  })

  it('the same wind heels the boat less on a run than on a beat', () => {
    const beat = windAt(18)
    const run: WindState = { trueWindSpeedKts: 18, apparentWindAngleDeg: 145 }
    const beatHeel = computeRelativeHeel(rigAeroFor(findOptimalRig(beat), beat), beat)
    const runHeel = computeRelativeHeel(rigAeroFor(findOptimalRig(run), run), run)
    expect(runHeel).toBeLessThan(beatHeel)
  })

  it('downwind the optimum eases both sails against their rigging limits', () => {
    const rig = findOptimalRig(RUN)
    const main = computeSailShape(rig.main, RUN)
    const genoa = computeGenoaShape(rig.genoa, rig.main.backstay, RUN)
    // AoA pinned at (or near) the boom/sheeting-limit floor: eased right out
    expect(main.angleOfAttackDeg).toBeLessThan(90)
    expect(genoa.angleOfAttackDeg).toBeLessThan(90)
    expect(main.angleOfAttackDeg).toBeGreaterThanOrEqual(145 - 85)
    expect(genoa.angleOfAttackDeg).toBeGreaterThanOrEqual(145 - 80)
  })
})

describe('performance — output ranges (sampled)', () => {
  // Simple property-based sweep: generate combinations of AeroCoefficients
  // and verify outputs stay in [0, 100].
  const clValues = [0, 0.2, 0.5, 0.8, 1.0, 1.2, 1.5]
  const cdValues = [0.02, 0.05, 0.10, 0.20]
  const winds: WindState[] = [windAt(6), windAt(12), windAt(18), windAt(25)]

  let count = 0
  for (const cl of clValues) {
    for (const cd of cdValues) {
      for (const wind of winds) {
        count++
        it(`[${count}] cl=${cl} cd=${cd} tws=${wind.trueWindSpeedKts} → valid ranges`, () => {
          const perf = perfOf(makeAero(cl, cd), wind)
          expect(perf.relativeVMG).toBeGreaterThanOrEqual(0)
          expect(perf.relativeVMG).toBeLessThanOrEqual(100)
          expect(perf.relativeHeel).toBeGreaterThanOrEqual(0)
          expect(perf.relativeHeel).toBeLessThanOrEqual(100)
          expect(['underpowered', 'optimal', 'overpowered']).toContain(perf.powerBalance)
        })
      }
    }
  }
})

describe('performance — per-boat tuning', () => {
  const TENDER = { heelComfortFrac: 0.30 } // sportboat: depowers early
  const STIFF = { heelComfortFrac: 0.50 }  // big keelboat: carries power

  it('in a breeze, the tender boat optimum carries less heel than the stiff boat', () => {
    const wind = windAt(20)
    const heelFor = (tuning: { heelComfortFrac: number }) =>
      computeRelativeHeel(rigAeroFor(findOptimalRig(wind, tuning), wind), wind)
    expect(heelFor(TENDER)).toBeLessThan(heelFor(STIFF))
  })

  it('in light air both boats want full power (same optimum)', () => {
    const wind = windAt(7)
    expect(findOptimalRig(wind, TENDER)).toEqual(findOptimalRig(wind, STIFF))
  })

  it('the same powered-up trim scores worse on the tender boat in a breeze', () => {
    const wind = windAt(22)
    const powered: OptimalRig = {
      main: { mainsheet: 87.5, traveler: 12.5, cunningham: 25, backstay: 0, outhaul: 25 },
      genoa: { jibsheet: 62.5, car: 37.5, halyard: 25 },
    }
    const aero = rigAeroFor(powered, wind)
    expect(trimScore(aero, wind, TENDER)).toBeLessThan(trimScore(aero, wind, STIFF))
  })

  it('estimateRigPerformance can flag the same trim overpowered on tender, optimal on stiff', () => {
    const wind = windAt(20)
    const stiffOptimal = findOptimalRig(wind, STIFF)
    const mainAero = computeAeroCoefficients(computeSailShape(stiffOptimal.main, wind), wind)
    const genoaAero = computeAeroCoefficients(
      computeGenoaShape(stiffOptimal.genoa, stiffOptimal.main.backstay, wind), wind, GENOA_AERO)
    // By construction this is 'optimal' for the stiff boat…
    expect(estimateRigPerformance(mainAero, genoaAero, wind, STIFF).powerBalance).toBe('optimal')
    // …and must NOT read underpowered for the tender boat (it carries at
    // least as much heel as the tender optimum).
    expect(estimateRigPerformance(mainAero, genoaAero, wind, TENDER).powerBalance).not.toBe('underpowered')
  })
})
