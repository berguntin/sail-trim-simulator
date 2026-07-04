import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { TrimControls, GenoaControls, WindState } from '../physics/types'
import { computeSailShape } from '../physics/sailShape'
import { computeGenoaShape } from '../physics/genoaShape'
import { computeAeroCoefficients, applyGenoaBlanketing, GENOA_AERO } from '../physics/aerodynamics'
import { estimateRigPerformance, findOptimalRig, combineRigAero } from '../physics/performance'
import type { BoatModel } from '../boats/types'
import { PRESET_BOATS, DEFAULT_BOAT_ID } from '../boats/presets'
import {
  boatTuning,
  beatAngleDeg,
  beatVMGKts,
  beatSpeedKts,
  courseTargetSpeedKts,
  courseApparentWindAngleDeg,
} from '../boats/polar'

export const useTrimStore = defineStore('trim', () => {
  const controls = ref<TrimControls>({
    mainsheet: 50,
    traveler: 0,
    cunningham: 20,
    backstay: 20,
    outhaul: 50,
  })

  const genoaControls = ref<GenoaControls>({
    jibsheet: 50,
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
   * Physics tuning derived from the selected boat's polar — this is what
   * makes trim behaviour boat-specific: a tender sportboat's optimal trim
   * depowers at a wind speed where a stiff keelboat still wants full power.
   */
  const tuning = computed(() => boatTuning(boat.value.polar))

  function selectBoat(id: string) {
    const found = availableBoats.value.find((b) => b.id === id)
    if (found) boat.value = found
  }

  /** Register a user-loaded boat (replacing any previous file with the same id) and select it. */
  function addCustomBoat(model: BoatModel) {
    customBoats.value = [...customBoats.value.filter((b) => b.id !== model.id), model]
    boat.value = model
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
  const aero = computed(() => computeAeroCoefficients(sailShape.value, wind.value))

  // Genoa: forestay tension comes from the backstay — one control, two sails
  const genoaShape = computed(() =>
    computeGenoaShape(genoaControls.value, controls.value.backstay, wind.value),
  )
  // Blanketing applied here AND in the optimizer's genoaAeroFor — the badge
  // and the optimal button must see the same genoa force downwind.
  const genoaAero = computed(() =>
    applyGenoaBlanketing(
      computeAeroCoefficients(genoaShape.value, wind.value, GENOA_AERO),
      wind.value,
    ),
  )

  /** Area-weighted rig totals (what the coefficient bars display). */
  const rigAero = computed(() => combineRigAero(aero.value, genoaAero.value))

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
   */
  const estimatedSpeedKts = computed(
    () => targets.value.courseSpeedKts * (0.55 + 0.45 * optimalProximity.value),
  )

  return {
    controls,
    genoaControls,
    wind,
    trueWindAngleDeg,
    boat,
    customBoats,
    availableBoats,
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
    addCustomBoat,
    applyOptimalTrim,
    optimalProximity,
  }
})
