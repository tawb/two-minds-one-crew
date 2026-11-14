> **Superseded (14 Nov 2026).** The current specification is `Astronaut_Health_Hardware_Report.pdf` plus the team's edit brief
> (three views, auto-populated synthetic data, store-and-forward Earth sync). The app now implements that. This file is kept for
> history: its five-pillar scope (exercise plan, camera reaction test, DONKI/OSDR ship screen, manual-entry-first flow) is **not**
> built in the current version. Its rules about never stating a cause, never inventing clinical limits, and labelling simulated data still apply.

# AstroVitals — v1 build spec for Claude Code

Team Axiom · NASA Space Apps Challenge 2026 · "Create Health Monitoring Software for Astronauts on Space Missions"

You are building the first working version of **AstroVitals**, a web app that helps an astronaut on a long mission monitor their own health, with no doctor aboard and Earth minutes away.

**Thesis:** *It does not tell you how you feel. It tells you what you cannot feel.*

---

## 0. How to work on this project — read first

1. **Ask, do not decide.** If anything in this spec is unclear, missing or contradictory, stop and ask the team. Do not fill gaps with your own choices. Section 11 lists the questions you must ask before or during the build.
2. **Never invent a medical number.** Every threshold, limit, target or reference value must come from `src/data/thresholds.json` (or `exercise.json`), and every entry there must carry a `source` (document name + requirement ID or section + URL). If a value has no source yet, store `null`, and show "reference pending" in the UI. Never fill a number from memory.
3. **The app measures and triages. People diagnose.** No clinical label may ever appear on screen, for anyone: no "depression", "anxiety", "impairment", "disorder", "stroke", "hypertension" or similar. The app reports measurements, compares them to references, and says *On track / Watch / Act now*. It never states a cause. When it shows two facts together (for example, heart rate high and cabin CO2 high), it shows them side by side as facts — never "because".
4. **Nothing medical waits for Earth.** Every reading, threshold, baseline and triage verdict must work fully offline. The network only adds context (live NASA feeds) and carries packets out.
5. **Label simulated data as simulated.** Crew readings are entered by hand or simulated. Real astronaut medical records are not public. Any simulated value must be visibly marked as simulated wherever it appears.
6. **English only. Runs locally only** (`npm run dev`, and `npm run build && npm run preview` to test offline behaviour). No deployment in v1.
7. **List every dependency you add and why**, in `README.md`. Prefer well-known, maintained libraries. Keep the dependency count small.
8. Work in the milestones of section 10. At the end of each milestone, run the app, check it works, and summarise what was done and what is left.

---

## 1. Stack

- **React + Vite.** (Ask the team: JavaScript or TypeScript — see section 11.)
- **Installable PWA, offline-first:** service worker caching the whole app shell (e.g. `vite-plugin-pwa`). Fonts self-hosted (not from a CDN) so they work offline.
- **Local storage of all data in the browser:** IndexedDB (a small wrapper such as `idb` or Dexie is fine).
- **No backend, no login, no accounts, no server database.** "Sending to the ground" means moving a packet into a local *Sent* list when the link is open.
- **Camera:** in-browser pose detection only (MediaPipe Tasks Vision, Pose Landmarker), running on the device. **Video is never stored or sent.** Only derived numbers (timestamps, reaction times) are saved.

---

## 2. The five pillars (this is the entire scope)

### Pillar 1 — Vitals
- The crew member **enters readings by hand** (no sensor stream in v1). Indicators: heart rate (bpm), blood pressure (mmHg, systolic/diastolic), blood sugar (mg/dL), body temperature (°C), sleep (hours), mood (self-report, 1–5).
- Each reading is compared against **two references**:
  1. the published reference from `thresholds.json` (if one exists — otherwise "reference pending");
  2. **this crew member's own baseline**: mean and standard deviation of their first N sessions (N is a config value — ask the team, section 11).
