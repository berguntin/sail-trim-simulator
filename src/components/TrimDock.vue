<script setup lang="ts">
/**
 * TrimDock — direct-manipulation trim controls in a row along the bottom
 * of the 3D canvas, mainsail group left, headsail group right.
 *
 * Each badge is a progress dial showing the control's setting at a glance,
 * with its localized two-letter code inside. Trimming is direct:
 *
 *  - drag the badge vertically (up = trim on, down = ease)
 *  - mouse wheel over the badge for fine adjustment
 *  - arrow keys when the badge has focus (the badges are role="slider")
 *
 * A non-interactive tooltip with the name, value and hint shows on hover
 * and while dragging.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTrimStore } from '../stores/trimStore'
import {
  MAIN_TRIM_SLIDERS,
  GENOA_TRIM_SLIDERS,
  type TrimSliderDef,
  type TrimAnchorKey,
  type MainControlKey,
  type GenoaControlKey,
} from './trimControlDefs'

const { t } = useI18n()
const store = useTrimStore()

const defs: TrimSliderDef[] = [...MAIN_TRIM_SLIDERS, ...GENOA_TRIM_SLIDERS]

/** Labels, hints and badge codes live in the locale files. */
function labelOf(d: TrimSliderDef): string {
  return t(`trim.sliders.${d.key}.label`)
}

function hintOf(d: TrimSliderDef): string {
  return t(`trim.sliders.${d.key}.hint`)
}

function shortOf(d: TrimSliderDef): string {
  return t(`trim.sliders.${d.key}.short`)
}

function valueOf(d: TrimSliderDef): number {
  return d.sail === 'main'
    ? store.controls[d.key as MainControlKey]
    : store.genoaControls[d.key as GenoaControlKey]
}

function setValue(d: TrimSliderDef, raw: number) {
  const stepped = Math.round(raw / d.step) * d.step
  const clamped = Math.min(d.max, Math.max(d.min, stepped))
  if (d.sail === 'main') store.setControl(d.key as MainControlKey, clamped)
  else store.setGenoaControl(d.key as GenoaControlKey, clamped)
}

function displayValue(d: TrimSliderDef): string {
  const v = valueOf(d)
  if (d.key === 'traveler') {
    if (v > 5) return t('trim.traveler.windward', { v })
    if (v < -5) return t('trim.traveler.leeward', { v })
    return t('trim.traveler.centered', { v })
  }
  return `${v}${d.unit}`
}

/** Ring fill 0–1 for the badge dial. */
function fracOf(d: TrimSliderDef): number {
  return (valueOf(d) - d.min) / (d.max - d.min)
}

// ---------------------------------------------------------------------------
// Direct manipulation: vertical pointer drag + wheel + arrow keys
// ---------------------------------------------------------------------------

/** Pixels of vertical drag that sweep the full control range. */
const DRAG_FULL_RANGE_PX = 150
/** Fraction of the range one wheel notch moves. */
const WHEEL_STEP_FRAC = 0.02

const dragging = ref<TrimAnchorKey | null>(null)
let dragStartY = 0
let dragStartValue = 0

function onPointerDown(d: TrimSliderDef, e: PointerEvent) {
  dragging.value = d.key
  dragStartY = e.clientY
  dragStartValue = valueOf(d)
  // Synthetic events (tests) carry no capturable pointerId — trim still works
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch { /* ignore */ }
}

function onPointerMove(d: TrimSliderDef, e: PointerEvent) {
  if (dragging.value !== d.key) return
  const range = d.max - d.min
  // Up = trim on (sheet in / more tension), down = ease
  const dy = dragStartY - e.clientY
  setValue(d, dragStartValue + (dy / DRAG_FULL_RANGE_PX) * range)
}

function onPointerUp(d: TrimSliderDef, e: PointerEvent) {
  if (dragging.value !== d.key) return
  dragging.value = null
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }
}

function onWheel(d: TrimSliderDef, e: WheelEvent) {
  // Keep the wheel from zooming the camera / scrolling the page
  e.preventDefault()
  if (e.deltaY === 0) return
  const range = d.max - d.min
  setValue(d, valueOf(d) - Math.sign(e.deltaY) * range * WHEEL_STEP_FRAC)
}

function onKeydown(d: TrimSliderDef, e: KeyboardEvent) {
  const range = d.max - d.min
  const step = range * WHEEL_STEP_FRAC
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault()
    setValue(d, valueOf(d) + step)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault()
    setValue(d, valueOf(d) - step)
  }
}
</script>

