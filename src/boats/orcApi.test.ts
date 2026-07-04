import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { normalizeSailNo, fetchBoatBySailNo } from './orcApi'

// Minimal certificate, same shape as data.orc.org DownBoatRMS &ext=json
const ORC_RMS = {
  RefNo: 'ESP000TEST1',
  YachtName: 'TESTBOAT',
  Class: 'Test 30',
  SailNo: 'ESP-7352',
  Allowances: {
    WindSpeeds: [6, 12, 20],
    WindAngles: [52, 90, 150],
    R52: [720, 600, 550],
    R90: [600, 514.3, 480],
    R150: [900, 640, 450],
    Beat: [1000, 800, 720],
    Run: [1100, 750, 500],
    BeatAngle: [44, 40, 38],
    GybeAngle: [140, 150, 165],
  },
}

const HIT = JSON.stringify({ rms: [ORC_RMS] })
const MISS = JSON.stringify({ rms: [] })

function mockFetch(...bodies: (string | number)[]) {
  const fn = vi.fn()
  for (const body of bodies) {
    if (typeof body === 'number') {
      fn.mockResolvedValueOnce(new Response('', { status: body }))
    } else {
      fn.mockResolvedValueOnce(new Response(body, { status: 200 }))
    }
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('normalizeSailNo', () => {
  it('canonicalizes prefix/number separators to a hyphen', () => {
    expect(normalizeSailNo('esp 7352')).toBe('ESP-7352')
    expect(normalizeSailNo('ESP7352')).toBe('ESP-7352')
    expect(normalizeSailNo(' esp-7352 ')).toBe('ESP-7352')
    expect(normalizeSailNo('ita 17352')).toBe('ITA-17352')
  })

  it('leaves unrecognized shapes as trimmed uppercase', () => {
    expect(normalizeSailNo('7352')).toBe('7352')
    expect(normalizeSailNo(' fra ')).toBe('FRA')
    expect(normalizeSailNo('')).toBe('')
  })
})

describe('fetchBoatBySailNo', () => {
  it('loads a boat on an exact match', async () => {
    const fetch = mockFetch(HIT)
    const boat = await fetchBoatBySailNo('esp 7352')
    expect(boat.name).toBe('TESTBOAT')
    expect(boat.custom).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('SailNo=ESP-7352')
    expect(fetch.mock.calls[0][0]).toContain('ext=json')
  })

  it('retries with a wildcard when the exact match is empty', async () => {
    const fetch = mockFetch(MISS, HIT)
    const boat = await fetchBoatBySailNo('ESP-7352')
    expect(boat.name).toBe('TESTBOAT')
    expect(fetch).toHaveBeenCalledTimes(2)
    // encodeURIComponent('ESP%7352')
    expect(fetch.mock.calls[1][0]).toContain('SailNo=ESP%257352')
  })

  it('reports when no certificate matches', async () => {
    mockFetch(MISS, MISS)
    await expect(fetchBoatBySailNo('ESP-9999')).rejects.toThrow(/No active ORC certificate/)
  })

  it('rejects empty input without calling the API', async () => {
    const fetch = mockFetch()
    await expect(fetchBoatBySailNo('   ')).rejects.toThrow(/Enter a sail number/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports HTTP errors', async () => {
    mockFetch(503)
    await expect(fetchBoatBySailNo('ESP-7352')).rejects.toThrow(/HTTP 503/)
  })

  it('reports non-JSON responses', async () => {
    mockFetch('<html>maintenance</html>')
    await expect(fetchBoatBySailNo('ESP-7352')).rejects.toThrow(/unexpected response/)
  })

  it('wraps network failures in a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchBoatBySailNo('ESP-7352')).rejects.toThrow(/Could not reach/)
  })
})
