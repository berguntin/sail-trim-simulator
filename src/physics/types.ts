// Core domain types for the sail trim simulator.
// All values are unitless ratios (0-100) or physical units as noted.

export interface TrimControls {
  /** 0 = fully eased, 100 = fully trimmed */
  mainsheet: number
  /** -50 = full leeward, 0 = centered, +50 = full windward */
  traveler: number
  /** 0 = no tension, 100 = maximum tension */
  cunningham: number
  /** 0 = no tension, 100 = maximum tension */
  backstay: number
  /** 0 = fully eased (deep foot), 100 = maximum tension (flat foot) */
  outhaul: number
}

export interface GenoaControls {
  /** 0 = fully eased, 100 = fully trimmed (escota de génova) */
  jibsheet: number
  /** Lead car position along the track: 0 = full forward, 100 = full aft (carro) */
  car: number
  /** Halyard / luff tension: 0 = none, 100 = maximum (driza) */
  halyard: number
}

export interface WindState {
  /** True wind speed in knots, valid range 6-25 */
  trueWindSpeedKts: number
  /**
   * Apparent wind angle in degrees from bow. ≈22-35° on the beat, opening
   * to ~150°+ on a deep run (follows the polar target via the wind triangle).
   */
  apparentWindAngleDeg: number
}

export interface SailShape {
  /** Twist: difference in boom angle at foot vs. leech top, degrees. Range 5-25° */
  twistDeg: number
  /**
   * Effective angle of attack of the sail vs. apparent wind, degrees.
   * EMERGENT, not directly controlled: AoA = AWA − boom/chord angle, where
   * the trim controls set the boom/chord angle in the BOAT's frame — a wind
   * shift changes the AoA until the crew re-trims. Working range ~5-20°;
   * negative (down to −30°) = the sail is backwinded and luffing/flogging;
   * past stall (boom/sheet limits on deep courses) it can reach 90° — a
   * sail square to the flow, driving by drag.
   */
  angleOfAttackDeg: number
  /** Camber ratio (depth/chord), 0.05 (flat) to 0.18 (full) */
  camberRatio: number
  /** Draft position ratio along chord: 0 = leading edge, 1 = trailing edge, optimal 0.4-0.5 */
  draftPositionRatio: number
  /**
   * Depth of the foot region relative to camberRatio, 0.70 (boarded flat) to
   * 1.30 (eased, shelf open). Effect fades out by ~mid-height.
   */
  footFullnessRatio: number
}

export interface AeroCoefficients {
  /** Lift coefficient */
  cl: number
  /** Drag coefficient (parasitic + induced) */
  cd: number
  /** Lift-to-drag ratio, primary quality metric for upwind performance */
  efficiency: number
}

export interface HeadsailTrimParams {
  /**
   * Camber (depth/chord) with a fully slack forestay (backstay 0). A genoa
   * is cut full (~0.16); a working jib flatter (~0.135); a heavy-weather
   * jib flatter still (~0.11).
   */
  camberSlackRatio: number
  /** Camber at maximum forestay tension (backstay 100). */
  camberTightRatio: number
  /**
   * Inboard sheeting limit, degrees off centreline — where the lead track
   * sits. Non-overlapping jibs sheet inside the shrouds (~10°); an
   * overlapping genoa's clew must clear the rig (~13°).
   */
  minSheetAngleDeg: number
  /**
   * Extra camber blown into the sail by cloth stretch at 25 kts TWS (linear
   * from 6 kts). Scales with sail size and cut: a big light genoa goes deep
   * just when you want it flat (~0.03) — THE reason crews change down —
   * while a small heavy-cloth jib barely moves (~0.006).
   */
  windStretchCamber: number
}

export interface BoatTuning {
  /**
   * Fraction (0-1) of the theoretical max heeling force above which the trim
   * score starts penalising heel — i.e. when this boat wants to depower.
   * Low (~0.30) for tender sportboats, high (~0.50) for stiff keelboats.
   * Derived from the boat's polar (see boats/polar.ts boatTuning).
   */
  heelComfortFrac: number
  /**
   * Main's share of upwind sail area (main + jib), 0-1 — the weight used to
   * combine the two sails' coefficients into rig totals. Exact from the ORC
   * certificate areas when available (see boats/rig.ts deriveRig).
   */
  mainAreaFrac: number
  /** Induced-drag aspect ratio (span²/area) of the mainsail (boats/rig.ts). */
  mainAspectRatio: number
  /** Induced-drag aspect ratio of the jib/genoa (boats/rig.ts). */
  genoaAspectRatio: number
  /**
   * Total upwind area of the SELECTED sail plan relative to the certificate
   * plan (main + rated headsail), 0-1. Scales the combined rig coefficients:
   * changing down to a smaller jib sheds drive AND heeling force together —
   * this is what makes a headsail change a depowering step.
   */
  rigPowerFrac: number
  /** Shape characteristics of the selected headsail (boats/headsails.ts). */
  headsail: HeadsailTrimParams
}

export interface PerformanceEstimate {
  /**
   * QUALITATIVE ONLY — 0-100 compared to a theoretical internal optimum.
   * NOT a real VMG prediction for any real boat or polar.
   */
  relativeVMG: number
  /**
   * QUALITATIVE ONLY — 0-100 estimate of heeling force generated.
   * NOT a real heel angle for any real boat.
   */
  relativeHeel: number
  /** Simple classification based on power thresholds */
  powerBalance: 'underpowered' | 'optimal' | 'overpowered'
}
