import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { TrimControls, GenoaControls, WindState, BoatTuning } from '../physics/types'
import { computeSailShape } from '../physics/sailShape'
import { computeGenoaShape } from '../physics/genoaShape'
import { computeAeroCoefficients, applyGenoaBlanketing } from '../physics/aerodynamics'
import {
  estimateRigPerformance,
  findOptimalRig,
  optimalRigScore,
  combineRigAero,
  mainAeroParams,
  genoaAeroParams,
} from '../physics/performance'
import type { BoatModel } from '../boats/types'
import { PRESET_BOATS, DEFAULT_BOAT_ID } from '../boats/presets'
import { deriveRig } from '../boats/rig'
import { deriveHeadsails, type Headsail } from '../boats/headsails'
import {
  boatTuning,
  beatAngleDeg,
  beatVMGKts,
  beatSpeedKts,
  courseTargetSpeedKts,
  courseApparentWindAngleDeg,
} from '../boats/polar'

export const useTrimStore = defineStore('trim', () => {
  // Starting trim: sheeted for the default course (a beat). The sheets set
  // boom/chord angles in the BOAT's frame, so mid-sheet would leave both
  // sails flogging at an upwind AWA — start them trimmed like a crew would
  // leave the marina.
  const controls = ref<TrimControls>({
    mainsheet: 80,
    traveler: 0,
    cunningham: 20,
    backstay: 20,
    outhaul: 50,
  })

  const genoaControls = ref<GenoaControls>({
    jibsheet: 90,
    car: 50,
    halyard: 25,
  })

  // -------------------------------------------------------------------------
  // Boat selection
  // -------------------------------------------------------------------------

  const customBoats = ref<BoatModel[]>([])
  const availableBoats = computed<BoatModel[]>(() => [...PRESET_BOATS, ...customBoats.value])

  const boat = ref<BoatModel>(
    PRESET_BOATS.find((b) => b.id === DEFAULT_BOAT_ID) ?? PRESET_BOATS[0],
  )

  /**
   * Rig proportions from the boat's certificate data: the main's real share
   * of upwind area, estimated aspect ratios, and the visual proportions the
   * 3D view reads (genoa overlap, main chord scale).
   */
  const rig = computed(() => deriveRig(boat.value))

  // -------------------------------------------------------------------------
  // Headsail wardrobe — the certificate's rated sail plus the smaller jibs
  // derived from it (boats/headsails.ts). Selecting a sail changes both the
  // physics (tuning below) and the 3D geometry (overlap, luff, clew).
  // -------------------------------------------------------------------------

  const headsails = computed<Headsail[]>(() => deriveHeadsails(boat.value))

  const headsailId = ref(headsails.value[0].id)
  const headsail = computed<Headsail>(
    () => headsails.value.find((h) => h.id === headsailId.value) ?? headsails.value[0],
  )

  function selectHeadsail(id: string) {
    if (headsails.value.some((h) => h.id === id)) headsailId.value = id
  }

  /**
   * Physics tuning derived from the selected boat's polar and rig — this is
   * what makes trim behaviour boat-specific: a tender sportboat's optimal
   * trim depowers at a wind speed where a stiff keelboat still wants full
   * power, and a blade-jib racer weights its main more than a genoa cruiser.
   *
   * Parameterised on the headsail because the sail choice moves ALL the rig
   * numbers: a smaller jib shifts area share toward the main, raises the
   * headsail's aspect ratio, shrinks the rig's total power, and swaps in its
   * own camber range and sheeting limit.
   */
  function tuningFor(hs: Headsail): BoatTuning {
    const certMainFrac = rig.value.mainAreaFrac
    const rigPowerFrac = certMainFrac + (1 - certMainFrac) * hs.areaRatio
    return {
      ...boatTuning(boat.value.polar),
      mainAreaFrac: certMainFrac / rigPowerFrac,
      mainAspectRatio: rig.value.mainAspectRatio,
      genoaAspectRatio: hs.aspectRatio,
      rigPowerFrac,
      headsail: hs.trim,
    }
  }

  const tuning = computed(() => tuningFor(headsail.value))

  function selectBoat(id: string) {
    const found = availableBoats.value.find((b) => b.id === id)
    if (found) {
      boat.value = found
      // The wardrobe is boat-specific — start on the certificate's rated sail
      headsailId.value = deriveHeadsails(found)[0].id
    }
  }

  /** Register a user-loaded boat (replacing any previous file with the same id) and select it. */
  function addCustomBoat(model: BoatModel) {
    customBoats.value = [...customBoats.value.filter((b) => b.id !== model.id), model]
    boat.value = model
    headsailId.value = deriveHeadsails(model)[0].id
  }

  // -------------------------------------------------------------------------
  // Wind state — course (TWA) is the user's; AWA follows from the polar
  // -------------------------------------------------------------------------

  /** Deepest course on the slider — past this a gybe/pole is due, not trim. */
  const MAX_TWA_DEG = 165

  const wind = ref<WindState>({
    trueWindSpeedKts: 12,
    apparentWindAngleDeg: 30, // overwritten below from the polar
  })

  /** Course as true wind angle; minimum is the polar's beat angle. */
  const trueWindAngleDeg = ref(beatAngleDeg(boat.value.polar, wind.value.trueWindSpeedKts))

  function syncCourse() {
    // Sailing the polar's target speed on the chosen course: AWA follows
    // from the wind triangle (true wind at TWA + the boat's own speed).
    // The course can never point higher than the polar's beat optimum.
    const polar = boat.value.polar
    const tws = wind.value.trueWindSpeedKts
    const minTwa = beatAngleDeg(polar, tws)
    trueWindAngleDeg.value = Math.min(MAX_TWA_DEG, Math.max(minTwa, trueWindAngleDeg.value))
    // Round to 0.5° so the optimizer cache doesn't churn while dragging
    wind.value.apparentWindAngleDeg =
      Math.round(courseApparentWindAngleDeg(polar, tws, trueWindAngleDeg.value) * 2) / 2
  }
  syncCourse()
  watch(boat, syncCourse)

  function setWindSpeed(kts: number) {
    wind.value.trueWindSpeedKts = kts
    syncCourse()
  }

  function setWindAngle(twaDeg: number) {
    trueWindAngleDeg.value = twaDeg
    syncCourse()
  }

  // -------------------------------------------------------------------------
  // Derived physics
  // -------------------------------------------------------------------------

  const sailShape = computed(() => computeSailShape(controls.value, wind.value))
  const aero = computed(() =>
    computeAeroCoefficients(sailShape.value, wind.value, mainAeroParams(tuning.value)),
  )

  // Genoa: forestay tension comes from the backstay — one control, two sails.
  // The selected headsail's cut (camber range, sheeting limit) shapes it.
  const genoaShape = computed(() =>
    computeGenoaShape(genoaControls.value, controls.value.backstay, wind.value, headsail.value.trim),
  )
  // Blanketing applied here AND in the optimizer's genoaAeroFor — the badge
  // and the optimal button must see the same genoa force downwind.
  const genoaAero = computed(() =>
    applyGenoaBlanketing(
      computeAeroCoefficients(genoaShape.value, wind.value, genoaAeroParams(tuning.value)),
      wind.value,
    ),
  )

  /** Area-weighted rig totals (what the coefficient bars display), referenced
   *  to the certificate sail plan — changing down to a smaller jib visibly
   *  drops both bars even at identical per-sail coefficients. */
  const rigAero = computed(() =>
    combineRigAero(aero.value, genoaAero.value, tuning.value.mainAreaFrac, tuning.value.rigPowerFrac),
  )

  const performance = computed(() =>
    estimateRigPerformance(aero.value, genoaAero.value, wind.value, tuning.value),
  )

  function setControl<K extends keyof TrimControls>(key: K, value: TrimControls[K]) {
    controls.value[key] = value
  }

  function setGenoaControl<K extends keyof GenoaControls>(key: K, value: GenoaControls[K]) {
    genoaControls.value[key] = value
  }

  function applyOptimalTrim() {
    const rig = findOptimalRig(wind.value, tuning.value)
    controls.value = { ...rig.main }
    genoaControls.value = { ...rig.genoa }
  }

  // How close the current trim is to the grid optimum, 0-1.
  // relativeVMG is already normalised against the theoretical max (0-100).
  const optimalProximity = computed<number>(() => performance.value.relativeVMG / 100)

  // -------------------------------------------------------------------------
  // Sail choice quality — which headsail should be up right now?
  // -------------------------------------------------------------------------

  /**
   * Best achievable trim score per wardrobe sail in the current wind, from
   * the same grid search that powers "Show Optimal Trim" (results are cached
   * per wind/tuning). The genoa wins in light air on sheer area; once the
   * heel penalty binds, a smaller flatter jib overtakes it — so the
   * recommendation emerges from the physics, not from wind-speed tables.
   */
  const headsailScores = computed(() =>
    headsails.value.map((h) => ({ id: h.id, score: optimalRigScore(wind.value, tuningFor(h)) })),
  )

  const recommendedHeadsailId = computed<string>(
    () => headsailScores.value.reduce((a, b) => (b.score > a.score ? b : a)).id,
  )

  /**
   * How the selected sail's best score compares to the best sail's, 0-1.
   * 1 = the right sail is up; less = leaving performance on the table
   * (heavy jib in light air, genoa dragging the rail in a breeze).
   */
  const sailChoiceFrac = computed<number>(() => {
    const scores = headsailScores.value
    const best = Math.max(...scores.map((s) => s.score))
    const selected = scores.find((s) => s.id === headsail.value.id)?.score ?? best
    if (best <= 0 || selected <= 0) return best <= 0 ? 1 : 0
    return Math.min(1, selected / best)
  })

  // -------------------------------------------------------------------------
  // Polar targets (real numbers from the certificate, in knots)
  // -------------------------------------------------------------------------

  const targets = computed(() => {
    const polar = boat.value.polar
    const tws = wind.value.trueWindSpeedKts
    return {
      beatAngleDeg: beatAngleDeg(polar, tws),
      beatVMGKts: beatVMGKts(polar, tws),
      beatSpeedKts: beatSpeedKts(polar, tws),
      /** Polar target boat speed on the CURRENT course (TWA) */
      courseSpeedKts: courseTargetSpeedKts(polar, trueWindAngleDeg.value, tws),
    }
  })

  /**
   * QUALITATIVE boat speed estimate: the polar's target speed on the current
   * course scaled by how close the current trim is to optimal. Perfect trim
   * sails the polar (100 % of target); the floor of 55 % represents a badly
   * trimmed but still-moving boat. Illustrative feedback, not a prediction.
   *
   * The polar assumes the RIGHT sail is up, so a wrong headsail discounts
   * the estimate: cube root because the score is a force proxy and boat
   * speed responds roughly as its cube root near hull speed.
   */
  const estimatedSpeedKts = computed(
    () =>
      targets.value.courseSpeedKts *
      (0.55 + 0.45 * optimalProximity.value) *
      Math.cbrt(sailChoiceFrac.value),
  )

  return {
    controls,
    genoaControls,
    wind,
    trueWindAngleDeg,
    boat,
    customBoats,
    availableBoats,
    rig,
    headsails,
    headsailId,
    headsail,
    recommendedHeadsailId,
    sailChoiceFrac,
    tuning,
    sailShape,
    genoaShape,
    aero,
    genoaAero,
    rigAero,
    performance,
    targets,
    estimatedSpeedKts,
    setControl,
    setGenoaControl,
    setWindSpeed,
    setWindAngle,
    selectBoat,
    selectHeadsail,
    addCustomBoat,
    applyOptimalTrim,
    optimalProximity,
  }
})
