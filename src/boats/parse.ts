/**
 * parse.ts — User-supplied boat model files → BoatModel
 *
 * Two formats are supported:
 *
 * 1. ORC certificate JSON, as downloaded from the ORC public database
 *    (https://data.orc.org → "DownBoatRMS...&ext=json"). Either the full
 *    `{ "rms": [ ... ] }` envelope or a single rms record object. Allowances
 *    (seconds/mile) are converted to knots.
 *
 * 2. Plain-text polar grid (.pol / .csv / .txt) as used by Expedition and
 *    most routing tools: a header row with wind speeds, then one row per
 *    wind angle with target boat speeds in knots. Beat/run optima are not
 *    part of that format, so they are derived by maximising VMG over the
 *    grid rows (upwind rows < 90°, downwind rows > 90°).
 *
 * All parse errors throw Error with a user-presentable message.
 */

import type { BoatModel, OrcPolar } from './types'
import { allowanceToKts } from './polar'

// ---------------------------------------------------------------------------
// ORC certificate JSON
// ---------------------------------------------------------------------------

interface OrcAllowances {
  WindSpeeds: number[]
  WindAngles: number[]
  Beat: number[]
  Run: number[]
  BeatAngle: number[]
  GybeAngle: number[]
  [key: string]: number[]
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')
}