<template>
  <div class="trim-dock">
    <div
      v-for="d in defs"
      :key="d.key"
      class="dock-item"
      :class="[d.sail, { dragging: dragging === d.key, 'group-start': d.key === 'jibsheet' }]"
    >
      <button
        class="badge"
        :style="{ '--frac': fracOf(d) }"
        role="slider"
        :aria-label="labelOf(d)"
        :aria-valuemin="d.min"
        :aria-valuemax="d.max"
        :aria-valuenow="valueOf(d)"
        :aria-valuetext="displayValue(d)"
        @pointerdown="(e) => onPointerDown(d, e)"
        @pointermove="(e) => onPointerMove(d, e)"
        @pointerup="(e) => onPointerUp(d, e)"
        @pointercancel="(e) => onPointerUp(d, e)"
        @wheel="(e) => onWheel(d, e)"
        @keydown="(e) => onKeydown(d, e)"
      >
        <span class="badge-inner">{{ shortOf(d) }}</span>
      </button>

      <div class="tooltip">
        <div class="tip-label">
          <span class="tip-name">{{ labelOf(d) }}</span>
          <span class="tip-value">{{ displayValue(d) }}</span>
        </div>
        <span class="tip-hint">{{ hintOf(d) }}</span>
        <span class="tip-how">{{ t('trim.anchorHow') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trim-dock {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 12px);
  pointer-events: none;
  z-index: 5;
}

.dock-item {
  position: relative;
}

/* Divider between the mainsail and headsail groups */
.dock-item.group-start {
  margin-left: 14px;
}

.dock-item.group-start::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 15%;
  bottom: 15%;
  width: 1px;
  background: var(--color-border);
}

/* -- Badge: progress ring + localized code -------------------------------- */

.badge {
  --ring: var(--color-accent);
  pointer-events: auto;
  display: block;
  width: 38px;
  height: 38px;
  padding: 3px;
  border: none;
  border-radius: 50%;
  cursor: ns-resize;
  touch-action: none;
  background: conic-gradient(
    var(--ring) calc(var(--frac) * 360deg),
    rgba(30, 48, 74, 0.85) 0
  );
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
  transition: transform 0.12s ease;
}

.dock-item.genoa .badge {
  --ring: #e8c476;
}

.badge:hover,
.badge:focus-visible,
.dock-item.dragging .badge {
  transform: scale(1.15);
  outline: none;
}

.badge-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(10, 24, 38, 0.92);
  color: var(--color-text);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  pointer-events: none;
}

/* -- Tooltip (info only — trimming is drag/wheel on the badge) ------------ */

.tooltip {
  pointer-events: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 215px;
  display: none;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.65rem;
  background: rgba(13, 21, 32, 0.96);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.6);
}

.dock-item:hover .tooltip,
.dock-item:focus-within .tooltip,
.dock-item.dragging .tooltip {
  display: flex;
}

.tip-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.tip-name {
  font-weight: 600;
  color: var(--color-text);
}

.tip-value {
  font-variant-numeric: tabular-nums;
  color: var(--color-accent);
  font-weight: 600;
  white-space: nowrap;
}

.tip-hint {
  font-size: 0.68rem;
  color: var(--color-hint);
  font-style: italic;
  line-height: 1.35;
}

.tip-how {
  font-size: 0.62rem;
  color: var(--color-hint);
  opacity: 0.8;
  letter-spacing: 0.03em;
}

/* Touch screens (and the app's mobile breakpoint): the dock spans nearly
 * the full width, so badges tighten up; the wheel tip doesn't apply and the
 * tooltip only appears while dragging (no hover on touch). The canvas edge
 * clips centered tooltips of the outermost badges — pin them inward. */
@media (pointer: coarse), (max-width: 768px) {
  .trim-dock {
    gap: 4px;
  }

  .dock-item.group-start {
    margin-left: 11px;
  }

  .dock-item.group-start::before {
    left: -8px;
  }

  .badge {
    width: 40px;
    height: 40px;
  }

  .badge-inner {
    font-size: 0.66rem;
  }

  .tip-how {
    display: none;
  }

  .dock-item:nth-child(-n+2) .tooltip {
    left: -8px;
    transform: none;
  }

  .dock-item:nth-last-child(-n+2) .tooltip {
    left: auto;
    right: -8px;
    transform: none;
  }
}
</style>
