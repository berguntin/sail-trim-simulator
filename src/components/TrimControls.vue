<script setup lang="ts">
import { useTrimStore } from '../stores/trimStore'

const store = useTrimStore()

interface SliderDef {
  label: string
  key: 'mainsheet' | 'traveler' | 'cunningham' | 'backstay' | 'outhaul'
  min: number
  max: number
  step: number
  unit: string
  hint: string
}

interface GenoaSliderDef {
  label: string
  key: 'jibsheet' | 'car' | 'halyard'
  hint: string
}

const sliders: SliderDef[] = [
  {
    label: 'Mainsheet',
    key: 'mainsheet',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    hint: 'Controls twist (primary) and leech tension',
  },
  {
    label: 'Traveler',
    key: 'traveler',
    min: -50,
    max: 50,
    step: 1,
    unit: '',
    hint: 'Controls angle of attack without changing leech tension',
  },
  {
    label: 'Outhaul (pajarín)',
    key: 'outhaul',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    hint: 'Foot tension: flattens the lower third of the sail',
  },
  {
    label: 'Cunningham',
    key: 'cunningham',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    hint: 'Moves draft forward; slightly flattens the sail',
  },
  {
    label: 'Backstay',
    key: 'backstay',
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    hint: 'Bends mast → flattens sail and opens upper leech',
  },
]

const genoaSliders: GenoaSliderDef[] = [
  {
    label: 'Jib sheet (escota)',
    key: 'jibsheet',
    hint: 'Primary genoa control: angle of attack and leech twist',
  },
  {
    label: 'Lead car (carro)',
    key: 'car',
    hint: 'Forward = closed leech, full foot; aft = open leech, flat foot',
  },
  {
    label: 'Halyard (driza)',
    key: 'halyard',
    hint: 'Luff tension: moves the genoa draft forward',
  },
]

function onChange(key: SliderDef['key'], event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  store.setControl(key, value)
}

function onGenoaChange(key: GenoaSliderDef['key'], event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  store.setGenoaControl(key, value)
}

function onWindChange(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  store.setWindSpeed(value)
}

function onCourseChange(event: Event) {
  const value = parseFloat((event.target as HTMLInputElement).value)
  store.setWindAngle(value)
}

/** Point of sail for the current course, for the TWA slider label. */
function pointOfSail(twa: number): string {
  if (twa <= store.targets.beatAngleDeg + 3) return 'close-hauled (ceñida)'
  if (twa < 80) return 'close reach'
  if (twa <= 105) return 'beam reach (través)'
  if (twa < 145) return 'broad reach (largo)'
  return 'run (popa)'
}

function travelerLabel(v: number): string {
  if (v > 5) return `+${v} ▲ windward`
  if (v < -5) return `${v} ▼ leeward`
  return `${v} centered`
}
</script>

<template>
  <section class="trim-controls">
    <h2>Trim Controls</h2>

    <div class="control-group wind-group">
      <label class="control-label">
        <span class="label-name">True Wind Speed</span>
        <span class="label-value">{{ store.wind.trueWindSpeedKts.toFixed(0) }} kts</span>
      </label>
      <input
        type="range"
        min="6"
        max="25"
        step="1"
        :value="store.wind.trueWindSpeedKts"
        @input="onWindChange"
        class="slider wind-slider"
      />
    </div>

    <div class="control-group wind-group">
      <label class="control-label">
        <span class="label-name">Course (TWA)</span>
        <span class="label-value">{{ store.trueWindAngleDeg.toFixed(0) }}°</span>
      </label>
      <input
        type="range"
        :min="Math.ceil(store.targets.beatAngleDeg)"
        max="165"
        step="1"
        :value="store.trueWindAngleDeg"
        @input="onCourseChange"
        class="slider wind-slider"
      />
      <span class="hint">
        {{ pointOfSail(store.trueWindAngleDeg) }} · AWA ≈ {{ store.wind.apparentWindAngleDeg.toFixed(1) }}°
      </span>
    </div>

    <div class="optimal-row">
      <button class="btn-optimal" @click="store.applyOptimalTrim()">
        Show Optimal Trim
      </button>
      <div class="proximity-bar-wrap" title="How close current trim is to the optimum">
        <div
          class="proximity-bar"
          :style="{ width: `${store.optimalProximity * 100}%` }"
          :class="{
            'prox-low': store.optimalProximity < 0.5,
            'prox-mid': store.optimalProximity >= 0.5 && store.optimalProximity < 0.85,
            'prox-high': store.optimalProximity >= 0.85,
          }"
        />
        <span class="proximity-label">{{ Math.round(store.optimalProximity * 100) }}% of optimum</span>
      </div>
    </div>

    <h3 class="sail-heading">Mainsail</h3>

    <div v-for="s in sliders" :key="s.key" class="control-group">
      <label class="control-label">
        <span class="label-name">{{ s.label }}</span>
        <span class="label-value">
          <template v-if="s.key === 'traveler'">
            {{ travelerLabel(store.controls[s.key]) }}
          </template>
          <template v-else>
            {{ store.controls[s.key] }}{{ s.unit }}
          </template>
        </span>
      </label>
      <input
        type="range"
        :min="s.min"
        :max="s.max"
        :step="s.step"
        :value="store.controls[s.key]"
        @input="(e) => onChange(s.key, e)"
        class="slider"
        :class="s.key"
      />
      <span class="hint">{{ s.hint }}</span>
    </div>

    <h3 class="sail-heading genoa-heading">{{ store.headsail.name }}</h3>

    <div v-for="s in genoaSliders" :key="s.key" class="control-group">
      <label class="control-label">
        <span class="label-name">{{ s.label }}</span>
        <span class="label-value">{{ store.genoaControls[s.key] }}%</span>
      </label>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="store.genoaControls[s.key]"
        @input="(e) => onGenoaChange(s.key, e)"
        class="slider"
        :class="s.key"
      />
      <span class="hint">{{ s.hint }}</span>
    </div>
  </section>
</template>

<style scoped>
.trim-controls {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1rem 1.25rem;
  background: var(--color-panel);
  border-radius: 8px;
}

h2 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-label);
}

.sail-heading {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-hint);
}

.genoa-heading {
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.control-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.label-name {
  font-weight: 500;
  color: var(--color-text);
}

.label-value {
  font-variant-numeric: tabular-nums;
  color: var(--color-accent);
  font-weight: 600;
  min-width: 9ch;
  text-align: right;
}

.slider {
  width: 100%;
  accent-color: var(--color-accent);
  cursor: pointer;
  height: 4px;
}

.wind-slider {
  accent-color: var(--color-wind);
}

.hint {
  font-size: 0.75rem;
  color: var(--color-hint);
  font-style: italic;
}

.wind-group {
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.optimal-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.btn-optimal {
  width: 100%;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1.5px solid var(--color-accent);
  border-radius: 6px;
  color: var(--color-accent);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: background 0.15s, color 0.15s;
}

.btn-optimal:hover {
  background: var(--color-accent);
  color: var(--color-bg);
}

.btn-optimal:active {
  opacity: 0.8;
}

.proximity-bar-wrap {
  position: relative;
  height: 8px;
  background: var(--color-bar-track);
  border-radius: 4px;
  overflow: hidden;
}

.proximity-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.15s ease, background 0.3s ease;
}

.prox-low  { background: #e07060; }
.prox-mid  { background: #f0c048; }
.prox-high { background: #5dd49c; }

.proximity-label {
  position: absolute;
  right: 0;
  top: 10px;
  font-size: 0.7rem;
  color: var(--color-hint);
  font-variant-numeric: tabular-nums;
}
</style>
