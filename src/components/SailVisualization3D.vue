<script setup lang="ts">
/**
 * SailVisualization3D — Three.js mainsail model
 *
 * Geometry: a parametric surface S(u, v) over a grid (U_SEGS × V_SEGS).
 *   u ∈ [0,1]  →  height along luff (0 = foot, 1 = head)
 *   v ∈ [0,1]  →  position across chord (0 = luff, 1 = leech)
 *
 * At each (u,v) we compute:
 *  1. chord_length(u)  — tapers from CHORD_FOOT to CHORD_HEAD with a roach
 *                         bulge, so the upper leech keeps enough chord for
 *                         twist to be readable.
 *  2. sectionAngle(u)  — rotation of the cross-section around the mast.
 *                         The boom sits at (AWA − AoA) off the centreline
 *                         (that's what "angle of attack vs apparent wind"
 *                         means geometrically), and each section opens a
 *                         further twist·u degrees to leeward going up
 *                         (exaggerated by TWIST_VIS on screen only).
 *  3. camber(v)        — NACA 4-digit mean-line with its peak at
 *                         draftPositionRatio: smooth slope everywhere,
 *                         unlike a piecewise parabola. Under backstay the
 *                         depth is redistributed with height (flattest at
 *                         the head — see sailPoint).
 *
 * Backstay: bows the mast forward mid-span AND drops the masthead aft
 * (fractional-rig tip fall-off), which visibly opens the upper leech.
 *
 * Extras: draft stripes (the horizontal bands real sails carry to make
 * camber readable), a highlighted leech line (where twist is read), a boom
 * that follows the trim, and animated telltales driven by computeLocalFlow
 * + wind speed.
 *
 * Genoa: a second parametric surface hung off the forestay (tack at the
 * stem, hounds on the mast at HOUNDS_FRAC). Same section mathematics as the
 * main; what differs is the luff support — forestay sag (backstay + wind
 * load) instead of mast bend — and the sheet lead hardware: a fore/aft
 * track with a car instead of a traveler. Genoa telltales sit close to the
 * luff, where real jib telltales live.
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useI18n } from 'vue-i18n'
import { useTrimStore } from '../stores/trimStore'
import { computeLocalFlow } from '../physics/aerodynamics'
import { mainBoomAngleDeg } from '../physics/sailShape'
import { genoaSheetAngleDeg } from '../physics/genoaShape'
import type { SailShape } from '../physics/types'

const { t } = useI18n()

// ---------------------------------------------------------------------------
// Sail geometry constants (metres — arbitrary scale for visual)
//
// The mast height and foretriangle base are the fixed scene scale; the foot
// chords vary per boat (store.rig, from the ORC certificate's sail areas):
// a high-aspect racing main reads skinnier than a cruiser's, and the genoa
// clew overlaps the mast as far as the certificate areas suggest.
// ---------------------------------------------------------------------------
const LUFF_HEIGHT  = 10    // mast height
const CHORD_FOOT   = 4.5   // boom length at the default rig proportions
const CHORD_HEAD   = 1.0   // sail width at masthead
const ROACH        = 0.55  // extra leech curve beyond the straight taper

// Genoa geometry (fore = −x: the boom extends aft toward +x)
const J_LENGTH         = 3.6   // mast → stem head (bow) distance
const TACK_Y           = 0.15  // genoa tack just above the deck
const HOUNDS_FRAC      = 0.85  // forestay attachment height on the mast (fractional rig)
const GENOA_CHORD_HEAD = 0.12
const GENOA_HOLLOW     = 0.18  // slight hollow in the leech (no battens, no roach)
// The genoa foot rises from the tack to a clew well above the deck (real
// genoas only sweep the deck near the tack). The clew rides higher when the
// lead car goes aft: the flatter sheet pull stops holding the leech down.
const GENOA_CLEW_RISE_MIN = 0.40  // clew height above the tack, car full forward
const GENOA_CLEW_RISE_MAX = 0.62  // car full aft: leech unloaded, clew lifts
// The head (puño de driza) stops short of the hounds — the halyard covers the
// rest of the stay. Halyard tension stretches the luff toward the sheave.
const GENOA_HEAD_FRAC_MIN = 0.90   // eased halyard: head hangs lower
const GENOA_HEAD_FRAC_MAX = 0.945  // full halyard: luff stretched up the stay

const U_SEGS = 32   // vertical segments
const V_SEGS = 24   // horizontal (chord) segments

// Visual-only exaggeration so camber changes read clearly on screen.
// Physics uses the raw camberRatio; this factor never feeds back.
const CAMBER_VIS = 1.25
// Same idea for twist: the section rotation scales with the local chord, which
// tapers hard toward the head, so the true angle reads too faintly on screen.
// Physics (and the overlay stats) always use the raw twistDeg.
const TWIST_VIS = 1.6

const store = useTrimStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// Boat-specific proportions (boats/rig.ts) — read at geometry-build time so a
// boat change only needs an update pass, not a scene rebuild.
/** Main foot chord: shorter for a high-aspect racing main, longer for a cruiser. */
function mainChordFoot(): number {
  return CHORD_FOOT * store.rig.mainChordScale
}
/** Headsail foot chord from the SELECTED sail's overlap: LP = overlap × J.
 *  A 140 % genoa reaches well past the mast; an 85 % heavy jib stops short
 *  of the forestay-to-mast distance. */
function genoaChordFoot(): number {
  return J_LENGTH * store.headsail.overlapRatio
}

// ---------------------------------------------------------------------------
// Three.js objects (module-level so cleanup can reach them)
// ---------------------------------------------------------------------------
let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let sailMesh: THREE.Mesh
let sailGeo: THREE.BufferGeometry
let boom: THREE.Mesh
let boomEndFitting: THREE.Mesh
let travelerCar: THREE.Mesh
let outhaulLine: THREE.Line
let mainsheetLine: THREE.Line
let mast: THREE.Mesh
let draftStripes: { u: number; line: THREE.Line; geo: THREE.BufferGeometry }[] = []
let leechLine: THREE.Line
let backstayLine: THREE.Line
let genoaGeo: THREE.BufferGeometry
let genoaStripes: { u: number; line: THREE.Line; geo: THREE.BufferGeometry }[] = []
let genoaLeechLine: THREE.Line
let forestayLine: THREE.Line
let genoaHalyardLine: THREE.Line
let genoaHeadShackle: THREE.Mesh
let genoaHeadPatchGeo: THREE.BufferGeometry
let jibTrack: THREE.Mesh
let jibCar: THREE.Mesh
let jibWinch: THREE.Mesh
let jibSheetLine: THREE.Line
let animId: number
let resizeObserver: ResizeObserver

// ---------------------------------------------------------------------------
// Sail geometry builder
// ---------------------------------------------------------------------------

/**
 * Blend factor for outhaul effects: 1 at the boom, fading to 0 by ~45 %
 * height — the outhaul only shapes the lower sail.
 */
function footBlend(u: number): number {
  return Math.max(0, 1 - u / 0.45)
}

/** How far the clew slides forward along the boom when the outhaul is eased. */
const MAX_CLEW_SLIDE = 0.35

/**
 * Chord at height fraction u: straight taper foot → head, plus a roach bulge
 * peaking around 60 % height (u^1.35 shifts the sine peak up). The roach keeps
 * real chord in the upper third, which is where twist is read on the water.
 *
 * Easing the outhaul lets the clew slide forward along the boom, shortening
 * the lower chords — the freed cloth is what deepens the foot (footFullness).
 */
