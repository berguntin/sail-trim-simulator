import { describe, it, expect } from 'vitest'
import {
  computeAeroCoefficients,
  baseCl,
  optimalTwistDeg,
  computeLocalFlow,
  genoaBlanketFactor,
  applyGenoaBlanketing,
  MAINSAIL_AERO,
  GENOA_AERO,
} from './aerodynamics'
import type { SailShape, WindState } from './types'

const DEFAULT_WIND: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }

function makeShape(overrides: Partial<SailShape> = {}): SailShape {
  return {
    angleOfAttackDeg: 12,
    twistDeg: 10,
    camberRatio: 0.10,
    draftPositionRatio: 0.45,
    footFullnessRatio: 1.0,
    ...overrides,
  }
}

describe('aerodynamics — Cl vs angle of attack', () => {
  it('Cl is highest in the optimal range (8-20°), not at extremes', () => {
    const cls = [2, 5, 12, 22, 30].map((aoa) =>
      computeAeroCoefficients(makeShape({ angleOfAttackDeg: aoa }), DEFAULT_WIND).cl,
    )
    const [cl2, , cl12, cl22, cl30] = cls
    // Peak should be in the 12° area, clearly above low and stall extremes
    expect(cl12).toBeGreaterThan(cl2)
    expect(cl12).toBeGreaterThan(cl30)
    expect(cl22).toBeGreaterThan(cl30)
  })

  it('baseCl stalls (decreases) for AoA > 24°', () => {
    const cl20 = baseCl(20)
    const cl24 = baseCl(24)
    const cl28 = baseCl(28)
    expect(cl24).toBeLessThan(cl20)
    expect(cl28).toBeLessThan(cl24)
  })

  it('baseCl rises from near-zero at AoA = 0', () => {
    expect(baseCl(0)).toBeLessThanOrEqual(0.05)
    expect(baseCl(10)).toBeGreaterThan(baseCl(0))
  })
})

describe('aerodynamics — Cl vs camber (power)', () => {
  it('a fuller sail generates more lift than a flatter one at the same AoA', () => {
    const flat = computeAeroCoefficients(makeShape({ camberRatio: 0.06 }), DEFAULT_WIND)
    const medium = computeAeroCoefficients(makeShape({ camberRatio: 0.10 }), DEFAULT_WIND)
    const full = computeAeroCoefficients(makeShape({ camberRatio: 0.15 }), DEFAULT_WIND)
    expect(medium.cl).toBeGreaterThan(flat.cl)
    expect(full.cl).toBeGreaterThan(medium.cl)
  })
})

describe('aerodynamics — local flow (telltales)', () => {
  it('a well-trimmed sail has attached flow top to bottom', () => {
    // AoA 12°, twist ≈ optimal for 12 kts
    const shape = makeShape({ angleOfAttackDeg: 12, twistDeg: optimalTwistDeg(12) })
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      expect(computeLocalFlow(shape, DEFAULT_WIND, u).regime).toBe('attached')
    }
  })

  it('a strangled sail (very high AoA) separates at the foot', () => {
    const shape = makeShape({ angleOfAttackDeg: 24, twistDeg: 5 })
    expect(computeLocalFlow(shape, DEFAULT_WIND, 0).regime).toBe('separated')
  })

  it('an eased sail (very low AoA) luffs', () => {
    const shape = makeShape({ angleOfAttackDeg: 2, twistDeg: 10 })
    expect(computeLocalFlow(shape, DEFAULT_WIND, 0).regime).toBe('luffing')
  })

  it('excess twist makes the head luff before the foot', () => {
    const shape = makeShape({ angleOfAttackDeg: 8, twistDeg: 25 })
    const foot = computeLocalFlow(shape, DEFAULT_WIND, 0)
    const head = computeLocalFlow(shape, DEFAULT_WIND, 1)
    expect(head.localAoADeg).toBeLessThan(foot.localAoADeg)
    expect(head.regime).toBe('luffing')
    expect(foot.regime).toBe('attached')
  })

  it('local AoA decreases from foot to head when sail twist exceeds wind twist', () => {
    const shape = makeShape({ angleOfAttackDeg: 12, twistDeg: 20 })
    const aoas = [0, 0.5, 1].map((u) => computeLocalFlow(shape, DEFAULT_WIND, u).localAoADeg)
    expect(aoas[1]).toBeLessThan(aoas[0])
    expect(aoas[2]).toBeLessThan(aoas[1])
  })
})

