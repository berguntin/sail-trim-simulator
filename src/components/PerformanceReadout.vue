<script setup lang="ts">
import { computed } from 'vue'
import { useTrimStore } from '../stores/trimStore'

const store = useTrimStore()

const powerClass = computed(() => store.performance.powerBalance)

const powerLabel = computed(() => ({
  underpowered: '⬇ Underpowered',
  optimal: '✓ Optimal',
  overpowered: '⬆ Overpowered',
}[powerClass.value]))

function barWidth(value: number, max = 100): string {
  return `${Math.min(100, (value / max) * 100).toFixed(1)}%`
}

// Bars show area-weighted RIG totals (main + genoa), same combination the
// trim score uses — so the bars always move when either sail is touched.
// Cl max ≈ 1.65 in our model (AoA peak + full camber)
const clPct = computed(() => barWidth(store.rigAero.cl, 1.65))
// Cd max ≈ 1.5 for display (deep-stall flat-plate drag on a run)
const cdPct = computed(() => barWidth(store.rigAero.cd, 1.5))
// Efficiency: rig L/D tops out around 12 in our model
const effPct = computed(() => barWidth(store.rigAero.efficiency, 12))
</script>

<template>
  <section class="readout">
    <h2>Performance Readout</h2>
    <p class="disclaimer">Speed estimate is qualitative — targets come from the boat's ORC polar.</p>

    <!-- Power balance badge -->
    <div class="power-badge" :class="powerClass">
      {{ powerLabel }}
    </div>

    <!-- Sail choice: visible only when a better headsail is available -->
    <p v-if="store.sailChoiceFrac < 0.97" class="sail-note">
      ⚑ {{ store.headsail.shortName }} gives {{ Math.round(store.sailChoiceFrac * 100) }}%
      of the best sail's power — see ★ in Boat Model
    </p>

    <!-- Polar targets for the selected boat -->
    <div class="targets">
      <div class="targets-title">
        {{ store.boat.name }} · {{ store.wind.trueWindSpeedKts.toFixed(0) }} kts · TWA {{ store.trueWindAngleDeg.toFixed(0) }}°
      </div>
      <table class="num-table">
        <tbody>
          <tr>
            <td>Est. speed</td>
            <td class="est-speed">{{ store.estimatedSpeedKts.toFixed(2) }} kn</td>
            <td>Target</td>
            <td>{{ store.targets.courseSpeedKts.toFixed(2) }} kn</td>
          </tr>
          <tr>
            <td>Beat VMG</td>
            <td>{{ store.targets.beatVMGKts.toFixed(2) }} kn</td>
            <td>Beat angle</td>
            <td>{{ store.targets.beatAngleDeg.toFixed(0) }}°</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Coefficient bars -->
    <div class="metrics">
      <div class="metric">
        <div class="metric-header">
          <span class="metric-name">Cl (Rig lift)</span>
          <span class="metric-value">{{ store.rigAero.cl.toFixed(3) }}</span>
        </div>
        <div class="bar-track">
          <div class="bar cl-bar" :style="{ width: clPct }" />
        </div>
      </div>

      <div class="metric">
        <div class="metric-header">
          <span class="metric-name">Cd (Rig drag)</span>
          <span class="metric-value">{{ store.rigAero.cd.toFixed(3) }}</span>
        </div>
        <div class="bar-track">
          <div class="bar cd-bar" :style="{ width: cdPct }" />
        </div>
      </div>

      <div class="metric">
        <div class="metric-header">
          <span class="metric-name">Cl/Cd (Efficiency)</span>
          <span class="metric-value">{{ store.rigAero.efficiency.toFixed(1) }}</span>
        </div>
        <div class="bar-track">
          <div class="bar eff-bar" :style="{ width: effPct }" />
        </div>
      </div>

      <div class="metric">
        <div class="metric-header">
          <span class="metric-name">Relative VMG</span>
          <span class="metric-value">{{ store.performance.relativeVMG.toFixed(0) }} / 100</span>
        </div>
        <div class="bar-track">
          <div class="bar vmg-bar" :style="{ width: barWidth(store.performance.relativeVMG) }" />
        </div>
      </div>

      <div class="metric">
        <div class="metric-header">
          <span class="metric-name">Relative Heel</span>
          <span class="metric-value">{{ store.performance.relativeHeel.toFixed(0) }} / 100</span>
        </div>
        <div class="bar-track">
          <div class="bar heel-bar" :style="{ width: barWidth(store.performance.relativeHeel) }" />
        </div>
      </div>
    </div>

    <!-- Compact numeric table for quick scanning -->
    <div class="targets-title">Mainsail</div>
    <table class="num-table">
      <tbody>
        <tr>
          <td>AoA</td>
          <td>{{ store.sailShape.angleOfAttackDeg.toFixed(1) }}°</td>
          <td>Twist</td>
          <td>{{ store.sailShape.twistDeg.toFixed(1) }}°</td>
        </tr>
        <tr>
          <td>Camber</td>
          <td>{{ (store.sailShape.camberRatio * 100).toFixed(1) }}%</td>
          <td>Draft pos.</td>
          <td>{{ (store.sailShape.draftPositionRatio * 100).toFixed(0) }}%</td>
        </tr>
      </tbody>
    </table>

    <div class="targets-title">{{ store.headsail.name }}</div>
    <table class="num-table">
      <tbody>
        <tr>
          <td>AoA</td>
          <td>{{ store.genoaShape.angleOfAttackDeg.toFixed(1) }}°</td>
          <td>Twist</td>
          <td>{{ store.genoaShape.twistDeg.toFixed(1) }}°</td>
        </tr>
        <tr>
          <td>Camber</td>
          <td>{{ (store.genoaShape.camberRatio * 100).toFixed(1) }}%</td>
          <td>Draft pos.</td>
          <td>{{ (store.genoaShape.draftPositionRatio * 100).toFixed(0) }}%</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.readout {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem 1.25rem;
  background: var(--color-panel);
  border-radius: 8px;
}

