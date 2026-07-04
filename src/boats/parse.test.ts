import { describe, it, expect } from 'vitest'
import { parseBoatFile, parseOrcJson, parseCsvPolar } from './parse'

// ---------------------------------------------------------------------------
// ORC JSON fixtures — same shape as data.orc.org DownBoatRMS &ext=json
// ---------------------------------------------------------------------------

const ORC_RMS = {
  RefNo: 'ESP000TEST1',
  YachtName: 'TESTBOAT',
  Class: 'Test 30',
  LOA: 9.5,
  Dspl_Sailing: 3500,
  Area_Main: 30,
  Area_Jib: 25,
  Allowances: {
    WindSpeeds: [6, 12, 20],
    WindAngles: [52, 90, 150],
    R52: [720, 600, 550], // 5.0, 6.0, ~6.55 kts
    R90: [600, 514.3, 480],
    R150: [900, 640, 450],
    Beat: [1000, 800, 720],
    Run: [1100, 750, 500],
    BeatAngle: [44, 40, 38],
    GybeAngle: [140, 150, 165],
  },
}

describe('parse — ORC certificate JSON', () => {
  it('parses the download envelope { rms: [...] }', () => {
    const boat = parseOrcJson(JSON.stringify({ rms: [ORC_RMS] }))
    expect(boat.name).toBe('TESTBOAT')
    expect(boat.custom).toBe(true)
    expect(boat.loaM).toBe(9.5)
    expect(boat.displacementKg).toBe(3500)
    expect(boat.upwindSailAreaM2).toBe(55)
    expect(boat.polar.windSpeedsKts).toEqual([6, 12, 20])
    // Allowances converted to knots: 3600/720 = 5
    expect(boat.polar.speedsKts[0][0]).toBeCloseTo(5.0)
    expect(boat.polar.beatVMGKts[0]).toBeCloseTo(3.6)
    expect(boat.polar.beatAnglesDeg).toEqual([44, 40, 38])
  })

  it('parses a bare rms record and strips a UTF-8 BOM', () => {
    const boat = parseOrcJson('﻿' + JSON.stringify(ORC_RMS))
    expect(boat.name).toBe('TESTBOAT')
    expect(boat.id).toBe('custom-esp000test1')
  })

  it('rejects an empty rms array', () => {
    expect(() => parseOrcJson('{"rms":[]}')).toThrow(/no certificates/)
  })

  it('rejects a certificate without Allowances', () => {
    const { Allowances: _, ...noPolar } = ORC_RMS
    expect(() => parseOrcJson(JSON.stringify(noPolar))).toThrow(/Allowances/)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseOrcJson('{nope')).toThrow(/not valid JSON/)
  })
})

// ---------------------------------------------------------------------------
// Plain-text polar grid
// ---------------------------------------------------------------------------

const POL_TEXT = `! Expedition-style polar
twa/tws\t6\t12\t20
45\t4.2\t5.8\t6.2
60\t4.8\t6.4\t6.9
90\t5.0\t6.9\t7.5
120\t4.6\t6.8\t8.2
150\t3.4\t5.6\t7.8
`

describe('parse — plain-text polar grid', () => {
  it('parses a tab-separated .pol file with comments', () => {
    const boat = parseCsvPolar(POL_TEXT, 'myboat.pol')
    expect(boat.name).toBe('myboat')
    expect(boat.custom).toBe(true)
    expect(boat.polar.windSpeedsKts).toEqual([6, 12, 20])
    expect(boat.polar.windAnglesDeg).toEqual([45, 60, 90, 120, 150])
    expect(boat.polar.speedsKts[2]).toEqual([5.0, 6.9, 7.5])
  })

  it('derives beat optima from the upwind rows', () => {
    const boat = parseCsvPolar(POL_TEXT, 'myboat.pol')
    // At TWS 6: VMG(45°) = 4.2·cos45 ≈ 2.97, VMG(60°) = 4.8·cos60 = 2.4 → beat at 45°
    expect(boat.polar.beatAnglesDeg[0]).toBe(45)
    expect(boat.polar.beatVMGKts[0]).toBeCloseTo(4.2 * Math.cos(Math.PI / 4), 2)
  })

  it('derives run optima from the downwind rows', () => {
    const boat = parseCsvPolar(POL_TEXT, 'myboat.pol')
    // At TWS 6: |VMG(120°)| = 4.6·cos60 = 2.3, |VMG(150°)| = 3.4·cos30 ≈ 2.94 → gybe at 150°
    expect(boat.polar.gybeAnglesDeg[0]).toBe(150)
    expect(boat.polar.runVMGKts[0]).toBeCloseTo(3.4 * Math.cos(Math.PI / 6), 2)
  })

  it('accepts comma-separated values', () => {
    const csv = 'twa,6,12\n45,4.2,5.8\n90,5.0,6.9\n150,3.4,5.6\n'
    const boat = parseCsvPolar(csv, 'boat.csv')
    expect(boat.polar.windSpeedsKts).toEqual([6, 12])
    expect(boat.polar.speedsKts[0]).toEqual([4.2, 5.8])
  })

  it('rejects a row with the wrong number of columns', () => {
    const bad = 'twa 6 12\n45 4.2\n90 5.0 6.9\n'
    expect(() => parseCsvPolar(bad, 'bad.pol')).toThrow(/expected 2/)
  })

  it('rejects a polar with no upwind rows', () => {
    const bad = 'twa 6 12\n110 4.2 5.5\n150 3.4 5.6\n'
    expect(() => parseCsvPolar(bad, 'bad.pol')).toThrow(/upwind/)
  })

  it('rejects non-ascending angles', () => {
    const bad = 'twa 6 12\n90 5.0 6.9\n45 4.2 5.8\n'
    expect(() => parseCsvPolar(bad, 'bad.pol')).toThrow(/ascending/)
  })
})

describe('parse — format dispatch', () => {
  it('routes JSON content to the ORC parser', () => {
    const boat = parseBoatFile('cert.json', JSON.stringify({ rms: [ORC_RMS] }))
    expect(boat.source).toContain('ESP000TEST1')
  })

  it('routes text content to the grid parser', () => {
    const boat = parseBoatFile('myboat.pol', POL_TEXT)
    expect(boat.source).toContain('myboat.pol')
  })
})