describe('aerodynamics — twist penalty', () => {
  it('shape with optimal twist has higher or equal Cl than same shape with very high twist', () => {
    const wind: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }
    const optTwist = optimalTwistDeg(12)
    const optimal = computeAeroCoefficients(makeShape({ twistDeg: optTwist }), wind)
    const veryHighTwist = computeAeroCoefficients(makeShape({ twistDeg: optTwist + 10 }), wind)
    expect(optimal.cl).toBeGreaterThanOrEqual(veryHighTwist.cl)
  })

  it('shape with optimal twist has higher or equal Cl than same shape with very low twist', () => {
    const wind: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 30 }
    const optTwist = optimalTwistDeg(12)
    const optimal = computeAeroCoefficients(makeShape({ twistDeg: optTwist }), wind)
    const veryLowTwist = computeAeroCoefficients(makeShape({ twistDeg: Math.max(5, optTwist - 10) }), wind)
    expect(optimal.cl).toBeGreaterThanOrEqual(veryLowTwist.cl)
  })
})

describe('aerodynamics — Cd vs camber', () => {
  it('Cd increases monotonically with camberRatio above the optimal range', () => {
    const shape1 = makeShape({ camberRatio: 0.12 })
    const shape2 = makeShape({ camberRatio: 0.15 })
    const shape3 = makeShape({ camberRatio: 0.18 })

    const cd1 = computeAeroCoefficients(shape1, DEFAULT_WIND).cd
    const cd2 = computeAeroCoefficients(shape2, DEFAULT_WIND).cd
    const cd3 = computeAeroCoefficients(shape3, DEFAULT_WIND).cd

    expect(cd2).toBeGreaterThan(cd1)
    expect(cd3).toBeGreaterThan(cd2)
  })
})

describe('aerodynamics — deep stall (flat-plate regime)', () => {
  it('Cl keeps falling past stall and vanishes square to the flow', () => {
    expect(baseCl(45)).toBeLessThan(baseCl(20))
    expect(baseCl(70)).toBeLessThan(baseCl(45))
    expect(baseCl(90)).toBeCloseTo(0, 5)
  })

  it('baseCl is continuous at the soft-stall / deep-stall join (35°)', () => {
    expect(baseCl(34.999)).toBeCloseTo(baseCl(35.001), 2)
  })

  it('deep-stall drag dwarfs working-range drag (drive by drag on a run)', () => {
    const working = computeAeroCoefficients(makeShape({ angleOfAttackDeg: 12 }), DEFAULT_WIND)
    const stalled = computeAeroCoefficients(makeShape({ angleOfAttackDeg: 80 }), DEFAULT_WIND)
    expect(stalled.cd).toBeGreaterThan(1.0)
    expect(stalled.cd).toBeGreaterThan(working.cd * 5)
  })

  it('Cd rises through the stall and stays plate-high in deep stall', () => {
    const cdAt = (aoa: number) =>
      computeAeroCoefficients(makeShape({ angleOfAttackDeg: aoa }), DEFAULT_WIND).cd
    expect(cdAt(40)).toBeGreaterThan(cdAt(25))
    // Past ~40° the pressure drag plateaus around the flat-plate ceiling
    expect(cdAt(60)).toBeGreaterThan(1.0)
    expect(cdAt(80)).toBeGreaterThan(1.0)
  })
})

