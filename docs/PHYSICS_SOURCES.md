# Physics Model — Reliable Sources & Calibration Data

Research notes (2026-07) on authoritative sources for the calculation model in
`src/physics/`, prompted by feedback on the similar project
[SailRhythm](https://www.sailrhythm.com/).

## What SailRhythm uses (from the creator)

The Reddit thread is not accessible programmatically, but the creator ("stass")
described the model in the parallel
[Hacker News thread](https://news.ycombinator.com/item?id=43775283):

> "I cheated a little bit and don't calculate the fluid dynamics in real time.
> Instead, I'm using force models from the excellent Aero-Hydrodynamics of
> Sailing book by Marchaj."

- Physics-based VPP (Velocity Prediction Program), boat model: Catalina 36 Tall Rig.
- **Calibrated against ORC-published polars to within 1–5%** on close, beam and
  broad reaches.
- Recommended resource: <https://www.onemetre.net/Design/Design.htm>.

Takeaway: same family of approach as ours (static force coefficients from
Marchaj, no CFD). The main thing they did that we don't: **calibration against
published polar data**.

## Primary references (books & papers)

| Source | Why it matters |
|---|---|
| C.A. Marchaj, *Aero-Hydrodynamics of Sailing* | The classic sail force model reference; what both this project and SailRhythm cite. Ch.2 wind gradient, ch.3 camber/lift, ch.4 stall & separation, ch.5 force decomposition. Out of print — used copies / libraries. |
| F. Fossati, *Aero-Hydrodynamics and the Performance of Sailing Yachts* (2009) | Modern treatment with wind-tunnel data and a full VPP chapter. In print. |
| Larsson, Eliasson & Orych, *Principles of Yacht Design* | Accessible sail force model chapter; good sanity-check numbers. |
| G. Hazen, *A Model of Sail Aerodynamics for Diverse Rig Types* (New England Sailing Yacht Symposium, 1980) | The aero model the IMS/ORC VPP is built on — max Cl / Cd per sail as functions of apparent wind angle, plus reef/flat depowering. |
| J.E. Kerwin, *A Velocity Prediction Program for Ocean Racing Yachts* (MIT, 1978) | The original VPP formulation. |

## Free, verified online sources

### ORC VPP Documentation (the gold standard, free PDF)

<https://orc.org/uploads/files/ORC-VPP-Documentation-2023.pdf> — 92 pages, the
full mathematical model used to handicap real race boats worldwide. Chapter 5
"Aerodynamic Forces" (pp. 35–56) is directly relevant:

**Mainsail force coefficients (Table 5.1, cloth-area based, vs apparent wind
angle β in degrees):**

| β | 0 | 7 | 9 | 12 | 28 | 60 | 90 | 120 | 150 | 180 |
|---|---|---|---|----|----|----|----|-----|-----|-----|
| CL (low) | 0.000 | 0.862 | 1.052 | 1.164 | 1.347 | 1.353 | 1.267 | 0.931 | 0.388 | −0.112 |
| CD (low) | 0.043 | 0.026 | 0.023 | 0.023 | 0.033 | 0.113 | 0.383 | 0.969 | 1.316 | 1.345 |
| CL (high) | 0.000 | 0.948 | 1.138 | 1.250 | 1.427 | 1.383 | 1.267 | 0.931 | 0.388 | −0.112 |

Quadratic viscous drag: `kpm = 0.01379` (drag grows with CL²).

**Jib/genoa force coefficients (Table 5.4):**

| β | 7 | 15 | 20 | 27 | 50 | 60 | 100 | 150 | 180 |
|---|---|----|----|----|----|----|-----|-----|-----|
| CL (high) | 0.000 | 1.100 | 1.475 | 1.500 | 1.450 | 1.250 | 0.400 | 0.000 | −0.100 |
| CD | 0.050 | 0.032 | 0.031 | 0.037 | 0.250 | 0.350 | 0.730 | 0.950 | 0.900 |

`kpj = 0.016`.

**Key formulas:**

- Induced drag: `CDI = CL² · Aref / (π · heff²)` where `heff` is the *effective
  rig height* (eq. 5.34) — a function of roach, fractionality, overlap and
  depowering, not a fixed aspect ratio. Effective span coefficient ≈ 1.1 for a
  masthead rig (eq. 5.42), further scaled by `kheff` which drops from 1.45 at
  20° AWA to 0.80 at 80° AWA (sails eased = jib/hull seal lost).
- Force decomposition (eq. 5.50/5.51) — identical to `computeDriveHeel()` in
  [performance.ts](../src/physics/performance.ts):
  `CR = CL·sinβ − CD·cosβ`, `CH = CL·cosβ + CD·sinβ`.
- Depowering: `flat` scales CL down to a floor of **0.42** (wind-tunnel based,
  revised 2023); `reef` reduces area (jib foot first, then main).
- Twist function (eq. 5.49): depowering lowers the centre of effort —
  `ZCE = ZCE|flat=1 · [1 − 0.406·(1−flat) − 0.902·(1−flat)·(1−frac)]` —
  fractional rigs depower more effectively than masthead rigs.
- Drag non-linearity vs flat (`fcdmult` table, §5.4.3): both fully powered
  (flat=1) and deeply depowered (flat<0.8) trims carry ~6% extra parasitic drag
  vs the linear Cd–Cl² model.

**Caveat when comparing:** ORC tables are indexed by *apparent wind angle* β of
the whole boat and represent the *maximum achievable* coefficient at that
angle with optimal trim folded in. Our `baseCl()` in
[aerodynamics.ts](../src/physics/aerodynamics.ts) is indexed by *sail-section
angle of attack*. Magnitudes are comparable (peak CL ≈ 1.35–1.5 in both), but
the abscissae mean different things — don't transplant numbers blindly.

### Arvel Gentry — sail aerodynamics essays

Boeing aerodynamicist; the definitive corrective on slot-effect myths, how
telltales work, circulation and lift. Free PDFs:

- <https://gentrysailing.com/pdf-theory/Origins-of-Lift.pdf> ("The Origins of Lift")
- Site index: <https://gentrysailing.com/> (blocks bots; open in a browser).
  Mirror of some PDFs: <https://oceansailing.meder.hu/>

Especially relevant to `computeLocalFlow()` / telltale behaviour.

### Onemetre.net — Lester Gilbert's design pages

<https://www.onemetre.net/Design/Design.htm> — recommended by the SailRhythm
creator. Covers circulation theory, sail section lift, twist (measurement,
downwash, wind-gradient-induced twist), camber/draft, and a worked **"Simple
VPP"** — the closest free analogue to what this project needs.

### ORC polar data for calibration

- <https://github.com/jieter/orc-data> — thousands of real ORC certificates
  (2019–2025) as JSON: hull data, sail dimensions, and VPP speed predictions at
  TWS 6–20 kt across true wind angles. Browsable polars:
  <https://jieter.github.io/orc-data/site/>
- This is how SailRhythm validated (1–5% vs ORC polars). If we ever want
  quantitative output, calibrate `performance.ts` against a certificate polar
  the same way.

### ORC public certificate API (used by `src/boats/`) — implemented 2026-07

The ORC serves every active certificate directly (no key required):

- List active certs: `https://data.orc.org/public/WPub.dll?action=activecerts&CountryId=ESP&Family=1` (XML)
- Full RMS record: `https://data.orc.org/public/WPub.dll?action=DownBoatRMS&RefNo=<ref>&ext=json`

Each RMS record carries an `Allowances` object — the boat's VPP polar as time
allowances in **seconds/mile** (knots = 3600 / allowance): grid rows `R52…R150`
over `WindSpeeds` 4–24 kts, plus `Beat`/`Run` optima and `BeatAngle`/`GybeAngle`.

`src/boats/presets.ts` is generated from six representative 2026 Spanish
certificates (Platu 25, J/80, Dufour 34, X-35, First 36.7, Swan 42 CS). The
boat couples into the trim physics two ways (see `src/boats/polar.ts`):

1. **Apparent wind angle** — the wind triangle at the polar's optimum beat
   (beat angle + beat speed) replaces the old fixed AWA heuristic; real boats
   give ≈22–35° across the fleet and wind range.
2. **Heel comfort fraction** — derived from the polar's *power saturation*
   (upwind speed still gained from 12→20 kts vs 6→12 kts). ORC polars encode
   righting moment through the VPP, so a Platu 25 (sat ≈ 0.12 → comfort 0.33)
   depowers in the simulator several knots of TWS before a Swan 42
   (sat ≈ 0.21 → comfort 0.48). Mapping calibrated in `boatTuning()`.

## Genoa model (implemented 2026-07)

`src/physics/genoaShape.ts` maps the three headsail controls to the same
`SailShape` the main uses; `performance.ts` combines both sails area-weighted
(main 0.55 / genoa 0.45, from the preset fleet's certificates) into rig
coefficients scored by the same single objective function.

Control → shape mapping and its sources:

| Control | Effect | Source |
|---|---|---|
| Jib sheet (escota) | AoA (±7°) + twist (primary, sqrt curve) + slight flattening | North U — "the jib sheet is 90 % of jib trim"; Speed & Smarts jib issues |
| Lead car (carro) | Twist ±4° (aft = open leech) + foot fullness (fwd = deep) | North U lead-position diagrams; SailZing lead tables |
| Halyard (driza) | Draft position 0.55 → 0.35 (like the main's cunningham) | North U — "halyard tension positions the draft" |
| Backstay (shared) | Forestay sag → camber 0.16 → 0.08, entry flattens (draft +0.04 aft) | North U — "headstay sag is the biggest depth control on the genoa" |

Modelling decisions:

- **Upwash baseline**: the genoa's baseline AoA is 0.40·AWA vs the main's
  0.35·AWA — the main's circulation rotates the flow at the jib (Gentry,
  "The Origins of Lift"), which is also why the jib sheets closer to the
  centreline without luffing.
- **No slot bonus**: rig coefficients are a plain area-weighted sum. Gentry
  showed the "slot magic" is mostly myth; the real interactions live in the
  shape functions (upwash baseline, backstay ↔ sag coupling).
- **Induced drag**: per-sail `SailAeroParams` (main AR 5 / e 0.9 with the
  boom end-plate; genoa AR 4.5 / e 0.95 — lower geometric AR offset by the
  deck-sweeping foot seal, cf. ORC `kheff`, VPP doc §5.3).
- **Optimizer**: the joint 8-control grid is ~13 M points, so
  `rigGridSearch` runs deterministic coordinate descent (3 rounds of
  main-sweep with genoa held, then genoa-sweep with main held); the sails
  couple only through the shared heel budget and the backstay, so this
  converges and keeps the optimal-button ↔ badge consistency invariant.
- ORC Table 5.4 (jib CL peak 1.5 at β ≈ 27°) supports reusing the main's
  `baseCl` curve for the genoa cloth.

## All points of sail (implemented 2026-07)

The course (TWA) is now a user control from the polar's beat angle to 165°;
AWA follows from the wind triangle at the polar target speed
(`courseApparentWindAngleDeg`), and targets/estimates use
`courseTargetSpeedKts`, which anchors the ORC grid (52-150°) with the
certificate's own beat and run optima at the ends.

Model extensions, all downstream of one physical constraint — **the rigging
limits how far the sails can be eased** (boom ~85°, genoa sheet ~80°):

- **AoA baseline** picks the binding regime: `max(0.35·AWA, AWA − limit + 5)`.
  Upwind this reproduces the previous model exactly; past ~AWA 120° the sail
  is forced beyond stall — which is *why* downwind sailing is drag-driven.
- **Sheet authority grows with AWA** (±4° at 30° → ±20° at 150° for the
  mainsheet): at close angles the sheet mostly pulls down (leech), off the
  wind it is the only angle control and swings the boom through a big arc.
- **Deep-stall aero**: `baseCl` blends the soft-stall line (Marchaj) into a
  flat-plate curve past 35° — Cl = CN·sinα·cosα, pressure drag capped at the
  flat-plate ceiling ≈ 1.2 (Hoerner). Rig CD on a run lands ≈ 1.3, matching
  the ORC main coefficient at β 180° (1.345). Drive then comes from
  `−Cd·cosβ` turning positive past β 90° in eq. 5.50 — no downwind special
  case anywhere.
- **Genoa blanketing**: without a pole the main takes the genoa's air past
  AWA ~120°; both coefficients fade linearly to 45 % at 170°. Applied
  identically in the store and in the optimizer so the badge and the optimal
  button still agree.
- The heel penalty needs no change: `Cy = Cl·cosβ + Cd·sinβ` shrinks on its
  own as β opens, so the optimizer stops depowering downwind for free.

Not modelled (documented simplifications): pinching above the beat angle,
poling out / wing-on-wing, spinnakers, and rolling downwind. Twist optimum
remains TWS-only (a small AWA term would be the next refinement).

## Mapping to our modules

| Our model | Status vs sources |
|---|---|
| `baseCl` peak ≈ 1.5 | Consistent with ORC jib peak (1.5) and main peak (1.35–1.43); Marchaj ch.4 soft-stall shape is right. |
| `cd0` floor 0.015 | ORC mainsail min CD ≈ 0.015–0.023 plus `kpm·CL²` quadratic term. We fold the quadratic viscous term into "separation drag"; ORC keeps it separate (KPP). Acceptable simplification. |
| Induced drag `Cl²/(π·AR·e)`, AR=5, e=0.9 | ORC uses effective rig height instead of fixed AR, and reduces effective span as AWA widens (`kheff`). A fixed AR is fine for a trainer; if reaching angles ever feel wrong, this is the knob. |
| Twist penalty (quadratic, max 30%) | Heuristic (Speed & Smarts #88, SailZing). ORC models twist as CE-height lowering tied to `flat` (eq. 5.49) rather than a Cl penalty — different framing, same physics direction. |
| `computeDriveHeel` | Exactly ORC eq. 5.50/5.51. |
| `trimScore` (drive − heel penalty) | Structurally the same trade-off the ORC optimizer solves with `flat`/`reef`; our comfort-fraction heuristic stands in for a righting-moment model. |

## Community feedback on SailRhythm (HN thread — Reddit inaccessible)

Relevant lessons for this project:

1. **Users immediately test whether trim changes move the numbers.** Several
   reported speed not responding to trim (and one absurd 35 kt reading) — the
   fastest way to lose credibility. Our single-objective-function design
   (score → VMG → badge all from one formula) guards against this; keep it.
2. **Motion/feedback cues matter**: wake, reference grid, wind-flow
   visualization around the sails were the most-requested visual features.
3. **Shape feedback for every control**: users wanted to *see* the sail deform
   per control (vang, cunningham, outhaul, backstay, jib lead), not just read
   numbers. Draft stripes and telltales were the creator's own roadmap answer.
4. **Calibration claim builds trust**: "within 1–5% of ORC polars" was the
   creator's headline credibility statement.
