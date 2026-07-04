<script setup lang="ts">
/**
 * SailVisualization — top-down plan-view of the mainsail.
 *
 * The boat (centreline) runs bottom-to-top. The wind comes from the upper-left
 * (roughly). The sail is drawn as a quadrilateral whose:
 *  - foot angle reflects angleOfAttackDeg relative to the boat centreline
 *  - head angle is foot angle + twistDeg (head falls off to leeward)
 *  - chord depth (bulge) reflects camberRatio
 *  - draftPositionRatio shifts the bulge along the chord
 *
 * The génova is a static grey rectangle for visual reference only (no physics).
 */
import { computed } from 'vue'
import { useTrimStore } from '../stores/trimStore'

const store = useTrimStore()

// Canvas dimensions (logical px)
const W = 480
const H = 580

// Boat centreline x
const CX = W / 2

// Sail parameters
const SAIL_FOOT_Y = H - 80   // boom position (y)
const SAIL_HEAD_Y = 80        // masthead (y)
const SAIL_CHORD = 110        // half-width of sail at foot (boom length in px)

// Convert degrees to radians
function toRad(deg: number) { return deg * Math.PI / 180 }

// -----------------------------------------------------------------------
// Sail outline as SVG path (plan view)
// -----------------------------------------------------------------------

const sailPath = computed(() => {
  const { angleOfAttackDeg, twistDeg } = store.sailShape

  // Foot: angle from centreline (boom). +angle = boom swings to leeward (port)
  // In plan view, sail is to leeward (port = left) of centreline.
  const footAngle = toRad(angleOfAttackDeg * 1.5) // scale for visibility
  const headAngle = toRad((angleOfAttackDeg + twistDeg) * 1.5) // head falls further off

  // Luff (straight, along mast) sits at CX
  const luffBottom = { x: CX, y: SAIL_FOOT_Y }
  const luffTop = { x: CX, y: SAIL_HEAD_Y }

  // Leech foot tip (end of boom)
  const footTip = {
    x: CX - Math.sin(footAngle) * SAIL_CHORD,
    y: SAIL_FOOT_Y - Math.cos(footAngle) * SAIL_CHORD * 0.2,
  }

  // Leech head tip (narrower — sail tapers)
  const headTip = {
    x: CX - Math.sin(headAngle) * SAIL_CHORD * 0.35,
    y: SAIL_HEAD_Y + Math.cos(headAngle) * SAIL_CHORD * 0.05,
  }

  // Sail outline (luff is straight, leech is a curve from foot tip to head tip)

  const leechCpX = (footTip.x + headTip.x) / 2 - 5
  const leechCpY = (footTip.y + headTip.y) / 2

  return [
    `M ${luffBottom.x} ${luffBottom.y}`,
    // Luff — straight up to masthead
    `L ${luffTop.x} ${luffTop.y}`,
    // Head to leech head tip
    `L ${headTip.x} ${headTip.y}`,
    // Leech — curve from head to foot tip (slight roach)
    `Q ${leechCpX} ${leechCpY} ${footTip.x} ${footTip.y}`,
    // Foot — back to luff
    `L ${luffBottom.x} ${luffBottom.y}`,
  ].join(' ')
})

// Camber curve overlay (shows how full the sail is)
const camberPath = computed(() => {
  const { angleOfAttackDeg, twistDeg, camberRatio, draftPositionRatio } = store.sailShape
  const footAngle = toRad(angleOfAttackDeg * 1.5)
  const headAngle = toRad((angleOfAttackDeg + twistDeg) * 1.5)

  // Midpoint chord cross-section line at ~50% height
  const midY = SAIL_HEAD_Y + (SAIL_FOOT_Y - SAIL_HEAD_Y) * 0.5
  const luffMid = { x: CX, y: midY }
  const leechMidAngle = (footAngle + headAngle) / 2
  const leechMid = {
    x: CX - Math.sin(leechMidAngle) * SAIL_CHORD * 0.65,
    y: midY,
  }

  const bulgeHeight = SAIL_CHORD * camberRatio * 6
  const draftY = SAIL_HEAD_Y + (SAIL_FOOT_Y - SAIL_HEAD_Y) * draftPositionRatio
  const draftMidY = (midY * 0.5 + draftY * 0.5)

  const cpX = CX - bulgeHeight
  const cpY = draftMidY

  return `M ${luffMid.x} ${luffMid.y} Q ${cpX} ${cpY} ${leechMid.x} ${leechMid.y}`
})