- **Triage rule** (the same rule the team approved for the reaction test): a reading outside the person's own baseline mean ± 2 standard deviations is **Watch**; a reading outside a published limit is **Act now**. Inside both is **On track**.
- Every status shows **colour + shape + word**, never colour alone.
- Under every verdict, a collapsible **reasoning line**: reading → which reference → source (with requirement ID) → verdict.
- **Trends:** chart each indicator over mission days with the personal baseline band drawn behind it.
- **Measurement prompts:** a schedule of exams with due / overdue / done states.
- **Adherence streak:** days in a row with every due exam done. No XP, no levels, no badges.

### Pillar 2 — Countermeasures (exercise plan)
- Base tables are **NASA's two real ISS exercise programs**, both stored in `src/data/exercise.json` with sources. **The app shows both; the flight surgeon picks one.** Until a ground selection arrives, the plan shows **"Pending flight surgeon approval"**.
- Machines (ISS): **ARED** (resistance), **T2** (treadmill), **CEVIS** (cycle ergometer).
- **Standard ISS program:** resistance and aerobic exercise 6 days a week, about 2.5 hours a day; total ~600 min/week (range ~450–720).
- **NASA Sprint program:** resistance 3 days a week; aerobic 6 days a week, alternating interval and continuous workouts (3 days each); intervals above 90% of maximum heart rate. Versus standard: resistance loads 6–15% higher, repetitions 41–46% fewer, similar outcomes in less time.
- ARED exercises to list: squat, deadlift, heel raise, bench press.
- Reference only (do **not** prescribe from these): cohort median in-flight ARED loads — squat 181 lb, deadlift 192 lb, heel raise 239 lb, bench press 122 lb; median session length CEVIS 26 min, T2 27 min.
- **Do not invent sets, reps, durations or intensities** that are not in the sources. Where a value is not sourced, the field reads "set by flight surgeon".
- **Matching rules — exactly these four, nothing else:**
  1. **T2 harness load** = a percentage of the person's body mass. The percentage is a ground-set field (`null` until set); the app computes kg from it.
  2. **ARED loads** come from the person's own **strength calibration** results, entered per exercise (as ESA's ARED sessions calibrate loads to each astronaut's capability).
  3. If the **hip or spine bone trend is falling**, mark **deadlift** and **T2 treadmill time** as **priority**, with the reason and source shown (NASA data links pelvis bone density with deadlift load, and femoral neck / lumbar spine bone density with treadmill time). Mark priority only — never change a number; any change goes to the ground.
  4. Each **destination** has a list of machines available there; the plan only shows exercises whose machine exists at the current destination.
- **Inputs:** body mass, destination, bone trend (periodic measurements entered by hand — simulated in the demo), strength calibration per ARED exercise. **Height is not an input.**
- Bone target shown on screen: hip and spine bone mineral density at or above **95%** of pre-mission, femoral neck at or above **90%** — NASA-STD-3001 Vol. 1 **[V1 4027]**.

### Pillar 3 — Symptoms, and who decides
- The crew member reports what feels wrong: free text, the body region (tap on the body map), and when it started.
- The app builds a **ground packet**: the report, the latest readings, the personal baselines, the last 14 days of relevant indicators, the cabin state at that moment, which references were crossed and by how much, and what the app's triage said. Timestamp everything.
- The packet goes to a **queue**. When the link is open it moves to **Sent**.
- **Doctors diagnose, not the app.** No diagnosis, no causes, no treatments are generated anywhere.
- v1 is **crew side only** — there is no flight-surgeon console. Ground replies are simulated through the Demo controls (section 6).