function chordLength(u: number): number {
  const foot = mainChordFoot()
  const straight = foot + (CHORD_HEAD - foot) * u
  const clewSlide = MAX_CLEW_SLIDE * (1 - store.controls.outhaul / 100) * footBlend(u)
  return straight + ROACH * Math.sin(Math.PI * Math.pow(u, 1.35)) - clewSlide
}

// ---------------------------------------------------------------------------
// Mast bend
// ---------------------------------------------------------------------------

/** Rig pre-bend: even with the backstay off, a tuned mast carries some bend. */
const PRE_BEND = 0.06
/** Extra fore-aft deflection at full backstay (visual scale, metres). */
const MAX_BEND = 0.55
/** Masthead fall-off aft at full backstay (visual scale, metres). */
const MAX_TIP_FALL = 0.45

/**
 * Fore-aft mast deflection at height fraction u (aft = +x).
 *
 * Two components, both driven by the backstay:
 *  - Bow: compression bows the middle of the spar toward the bow (−x),
 *    held at step/partners below and forestay above → parabola, peak mid-span.
 *  - Tip fall-off: on a fractional rig the topmast (above the hounds) has
 *    nothing holding it forward, so backstay tension drags the masthead aft
 *    (+x, ∝ u²). This is what visibly opens the upper leech when you crank
 *    the backstay — the head of the sail rotates aft while the clew stays.
 */
function mastBendAt(u: number): number {
  const t = store.controls.backstay / 100
  const bow = -(PRE_BEND + t * MAX_BEND) * 4 * u * (1 - u)
  const tipFall = t * MAX_TIP_FALL * u * u
  return bow + tipFall
}

// ---------------------------------------------------------------------------
// Luffing — a sail whose sheeted angle is wider than the wind can't fill
// ---------------------------------------------------------------------------

/**
 * How luffed a sail is, 0-1, from its (emergent) angle of attack: the entry
 * starts backwinding below ~3°, and by −5° the whole sail is flogging.
 * Drives both the flap animation amplitude and the overlay badge.
 */
const LUFF_ONSET_AOA_DEG = 3
function luffAmount(aoaDeg: number): number {
  return Math.min(1, Math.max(0, (LUFF_ONSET_AOA_DEG - aoaDeg) / 8))
}

/** Render-clock time (seconds) driving the flap wave — set in animate(). */
let flapT = 0

/** Flap frequency, rad/s: cloth beats faster in more wind. */
function flapOmegaRad(): number {
  const windFrac = Math.min(1, Math.max(0, (store.wind.trueWindSpeedKts - 6) / 19))
  return 6 + windFrac * 9
}

/**
 * Flap-wave displacement along the section normal at (u, v) — zero while
 * the sail is full. Two travelling waves run aft through the cloth (held at
 * the luff, free at the leech; the foot region is steadied by boom/sheet),
 * the way a flogging sail beats on a real boat.
 */
function flapOffset(luff: number, chord: number, u: number, v: number): number {
  if (luff <= 0) return 0
  const w = flapT * flapOmegaRad()
  const wave =
    Math.sin(w - v * 7 + u * 3) +
    0.5 * Math.sin(w * 1.9 - v * 12 + u * 5)
  return luff * 0.09 * chord * v * (0.25 + 0.75 * u) * wave
}

/**
 * Angle of the cross-section at height u, measured from the boat centreline
 * (+x) toward leeward (+z), in radians.
 *
 * The boom sits where the SHEET and traveler put it (mainBoomAngleDeg) —
 * in the boat's frame, knowing nothing about the wind. When the sheeted
 * angle is wider than the AWA the sail can't fill: the cloth weathervanes
 * and streams along the apparent wind instead (a luffing sail doesn't hold
 * its trimmed angle). Twist opens the upper sections a further twist·u
 * degrees to leeward.
 */
function sectionAngleRad(u: number, shape: SailShape): number {
  const awa = store.wind.apparentWindAngleDeg
  const boomAngleDeg = Math.min(mainBoomAngleDeg(store.controls), awa)
  return ((boomAngleDeg + u * shape.twistDeg * TWIST_VIS) * Math.PI) / 180
}

/**
 * NACA 4-digit mean camber line with maximum at draftPos, normalised to
 * peak = 1. Continuous value AND slope at the peak — this is what gives the
 * sail its natural smooth "belly" instead of an angular crease at the draft.
 * (Abbott & von Doenhoff eq. 6.4; same family Marchaj uses for sail sections.)
 */
function camberCurve(v: number, draftPos: number): number {
  if (v <= 0 || v >= 1) return 0
  const d = Math.max(0.05, Math.min(0.95, draftPos))
  if (v <= d) {
    return (2 * d * v - v * v) / (d * d)
  }
  return (1 - 2 * d + 2 * d * v - v * v) / ((1 - d) * (1 - d))
}

/**
 * Point on the sail surface at (u, v), plus the local frame used by the
 * telltales: flowDir (chordwise, luff → leech) and leewardNormal.
 *
 * The luff follows the bent mast; the deflection fades toward the leech
 * (1 − v) because the clew is held by the boom and the leech hangs between
 * masthead and clew. This is what visually flattens the entry when the
 * backstay comes on.
 *
 * Camber is redistributed with height under backstay: mast bend pulls cloth
 * out of the UPPER sail first (that's where the spar deflects relative to
 * the shorter chords), so the head flattens hardest while the foot — whose
 * depth is really governed by the outhaul — barely changes. The scale is 1
 * at mid-height, so the reported camberRatio matches the middle draft stripe.
 */
function sailPoint(u: number, v: number, shape: SailShape): {
  pos: THREE.Vector3
  flowDir: THREE.Vector3
  leewardNormal: THREE.Vector3
} {
  const chord = chordLength(u)
  const a = sectionAngleRad(u, shape)
  const cosA = Math.cos(a)
  const sinA = Math.sin(a)

  const chordPos = v * chord
  const bendNorm = store.controls.backstay / 100
  const backstayScale = 1 - 0.6 * bendNorm * (u - 0.5)
  // Outhaul owns the lower third: footFullnessRatio at the boom, neutral aloft
  const footScale = 1 + (shape.footFullnessRatio - 1) * footBlend(u)
  const camberMag =
    CAMBER_VIS * shape.camberRatio * backstayScale * footScale * chord *
    camberCurve(v, shape.draftPositionRatio)
  const bendX = mastBendAt(u) * (1 - v)

  // Luffing: the belly collapses (flogging cloth holds no shape) and the
  // flap wave beats through what's left, all along the section normal.
  const luff = luffAmount(shape.angleOfAttackDeg)
  const normalOffset = camberMag * (1 - 0.8 * luff) + flapOffset(luff, chord, u, v)

  return {
    pos: new THREE.Vector3(
      chordPos * cosA - normalOffset * sinA + bendX,
      // Foot rides on the boom (BOOM_Y above deck); head stays at the masthead
      BOOM_Y + u * (LUFF_HEIGHT - BOOM_Y),
      chordPos * sinA + normalOffset * cosA,
    ),
    flowDir: new THREE.Vector3(cosA, 0, sinA),
    leewardNormal: new THREE.Vector3(-sinA, 0, cosA),
  }
}

