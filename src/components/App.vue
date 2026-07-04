<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import BoatSelector from './BoatSelector.vue'
import TrimControls from './TrimControls.vue'
import SailVisualization3D from './SailVisualization3D.vue'
import PerformanceReadout from './PerformanceReadout.vue'

// Mobile layout: the 3D model fills the screen and the side panels move into
// a bottom sheet driven by a tab bar. Rendered with v-if (not just CSS) so
// only one SailVisualization3D canvas ever exists.
const mql = window.matchMedia('(max-width: 768px)')
const isMobile = ref(mql.matches)
const onMqChange = (e: MediaQueryListEvent) => { isMobile.value = e.matches }
mql.addEventListener('change', onMqChange)
onBeforeUnmount(() => mql.removeEventListener('change', onMqChange))

type PanelId = 'boat' | 'trim' | 'data'
const activePanel = ref<PanelId | null>(null)

const panelTabs: { id: PanelId; label: string; icon: string }[] = [
  { id: 'boat', label: 'Boat', icon: '⛵' },
  { id: 'trim', label: 'Trim', icon: '🎚' },
  { id: 'data', label: 'Data', icon: '📊' },
]

const panelTitles: Record<PanelId, string> = {
  boat: 'Boat Model',
  trim: 'Trim Controls',
  data: 'Performance',
}

function togglePanel(id: PanelId) {
  activePanel.value = activePanel.value === id ? null : id
}
</script>

<template>
  <div class="app-shell" :class="{ mobile: isMobile }">
    <header class="app-header">
      <h1>Sail Trim Simulator</h1>
      <span class="subtitle">Mainsail + Genoa · All points of sail · Educational tool</span>
    </header>

    <!-- Desktop / tablet: three-column grid -->
    <main v-if="!isMobile" class="app-main">
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

    <!-- Mobile: full-screen 3D model + bottom sheet panels -->
    <template v-else>
      <main class="mobile-main">
        <SailVisualization3D />

        <transition name="sheet">
          <div v-if="activePanel" class="sheet">
            <div class="sheet-header">
              <span class="sheet-title">{{ panelTitles[activePanel] }}</span>
              <button class="sheet-close" aria-label="Close panel" @click="activePanel = null">✕</button>
            </div>
            <div class="sheet-body">
              <BoatSelector v-if="activePanel === 'boat'" />
              <TrimControls v-else-if="activePanel === 'trim'" />
              <PerformanceReadout v-else />
            </div>
          </div>
        </transition>
      </main>

      <nav class="tabbar">
        <button
          v-for="tab in panelTabs"
          :key="tab.id"
          class="tab"
          :class="{ active: activePanel === tab.id }"
          @click="togglePanel(tab.id)"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </nav>
    </template>

    <footer v-if="!isMobile" class="app-footer">
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
  /* Keep the 3D model on top when the columns stack */
  .col-viz {
    order: -1;
  }
}

/* ---------------------------------------------------------------------------
 * Mobile layout — 3D model first, panels in a bottom sheet
 * ------------------------------------------------------------------------- */

.app-shell.mobile {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.app-shell.mobile .app-header {
  padding: 0.55rem 0.85rem;
  margin-bottom: 0;
  gap: 0.6rem;
}

.app-shell.mobile h1 {
  font-size: 1.02rem;
}

.app-shell.mobile .subtitle {
  display: none;
}

.mobile-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Bottom sheet over the 3D view */
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  max-height: 62%;
  background: var(--color-panel);
  border-top: 1px solid var(--color-border);
  border-radius: 14px 14px 0 0;
  box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.5);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1rem 0.35rem;
  flex-shrink: 0;
}

/* Drag-handle look */
.sheet-header::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--color-border);
}

.sheet-title {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-label);
}

.sheet-close {
  background: transparent;
  border: none;
  color: var(--color-hint);
  font-size: 1rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  line-height: 1;
}

.sheet-body {
  overflow-y: auto;
  min-height: 0;
  padding: 0 0.6rem calc(0.75rem + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

/* The sheet header already names the panel — hide the component's own title */
.sheet-body :deep(> section > h2) {
  display: none;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
  opacity: 0.4;
}

/* Bottom tab bar */
.tabbar {
  display: flex;
  flex-shrink: 0;
  background: var(--color-panel);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.5rem 0 0.45rem;
  background: transparent;
  border: none;
  color: var(--color-hint);
  cursor: pointer;
  font-family: inherit;
}

.tab.active {
  color: var(--color-accent);
}

.tab-icon {
  font-size: 1.15rem;
  line-height: 1;
}

.tab-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