h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-label);
}

.disclaimer {
  margin: 0;
  font-size: 0.72rem;
  color: var(--color-hint);
  font-style: italic;
}

.power-badge {
  display: inline-block;
  padding: 0.3rem 0.9rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
}

.power-badge.underpowered {
  background: rgba(80, 160, 255, 0.18);
  color: #6bbfff;
  border: 1px solid #4499cc;
}

.power-badge.optimal {
  background: rgba(80, 220, 130, 0.18);
  color: #5ddc96;
  border: 1px solid #3aaa6e;
}

.power-badge.overpowered {
  background: rgba(255, 100, 80, 0.18);
  color: #ff7060;
  border: 1px solid #cc4433;
}

.sail-note {
  margin: 0;
  padding: 0.35rem 0.6rem;
  font-size: 0.74rem;
  color: #f0c048;
  background: rgba(240, 192, 72, 0.10);
  border: 1px solid rgba(240, 192, 72, 0.35);
  border-radius: 6px;
}

.metrics {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
}

.metric-name {
  color: var(--color-hint);
}

.metric-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text);
}

.bar-track {
  height: 7px;
  background: var(--color-bar-track);
  border-radius: 4px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.12s ease;
}

.cl-bar  { background: #4fa8e0; }
.cd-bar  { background: #e07060; }
.eff-bar { background: #5dd49c; }
.vmg-bar { background: #f0c048; }
.heel-bar { background: #d080e0; }

.targets {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.targets-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-label);
  letter-spacing: 0.04em;
}

.est-speed {
  color: var(--color-accent) !important;
}

.num-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  color: var(--color-hint);
}

.num-table td {
  padding: 0.2rem 0.4rem;
}

.num-table td:nth-child(even) {
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.num-table td:nth-child(odd) {
  color: var(--color-hint);
}
</style>