function buildPositions(): Float32Array {
  const shape = store.sailShape
  const positions = new Float32Array((U_SEGS + 1) * (V_SEGS + 1) * 3)
  let i = 0

  for (let ui = 0; ui <= U_SEGS; ui++) {
    const u = ui / U_SEGS
    for (let vi = 0; vi <= V_SEGS; vi++) {
      const v = vi / V_SEGS
      const { pos } = sailPoint(u, v, shape)
      positions[i++] = pos.x
      positions[i++] = pos.y
      positions[i++] = pos.z
    }
  }

  return positions
}

function buildIndices(): Uint32Array {
  const indices: number[] = []
  for (let ui = 0; ui < U_SEGS; ui++) {
    for (let vi = 0; vi < V_SEGS; vi++) {
      const a = ui * (V_SEGS + 1) + vi   // lower-luff
      const b = a + 1                     // lower-leech
      const c = a + (V_SEGS + 1)         // upper-luff
      const d = c + 1                     // upper-leech
      // CCW winding viewed from windward (-z) side → normals point toward windward
      indices.push(a, b, c)
      indices.push(b, d, c)
    }
  }
  return new Uint32Array(indices)
}

function updateSailGeometry() {
  const positions = buildPositions()
  ;(sailGeo.attributes.position.array as Float32Array).set(positions)
  sailGeo.attributes.position.needsUpdate = true
  sailGeo.computeVertexNormals()
  updateDraftStripes()
  updateLeechLine()
  updateBoom()
  updateMast()
}

// ---------------------------------------------------------------------------
// Mast — curved tube that follows mastBendAt
// ---------------------------------------------------------------------------

function buildMastGeometry(): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = []
  const SEGS = 20
  for (let i = 0; i <= SEGS; i++) {
    const u = i / SEGS
    // Extend slightly past the sail head for the masthead fitting
    pts.push(new THREE.Vector3(mastBendAt(u), u * (LUFF_HEIGHT + 0.4), 0))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  return new THREE.TubeGeometry(curve, 24, 0.06, 8, false)
}

function updateMast() {
  if (!mast) return
  const old = mast.geometry
  mast.geometry = buildMastGeometry()
  old.dispose()
  // Keep the backstay cable attached to the (moving) masthead
  if (backstayLine) {
    backstayLine.geometry.setFromPoints([
      new THREE.Vector3(mastBendAt(1), LUFF_HEIGHT + 0.4, 0),
      new THREE.Vector3(mainChordFoot() * 1.25, 0, 0),
    ])
    backstayLine.geometry.attributes.position.needsUpdate = true
  }
}

// ---------------------------------------------------------------------------
// Draft stripes — the horizontal trim bands real mainsails carry
// ---------------------------------------------------------------------------

const STRIPE_HEIGHTS = [0.25, 0.55, 0.85]

function stripePoints(u: number): THREE.Vector3[] {
  const shape = store.sailShape
  const pts: THREE.Vector3[] = []
  for (let vi = 0; vi <= V_SEGS; vi++) {
    const { pos, leewardNormal } = sailPoint(u, vi / V_SEGS, shape)
    // Nudge off the surface so the stripe never z-fights with the sail cloth
    pts.push(pos.addScaledVector(leewardNormal, 0.012))
  }
  return pts
}

function initDraftStripes() {
  const mat = new THREE.LineBasicMaterial({ color: 0x2a4a6a, transparent: true, opacity: 0.9 })
  draftStripes = STRIPE_HEIGHTS.map((u) => {
    const geo = new THREE.BufferGeometry().setFromPoints(stripePoints(u))
    const line = new THREE.Line(geo, mat)
    scene.add(line)
    return { u, line, geo }
  })
}

function updateDraftStripes() {
  for (const stripe of draftStripes) {
    stripe.geo.setFromPoints(stripePoints(stripe.u))
    stripe.geo.attributes.position.needsUpdate = true
  }
}

// ---------------------------------------------------------------------------
// Leech line — highlighted trailing edge; twist is read off this edge on a
// real boat, so give it enough contrast to follow when the head opens
// ---------------------------------------------------------------------------

function leechPoints(): THREE.Vector3[] {
  const shape = store.sailShape
  const pts: THREE.Vector3[] = []
  for (let ui = 0; ui <= U_SEGS; ui++) {
    const { pos, leewardNormal } = sailPoint(ui / U_SEGS, 1, shape)
    pts.push(pos.addScaledVector(leewardNormal, 0.012))
  }
  return pts
}

function initLeechLine() {
  const mat = new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.95 })
  leechLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(leechPoints()), mat)
  scene.add(leechLine)
}

function updateLeechLine() {
  if (!leechLine) return
  leechLine.geometry.setFromPoints(leechPoints())
  leechLine.geometry.attributes.position.needsUpdate = true
}

// ---------------------------------------------------------------------------
// Boom & running rigging — follow the foot of the sail as trim changes
// ---------------------------------------------------------------------------

const BOOM_Y   = 1.1                   // gooseneck height: boom clears the deck hardware
                                       // (genoa track, traveler) under the main's foot
const BOOM_LEN_BASE = CHORD_FOOT + 0.3 // spar length at default proportions (mesh is scaled)
const TRACK_X  = 3.9                   // traveler track position on deck (aft)
const TRACK_HALF = 1.0                 // half-width of the traveler track

/** Boom length follows the boat's foot chord: extends past the clew at full outhaul. */
function boomLen(): number {
  return mainChordFoot() + 0.3
}

function updateBoom() {
  if (!boom) return
  const shape = store.sailShape
  const a = sectionAngleRad(0, shape)
  const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
  const len = boomLen()
  boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  boom.scale.setY(len / BOOM_LEN_BASE) // cylinder axis is y before the quaternion
  boom.position.set(dir.x * len / 2, BOOM_Y, dir.z * len / 2)
  boomEndFitting.position.set(dir.x * len, BOOM_Y, dir.z * len)

  // Outhaul (pajarín): clew → boom-end fitting. Easing it slides the clew
  // forward along the spar (chordLength), so this line reads the setting.
  const clew = sailPoint(0, 1, shape).pos
  clew.y = BOOM_Y + 0.06
  outhaulLine.geometry.setFromPoints([
    clew,
    new THREE.Vector3(dir.x * len, BOOM_Y + 0.05, dir.z * len),
  ])

  // Mainsheet: from the aft end of the boom down to the traveler car,
  // which slides to windward (−z) / leeward (+z) with the traveler control.
  const sheetAttach = new THREE.Vector3(
    dir.x * mainChordFoot() * 0.92, BOOM_Y - 0.07, dir.z * mainChordFoot() * 0.92)
  const carZ = -(store.controls.traveler / 50) * TRACK_HALF
  travelerCar.position.set(TRACK_X, 0.06, carZ)
  mainsheetLine.geometry.setFromPoints([
    sheetAttach,
    new THREE.Vector3(TRACK_X, 0.10, carZ),
  ])
}

// ---------------------------------------------------------------------------
// Genoa — forestay, surface, stripes, leech line, sheet lead
// ---------------------------------------------------------------------------

/**
 * Forestay sag (metres, visual scale): grows with wind load, shrinks with
 * backstay tension — the same coupling computeGenoaShape models as camber.
 * Rendered as a leeward bow of the luff, fading toward the sheeted clew.
 */
function forestaySagAmount(): number {
  const slack = 1 - store.controls.backstay / 100
  const load = Math.min(1, Math.max(0, (store.wind.trueWindSpeedKts - 6) / 19))
  return 0.05 + slack * (0.15 + 0.30 * load)
}

/** Fraction of the stay the luff spans, stretched by halyard tension.
 *  Scaled by the selected sail's luff length: a heavy-weather jib hoists
 *  well short of the hounds, leaving bare stay above its head. */
