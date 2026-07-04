<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTrimStore } from '../stores/trimStore'
import { parseBoatFile } from '../boats/parse'
import { fetchBoatBySailNo } from '../boats/orcApi'

const store = useTrimStore()
const fileError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const orcSailNo = ref('')
const orcLoading = ref(false)
const orcError = ref<string | null>(null)

async function onLoadFromOrc() {
  if (orcLoading.value) return
  orcError.value = null
  orcLoading.value = true
  try {
    store.addCustomBoat(await fetchBoatBySailNo(orcSailNo.value))
    orcSailNo.value = ''
  } catch (err) {
    orcError.value = err instanceof Error ? err.message : 'Could not load boat from ORC'
  } finally {
    orcLoading.value = false
  }
}

function onSelect(event: Event) {
  store.selectBoat((event.target as HTMLSelectElement).value)
}

async function onFile(event: Event) {
  fileError.value = null
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    store.addCustomBoat(parseBoatFile(file.name, text))
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : 'Could not read file'
  } finally {
    input.value = '' // allow re-selecting the same file
  }
}

const specs = computed(() => {
  const b = store.boat
  const parts: string[] = []
  if (b.loaM !== null) parts.push(`LOA ${b.loaM.toFixed(1)} m`)
  if (b.displacementKg !== null) parts.push(`${(b.displacementKg / 1000).toFixed(1)} t`)
  if (b.upwindSailAreaM2 !== null) parts.push(`${b.upwindSailAreaM2.toFixed(0)} m² upwind`)
  return parts.join(' · ')
})
</script>

<template>
  <section class="boat-selector">
    <h2>Boat Model</h2>

    <select class="boat-select" :value="store.boat.id" @change="onSelect">
      <optgroup label="ORC presets">
        <option v-for="b in store.availableBoats.filter((b) => !b.custom)" :key="b.id" :value="b.id">
          {{ b.name }}
        </option>
      </optgroup>
      <optgroup v-if="store.customBoats.length" label="Your files">
        <option v-for="b in store.customBoats" :key="b.id" :value="b.id">
          {{ b.name }}
        </option>
      </optgroup>
    </select>

    <p class="boat-desc">{{ store.boat.description }}</p>
    <p v-if="specs" class="boat-specs">{{ specs }}</p>
    <p class="boat-source" :title="store.boat.source">{{ store.boat.source }}</p>

    <form class="orc-search" @submit.prevent="onLoadFromOrc">
      <input
        v-model="orcSailNo"
        type="text"
        class="orc-input"
        placeholder="Sail number, e.g. ESP-7352"
        :disabled="orcLoading"
        aria-label="Sail number"
      />
      <button class="btn-load btn-orc" type="submit" :disabled="orcLoading">
        {{ orcLoading ? 'Loading…' : 'Load from ORC' }}
      </button>
    </form>
    <span class="hint">Fetches the active certificate from data.orc.org</span>
    <p v-if="orcError" class="file-error">{{ orcError }}</p>

    <button class="btn-load" @click="fileInput?.click()">Load your own polar…</button>
    <input
      ref="fileInput"
      type="file"
      accept=".json,.pol,.csv,.txt"
      class="file-hidden"
      @change="onFile"
    />
    <span class="hint">ORC certificate JSON (data.orc.org) or polar grid (.pol / .csv)</span>
    <p v-if="fileError" class="file-error">{{ fileError }}</p>
  </section>
</template>

<style scoped>
.boat-selector {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
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

.boat-select {
  width: 100%;
  padding: 0.45rem 0.6rem;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
}

.boat-desc {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text);
}

.boat-specs {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-accent);
  font-variant-numeric: tabular-nums;
}

.boat-source {
  margin: 0;
  font-size: 0.7rem;
  color: var(--color-hint);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-load {
  margin-top: 0.35rem;
  padding: 0.4rem 0.8rem;
  background: transparent;
  border: 1.5px dashed var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.btn-load:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.file-hidden {
  display: none;
}

.orc-search {
  display: flex;
  gap: 0.45rem;
  margin-top: 0.35rem;
}

.orc-input {
  flex: 1;
  min-width: 0;
  padding: 0.4rem 0.6rem;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.8rem;
}

.orc-input::placeholder {
  color: var(--color-hint);
}

.btn-orc {
  margin-top: 0;
  white-space: nowrap;
}

.btn-orc:disabled {
  opacity: 0.6;
  cursor: wait;
}

.hint {
  font-size: 0.7rem;
  color: var(--color-hint);
  font-style: italic;
}

.file-error {
  margin: 0;
  font-size: 0.75rem;
  color: #ff7060;
}
</style>