describe('aerodynamics — genoa blanketing', () => {
  it('no blanketing at reaching angles and tighter', () => {
    expect(genoaBlanketFactor(30)).toBe(1)
    expect(genoaBlanketFactor(120)).toBe(1)
  })

  it('fades toward deep running angles', () => {
    expect(genoaBlanketFactor(145)).toBeLessThan(1)
    expect(genoaBlanketFactor(170)).toBeLessThan(genoaBlanketFactor(145))
    expect(genoaBlanketFactor(170)).toBeCloseTo(0.45, 5)
  })

  it('scales Cl and Cd equally, leaving efficiency unchanged', () => {
    const aero = { cl: 1.0, cd: 0.2, efficiency: 5 }
    const wind: WindState = { trueWindSpeedKts: 12, apparentWindAngleDeg: 150 }
    const blanketed = applyGenoaBlanketing(aero, wind)
    expect(blanketed.cl).toBeLessThan(aero.cl)
    expect(blanketed.cd).toBeLessThan(aero.cd)
    expect(blanketed.efficiency).toBeCloseTo(aero.efficiency, 10)
  })

  it('is the identity upwind', () => {
    const aero = { cl: 1.0, cd: 0.2, efficiency: 5 }
    expect(applyGenoaBlanketing(aero, DEFAULT_WIND)).toEqual(aero)
  })
})

describe('aerodynamics — per-sail params', () => {
  it('omitting params is identical to passing MAINSAIL_AERO explicitly', () => {
    const implicit = computeAeroCoefficients(makeShape(), DEFAULT_WIND)
    const explicit = computeAeroCoefficients(makeShape(), DEFAULT_WIND, MAINSAIL_AERO)
    expect(implicit).toEqual(explicit)
  })

  it('params only touch drag: same shape → same Cl for main and genoa', () => {
    const main = computeAeroCoefficients(makeShape(), DEFAULT_WIND, MAINSAIL_AERO)
    const genoa = computeAeroCoefficients(makeShape(), DEFAULT_WIND, GENOA_AERO)
    expect(genoa.cl).toBe(main.cl)
  })

  it('genoa carries slightly more induced drag per unit Cl (lower π·AR·e)', () => {
    const main = computeAeroCoefficients(makeShape(), DEFAULT_WIND, MAINSAIL_AERO)
    const genoa = computeAeroCoefficients(makeShape(), DEFAULT_WIND, GENOA_AERO)
    expect(genoa.cd).toBeGreaterThan(main.cd)
  })
})

describe('aerodynamics — internal consistency', () => {
  it('efficiency always equals cl / cd exactly', () => {
    const testCases: Partial<SailShape>[] = [
      { angleOfAttackDeg: 5 },
      { angleOfAttackDeg: 12 },
      { angleOfAttackDeg: 22 },
      { camberRatio: 0.06 },
      { camberRatio: 0.18 },
    ]
    for (const override of testCases) {
      const { cl, cd, efficiency } = computeAeroCoefficients(makeShape(override), DEFAULT_WIND)
      expect(efficiency).toBeCloseTo(cl / cd, 10)
    }
  })

  it('Cl is always within [0, 2] for all valid inputs', () => {
    const aoaValues = [0, 5, 10, 15, 20, 25, 30]
    for (const aoa of aoaValues) {
      const { cl } = computeAeroCoefficients(makeShape({ angleOfAttackDeg: aoa }), DEFAULT_WIND)
      expect(cl).toBeGreaterThanOrEqual(0)
      expect(cl).toBeLessThanOrEqual(2)
    }
  })

  it('Cd is always positive', () => {
    const shapes = [
      makeShape({ camberRatio: 0.05, draftPositionRatio: 0.35 }),
      makeShape({ camberRatio: 0.18, draftPositionRatio: 0.55 }),
      makeShape({ angleOfAttackDeg: 28, twistDeg: 25 }),
    ]
    for (const shape of shapes) {
      const { cd } = computeAeroCoefficients(shape, DEFAULT_WIND)
      expect(cd).toBeGreaterThan(0)
    }
  })
})