function genoaHeadFrac(): number {
  const t = store.genoaControls.halyard / 100
  return (GENOA_HEAD_FRAC_MIN + (GENOA_HEAD_FRAC_MAX - GENOA_HEAD_FRAC_MIN) * t) *
    store.headsail.luffFrac
}

/**
 * Straight-line luff point: tack at the stem toward the hounds on the (bent)
 * mast — but the head (u = 1) stops at genoaHeadFrac() of the stay, leaving
 * room for the halyard between the head and the sheave.
 */
function genoaLuffPoint(u: number): THREE.Vector3 {
  const hx = mastBendAt(HOUNDS_FRAC)
  const hy = HOUNDS_FRAC * LUFF_HEIGHT
  const s = u * genoaHeadFrac()
  return new THREE.Vector3(
    -J_LENGTH + s * (hx + J_LENGTH),
    TACK_Y + s * (hy - TACK_Y),
    0,
  )
}

/** Chord at height u: straight taper with a slight leech hollow (no roach). */
function genoaChordLength(u: number): number {
  const foot = genoaChordFoot()
  const straight = foot + (GENOA_CHORD_HEAD - foot) * u
  return straight - GENOA_HOLLOW * Math.sin(Math.PI * u)
}

/**
 * Clew height above the tack. The lead car sets the base: car forward, the
 * sheet pulls the clew down hard (leech tension) and holds it low; car aft,
 * the pull goes flat along the foot and the unloaded leech lets the clew
 * ride up — the visual cue every jib-trim guide draws next to its lead
 * table. Sheet tension stacks on top: winching in drags the clew down
 * toward the car, easing lets it fly up (the first inch of a flogging
 * clew is always UP).
 */
function genoaClewRise(): number {
  const t = store.genoaControls.car / 100
  const base = GENOA_CLEW_RISE_MIN + (GENOA_CLEW_RISE_MAX - GENOA_CLEW_RISE_MIN) * t
  const sheetPull = (store.genoaControls.jibsheet / 100 - 0.5) * 0.16
  // High-cut sails (heavy-weather jib) carry their clew well above the deck
  return base - sheetPull + store.headsail.clewRise
}

/**
 * Vertical rise of the sail toward the clew: zero along the luff (v = 0),
 * full at the clew (v = 1, u = 0), fading with height as the leech blends
 * into the straight taper. Only the foot region actually lifts.
 */
function genoaFootRise(u: number, v: number): number {
  return genoaClewRise() * Math.pow(v, 1.3) * (1 - u) ** 2
}

/**
 * Section angle of the genoa at height u — same convention as the main:
 * the chord flies where the SHEET puts it (genoaSheetAngleDeg, boat frame),
 * weathervaning along the AWA when the sheeted angle is wider than the wind
 * (luffing). Twist opens the upper sections a further twist·u degrees to
 * leeward (TWIST_VIS on screen only).
 */
function genoaSectionAngleRad(u: number, shape: SailShape): number {
  const awa = store.wind.apparentWindAngleDeg
  const chordAngleDeg = Math.min(
    genoaSheetAngleDeg(store.genoaControls, store.headsail.trim),
    awa,
  )
  return ((chordAngleDeg + u * shape.twistDeg * TWIST_VIS) * Math.PI) / 180
}

/**
 * Point on the genoa surface at (u, v) plus the local telltale frame —
 * mirrors sailPoint. Differences: the luff hangs off the forestay (with
 * sag instead of mast bend), and the foot depth is owned by the lead car
 * (footFullnessRatio) rather than the outhaul.
 */
function genoaPoint(u: number, v: number, shape: SailShape): {
  pos: THREE.Vector3
  flowDir: THREE.Vector3
  leewardNormal: THREE.Vector3
} {
  const chord = genoaChordLength(u)
  const a = genoaSectionAngleRad(u, shape)
  const cosA = Math.cos(a)
  const sinA = Math.sin(a)

  const chordPos = v * chord
  const footScale = 1 + (shape.footFullnessRatio - 1) * footBlend(u)
  const camberMag =
    CAMBER_VIS * shape.camberRatio * footScale * chord *
    camberCurve(v, shape.draftPositionRatio)
  // Sag bows the luff to leeward mid-span; the clew is held by the sheet,
  // so the deflection fades toward the leech — like mast bend on the main.
  const sagZ = forestaySagAmount() * 4 * u * (1 - u) * (1 - v)

  // Luffing genoa: belly collapses, flap wave beats through the cloth
  const luffing = luffAmount(shape.angleOfAttackDeg)
  const normalOffset = camberMag * (1 - 0.8 * luffing) + flapOffset(luffing, chord, u, v)

  const luff = genoaLuffPoint(u)
  return {
    pos: new THREE.Vector3(
      luff.x + chordPos * cosA - normalOffset * sinA,
      luff.y + genoaFootRise(u, v),
      chordPos * sinA + normalOffset * cosA + sagZ,
    ),
    flowDir: new THREE.Vector3(cosA, 0, sinA),
    leewardNormal: new THREE.Vector3(-sinA, 0, cosA),
  }
}

function buildGenoaPositions(): Float32Array {
  const shape = store.genoaShape
  const positions = new Float32Array((U_SEGS + 1) * (V_SEGS + 1) * 3)
  let i = 0
  for (let ui = 0; ui <= U_SEGS; ui++) {
    const u = ui / U_SEGS
    for (let vi = 0; vi <= V_SEGS; vi++) {
      const { pos } = genoaPoint(u, vi / V_SEGS, shape)
      positions[i++] = pos.x
      positions[i++] = pos.y
      positions[i++] = pos.z
    }
  }
  return positions
}

const GENOA_STRIPE_HEIGHTS = [0.3, 0.6]

function genoaStripePoints(u: number): THREE.Vector3[] {
  const shape = store.genoaShape
  const pts: THREE.Vector3[] = []
  for (let vi = 0; vi <= V_SEGS; vi++) {
    const { pos, leewardNormal } = genoaPoint(u, vi / V_SEGS, shape)
    pts.push(pos.addScaledVector(leewardNormal, 0.012))
  }
  return pts
}

function genoaLeechPoints(): THREE.Vector3[] {
  const shape = store.genoaShape
  const pts: THREE.Vector3[] = []
  for (let ui = 0; ui <= U_SEGS; ui++) {
    const { pos, leewardNormal } = genoaPoint(ui / U_SEGS, 1, shape)
    pts.push(pos.addScaledVector(leewardNormal, 0.012))
  }
  return pts
}

/**
 * The full forestay: stem head → hounds, sagging to leeward under load.
 * The genoa's luff hangs on the lower genoaHeadFrac() of it; above the head
 * only the bare stay (and the halyard) remain visible.
 */
function forestayPoints(): THREE.Vector3[] {
  const hx = mastBendAt(HOUNDS_FRAC)
  const hy = HOUNDS_FRAC * LUFF_HEIGHT
  const sag = forestaySagAmount()
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 16; i++) {
    const s = i / 16
    pts.push(new THREE.Vector3(
      -J_LENGTH + s * (hx + J_LENGTH),
      0.05 + s * (hy - 0.05),
      sag * 4 * s * (1 - s),
    ))
  }
  return pts
}

/**
 * Head reinforcement patch (puño de driza): the darker cloth band across the
 * top of the sail where the layers double up around the head fitting.
 */
const HEAD_PATCH_U = 0.88
const HEAD_PATCH_COLS = 8

