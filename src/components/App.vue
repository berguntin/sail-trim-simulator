<script setup lang="ts">
import BoatSelector from './BoatSelector.vue'
import TrimControls from './TrimControls.vue'
import SailVisualization3D from './SailVisualization3D.vue'
import PerformanceReadout from './PerformanceReadout.vue'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Sail Trim Simulator</h1>
      <span class="subtitle">Mainsail + Genoa · All points of sail · Educational tool</span>
    </header>

    <main class="app-main">
      <aside class="col-controls">
        <BoatSelector />
        <TrimControls />
      </aside>

      <section class="col-viz">
        <SailVisualization3D />
      </section>

      <aside class="col-readout">
        <PerformanceReadout />
      </aside>
    </main>

    <footer class="app-footer">
      Polar targets from ORC certificates (data.orc.org); trim response and speed estimates are qualitative illustrations.
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 0 1rem;
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 1rem 0 0.5rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 1rem;
}

h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: 0.02em;
}

.subtitle {
  font-size: 0.8rem;
  color: var(--color-hint);
  font-style: italic;
}

.app-main {
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  gap: 1.25rem;
  flex: 1;
  align-items: start;
}

.col-controls,
.col-readout {
  position: sticky;
  top: 1rem;
}

.col-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.col-viz {
  min-width: 0;
}

.app-footer {
  text-align: center;
  padding: 0.75rem 0;
  font-size: 0.72rem;
  color: var(--color-hint);
  border-top: 1px solid var(--color-border);
  margin-top: 1rem;
}

@media (max-width: 900px) {
  .app-main {
    grid-template-columns: 1fr;
  }
  .col-controls,
  .col-readout {
    position: static;
  }
}
</style>