### Pillar 4 — Behavioural health (camera reaction test)
- A **3-minute reaction test** modelled on NASA's PVT-B / ISS Reaction Self-Test, using **movements detected by the camera** instead of a button.
- **Movements:** the screen randomly cues **LEFT HAND**, **RIGHT HAND** or **BOTH HANDS**. Correct response = the cued wrist(s) rise above the shoulder(s), detected from pose landmarks.
- **Trial loop:** wait until both wrists are below the shoulders (neutral) → random delay of **1–4 s** (PVT-B interval) → show cue → record time from cue to detected correct movement.
- Per trial record: reaction time, correct / wrong movement, **false start** (movement detected before the cue or within 100 ms of it — PVT-B convention), **miss** (no response before a timeout — ask the team for the timeout, section 11).
- Per session report: median reaction time, **response speed** (1 / reaction time — the primary PVT outcome), wrong movements, false starts, misses.
- **The normal is the person's own baseline.** The first **3 sessions** set it (mean and standard deviation of session response speed). A later session is flagged **Watch** when it is slower than baseline mean − 2 standard deviations of response speed. Explain on screen why: the published PVT-B lapse threshold (355 ms) applies to button presses; a camera-detected arm movement is slower by nature, so the app uses the person's own normal — as NASA's Reaction Self-Test scores astronauts against their own peak-alertness performance.
- **Sleep** comes from the pillar 1 entry. Reference: in the ISS Reaction Self-Test study, sleep of 6 hours or less was associated with slower psychomotor speed and higher stress → sleep ≤ 6 h is **Watch**.
- **What the crew member sees:** their own two numbers — reaction speed against their own normal, and sleep against their own normal. Nothing else. No labels, no interpretation, no mood inference, no face or voice analysis.
- **What goes down:** the same two numbers, automatically, in the routine packet. A flight surgeon decides what they mean.

### Pillar 5 — The ship
- **Cabin environment** from real recorded ISS data (NASA OSDR Environmental Data App): CO2, temperature, relative humidity, radiation dose. Replay one row per mission day.
- **Limits:** cabin CO2 1-hour average partial pressure **< 3 mmHg** — NASA-STD-3001 **[V2 6004]**. Temperature / humidity operating envelope from **18 °C at 75% RH to 27 °C at 25% RH** — **[V2 6012]**. Radiation limits: NASA-STD-3001 Vol. 1 sections 4.8.2–4.8.4 — no numbers until the team supplies them from the document.
- **Live radiation context** from NASA DONKI (solar flares, solar energetic particle events, geomagnetic storms). Cache the last response so it still shows offline, with its "last updated" time.
- **Live ISS telemetry ticker** (online only): the public ISS feed used by the ISS Mimic project. Hidden when offline.
- **Body + ship together:** when a crew reading is Watch or Act now, the result screen also lists any cabin value outside its limit at the same time — as facts side by side, never as a cause.

---

## 3. NASA data — exactly how each source is used

| Source | URL | Used for |
| --- | --- | --- |
| NASA-STD-3001 Vol. 1 Rev C | https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf | Crew health limits (bone [V1 4027], radiation sections) |
| OCHMO technical briefs | https://www.nasa.gov/ochmo/health-operations-and-oversight/hsa-standards/ | Readable summaries of the standard: CO2 [V2 6004], temperature/humidity [V2 6012], bone |
| NASA OSDR Environmental Data App | https://visualization.osdr.nasa.gov/eda | Recorded ISS cabin CO2, temperature, humidity, radiation dose |
| NASA Open Science Data Repository | https://osdr.nasa.gov/bio/repo | Attribution and any further spaceflight data |
| NASA DONKI API | https://api.nasa.gov (`/DONKI/FLR`, `/DONKI/SEP`, `/DONKI/GST`) | Live space-weather events → radiation context |
| ISS public telemetry (via ISS Mimic) | https://iss-mimic.github.io/Mimic/ | Live cabin values ticker (online only) |
| PVT-B — Basner, Mollicone & Dinges 2011 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786 | Reaction test method: 3 min, 1–4 s intervals, false starts, 355 ms button lapse threshold (explanation only) |
| ISS Reaction Self-Test study (24 astronauts) | https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197 | Response speed as primary outcome; sleep ≤ 6 h reference |
| NASA Spinoff — Reaction Self-Test | https://spinoff.nasa.gov/Spinoff2013/hm_1.html | Scoring against the astronaut's own peak performance |
| NASA Sprint study — English et al. 2020 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7434884 | Sprint and standard ISS exercise programs |
| Scott et al. 2023 — exercise countermeasures, 46 astronauts | https://pmc.ncbi.nlm.nih.gov/articles/PMC9898566 | ARED/T2/CEVIS, median loads, session lengths, ~600 min/week |
| NASA iRAT study | https://phys.org/news/2015-05-sprint-nasa-irat.html | Standard program: 2.5 h/day, 6 days/week |
| Ploutz-Snyder 2009, NASA NTRS | https://ntrs.nasa.gov/api/citations/20090013286/downloads/20090013286.pdf | Bone density correlations with deadlift load and treadmill time (matching rule 3) |
| ESA — ARED | https://www.esa.int/ESA_Multimedia/Images/2026/07/Staying_strong_in_orbit_with_ARED | Strength calibration to tailor ARED loads (matching rule 2) |