function genoaHeadPatchPositions(): Float32Array {
  const shape = store.genoaShape
  const positions = new Float32Array(2 * (HEAD_PATCH_COLS + 1) * 3)
  let i = 0
  for (const u of [HEAD_PATCH_U, 1]) {
    for (let c = 0; c <= HEAD_PATCH_COLS; c++) {
      const { pos, leewardNormal } = genoaPoint(u, c / HEAD_PATCH_COLS, shape)
      // Sit just off the cloth so the patch never z-fights with the sail
      pos.addScaledVector(leewardNormal, 0.007)
      positions[i++] = pos.x
      positions[i++] = pos.y
      positions[i++] = pos.z
    }
  }
  return positions
}

/** Hounds point on the (bent) mast — where the halyard sheave lives. */
function houndsPoint(): THREE.Vector3 {
  return new THREE.Vector3(mastBendAt(HOUNDS_FRAC), HOUNDS_FRAC * LUFF_HEIGHT, 0)
}

// Jib lead track on the leeward side deck; the car slides fore/aft. The
// track lives where the sheet can actually work: it STARTS just aft of the
// clew's neutral position (a lead forward of the clew would push, not pull)
// and runs aft from there. Per-boat: a 145 % genoa sheets much further aft
// than a blade jib, so the track follows the boat's overlap.
const JIB_TRACK_LEN = 2.2

/** Forward end of the lead track: just aft of the clew at its neutral trim. */
function jibTrackX0(): number {
  return -J_LENGTH + genoaChordFoot() * 0.96 + 0.15
}

/**
 * Lateral (athwartships) position of the track: ON the sheeting line the
 * physics enforces — the chord can rotate inboard until the clew sits
 * exactly over the track (the sail's minSheetAngleDeg), and no further.
 * Deriving the track z from the same angle keeps the picture honest: fully
 * winched in, the sheet goes vertical and the clew never crosses inside the
 * lead line (a rope can pull, not push). Per-sail: a blade jib's track sits
 * visibly further inboard than a genoa's.
 */
function jibTrackZ(): number {
  return genoaChordFoot() * Math.sin((store.headsail.trim.minSheetAngleDeg * Math.PI) / 180)
}

function initGenoa() {
  genoaGeo = new THREE.BufferGeometry()
  genoaGeo.setAttribute('position', new THREE.BufferAttribute(buildGenoaPositions(), 3))
  genoaGeo.setIndex(Array.from(buildIndices()))
  genoaGeo.computeVertexNormals()

  // Warm sailcloth tint so the two sails read apart at a glance
  const genoaMatFront = new THREE.MeshStandardMaterial({
    color: 0xf2e9d4,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.88,
    roughness: 0.65,
    metalness: 0.0,
  })
  const genoaMatBack = new THREE.MeshStandardMaterial({
    color: 0xd9cba6,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.80,
    roughness: 0.75,
    metalness: 0.0,
  })

  const genoaMesh = new THREE.Mesh(genoaGeo, genoaMatFront)
  genoaMesh.castShadow = true
  scene.add(genoaMesh)
  scene.add(new THREE.Mesh(genoaGeo, genoaMatBack))

  const stripeMat = new THREE.LineBasicMaterial({ color: 0x6a5a2a, transparent: true, opacity: 0.9 })
  genoaStripes = GENOA_STRIPE_HEIGHTS.map((u) => {
    const geo = new THREE.BufferGeometry().setFromPoints(genoaStripePoints(u))
    const line = new THREE.Line(geo, stripeMat)
    scene.add(line)
    return { u, line, geo }
  })

  genoaLeechLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(genoaLeechPoints()),
    new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.95 }),
  )
  scene.add(genoaLeechLine)

  forestayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(forestayPoints()),
    new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.7 }),
  )
  scene.add(forestayLine)

  // Halyard: head of the sail → sheave at the hounds, with a shackle at the
  // head and a doubled reinforcement patch on the cloth below it
  genoaHalyardLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xf0a848 }),
  )
  scene.add(genoaHalyardLine)

  genoaHeadShackle = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.6, roughness: 0.4 }),
  )
  scene.add(genoaHeadShackle)

  genoaHeadPatchGeo = new THREE.BufferGeometry()
  genoaHeadPatchGeo.setAttribute(
    'position', new THREE.BufferAttribute(genoaHeadPatchPositions(), 3))
  const patchIndices: number[] = []
  for (let c = 0; c < HEAD_PATCH_COLS; c++) {
    const a = c
    const b = c + 1
    const cc = HEAD_PATCH_COLS + 1 + c
    const d = cc + 1
    patchIndices.push(a, b, cc, b, d, cc)
  }
  genoaHeadPatchGeo.setIndex(patchIndices)
  genoaHeadPatchGeo.computeVertexNormals()
  const headPatch = new THREE.Mesh(
    genoaHeadPatchGeo,
    new THREE.MeshStandardMaterial({
      color: 0xc4ac74,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      roughness: 0.8,
    }),
  )
  scene.add(headPatch)

  // Lead track + car + sheet + winch, mirroring the traveler/mainsheet
  // hardware. Track and winch positions follow the boat's overlap, so they
  // are (re)placed in updateGenoaGeometry, not here.
  const hardwareMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.5, roughness: 0.5 })
  jibTrack = new THREE.Mesh(
    new THREE.BoxGeometry(JIB_TRACK_LEN + 0.2, 0.05, 0.07), hardwareMat)
  scene.add(jibTrack)

  jibCar = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.10, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x38404c, metalness: 0.3, roughness: 0.6 }),
  )
  scene.add(jibCar)

  jibWinch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.16, 14),
    new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.7, roughness: 0.35 }),
  )
  scene.add(jibWinch)

  jibSheetLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xd8dee8 }),
  )
  scene.add(jibSheetLine)

  updateGenoaGeometry()
}

function updateGenoaGeometry() {
  if (!genoaGeo) return
  ;(genoaGeo.attributes.position.array as Float32Array).set(buildGenoaPositions())
  genoaGeo.attributes.position.needsUpdate = true
  genoaGeo.computeVertexNormals()

  for (const stripe of genoaStripes) {
    stripe.geo.setFromPoints(genoaStripePoints(stripe.u))
    stripe.geo.attributes.position.needsUpdate = true
  }
  genoaLeechLine.geometry.setFromPoints(genoaLeechPoints())
  genoaLeechLine.geometry.attributes.position.needsUpdate = true
  forestayLine.geometry.setFromPoints(forestayPoints())
  forestayLine.geometry.attributes.position.needsUpdate = true

  // Halyard hardware follows the head of the sail
  const head = genoaPoint(1, 0, store.genoaShape).pos
  genoaHalyardLine.geometry.setFromPoints([head, houndsPoint()])
  genoaHeadShackle.position.copy(head)
  ;(genoaHeadPatchGeo.attributes.position.array as Float32Array)
    .set(genoaHeadPatchPositions())
  genoaHeadPatchGeo.attributes.position.needsUpdate = true
  genoaHeadPatchGeo.computeVertexNormals()

  // Sheet lead: the sheet leaves the clew, turns DOWN-AND-AFT through the
  // car block, then runs aft to the primary winch. The car position changes
  // the clew→car angle — steep pull (leech tension) with the car forward,
  // flat pull (foot tension) with it aft — which is the whole point of the
  // control, so the two-segment routing has to be visible.
  const x0 = jibTrackX0()
  const trackZ = jibTrackZ()
  jibTrack.position.set(x0 + JIB_TRACK_LEN / 2, 0.03, trackZ)

  const clew = genoaPoint(0, 1, store.genoaShape).pos
  const carX = x0 + (store.genoaControls.car / 100) * JIB_TRACK_LEN
  jibCar.position.set(carX, 0.06, trackZ)

  const winch = new THREE.Vector3(x0 + JIB_TRACK_LEN + 0.9, 0.08, trackZ - 0.15)
  jibWinch.position.copy(winch)
  jibSheetLine.geometry.setFromPoints([
    clew,
    new THREE.Vector3(carX, 0.11, trackZ),
    new THREE.Vector3(winch.x, winch.y + 0.08, winch.z),
  ])
}

