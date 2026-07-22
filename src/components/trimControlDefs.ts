/**
 * Shared trim-slider definitions, used by both the classic slider panel
 * (TrimControls) and the on-model anchor overlay (TrimAnchorOverlay).
 *
 * Only the non-textual metadata lives here — labels and hints belong to the
 * locale files under trim.sliders.<key>.
 */

export type MainControlKey = 'mainsheet' | 'traveler' | 'cunningham' | 'backstay' | 'outhaul'
export type GenoaControlKey = 'jibsheet' | 'car' | 'halyard'

export interface TrimSliderDef<K extends string = MainControlKey | GenoaControlKey> {
  key: K
  sail: 'main' | 'genoa'
  /** Two-letter code shown inside the on-model badge. */
  short: string
  min: number
  max: number
  step: number
  unit: string
}

export const MAIN_TRIM_SLIDERS: TrimSliderDef<MainControlKey>[] = [
  { key: 'mainsheet', sail: 'main', short: 'MS', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'traveler', sail: 'main', short: 'TR', min: -50, max: 50, step: 1, unit: '' },
  { key: 'outhaul', sail: 'main', short: 'OH', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'cunningham', sail: 'main', short: 'CU', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'backstay', sail: 'main', short: 'BS', min: 0, max: 100, step: 1, unit: '%' },
]

export const GENOA_TRIM_SLIDERS: TrimSliderDef<GenoaControlKey>[] = [
  { key: 'jibsheet', sail: 'genoa', short: 'JS', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'car', sail: 'genoa', short: 'CA', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'halyard', sail: 'genoa', short: 'HA', min: 0, max: 100, step: 1, unit: '%' },
]

export type TrimAnchorKey = MainControlKey | GenoaControlKey

export interface AnchorScreenPos {
  x: number
  y: number
  visible: boolean
}