// Wind arrow direction (apparent wind, top left area)
const windArrow = computed(() => {
  const awa = store.wind.apparentWindAngleDeg
  const angle = toRad(awa)
  const startX = CX - 30
  const startY = 30
  const len = 60
  const endX = startX + Math.sin(angle) * len
  const endY = startY + Math.cos(angle) * len
  return { startX, startY, endX, endY }
})

// Angle of attack indicator arc
const aoaArcPath = computed(() => {
  const { angleOfAttackDeg } = store.sailShape
  const awa = store.wind.apparentWindAngleDeg
  const r = 40
  const footY = SAIL_FOOT_Y
  const cx = CX

  // Wind direction line
  const windAngle = toRad(awa)
  const windEndX = cx - Math.sin(windAngle) * r
  const windEndY = footY - Math.cos(windAngle) * r

  // Sail foot angle
  const sailAngle = toRad(angleOfAttackDeg * 1.5)
  const sailEndX = cx - Math.sin(sailAngle) * r * 0.7
  const sailEndY = footY - Math.cos(sailAngle) * r * 0.7

  return { windEndX, windEndY, sailEndX, sailEndY, cx, footY }
})

// Twist visual label positions
const twistLabels = computed(() => {
  const { angleOfAttackDeg, twistDeg } = store.sailShape
  const footAngle = toRad(angleOfAttackDeg * 1.5)
  const headAngle = toRad((angleOfAttackDeg + twistDeg) * 1.5)

  return {
    footAngleDeg: (angleOfAttackDeg * 1.5).toFixed(0),
    headAngleDeg: ((angleOfAttackDeg + twistDeg) * 1.5).toFixed(0),
    footX: CX - Math.sin(footAngle) * SAIL_CHORD * 0.55,
    footY: SAIL_FOOT_Y - 20,
    headX: CX - Math.sin(headAngle) * SAIL_CHORD * 0.4,
    headY: SAIL_HEAD_Y + 28,
  }
})

// Draft dot position
const draftDot = computed(() => {
  const { angleOfAttackDeg, twistDeg, draftPositionRatio, camberRatio } = store.sailShape
  const midAngle = toRad((angleOfAttackDeg + twistDeg * draftPositionRatio) * 1.5)
  const draftY = SAIL_HEAD_Y + (SAIL_FOOT_Y - SAIL_HEAD_Y) * draftPositionRatio
  const bulgeX = CX - SAIL_CHORD * camberRatio * 6 * 0.85
  const luffX = CX - Math.sin(midAngle) * SAIL_CHORD * draftPositionRatio * 0.3
  return {
    x: (bulgeX + luffX) / 2,
    y: draftY,
  }
})
</script>