// ---------------------------------------------------------------------------
// Telltales
// ---------------------------------------------------------------------------

type TelltaleKind = 'windward' | 'leeward' | 'leech'

interface Telltale {
  kind: TelltaleKind
  sail: 'main' | 'genoa'
  u: number          // height fraction on the sail
  v: number          // chord fraction (1 for leech telltales)
  phase: number      // per-telltale random phase so they don't move in sync
  line: THREE.Line
  geo: THREE.BufferGeometry
  positions: Float32Array
}

const TELL_SEGS = 10
const TELL_LEN = 0.55
let telltales: Telltale[] = []

const TELL_COLORS: Record<TelltaleKind, number> = {
  windward: 0x3ed47e, // green — like a starboard-side yarn
  leeward: 0xe8534a,  // red — visible through the cloth from windward
  leech: 0xf5f0dc,    // off-white ribbon on the leech
}

function initTelltales() {
  const defs: { kind: TelltaleKind; sail: 'main' | 'genoa'; u: number; v: number }[] = [
    // Mainsail body pairs (windward + leeward) at three heights, ~35 % chord
    { kind: 'windward', sail: 'main', u: 0.25, v: 0.35 }, { kind: 'leeward', sail: 'main', u: 0.25, v: 0.35 },
    { kind: 'windward', sail: 'main', u: 0.55, v: 0.35 }, { kind: 'leeward', sail: 'main', u: 0.55, v: 0.35 },
    { kind: 'windward', sail: 'main', u: 0.82, v: 0.35 }, { kind: 'leeward', sail: 'main', u: 0.82, v: 0.35 },
    // Mainsail leech ribbons, roughly at batten heights
    { kind: 'leech', sail: 'main', u: 0.30, v: 1 },
    { kind: 'leech', sail: 'main', u: 0.60, v: 1 },
    { kind: 'leech', sail: 'main', u: 0.88, v: 1 },
    // Genoa pairs sit close to the luff — THE jib-trim reference on a real
    // boat (steer/sheet until both sides stream)
    { kind: 'windward', sail: 'genoa', u: 0.30, v: 0.18 }, { kind: 'leeward', sail: 'genoa', u: 0.30, v: 0.18 },
    { kind: 'windward', sail: 'genoa', u: 0.58, v: 0.18 }, { kind: 'leeward', sail: 'genoa', u: 0.58, v: 0.18 },
    { kind: 'windward', sail: 'genoa', u: 0.84, v: 0.18 }, { kind: 'leeward', sail: 'genoa', u: 0.84, v: 0.18 },
    // One genoa leech ribbon at mid-leech for reading twist
    { kind: 'leech', sail: 'genoa', u: 0.55, v: 1 },
  ]

  telltales = defs.map((def, i) => {
    const positions = new Float32Array((TELL_SEGS + 1) * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: TELL_COLORS[def.kind], linewidth: 2 }),
    )
    line.frustumCulled = false
    scene.add(line)
    return { ...def, phase: i * 2.399, line, geo, positions }
  })
}

/**
 * Animate one telltale for time t (seconds).
 *
 * Behaviour follows what real yarns do:
 *  - attached flow  → streams aft along the surface, light flutter whose
 *    frequency and stiffness grow with wind speed (light air: lazy droop).
 *  - luffing        → the WINDWARD yarn lifts, dances and flicks upward
 *    (flow is hitting the lee side of the entry).
 *  - separated      → the LEEWARD yarn stalls: droops and swirls slowly in
 *    the detached, recirculating air.
 *  - leech ribbons stream when flow exits cleanly, and get sucked around to
 *    leeward when the leech is stalled (over-trimmed / hooked).
 */
function updateTelltale(tt: Telltale, t: number) {
  const shape = tt.sail === 'genoa' ? store.genoaShape : store.sailShape
  const wind = store.wind
  const windFrac = Math.min(1, Math.max(0, (wind.trueWindSpeedKts - 6) / 19))

  const surfacePoint = tt.sail === 'genoa' ? genoaPoint : sailPoint
  const { pos: root, flowDir, leewardNormal } = surfacePoint(tt.u, tt.v, shape)
  const flow = computeLocalFlow(shape, wind, tt.u)

  // Surface offset so body yarns sit just off the cloth
  const sideSign = tt.kind === 'windward' ? -1 : 1
  if (tt.kind !== 'leech') root.addScaledVector(leewardNormal, sideSign * 0.05)

  // Flutter parameters scale with wind: faster and straighter in a breeze
  const omega = 2 * Math.PI * (0.9 + windFrac * 2.6)   // flutter frequency
  const flutterAmp = 0.035 + windFrac * 0.045
  const droop = (1 - windFrac) * 0.30                   // light air: yarn sags

  const misbehaving =
    (tt.kind === 'windward' && flow.regime === 'luffing') ||
    (tt.kind === 'leeward' && flow.regime === 'separated') ||
    (tt.kind === 'leech' && flow.regime === 'separated')

  const up = new THREE.Vector3(0, 1, 0)
  const p = new THREE.Vector3()
  const dir = new THREE.Vector3()

  for (let k = 0; k <= TELL_SEGS; k++) {
    const s = k / TELL_SEGS
    const ph = tt.phase

    if (!misbehaving) {
      // Streaming: aft along the flow with travelling-wave flutter
      dir.copy(flowDir)
      p.copy(root).addScaledVector(dir, TELL_LEN * s)
      const wave = Math.sin(omega * t + ph + s * 5.5) * flutterAmp * s
      p.addScaledVector(leewardNormal, wave)
      p.y -= droop * s * s * 0.35
      // Luffing leech ribbons barely have flow: extra sag
      if (tt.kind === 'leech' && flow.regime === 'luffing') p.y -= 0.25 * s * s
    } else if (tt.kind === 'windward') {
      // Luffing: yarn lifts and flicks upward chaotically
      const lift = 0.55 + 0.45 * Math.sin(omega * 0.6 * t + ph)
      dir.copy(flowDir).multiplyScalar(0.45)
        .addScaledVector(up, lift)
        .addScaledVector(leewardNormal, -0.35 * Math.sin(omega * 0.83 * t + ph * 1.7))
        .normalize()
      p.copy(root).addScaledVector(dir, TELL_LEN * s)
      p.addScaledVector(leewardNormal, Math.sin(omega * t * 1.2 + ph + s * 6) * 0.06 * s)
    } else {
      // Stalled (leeward body yarn or leech ribbon in separated flow):
      // droops and swirls slowly in recirculating air
      const slow = (0.35 + windFrac * 0.4) * omega * t
      const curl = tt.kind === 'leech' ? -0.45 : 0.2 // leech ribbon sucked forward/leeward
      dir.copy(flowDir).multiplyScalar(curl + 0.25 * Math.sin(slow * 0.31 + ph))
        .addScaledVector(up, -0.85)
        .addScaledVector(leewardNormal, 0.45 * Math.cos(slow * 0.41 + ph))
        .normalize()
      p.copy(root).addScaledVector(dir, TELL_LEN * s)
      p.addScaledVector(leewardNormal, Math.sin(slow + ph + s * 4) * 0.10 * s)
      p.x += Math.sin(slow * 0.7 + ph + s * 3) * 0.05 * s
    }

    tt.positions[k * 3] = p.x
    tt.positions[k * 3 + 1] = p.y
    tt.positions[k * 3 + 2] = p.z
  }

  tt.geo.attributes.position.needsUpdate = true
}