**Data handling:**
- **OSDR environmental data:** the team downloads the CSV export from the Environmental Data App and places it in `public/data/`. If the file is not there when you need it, stop and ask for it — do not generate fake environmental data in its place.
- **DONKI:** read the key from `.env` as `VITE_NASA_API_KEY`; fall back to `DEMO_KEY` if missing. Do not commit `.env`.
- **ISS telemetry:** confirm the Lightstreamer server, adapter and channel IDs from the ISS Mimic project's source before implementing; ask if anything is unclear.
- **Required attribution** (in an About screen and the README):
  - "Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo)."
  - "Data and visualizations are courtesy of the Environmental Data Application (EDA) (https://visualization.osdr.nasa.gov/eda/)."
  - "NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites."

---

## 4. Screens and main flow

Main path: **Crew select → Today → Measure → Result → Ground link** (Ground link only matters when something is Watch or Act now).

1. **Crew select** — tap your name (placeholder crew; names marked as placeholders). No face recognition.
2. **Today (home)** — clickable SVG body map with coloured status markers (shape + word too); today's due / overdue exams; streak; destination; link status.
3. **Measure** — choose an indicator, read a short explainer ("how to take it" and "why it matters in space"), enter the value.
4. **Result** — the reading, its verdict, the reasoning line with sources, the personal baseline, any cabin values outside limits at the same time (side by side, no cause), and a button to send a packet.
5. **Organ / region detail** — tap a body region: its indicators, status, trend, and "why it matters in space".
6. **Trends** — charts per indicator over mission days with the baseline band.
7. **Countermeasures** — profile inputs, both NASA programs side by side, priority markers with reasons, approval status.
8. **Reaction test** — camera view, cue, live trial count, then the two-number result against the person's own normal.
9. **Symptom report** — free text, body region, onset time → packet preview → queue.
10. **Ship** — cabin values with limits, OSDR replay day, DONKI events, live ISS ticker when online.
11. **Ground link** — queued and sent packets, the link window state, simulated replies from the ground.
12. **About** — data sources, attribution, and the statement that crew readings are simulated.

**Destination profiles:** station, deep-space ship, Moon base, Mars base, rover. Each holds gravity, one-way link delay, and available machines. The team must confirm values for anything not ISS (section 11).

---

## 5. Online / offline

- Everything in pillars 1–4 and the stored environment replay works with **no network**.
- Show a clear link indicator. **Link window** = real connectivity AND a simulated comms window (toggle in Demo controls).
- When the link opens: queued packets move to Sent; DONKI refreshes; the ISS ticker connects.
- Show the one-way delay for the current destination on the Ground link screen.

---

## 6. Demo controls

A clearly labelled **"Demo controls — simulation"** panel, hidden behind a toggle, that can:
- open / close the comms window;
- simulate a ground reply to a packet (free text);
- simulate the ground choosing the Standard or Sprint program;
- advance the environment replay by one day.