function parseOrcJson(text: string): BoatModel {
  let data: unknown
  try {
    // ORC serves JSON with a UTF-8 BOM; strip it before parsing
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new Error('File is not valid JSON')
  }

  // Accept the download envelope { rms: [...] } or a bare rms record
  let rms: Record<string, unknown>
  if (data && typeof data === 'object' && 'rms' in data) {
    const arr = (data as { rms: unknown }).rms
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('ORC file contains no certificates ("rms" array is empty)')
    }
    rms = arr[0] as Record<string, unknown>
  } else if (data && typeof data === 'object') {
    rms = data as Record<string, unknown>
  } else {
    throw new Error('Unrecognized ORC JSON structure')
  }

  const al = rms.Allowances as OrcAllowances | undefined
  if (!al || !isNumberArray(al.WindSpeeds) || !isNumberArray(al.WindAngles)) {
    throw new Error('ORC certificate has no "Allowances" polar table')
  }
  for (const key of ['Beat', 'Run', 'BeatAngle', 'GybeAngle']) {
    if (!isNumberArray(al[key])) throw new Error(`ORC Allowances missing "${key}"`)
  }

  const speedsKts = al.WindAngles.map((angle) => {
    const row = al[`R${Math.round(angle)}`]
    if (!isNumberArray(row) || row.length !== al.WindSpeeds.length) {
      throw new Error(`ORC Allowances missing row "R${Math.round(angle)}"`)
    }
    return row.map(allowanceToKts)
  })

  const polar: OrcPolar = {
    windSpeedsKts: al.WindSpeeds,
    windAnglesDeg: al.WindAngles,
    speedsKts,
    beatAnglesDeg: al.BeatAngle,
    beatVMGKts: al.Beat.map(allowanceToKts),
    gybeAnglesDeg: al.GybeAngle,
    runVMGKts: al.Run.map(allowanceToKts),
  }

  const name = (rms.YachtName as string) || (rms.Class as string) || 'Custom boat'
  const cls = rms.Class as string | undefined
  const refNo = rms.RefNo as string | undefined
  const areaMain = typeof rms.Area_Main === 'number' ? rms.Area_Main : null
  const areaJib = typeof rms.Area_Jib === 'number' ? rms.Area_Jib : null

  return {
    id: `custom-${(refNo || name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    description: cls ? `${cls} — ORC certificate` : 'ORC certificate',
    source: refNo ? `ORC certificate ${refNo}` : 'ORC certificate (user file)',
    loaM: typeof rms.LOA === 'number' ? rms.LOA : null,
    displacementKg: typeof rms.Dspl_Sailing === 'number' ? rms.Dspl_Sailing : null,
    upwindSailAreaM2: areaMain !== null && areaJib !== null ? areaMain + areaJib : null,
    areaMainM2: areaMain,
    areaJibM2: areaJib,
    polar,
    custom: true,
  }
}

// ---------------------------------------------------------------------------
// Plain-text polar grid (.pol / .csv)
// ---------------------------------------------------------------------------

/** Split a polar file line on tabs, commas, semicolons or whitespace runs. */
function splitLine(line: string): string[] {
  return line.trim().split(/[\t,;]+|\s+/).filter((t) => t.length > 0)
}

function derivedOptima(windSpeedsKts: number[], windAnglesDeg: number[], speedsKts: number[][]) {
  const beatAnglesDeg: number[] = []
  const beatVMGKts: number[] = []
  const gybeAnglesDeg: number[] = []
  const runVMGKts: number[] = []

  for (let j = 0; j < windSpeedsKts.length; j++) {
    let bestUp = 0, bestUpAngle = windAnglesDeg[0]
    let bestDown = 0, bestDownAngle = windAnglesDeg[windAnglesDeg.length - 1]
    for (let i = 0; i < windAnglesDeg.length; i++) {
      const vmg = speedsKts[i][j] * Math.cos((windAnglesDeg[i] * Math.PI) / 180)
      if (windAnglesDeg[i] < 90 && vmg > bestUp) {
        bestUp = vmg
        bestUpAngle = windAnglesDeg[i]
      }
      if (windAnglesDeg[i] > 90 && -vmg > bestDown) {
        bestDown = -vmg
        bestDownAngle = windAnglesDeg[i]
      }
    }
    beatAnglesDeg.push(bestUpAngle)
    beatVMGKts.push(bestUp)
    gybeAnglesDeg.push(bestDownAngle)
    runVMGKts.push(bestDown)
  }
  return { beatAnglesDeg, beatVMGKts, gybeAnglesDeg, runVMGKts }
}

function parseCsvPolar(text: string, fileName: string): BoatModel {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('!') && !l.startsWith('#'))

  if (lines.length < 3) throw new Error('Polar file needs a header row and at least 2 angle rows')

  // Header: optional "TWA/TWS"-style label, then the wind speed columns
  const headerTokens = splitLine(lines[0])
  const windSpeedsKts = headerTokens
    .filter((t) => !Number.isNaN(Number(t)))
    .map(Number)
  if (windSpeedsKts.length < 2) {
    throw new Error('Header row must list at least 2 wind speeds (e.g. "twa/tws 6 8 10 12 16 20")')
  }

  const windAnglesDeg: number[] = []
  const speedsKts: number[][] = []
  for (const line of lines.slice(1)) {
    const nums = splitLine(line).map(Number)
    if (nums.some(Number.isNaN)) throw new Error(`Non-numeric value in row: "${line}"`)
    if (nums.length !== windSpeedsKts.length + 1) {
      throw new Error(
        `Row "${line}" has ${nums.length - 1} speeds, expected ${windSpeedsKts.length}`,
      )
    }
    windAnglesDeg.push(nums[0])
    speedsKts.push(nums.slice(1))
  }

  if (windAnglesDeg.length < 2) throw new Error('Polar file needs at least 2 wind angle rows')
  if (!windAnglesDeg.every((a, i) => i === 0 || a > windAnglesDeg[i - 1])) {
    throw new Error('Wind angle rows must be in ascending order')
  }
  if (!windAnglesDeg.some((a) => a < 90)) {
    throw new Error('Polar file needs at least one upwind row (angle < 90°)')
  }

  const name = fileName.replace(/\.[^.]+$/, '') || 'Custom polar'
  return {
    id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    description: 'Custom polar grid (beat/run optima derived from the grid)',
    source: `User file ${fileName}`,
    loaM: null,
    displacementKg: null,
    upwindSailAreaM2: null,
    areaMainM2: null,
    areaJibM2: null,
    polar: {
      windSpeedsKts,
      windAnglesDeg,
      speedsKts,
      ...derivedOptima(windSpeedsKts, windAnglesDeg, speedsKts),
    },
    custom: true,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseBoatFile(fileName: string, text: string): BoatModel {
  const trimmed = text.replace(/^﻿/, '').trimStart()
  return trimmed.startsWith('{') ? parseOrcJson(text) : parseCsvPolar(text, fileName)
}

// Export internals for testing
export { parseOrcJson, parseCsvPolar }
