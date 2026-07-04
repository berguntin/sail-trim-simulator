/**
 * orcApi.ts — Load a boat straight from the public ORC certificate database.
 *
 * data.orc.org serves active certificates over a CORS-enabled endpoint
 * (DownBoatRMS), so the browser can query it directly — no backend needed.
 * A sail number ("ESP-7352") already carries the national authority prefix,
 * making it effectively unique worldwide, unlike yacht names.
 *
 * The endpoint wants the exact database spelling ("ESP-7352"), so user input
 * is normalized first, and if the exact match comes up empty a `%` wildcard
 * between prefix and number is tried before giving up (the endpoint supports
 * SQL LIKE patterns).
 */

import type { BoatModel } from './types'
import { parseOrcJson } from './parse'

const ORC_ENDPOINT = 'https://data.orc.org/public/WPub.dll'

const REQUEST_TIMEOUT_MS = 20_000

/** "esp 7352" / "ESP7352" / "esp-7352" → "ESP-7352" */
export function normalizeSailNo(input: string): string {
  const raw = input.trim().toUpperCase()
  const m = raw.match(/^([A-Z]{2,3})[\s-]*([0-9].*)$/)
  return m ? `${m[1]}-${m[2]}` : raw
}

/** GET one certificate as JSON text; null when the query matched nothing. */
async function queryBySailNo(sailNo: string): Promise<string | null> {
  const url = `${ORC_ENDPOINT}?action=DownBoatRMS&SailNo=${encodeURIComponent(sailNo)}&ext=json`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new Error('Could not reach the ORC database — check your connection')
  }
  if (!res.ok) throw new Error(`ORC database returned HTTP ${res.status}`)

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new Error('ORC database returned an unexpected response')
  }
  const rms = (data as { rms?: unknown }).rms
  return Array.isArray(rms) && rms.length > 0 ? text : null
}

/**
 * Fetch the active ORC certificate for a sail number and turn it into a
 * BoatModel (via the same parser used for user-uploaded certificate files).
 * Throws Error with a user-presentable message.
 */
export async function fetchBoatBySailNo(input: string): Promise<BoatModel> {
  const sailNo = normalizeSailNo(input)
  if (!sailNo) throw new Error('Enter a sail number, e.g. ESP-7352')

  let text = await queryBySailNo(sailNo)

  // Forgive separator quirks ("ESP 7352 C" vs "ESP-7352_C"): retry with a
  // wildcard between the country prefix and the rest.
  if (text === null) {
    const m = sailNo.match(/^([A-Z]{2,3})-(.+)$/)
    if (m) text = await queryBySailNo(`${m[1]}%${m[2]}`)
  }

  if (text === null) {
    throw new Error(
      `No active ORC certificate found for "${sailNo}" — expected format ESP-7352`,
    )
  }
  return parseOrcJson(text)
}