Nothing in this panel may look like part of the real crew interface.

---

## 7. Look and feel

Dark mission-console style, matching the team's pitch deck:
- Background `#070D17`, panels `#0E1A2B` / `#15263D`, lines `#24395B`, text `#E9F0F8`, muted `#93A9C4`.
- Accent cyan `#3AD8F2`; status green `#3DDC97`, amber `#F7B733`, red `#FF6B81`.
- Fonts: Space Grotesk (headings), Inter (body), IBM Plex Mono (labels and numbers) — self-hosted.
- Large, legible type; status is always colour + shape + word.

---

## 8. Out of scope for v1 — do not build

Face recognition · posture gate before readings · first-aid / CPR / FAST coaching · emotion, micro-expression, body-language or voice analysis · flight-surgeon console · sensor stream or any hardware integration · 3D body model · layer toggle · ultrasound · crew overview dashboard · XP, levels, badges · login, accounts, servers · any trained machine-learning model · deployment.

---

## 9. Definition of done for v1

- [ ] App installs as a PWA and every pillar 1–4 screen works with the network switched off.
- [ ] Every number on screen that is a reference or limit shows its source; any unsourced one shows "reference pending".
- [ ] No clinical label appears anywhere (search the codebase for the banned words in section 0.3).
- [ ] Personal baselines form after the configured number of sessions and drive Watch.
- [ ] Reaction test runs for 3 minutes with camera cues, and reports against the person's own normal after 3 sessions.
- [ ] Exercise plan shows both NASA programs, applies only the four matching rules, and shows "Pending flight surgeon approval" until a simulated ground choice.
- [ ] Symptom report builds a full packet, queues it, and sends it when the link opens.
- [ ] Ship screen replays real OSDR data with V2 6004 / V2 6012 limits; DONKI shows live or cached events with a timestamp.
- [ ] Simulated values are marked as simulated everywhere.
- [ ] README lists dependencies, how to run, how to add the NASA key and the OSDR CSV, and the attribution text.

---

## 10. Build order (milestones)

1. Scaffold React + Vite + PWA; IndexedDB layer; routing; app shell with offline caching; Crew select; Demo controls panel.
2. `thresholds.json` and `exercise.json` with every sourced value from this spec and `null` for the rest; the triage engine (published reference + personal baseline).
3. Today, Measure, Result, Organ detail, Trends — pillar 1 end to end.
4. Ship screen: OSDR replay (needs the CSV), DONKI with caching, side-by-side display on Result; then the ISS ticker.
5. Symptom report, packet builder, Ground link queue — pillar 3.
6. Countermeasures — pillar 2.
7. Reaction test with the camera — pillar 4 (last, because it is the riskiest).
8. About screen, README, definition-of-done check.

---

## 11. Ask the team — do not decide these yourself

Ask before the milestone where each is needed:
1. **JavaScript or TypeScript?** (before scaffolding)
2. **Seed simulated history for the demo, or start empty?** If seeded: how many days, and confirm it will be labelled simulated everywhere. (milestone 3)
3. **Number of sessions that form a vitals baseline.** (milestone 2)
4. **Published references for heart rate, blood pressure, blood sugar and body temperature** — the team must supply the source and values; until then they are "reference pending". (milestone 2)
5. **Radiation limit values** from NASA-STD-3001 Vol. 1 sections 4.8.2–4.8.4. (milestone 4)
6. **The OSDR environmental CSV file** in `public/data/`. (milestone 4)
7. **T2 harness load percentage** — or confirm it stays "set by flight surgeon". (milestone 6)
8. **Machines available, gravity and link delay** for deep-space ship, Moon base, Mars base and rover. (milestone 6)
9. **Reaction-test miss timeout** (how long without a response counts as a miss). (milestone 7)
10. **Crew roster** — placeholder names and how many crew members. (milestone 1)