function updateTelltales(t: number) {
  for (const tt of telltales) updateTelltale(tt, t)
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

function initScene(canvas: HTMLCanvasElement) {
  const wrap = canvas.parentElement!
  const w = wrap.clientWidth || 800
  const h = wrap.clientHeight || 600

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x0a1826, 1)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  // Set size immediately using the values we already read
  renderer.setSize(w, h, false)

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1826)
  scene.fog = new THREE.Fog(0x0a1826, 35, 65)

  // Camera — raised leeward-quarter view: high enough that the fan of the
  // sections (twist) reads in plan, far enough off the chord line that
  // camber and the leech line stay visible.
  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100)
  camera.position.set(9, 11, 12)
  camera.lookAt(1.5, 4, 1)

  controls = new OrbitControls(camera, canvas)
  controls.target.set(1.5, 4, 1)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 5
  controls.maxDistance = 35
  controls.update()

  // Lights
  const ambient = new THREE.AmbientLight(0x6080a0, 1.2)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xfff5e0, 2.5)
  sun.position.set(-8, 20, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 50
  scene.add(sun)

  const fill = new THREE.DirectionalLight(0x4080c0, 0.6)
  fill.position.set(5, 5, -10)
  scene.add(fill)

  // Mast — curved tube, bends with the backstay (see mastBendAt)
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 })
  mast = new THREE.Mesh(buildMastGeometry(), mastMat)
  mast.castShadow = true
  scene.add(mast)

  // Backstay cable: masthead → stern anchor point (aft = +x), so the bend
  // reads as "the backstay is pulling" rather than the mast bowing on its own.
  // Endpoints follow the masthead in updateMast.
  backstayLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(mastBendAt(1), LUFF_HEIGHT + 0.4, 0),
      new THREE.Vector3(mainChordFoot() * 1.25, 0, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.7 }),
  )
  scene.add(backstayLine)

  // Boom — tapered spar with gooseneck and end fitting, plus the running
  // rigging that trims it: outhaul line and mainsheet → traveler car.
  // Everything except the gooseneck and track follows the trim in updateBoom.
  const boomMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.5, roughness: 0.5 })
  boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, BOOM_LEN_BASE, 12), boomMat)
  boom.castShadow = true
  scene.add(boom)

  boomEndFitting = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), boomMat)
  scene.add(boomEndFitting)

  const gooseneck = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), boomMat)
  gooseneck.position.set(0, BOOM_Y, 0)
  scene.add(gooseneck)

  // Traveler track across the deck; the car slides with the traveler control
  const track = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.05, TRACK_HALF * 2 + 0.2), boomMat)
  track.position.set(TRACK_X, 0.03, 0)
  scene.add(track)
  travelerCar = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.10, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x38404c, metalness: 0.3, roughness: 0.6 }),
  )
  scene.add(travelerCar)

  outhaulLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xf0a848 }),
  )
  scene.add(outhaulLine)
  mainsheetLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xd8dee8 }),
  )
  scene.add(mainsheetLine)

  // Water plane (subtle)
  const waterGeo = new THREE.PlaneGeometry(60, 60)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0d2a40,
    roughness: 0.9,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  })
  const water = new THREE.Mesh(waterGeo, waterMat)
  water.rotation.x = -Math.PI / 2
  water.position.y = -0.05
  water.receiveShadow = true
  scene.add(water)

  // Sail geometry
  sailGeo = new THREE.BufferGeometry()
  const positions = buildPositions()
  sailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  sailGeo.setIndex(Array.from(buildIndices()))
  sailGeo.computeVertexNormals()

  // Leeward face (FrontSide — normals point windward after CCW winding fix)
  const sailMatFront = new THREE.MeshStandardMaterial({
    color: 0xddeeff,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.88,
    roughness: 0.65,
    metalness: 0.0,
  })
  // Windward face — slightly warmer/darker
  const sailMatBack = new THREE.MeshStandardMaterial({
    color: 0xaaccee,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.80,
    roughness: 0.75,
    metalness: 0.0,
  })

  sailMesh = new THREE.Mesh(sailGeo, sailMatFront)
  sailMesh.castShadow = true
  scene.add(sailMesh)

  // Second mesh shares same geometry, renders windward face
  const backMesh = new THREE.Mesh(sailGeo, sailMatBack)
  scene.add(backMesh)

  initDraftStripes()
  initLeechLine()
  initGenoa()
  initTelltales()
  updateBoom()

  // Wind direction arrows (TWA + AWA)
  addWindArrows()

  // Grid on water
  const grid = new THREE.GridHelper(30, 20, 0x1a3a5a, 0x1a3a5a)
  grid.position.y = -0.04
  grid.material.opacity = 0.4
  grid.material.transparent = true
  scene.add(grid)
}

/**
 * Direction the wind BLOWS TOWARD for an angle off the bow (degrees).
 * Bow = −x, windward = −z: head-to-wind (0°) blows straight aft (+x),
 * wind abeam (90°) blows to leeward (+z) — matching the section/flowDir
 * convention used everywhere else in this file.
 */
function windBlowDir(angleDeg: number): THREE.Vector3 {
  const a = (angleDeg * Math.PI) / 180
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
}

/**
 * Two arrows upwind of the boat, both pointing at it along their wind:
 * TWA (true wind — what the course is set against) further out, AWA
 * (apparent wind — what the sails feel) closer in.
 */
function addWindArrows() {
  const boatCenter = new THREE.Vector3(0.5, 0.1, 0)
  const defs = [
    { name: 'twaArrow', angleDeg: store.trueWindAngleDeg, color: 0x5ddc96, dist: 10.5 },
    { name: 'awaArrow', angleDeg: store.wind.apparentWindAngleDeg, color: 0x9fd4ff, dist: 6.5 },
  ]
  for (const d of defs) {
    const dir = windBlowDir(d.angleDeg)
    const origin = boatCenter.clone().addScaledVector(dir, -d.dist)
    const arrow = new THREE.ArrowHelper(dir, origin, 3, d.color, 0.5, 0.3)
    arrow.name = d.name
    scene.add(arrow)
  }
}