<template>
  <section class="sail-viz">
    <h2>Sail Shape — Plan View</h2>
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      xmlns="http://www.w3.org/2000/svg"
      class="sail-svg"
      aria-label="Sail shape plan view"
    >
      <!-- Boat centreline -->
      <line
        :x1="CX" y1="10"
        :x2="CX" :y2="H - 10"
        stroke="var(--color-centreline)"
        stroke-width="1.5"
        stroke-dasharray="8 5"
        opacity="0.5"
      />

      <!-- Boat bow triangle -->
      <polygon
        :points="`${CX},20 ${CX - 14},55 ${CX + 14},55`"
        fill="var(--color-boat)"
        opacity="0.35"
      />

      <!-- Static genoa outline (reference only, no physics) -->
      <path
        :d="`M ${CX} ${SAIL_FOOT_Y - 20} L ${CX - 145} ${SAIL_HEAD_Y + 180} L ${CX - 80} ${SAIL_FOOT_Y - 20} Z`"
        fill="none"
        stroke="var(--color-genoa)"
        stroke-width="1.5"
        stroke-dasharray="6 4"
        opacity="0.4"
      />
      <text
        :x="CX - 115"
        :y="SAIL_FOOT_Y - 50"
        fill="var(--color-genoa)"
        font-size="11"
        opacity="0.6"
        text-anchor="middle"
      >génova (ref.)</text>

      <!-- Mainsail fill -->
      <path
        :d="sailPath"
        fill="var(--color-sail-fill)"
        stroke="var(--color-sail-stroke)"
        stroke-width="2"
        stroke-linejoin="round"
      />

      <!-- Camber cross-section curve -->
      <path
        :d="camberPath"
        fill="none"
        stroke="var(--color-camber)"
        stroke-width="2"
        stroke-dasharray="5 3"
        opacity="0.8"
      />

      <!-- Draft maximum dot -->
      <circle
        :cx="draftDot.x"
        :cy="draftDot.y"
        r="5"
        fill="var(--color-draft)"
      />
      <text
        :x="draftDot.x - 8"
        :y="draftDot.y - 8"
        fill="var(--color-draft)"
        font-size="10"
      >draft</text>

      <!-- Twist angle labels -->
      <text
        :x="twistLabels.footX"
        :y="twistLabels.footY"
        fill="var(--color-twist)"
        font-size="11"
        font-weight="600"
        text-anchor="middle"
      >foot</text>

      <text
        :x="twistLabels.headX"
        :y="twistLabels.headY"
        fill="var(--color-twist)"
        font-size="11"
        font-weight="600"
        text-anchor="middle"
      >head</text>

      <!-- Twist annotation arrow between foot and head positions -->
      <line
        :x1="CX - 160"
        :y1="SAIL_FOOT_Y - 10"
        :x2="CX - 160"
        :y2="SAIL_HEAD_Y + 10"
        stroke="var(--color-twist)"
        stroke-width="1"
        marker-end="url(#arrowTwist)"
        marker-start="url(#arrowTwistBack)"
        opacity="0.6"
      />
      <text
        :x="CX - 185"
        y="295"
        fill="var(--color-twist)"
        font-size="11"
        text-anchor="middle"
        transform="rotate(-90, 185, 295)"
      >twist {{ store.sailShape.twistDeg.toFixed(1) }}°</text>

      <!-- Wind arrow -->
      <defs>
        <marker id="arrowWind" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L0,8 L8,4 Z" fill="var(--color-wind)" />
        </marker>
        <marker id="arrowTwist" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 Z" fill="var(--color-twist)" />
        </marker>
        <marker id="arrowTwistBack" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L0,6 L6,3 Z" fill="var(--color-twist)" />
        </marker>
      </defs>

      <line
        :x1="windArrow.startX"
        :y1="windArrow.startY"
        :x2="windArrow.endX"
        :y2="windArrow.endY"
        stroke="var(--color-wind)"
        stroke-width="2.5"
        marker-end="url(#arrowWind)"
      />
      <text
        :x="windArrow.startX - 12"
        :y="windArrow.startY"
        fill="var(--color-wind)"
        font-size="11"
        font-weight="600"
      >AWA {{ store.wind.apparentWindAngleDeg.toFixed(0) }}°</text>

      <!-- Angle of attack indicator at the boom level -->
      <line
        :x1="aoaArcPath.cx"
        :y1="aoaArcPath.footY"
        :x2="aoaArcPath.windEndX"
        :y2="aoaArcPath.windEndY"
        stroke="var(--color-wind)"
        stroke-width="1"
        stroke-dasharray="4 3"
        opacity="0.6"
      />
      <line
        :x1="aoaArcPath.cx"
        :y1="aoaArcPath.footY"
        :x2="aoaArcPath.sailEndX"
        :y2="aoaArcPath.sailEndY"
        stroke="var(--color-accent)"
        stroke-width="1.5"
        opacity="0.8"
      />
      <text
        :x="aoaArcPath.cx - 48"
        :y="aoaArcPath.footY + 18"
        fill="var(--color-accent)"
        font-size="11"
      >AoA {{ store.sailShape.angleOfAttackDeg.toFixed(1) }}°</text>
    </svg>

    <div class="shape-summary">
      <span>Camber: <strong>{{ (store.sailShape.camberRatio * 100).toFixed(1) }}%</strong></span>
      <span>Draft: <strong>{{ (store.sailShape.draftPositionRatio * 100).toFixed(0) }}% back</strong></span>
      <span>Twist: <strong>{{ store.sailShape.twistDeg.toFixed(1) }}°</strong></span>
    </div>
  </section>
</template>

<style scoped>
.sail-viz {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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

.sail-svg {
  width: 100%;
  max-height: 420px;
  border-radius: 6px;
  background: var(--color-sea);
}

.shape-summary {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--color-hint);
}

.shape-summary strong {
  color: var(--color-text);
}
</style>