function updateWindArrows() {
  for (const name of ['twaArrow', 'awaArrow']) {
    const old = scene.getObjectByName(name)
    if (old) scene.remove(old)
  }
  addWindArrows()
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock()

function animate() {
  animId = requestAnimationFrame(animate)
  controls.update()
  const t = clock.getElapsedTime()
  flapT = t
  // A luffing sail flogs: rebuild the flapping cloth every frame while the
  // flap wave is live (full sails skip this — geometry updates via watches)
  if (luffAmount(store.sailShape.angleOfAttackDeg) > 0) updateSailGeometry()
  if (luffAmount(store.genoaShape.angleOfAttackDeg) > 0) updateGenoaGeometry()
  updateTelltales(t)
  renderer.render(scene, camera)
}

function syncSize() {
  if (!canvasRef.value || !renderer) return
  const wrap = canvasRef.value.parentElement!
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (w === 0 || h === 0) return
  renderer.setSize(w, h, false)
  if (camera) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
}

function onResize() { syncSize() }

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  const canvas = canvasRef.value!

  function boot() {
    const wrap = canvas.parentElement!
    const w = wrap.clientWidth || 800
    const h = wrap.clientHeight || 600
    // Pre-size the buffer so Three.js never starts at 300×150
    canvas.width = w
    canvas.height = h
    initScene(canvas)
    animate()
    resizeObserver = new ResizeObserver(() => syncSize())
    resizeObserver.observe(wrap)
    window.addEventListener('resize', onResize)
  }

  // setTimeout(0) runs after the current call stack, by which point CSS layout is computed
  setTimeout(boot, 0)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  resizeObserver?.disconnect()
  controls.dispose()
  renderer.dispose()
  window.removeEventListener('resize', onResize)
})

// React to trim changes
watch(
  () => store.sailShape,
  () => {
    updateSailGeometry()
    updateGenoaGeometry() // mast bend (backstay) moves the hounds/forestay
  },
  { deep: true },
)

watch(
  () => store.genoaShape,
  () => updateGenoaGeometry(),
  { deep: true },
)

// The lead car and halyard can change without changing the genoa shape ranges
// (the halyard also moves the head up the stay — see genoaHeadFrac); the
// sheet sets the chord angle in the BOAT frame, which the AoA clamps can
// hide from genoaShape (deep luffing / past-stall)
watch(
  () => [store.genoaControls.car, store.genoaControls.halyard, store.genoaControls.jibsheet],
  () => updateGenoaGeometry(),
)

// Same for the main: when the AoA clamps bind (fully flogging at −30°, or
// square to the flow at 90°) the sheet/traveler still move the boom
watch(
  () => [store.controls.mainsheet, store.controls.traveler],
  () => updateSailGeometry(),
)

watch(
  () => store.wind.apparentWindAngleDeg,
  () => {
    updateWindArrows()
    updateSailGeometry() // boom angle depends on AWA
    updateGenoaGeometry() // genoa chord angle too
  },
)

// TWA can move without AWA changing (rounded to 0.5°) — keep its arrow honest
watch(
  () => store.trueWindAngleDeg,
  () => updateWindArrows(),
)

// Boat change: rig proportions (chords, overlap, boom) come from store.rig
watch(
  () => store.boat.id,
  () => {
    updateSailGeometry()
    updateGenoaGeometry()
  },
)

// Headsail change: overlap (foot chord), luff span, clew height and the
// lead track all belong to the selected sail
watch(
  () => store.headsailId,
  () => updateGenoaGeometry(),
)
</script>

<template>
  <section class="viz3d">
    <h2>{{ t('viz.heading') }}</h2>
    <div class="canvas-wrap">
      <canvas ref="canvasRef" class="three-canvas" />
      <div class="overlay-hint">{{ t('viz.hint') }}</div>
      <div class="overlay-stats">
        <span class="stats-sail">{{ t('viz.main') }}</span>
        <span>{{ t('viz.twist') }} <strong>{{ store.sailShape.twistDeg.toFixed(1) }}°</strong></span>
        <span>{{ t('viz.aoa') }} <strong>{{ store.sailShape.angleOfAttackDeg.toFixed(1) }}°</strong></span>
        <span>{{ t('viz.camber') }} <strong>{{ (store.sailShape.camberRatio * 100).toFixed(1) }}%</strong></span>
        <span>{{ t('viz.draft') }} <strong>{{ (store.sailShape.draftPositionRatio * 100).toFixed(0) }}%</strong></span>
        <span v-if="store.sailShape.angleOfAttackDeg < LUFF_ONSET_AOA_DEG" class="stat-luffing">{{ t('viz.luffing') }}</span>
      </div>
      <div class="overlay-stats overlay-stats-genoa">
        <span class="stats-sail">{{ t(`headsail.kind.${store.headsail.kind}`) }}</span>
        <span>{{ t('viz.twist') }} <strong>{{ store.genoaShape.twistDeg.toFixed(1) }}°</strong></span>
        <span>{{ t('viz.aoa') }} <strong>{{ store.genoaShape.angleOfAttackDeg.toFixed(1) }}°</strong></span>
        <span>{{ t('viz.camber') }} <strong>{{ (store.genoaShape.camberRatio * 100).toFixed(1) }}%</strong></span>
        <span>{{ t('viz.draft') }} <strong>{{ (store.genoaShape.draftPositionRatio * 100).toFixed(0) }}%</strong></span>
        <span v-if="store.genoaShape.angleOfAttackDeg < LUFF_ONSET_AOA_DEG" class="stat-luffing">{{ t('viz.luffing') }}</span>
      </div>
      <div class="overlay-legend">
        <span><i class="dot dot-windward" /> {{ t('viz.legend.windward') }}</span>
        <span><i class="dot dot-leeward" /> {{ t('viz.legend.leeward') }}</span>
        <span><i class="dot dot-leech" /> {{ t('viz.legend.leech') }}</span>
        <span><i class="dot dot-twa" /> {{ t('viz.legend.twa') }}</span>
        <span><i class="dot dot-awa" /> {{ t('viz.legend.awa') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.viz3d {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
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

.canvas-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  overflow: hidden;
}

.three-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.overlay-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  color: var(--color-hint);
  pointer-events: none;
  background: rgba(10, 24, 38, 0.5);
  padding: 2px 8px;
  border-radius: 4px;
}

.overlay-stats {
  position: absolute;
  top: 8px;
  left: 10px;
  display: flex;
  gap: 1rem;
  font-size: 0.72rem;
  color: var(--color-hint);
  pointer-events: none;
  background: rgba(10, 24, 38, 0.6);
  padding: 4px 10px;
  border-radius: 4px;
}

.overlay-stats strong {
  color: var(--color-accent);
}

.overlay-stats-genoa {
  top: 36px;
}

.stats-sail {
  font-weight: 700;
  color: var(--color-label);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-luffing {
  font-weight: 700;
  color: #e8534a;
  letter-spacing: 0.06em;
  animation: luff-blink 1.1s ease-in-out infinite;
}

@keyframes luff-blink {
  50% { opacity: 0.35; }
}

.overlay-legend {
  position: absolute;
  bottom: 8px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.68rem;
  color: var(--color-hint);
  pointer-events: none;
  background: rgba(10, 24, 38, 0.6);
  padding: 4px 10px;
  border-radius: 4px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.dot-windward { background: #3ed47e; }
.dot-leeward  { background: #e8534a; }
.dot-leech    { background: #f5f0dc; }
.dot-twa      { background: #5ddc96; }
.dot-awa      { background: #9fd4ff; }

/* Mobile: the canvas fills the available height instead of a fixed ratio,
 * and the heavier overlays get out of the model's way. */
@media (max-width: 768px) {
  .viz3d {
    height: 100%;
    min-height: 0;
    padding: 0.45rem;
    gap: 0;
    border-radius: 0;
  }

  .viz3d h2 {
    display: none;
  }

  .canvas-wrap {
    aspect-ratio: auto;
    flex: 1;
    min-height: 0;
  }

  .overlay-legend,
  .overlay-hint {
    display: none;
  }

  .overlay-stats {
    top: 6px;
    left: 6px;
    gap: 0.5rem;
    font-size: 0.62rem;
    padding: 3px 7px;
  }

  .overlay-stats-genoa {
    top: 30px;
  }
}
</style>
