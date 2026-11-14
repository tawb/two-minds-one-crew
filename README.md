# AstroVitals — simulation prototype

Team Axiom · NASA Space Apps Challenge 2026 · "Create Health Monitoring Software for Astronauts on Space Missions"

An **AI-assisted student prototype** running on **synthetic data** with **proposed hardware**. It follows the team's
`Astronaut_Health_Hardware_Report.pdf`. It is not a medical device. Every screen carries a persistent **Simulation** label.

> It does not tell you how you feel. It tells you what you cannot feel.
> The app shows prompts for review (Logged · Verify · Review suggested · Help requested). It never names a condition or a cause. People diagnose.

## Live site and hosting

Live: https://tawb.github.io/two-minds-one-crew/ (GitHub Pages). Every push to `main` runs `.github/workflows/pages.yml`: install, `npm run setup:cv` (downloads the two on-device camera models), `npm test`, build, publish. The site is served from a sub-path, so the build sets `VITE_BASE=/two-minds-one-crew/` (the router, the manifest and all asset links follow it; local `npm run dev` stays at `/`). GitHub Pages has no single-page-app fallback, so the workflow copies `index.html` to `404.html`: a refreshed or shared deep link loads the app (the page reports status 404, the browser still shows the app). The public datasets from `npm run fetch-data` are not in the repository or the site (licenses, CGMacros is non-commercial), so the hosted replay uses the synthetic day and the reference ranges use the marked placeholders.

To work on it: `git clone https://github.com/tawb/two-minds-one-crew.git`, `npm install`, `cp .env.example .env`, `npm run dev`. License: Apache 2.0.

## Run

Needs Node 20+ (Vite warns below 20.19; 22.12+ is recommended).

```bash
npm install
npm run dev        # open the printed URL: it populates and starts monitoring by itself
npm test           # simulation-core tests (vitest)
npm run build && npm run preview   # production build with the offline service worker
```

Nothing needs to be typed or configured. Deep link to a scenario: `/?scenario=headache-co2` (ids: `routine`, `headache-co2`, `headache-stale`, `headache-other-module`, `wearable-help`, `comms-loss`).

If `npm run dev` fails with "Cannot find native binding" (an npm optional-dependency bug), run `npm i @rolldown/binding-win32-x64-msvc --no-save` (use the binding for your platform).

## The flow

1. **Pick your account** (4 fictional crew; asked once per app session).
2. **Dashboard**: just a clickable body and one button, **Measure vitals**. Markers on the body show a body part that needs a look (▲/◆ with a colour) or a reported issue.
3. **Measuring**: each simulated sensor (wrist band, upper-arm cuff, glucose patch, cabin sensor) is read in turn. The numbers are generated at that moment from the same deterministic signals as the rest of the simulation, and they are saved, queued and sent to Earth like any other record. A disconnected sensor shows "No signal" and the vital is marked as such; no number is invented.
4. **Your vitals**: six simple cards, at most two per row (heart rate, blood pressure, temperature, glucose, sleep, cabin air), each with an icon, one big number, its unit, a one-word status (✓ In range · ▲ Check · ◆ Review · ⚠ No signal · ⏱ old) and how it changed since the previous check ("↑ 2 since 14:00"). "In range" means inside the *simulation* range, not a clinical statement. Tap a card to open its body part.
4b. **Compare** (button on the vitals page): for each vital, **on board** and **on Earth** side by side, each with its latest value, the value before, and the change. "Previous" is the reading from the previous *Measure vitals* session (or 30 minutes earlier if there was none). Earth's numbers are what Mission Control actually received, so during an outage Earth shows older data and is labelled "Earth is catching up".
5. **Body part** (tap a part on the dashboard or a card): its readings as graphs (6 h / 24 h / 4 days; activity as bars) with source and time, and **Report an issue** (pick a symptom, rate 1–5, optional note). The report keeps its body region, is stored as a manual entry, and goes through the same alert rules and Earth sync.

| Body part | Shows |
| --- | --- |
| Head | Sleep, cabin air (CO₂) |
| Chest | Heart rate |
| Abdomen | Temperature |
| Left arm | Blood pressure (upper-arm cuff) |
| Right arm | Glucose (patch) |
| Legs | Activity |

The floating nav has tabs for **Home · Vitals · Compare · Crew · Mission Control**, **Need help?** (opens *Request onboard help*; works with missing sensors) and your avatar. The avatar menu holds Switch account, How it works, My detailed history & manual entry, Sources & evidence, Demo controls (try scenarios) and About. A small "Simulated data · fictional crew · not medical advice" line is always visible at the bottom of every screen.

**First run:** a short tour explains each part of the site (7 steps, once per browser). Reopen it any time from Menu → How it works.

The same fact is shown in one place only: for example, the crew cards no longer repeat what "Needs attention" says, the cuff controls live only on "Devices & cuff", and the Transmission tab no longer repeats the Mission Control summary.

Look: a calm, premium **dark-plum** dashboard. Plum background `#3B1B46` with lighter plum corner circles `#5A3566`, lilac four-point star accents `#B98BC4`, cream text `#FBF1E6`, lavender secondary text `#B08FBE`, and cream pill buttons with dark-plum text. Inter throughout (big bold cream headlines, lavender subtitles, tiny lavender captions), self-hosted so it works offline. A floating pill nav bar (logo left, tabs centred with a dot under the active one, avatar right), a home screen with the greeting and a large **Measure vitals →** button on the left and a frosted, tappable body figure on the right. Flat, soft and rounded: hairline borders instead of shadows, no neon. Dark theme only; reduced motion is respected.

### Earlier screens (still available from •••)

| View | Essential content (on top) | Opened on demand |
| --- | --- | --- |
| **Crew Overview** | 4 compact crew cards, "Needs attention", cabin conditions, communication status | Click a card for details |
| **Detailed view** | Alerts with plain-language explanation, current readings with age/source/quality, cuff controls | Tabs: Now · Trends · Well-being · Devices · History (also the History tab of Vitals) |
| **Mission Control** | Only records actually delivered to Earth: original time, receipt time, transit, last sync, pending transmissions, review status | Tabs: Received crew data · Alerts & review · Cabin · Transmission. Simulated roles: Flight surgeon / Ground operations |

### Feature inventory: where everything is

| Feature | Where |
| --- | --- |
| Crew selection (earlier scaffold) | Account picker (first screen); account chip in the header to switch |
| Simulation labelling, placeholder/fictional names | Header badge, clock bar, footer, About |
| Demo controls panel: comms window, ground reply | ••• → Demo controls → Earth link / Ground |
| Link indicator | Header chip, Overview "Communication", Mission Control summary |
| Attribution + About | ••• → About (`/about`) |
| Offline PWA shell, self-hosted fonts | Build output (`npm run build`) |
| Symptom report | Body part page → Report a problem |
| Request onboard help (works with missing data) | Header on every screen after sign-in; Detailed view when viewing someone else |
| Cuff "Measure now" with progress / complete / cancel / fail; scheduled cycles | Detailed view → Now, and Devices & cuff. The dashboard's **Measure vitals** takes an on-demand reading of all sensors |
| Evidence review | ••• → Evidence & sources; each alert → "Why am I seeing this?" → "Observations used" |
| Replay / switch scenario / reset | ••• → Demo controls |

The earlier scaffold's placeholder screens for the exercise plan, reaction test, ship data and the "ground program" choice were never built and are **not** part of this version (see `CLAUDE.md`).

## Automatic data (all synthetic, repeatable)

- Fictional crew **A1–A4** (Avery Lindqvist, Mateo Silva, Priya Nair, Kenji Aoki), cabin modules **M1–M3**, devices per person (`BAND-`, `CUFF-`, `CGM-`) and per module (`CAB-`).
- 4 days of history preloaded (coarse older, fine for the last 3 h), a recent blood-pressure result each, nightly sleep, daily check-ins. History and live data come from one deterministic function of simulated time, so charts, cards and explanations tell the same story. Clock starts at 14 Nov 2026 14:00 UTC.
- Live timing (report §5): pulse and activity every **5 s**, skin temperature and glucose every **1 min**, cabin CO₂/temperature/humidity every **10 s**, sleep after each simulated session, blood pressure after each completed cuff cycle (scheduled every 10 min plus optional "Measure now"). Speeds ×1 / ×10 / ×60 in Demo controls.
- Symptoms and mood/stress/fatigue are generated by scenarios and stored with origin `simulated-self-report`; the UI labels them **"Simulated self-report"**. Origins: `simulated`, `device` (reserved for real hardware), `manual`, `simulated-self-report`.
- Every observation: unique ID, subject (astronaut or module), metric, value, units, measured time, device ID, quality (`good` / `poor` / `missing` / `excluded`), origin. A missing value is `value: null, quality: 'missing'`; the last valid reading keeps its original time and is shown as stale / "device not reporting".
- Wrist pulse during a cuff cycle on the same arm is marked quality `poor` (report §6).

## Scenarios (select, replay, switch; no typing)

1. **Routine monitoring**
2. **Headache + fatigue, CO₂ rising in the same module**: shows "Environmental context available for review", explains the timing and location overlap, leaves the cause undetermined; supports onboard review and automatic transmission.
3. **Same symptoms, stale CO₂**: the module sensor stopped ~3 h earlier; explained as "unavailable or stale".
4. **Same symptoms, CO₂ high in another module**: identified as a different location, not matched.
5. **Disconnected wearable, then help request**: separate device-status message; help request works with incomplete readings.
6. **Earth communication loss, then recovery**: onboard monitoring and alerts continue; queued records are delivered once.

## Earth synchronization (report §7)

Each record is **saved locally first**, then queued, then sent when the link is open (real network **and** simulated comms window). Earth acknowledges stored records and rejects duplicate IDs; a retry after a lost acknowledgement is recognised and acknowledged without creating a second copy. Original IDs and timestamps are preserved. Onboard and Earth records are separate stores; Mission Control reads only the Earth side. **Receipt is not review**: review is a separate state set by the (simulated) flight surgeon. Storage failures and connection problems are shown in a banner and in the Communication panels; if storage fails, records are held in memory and not queued until they are saved.

Data persists in IndexedDB (`astrovitals` v2; the v1 empty stores are dropped on upgrade, and the old crew choice is migrated). On reload the simulated clock resumes where it stopped (it pauses while the page is closed), pending transmissions are restored, and any record saved just before closing but not yet queued is re-queued.

## Alerts

Labels: **Logged**, **Verify**, **Review suggested**, **Help requested**, each with colour **and** shape **and** word. Every prompt lists the observations behind it (value, time, location, quality, origin). Device failures get a separate **Device status** message. All thresholds are **simulation parameters** (shown in Demo controls and defined in `src/sim/params.ts`); clinical diagnosis and treatment require approved rules, and every procedure is a labelled placeholder.

## Privacy and roles (simulated)

- Well-being check-ins are visible onboard only to the person concerned ("Onboard user" selector) and, on Earth, only to the **Flight surgeon** role. **Ground operations** sees alerts, cabin and device status, but symptom details and well-being are shown as restricted. A real access policy must be agreed with medical owners.

## Response check (camera)

A short, on-device **alertness / fatigue / psychomotor-speed** check. The astronaut sees simple commands, performs them in front of the webcam, and the app times how quickly and correctly they respond, compared with that astronaut's **own** baseline. It supports a flight surgeon. **It is not a diagnosis and never claims to detect a mental illness.** Open it from the avatar menu → *Response check (camera)*, or from the **Head** page.

### Setup (once, needs internet)

```bash
npm install
npm run setup:cv      # copies the MediaPipe WASM to public/mediapipe/wasm and downloads both models to public/models
```

`setup:cv` downloads `pose_landmarker_lite.task` (about 5.8 MB) and `hand_landmarker.task` (about 7.8 MB) from Google's MediaPipe model storage **once**; add `-- --force` to download again. After that the feature makes **no network request**: WASM and models load from local paths (`/mediapipe/wasm`, `/models`). `public/models` is git-ignored, so run the script on each new checkout (and before `npm run build` if you want the models precached for offline use). If a file is missing the page says which one and tells you to run the script. The camera needs `localhost` or HTTPS.

### How it works

1. **Quality gates.** Head, both shoulders and both hands in view, adequate lighting, sensible distance. Each problem has a plain fix message; **Start stays disabled** until the picture has been good for about half a second.
2. **Reaction round (PVT-style).** 5 trials: hands down, a random 2 to 5 s wait, a visual cue (optional beep), raise either hand as fast as possible. Raising a hand early (or starting to move within 100 ms of the cue) is a **false start** and the trial repeats. A response is registered as soon as the hand has **clearly lifted** (a raised-hand pose, or a clear lift toward the face or head); it does **not** have to be held, because people flick a hand up and drop it when told to be fast. No response within 3 s is a **lapse**, and so is a response that is unusually slow *for that person* (see below). If **no** reaction trial registers any hand movement, the result is reported as a **tracking problem** (inconclusive), not as a slow person.
3. **Commands.** 6 to 8 random commands, never the same one twice in a row: pose (raise right hand, raise left hand, raise both hands, touch your nose, hand on head) and hand (one finger, two fingers, fist, open hand). Each trial waits for hands-down, shows the cue, then needs the correct gesture held for at least 3 frames and 150 ms. Skip and Stop buttons are always visible.
4. **Measurements** per command: **reaction time = cue shown to the moment the hand starts to move** (so the time the arm takes to travel does not count as reaction), the time the correct gesture was first seen, the confirm time, correct or not, wrong-gesture attempts, peak hand speed in **shoulder widths per second**, and smoothness (path length / straight distance). Everything is measured in shoulder widths, so it does not depend on distance from the camera. Times use `performance.now()`; the median camera frame interval is reported as the **timing resolution**.
5. **Low-confidence trials are discarded and counted**, not scored (pose lost for most of a trial, hand never visible for a missed hand command, hands never lowered).
6. **Personal baseline.** The last 30 sessions are kept. With 3 or more, the session's median reaction time is scored with the astronaut's own median and MAD (robust deviation; positive = slower). Before 3 it shows "calibrating, N of 3 baseline sessions" and uses coarse placeholder bands.
7. **Status:** `normal`, `watch` or `check-in suggested` (from deviation plus error and lapse rates), or `inconclusive` when too few trials were valid. The summary lists the reasons in plain words ("reaction 40 percent slower than your usual") and always shows: *"This is not a diagnosis. Tiredness, poor sleep or lighting can affect it."*

Mirroring and handedness: frames are fed to MediaPipe **unflipped** and only the on-screen preview is mirrored. Pose landmarks are anatomical, so "right hand" is the person's right hand. MediaPipe's hand label assumes a mirrored input, so hands are matched to the nearest pose wrist instead, and the label (swapped) is only a fallback.

### Privacy

Everything runs on the device. No video or image is stored or sent; frames are only held in memory for detection. Only numbers and timestamps are saved (localStorage key `cv-response-check:v1:*`, per astronaut). The downloadable JSON report holds numbers and text only.

### Event contract

After each finished session (not after Stop) the feature dispatches:

```ts
window.dispatchEvent(new CustomEvent('cv-result', { detail }));   // detail: CvResultDetail
```

```ts
interface CvResultDetail {
  check: 'response';
  state: 'normal' | 'watch' | 'check-in suggested' | 'inconclusive';
  medianReactionMs: number | null;   // reaction round
  baselineDeviation: number | null;  // null while calibrating
  completed: number;                 // trials answered correctly and not discarded
  total: number;                     // trials planned (5 reaction + commands)
  errors: number;                    // wrong-gesture attempts + missed commands
  lapses: number;
  falseStarts: number;
  timestamp: number;                 // Date.now()
}
```

The type is exported from `src/features/cv-response-check` (`CvResultDetail`, `CV_RESULT_EVENT`).

### Where it is hooked in

- `src/pages/Home.tsx`: the **body figure's head marker** also reflects a result from the last 24 hours: `watch` shows "check", `check-in suggested` shows "review suggested"; `normal`, `inconclusive` and older results show nothing. It reads `cvFlag(useCvStatus(userId))` from `src/features/cv-response-check/cvStatus.ts`, which loads the last result from storage and refreshes on every `cv-result` event.
- `src/pages/Part.tsx`: the **Head** page shows the latest result with a "Run response check" button.
- `src/components/Shell.tsx` (menu link) and `src/App.tsx` (lazy route `/response-check`, so MediaPipe is not in the main bundle).
- Not wired into the simulation engine or Earth sync: the result stays on the device. Syncing it would need a policy for sensitive well-being data first.

### How the results are judged (tuned after real-camera use)

The first version judged results too harshly. These changes make the scores fit a person in front of a webcam:

- **Reaction time is movement onset.** It was the moment the wrist crossed a zone, which included the time to lift the arm. It is now the first frame where either wrist has moved clearly away from where it was at the cue (0.12 shoulder widths, 2 frames in a row). A movement that never becomes the target gesture within 1.5 s is dropped as a fidget. The "gesture seen" time is still recorded and shown.
- **Lapses are relative.** A flat 500 ms is a button-press limit; a camera-detected arm raise is slower. A response is a lapse if it is slower than max(800 ms, 1.5 x your own typical time), where "typical" is your personal baseline median, or this session's median until you have one.
- **Wrong attempts need to dwell.** Hands pass through other gestures on the way to the right one (a hand rising passes the nose). A wrong gesture now counts only if held for 350 ms and 3 frames; correct gestures must hold 150 ms.
- **"Hand on head" is tight.** A hand must be within 0.35 shoulder widths of the nose sideways. An arm raised straight up is about 0.5 away and now stays "raised".
- **Fingers are judged by bend angle in 3D** (straight above 150 degrees, bent below 115 degrees), with fingertip distance as a fallback for in-between cases. A finger pointing at the camera still reads as extended.
- **Frame time is the camera's own capture time** when the browser provides it, which removes inference delay from every timestamp.
- **Early sessions cannot raise alarms.** While calibrating, the status is never above "watch", and the placeholder ranges are wider (normal up to 1500 ms, watch up to 2200 ms).
- **A quick flick counts.** In the reaction round a clear lift (a wrist 0.5 shoulder widths higher than at the cue for 2 frames) is the response. It no longer has to be held for 150 ms, and a hand lifted only to the face counts too.
- **One dropped frame is forgiven.** Landmark detectors flicker; a gesture can drop out for a single frame without restarting the hold.
- **Finger gestures are forgiving about the other fingers.** The finger(s) that define a gesture must be clearly extended; the others only need to be "not clearly extended", so one half-bent finger does not spoil "one finger" or "two fingers".
- **Trial by trial, with what the camera saw.** The result screen has an expandable table (hand moved, hand raised, wrong tries, notes) plus a **Camera saw** column: how high the hand got in shoulder widths, in how many frames a raised-hand pose was seen, and which gestures were detected during each command. If a result looks wrong, this column shows whether the camera or the person is the cause.

### Numbers that need expert tuning

All thresholds are in `src/features/cv-response-check/config.ts`. Two tags mark numbers that are **not validated**:

**`TODO(flight-surgeon)`** (clinical or interpretive; do not use for real decisions until reviewed): `commands.timeoutMs` (8 s, what counts as a miss), `reaction.lapseFloorMs` (800 ms) and `reaction.lapseMultiplier` (1.5 x own typical time), `reaction.noResponseMs` (3 s), `reaction.anticipationMs` (100 ms), `baseline.minSessions` (3), `baseline.minRelMad` (5 percent floor), `placeholderBands.reactionNormalMaxMs` (1500 ms) and `reactionWatchMaxMs` (2200 ms) (placeholders, not clinical values), `status.calibratingMaxLevel` (1 = never above watch while calibrating), `status.watchZ` (2.0), `status.checkInZ` (3.5), `status.watchErrorRate` (0.25), `status.checkInErrorRate` (0.5), `status.watchLapseRate` (0.4), `status.checkInLapseRate` (0.6), `status.minValidTrials` (5), and `FRESH_MS` in `cvStatus.ts` (24 h a result keeps marking the body figure).

**`TODO(tune-with-real-camera)`** (geometry; tuned on synthetic landmarks only): stable and neutral frame counts, `stableMs` and `stableGapFrames`, the clear-lift distance (`onset.riseSw`), movement-onset distance and timeout, wrong-attempt dwell time, pose margins (raise, down, nose radius, head box), finger bend angles and the fallback ratios, hand score, movement jitter floor and speed cap, quality gate lighting and distance ranges.

### Known limits

- **Not tested with a real person.** The logic is covered by unit tests on synthetic landmarks, and the camera, WASM, model loading and gate were run against a fake camera feed, but gesture detection on real hands and bodies has not been seen working. Expect to tune the geometry numbers above.
- Reaction times include camera and inference latency (roughly one to three frame intervals) plus display latency, so they are only comparable with the same person's own results, not with button-press tests. The cue time is taken when it has been painted, which is an estimate.
- A pose landmarker with `lite` accuracy can lose wrists in poor light, loose sleeves or when hands overlap the face; those trials are discarded rather than scored.
- Finger-count gestures need the hand reasonably close to the camera; half-bent fingers are "unknown" and not counted.
- Moving between commands can briefly pass through another gesture; it only counts as a wrong attempt if held for 3 frames.
- One person in frame; if two people are visible MediaPipe tracks one.
- Early-stopped sessions are not saved and do not dispatch an event.
- No ESLint is configured in this project, so there was no lint step; `npm run build` runs the type check.

### Tests

`npm test` runs every `*.test.ts` (191 tests in total, including the data layer). The response check part is the pure-logic tests in `src/features/cv-response-check/logic/*.test.ts` (72 tests): every gesture, mirrored and handedness handling, scale independence, command picking, quality gates, a normal run, false start, quick flick and face-height responses, dropped frames, relative lapses, timeout, wrong gesture, passing through gestures on the way, movement-onset timing, missing hand, low-confidence frames, no-neutral, skip and stop, movement metrics and onset detection, baseline deviation scoring, status decisions and wording, the report and event payload, and storage failure handling.

## Data layer and honesty (physical health)

This part labels what the data is rather than hiding it. It does **not** generate advice or recommendations.

### One reading model

Every physical reading (band, cuff, glucose patch, replay, manual, camera) is converted to one typed shape in `src/readings/types.ts`:

`{ id, subjectId, metric, value, unit, timestamp (ISO 8601), deviceId, source ("whoop" | "cuff" | "glucose" | "replay" | "manual" | "camera"), quality ("good" | "motion" | "poor_fit" | "unknown"), calibration { state ("calibrating" | "calibrated" | "stale"), lastCalibratedAt, daysSince }, context { posture, minutesSinceExercise, minutesSinceMeal, sleepLastNightHours, notes } }`

The simulation still stores `Obs` records; `toReading()` (`src/readings/model.ts`) converts them. `"camera"` is an addition to the list you asked for, because none of the other sources describes the response check honestly.

| Module | What it does |
| --- | --- |
| `src/readings/config.ts` | Every adjustable number in one place, each with a `TODO(flight-surgeon)` |
| `context.ts` | Merges what the astronaut entered with the simulator's schedule; the astronaut's entries always win; unknown stays unknown |
| `quality.ts` | Labels motion, poor fit and unknown. A reading is labelled, never hidden |
| `calibration.ts` | Cuff calibration age (stale after `staleAfterDays`, default 30) and glucose sensor warm-up |
| `reference.ts`, `referenceStore.ts` | Age and sex banded population ranges (below) |
| `baseline.ts` | Personal baseline: median and MAD per metric and situation (below) |
| `sleep.ts`, `glucose.ts` | Sleep summary and glucose variability maths |
| `cvBridge.ts` | Camera result bridge (stores each camera check with last night's sleep, shown in History) |
| `suggest.ts`, `survey.ts`, `mental.ts` | Recommendations for out-of-range vitals; the 5-question survey; the combined mental report |
| `src/replay/` | Replay datasets, player, synthetic generator |
| `src/validation/` | Placeholder blood pressure estimator, statistics, runner |

**Context panel.** Vitals page, "Context for new readings (optional)": posture, last exercise, last meal, last night's sleep. It is attached automatically to each new reading. Every field can stay unknown and nothing blocks a measurement. Fields left unknown are filled from the simulated schedule and the reading says so in its notes.

**Badges next to every number** (Vitals cards and body-part pages): quality (good, motion, poor fit, quality unknown), calibration (calibrating, "calibration 24 days old", "needs calibration (33 days old)"), and "context missing". Cuff interference on the same arm and wrist activity mark a reading as motion. Cabin air and sleep cards show no motion label because it does not apply. On a body-part page the blood pressure section has "Calibrate cuff now (simulated)".

### Replay mode

Demo controls, "Replay": **REPLAY: recorded public data, not live**. Replay runs through the same pipeline as live devices (`SimEngine.addObs`, store-and-forward, Earth records). While it is on, the simulated band, cuff and patch are paused for the signed-in astronaut only, a banner stays visible with pause and stop, and every replayed reading carries `source: "replay"`, `origin: "replay"`, a quality label and its context from the recording. Controls: play, pause, speed (x1, x15, x60, x300 seconds of recording per second), loop. "Measure vitals" during replay plays on to the next recorded cuff reading. Replay is not saved: a reload returns to the live simulation.

Without any download there is a **synthetic day** (`src/replay/synthetic.ts`, seeded, 24 h, meals, exercise, a loose-strap stretch, a night with stages). It is labelled "synthetic data generated in the app" in the banner and the picker.

### Public data (`npm run fetch-data`)

One-time download of small subsets into `data/` (git-ignored) and conversion into `public/replay/` (git-ignored). This is the only network use in the project, and only when you run it. Access terms were checked: all three are open access, no credentials.

| Dataset | License | What is taken | Used for |
| --- | --- | --- | --- |
| [Pulse Transit Time PPG v1.1.0](https://physionet.org/content/pulse-transit-time-ppg/1.1.0/) | ODbL 1.0 | The 66 small `.hea` headers (22 healthy adults sitting, walking, running): age, sex, activity, cuff BP and HR at start and end | Replay (two frames per recording, measured values only, nothing interpolated), BP validation |
| [CGMacros v1.0.0](https://physionet.org/content/cgmacros/1.0.0/) | **CC BY-NC-SA 4.0, non-commercial**, share-alike, attribution | Two participant CSVs read from the zip with range requests (not the 657 MB archive, no photos), 3 days at 5 minute samples | Replay of glucose, heart rate, meals |
| [Autonomic Aging v1.0.0](https://physionet.org/content/autonomic-aging-cardiovascular/1.0.0/) | ODbL 1.0 | `subject-info.csv` and the first 120 s of the ECG of up to 12 records per age band and sex | Resting heart rate and HRV (RMSSD) reference bands |
| PulseDB, Apple Watch sleep set | not downloaded | | PulseDB is multi-gigabyte; check its terms before use. The sleep view uses the band or replay |

CGMacros is non-commercial: do not use this prototype with that data commercially. The dataset attribution, license and limits are shown in the Demo controls picker when a dataset is selected and are repeated here. Options: `--skip=ptt,cgmacros,aging`, `--cgm=1,2`, `--days=3`, `--aging=12`. If a download fails the script says so and keeps using whatever is already in `data/`.

Attribution: Mehrgardt P, Khushi M, Poon S, Withana A. *Pulse Transit Time PPG Dataset*. PhysioNet. Das S, et al. *CGMacros*. PhysioNet. Schumann A, Bar KJ. *Autonomic Aging: a dataset to quantify changes of cardiovascular autonomic function during healthy aging*. PhysioNet. Goldberger A, et al. PhysioBank, PhysioToolkit, and PhysioNet. *Circulation* 2000.

### Reference ranges and personal baselines

`reference.ts` gives resting heart rate and HRV (RMSSD) bands from the 5th to 95th percentile of the Autonomic Aging sample, per age band (18 to 34, 35 to 49, 50 to 92) and sex, **only** when the band has at least `reference.minSampleN` (10) people. Blood pressure and glucose have no data-derived band: they are marked placeholders. Everything else, and everything if the file is missing, is a placeholder labelled "placeholder range, not sourced". These are descriptive ranges, not clinical limits and not alert thresholds. The ECG processing is a simple derivative R-peak detector over 2 minute windows (see `public/replay/aging-reference.json` after fetching, with method and limits); blood pressure from the waveform channel was **not** used because its scaling could not be verified.

Next to each metric: **"using population reference"** until the person has `baseline.minSessions` (7) sessions in the same situation, then **"using your baseline (N sessions)"**. A session is one "Measure vitals" tap or one replayed recording segment; the history that is preloaded into the simulation is not a session. Situations: resting seated, after exercise, other, unknown (decided by posture and minutes since exercise). Only good-quality readings count. The personal range is median ± `rangeK` (2) × 1.4826 × MAD, with a spread floor. Heart rate has a population reference only for resting seated; other situations say "no reference for this situation". The Demo controls button "Add 7 simulated sessions" lets you see the switch.

### Sleep and glucose (data only)

**Sleep** (`/sleep`, menu): duration, efficiency and stages only if the source provides them (replayed data; the simulated band gives duration only and says so), overnight resting pulse (10th percentile of that night's good readings), and the latest night against the person's earlier nights once at least 3 earlier nights exist. **Glucose** (`/glucose`): chart with meal and activity markers, time in band (time-weighted, gaps over 30 minutes not counted), SD and CV. There are no diabetes thresholds. The band is a configurable placeholder (70 to 140 mg/dL, `TODO(flight-surgeon)`; editable on the page). The page states that most public glucose data comes from people with diabetes.

### Validation (`npm run validate:bp`)

Runs `src/validation` on the Pulse Transit Time headers via Vite's own module loader (no extra packages), prints mean error, SD, MAE and percent within 10 mmHg for systolic and diastolic, and writes `src/validation/last-result.json` for the **Validation** page. The app has **no real cuffless estimator**: displayed blood pressure always comes from the cuff. The estimator under test is a **placeholder** (calibration reading plus a heart-rate slope with made-up coefficients, `TODO(flight-surgeon)`), compared with calibration-only. Last run: 22 people, 88 test points (walking and running, calibrated on the seated recording):

| Estimator | BP | Mean error | SD | Within 10 mmHg |
| --- | --- | --- | --- | --- |
| Calibration only | systolic | 1.0 mmHg | 6.6 | 86 % |
| Calibration only | diastolic | 0.0 mmHg | 4.6 | 97 % |
| Placeholder (heart-rate slope) | systolic | 1.6 mmHg | 6.3 | 90 % |
| Placeholder (heart-rate slope) | diastolic | 0.2 mmHg | 4.6 | 97 % |

**Limits.** Healthy volunteers; cuff values only at the start and end of each recording; calibration and test within one session, so it says nothing about calibration ageing. Blood pressure barely changes between sitting and walking or running in this set, so even "calibration only" scores well and the test cannot show that any estimator tracks real changes. PulseDB (not used) and other ICU-derived data would be for algorithm testing only, never astronaut thresholds. This is not a clinical validation.

### Readings that are not always normal, and what to do

Each **Measure vitals** run rolls a new random mix: 2 or 3 of pulse, blood pressure, glucose, skin temperature and last night's sleep are pushed out of range (high or low as fits), the rest stay normal. Values stay plausible (for example pulse 100 to 112 or 42 to 45, blood pressure 145 to 158 over 92 to 97, glucose 160 to 185 or 60 to 65, sleep 4.2 to 5.5 hours). The mix stays until the next run. Low sleep replaces last night's reading with a simulated value and keeps the original. Demo controls, "Test readings" (Normal, High, Low) still force all vitals one way. The engine option `mix` (on in the app, off in tests) and `random` make runs repeatable in tests.

Out-of-range vitals show a tag (High or Low) and a short recommendation on the card, and a **What to do now** list above the cards (rest, drink water, breathe slowly, walk, eat something, sleep, and tell the flight surgeon if it is severe). Normal vitals get a Normal tag and no recommendation. Ranges are the placeholders in `src/readings/reference.ts` until a personal baseline forms. All wording is placeholder, `TODO(flight-surgeon)` in `src/readings/suggest.ts`. Simulated data is labelled on every page.

### Protect your fitness (exercise rules)

The **Protect your fitness** card (Vitals, Overview) compares this week's training with the exercise rules in **NASA OCHMO-TB-031** ([Exercise Overview](https://www.nasa.gov/ochmo-tb-031-exercise-overview-2/)). The rules live in `src/data/exerciseRules.json`. Every rule has a `source` with the document link and a short quote, or `source: null` and `needsReview: true`. The numbers were checked against the page on 14 Nov 2026.

| Rule | Value | Status |
| --- | --- | --- |
| Normal week | 6 to 7 sessions: about 30 min aerobic (interval or steady) plus 30 to 60 min resistance | sourced |
| Aerobic intensity | 70 to 90% of max heart rate | sourced |
| Maximum heart rate | 220 minus age | **needs review** (the document says "age-predicted" but gives no formula) |
| Minimum dose | 3 or more sessions a week, longer than 20 min, above 70% of max HR (yellow if below) | sourced |
| Protect targets | aerobic and strength at 80% of baseline or more (NASA-STD-3001 [V1 4003], [V1 4024]); bone 95% (hip and spine, [V1 4027]) | sourced; bone is not measurable here |
| High-risk flag | a drop of 20% or more in a tracked endpoint | sourced |
| Volume drives bone and strength | resistance and treadmill volume are the main factors | sourced |
| Never drop volume to zero; lower intensity on recovery days | policy built on the rule above | **needs review** (not stated in these words) |
| Recovery-day intensity under 70% | | **needs review**, no source |
| 10% over 3 days trend rule | stored, not applied yet | **needs review**, no source |
| Safety-gate wording ("Talk to the flight surgeon before changing your plan.") | | **needs review**, no source |
| Baseline for the proxy: weekly average of the first 14 days | | **needs review**, this project's choice |

The card shows weekly aerobic and resistance minutes against the targets (6 x 30 = 180 min aerobic, 180 to 420 min resistance), the minimum dose, the 70 to 90% heart-rate zone for the astronaut's age, and two proxies as a percent of baseline. **Aerobic proxy** = aerobic minutes against baseline. **Strength proxy** = the average of resistance minutes and logged lift volume (load x sets x reps) against baseline. At 80% or lower (a drop of 20%) it shows a **high-risk** banner. It is labelled **proxy, not a VO2 or strength test**. Bone is listed as not measured. Each rule line links to its source, or shows "needs review". A "Rules and sources" list shows all of them.

Sessions come from a simulated five-week history for the fictional crew (labelled Simulated; Avery on track, Mateo below the minimum dose, Priya a high-risk drop) plus whatever the astronaut logs with "Log a session" (kept on the device, `localStorage` key `av:exercise-log:v1`). The workout-plan feature built on the IRATS dataset has not been started: it is waiting for `IRATS_Data_Dictionary.csv` in `public/data`.

### Mental check (survey and camera)

The **Mental check** page (`/response-check`) starts with an optional quick survey, then the camera reaction test, then one combined report. The survey has five statements ("Over the last 2 weeks I felt cheerful and in good spirits, calm and relaxed, active and energetic, rested when I woke up, interested in my daily tasks"), one question per screen with a progress bar, one tap each on a 0 (never) to 5 (always) scale. The score is the sum times 4 (a percent). It can be skipped. The items and scoring follow the WHO-5 Well-Being Index. The labels use common WHO-5 conventions as placeholders, not validated for astronauts (`TODO(flight-surgeon)`, `mental` in `src/readings/config.ts`): 50 or more Good, 29 to 49 Watch, 28 or less Check-in.

The report shows the reaction time with the camera check's own state (Good, Watch, Check-in) beside the survey score and label. If either is Watch or Check-in it suggests talking to a crewmate, resting, getting daylight or bright light, and telling the flight surgeon. A very low survey score (28 or less) shows a "talk to someone" message. It is labelled a screening aid, not a diagnosis. Survey results are saved on the device (`localStorage` key `av:survey:v1`) and listed with the reaction results in Vitals, History. The camera check itself was not changed.

### Coverage, camera bridge

**Coverage** (`/coverage`): table of what the device measures by NASA health area (cardiovascular, bone and muscle, sleep, nutrition, behavioral health) with an explicit "not measured" column. Bone density and muscle strength are NASA requirements this device cannot measure; workout logs are only a proxy for exercise adherence. Sources: [NASA-STD-3001 Vol. 1](https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf) and the [OCHMO technical briefs](https://www.nasa.gov/ochmo/health-operations-and-oversight/hsa-standards/). The row-to-requirement mapping was not checked line by line.

**Camera result bridge** (`src/readings/cvBridge.ts`, installed in `Shell.tsx`): listens to the existing `cv-result` event, stores a `response_ms` reading (source `camera`) with last night's sleep in its context. The results show in the History tab. The response check itself (`src/features/cv-response-check`) was not modified.

### Every `TODO(flight-surgeon)` in the data layer

None of these is a clinical value. All are configuration or placeholder:

- `src/readings/config.ts`: `bpCalibration.staleAfterDays` (30), `glucoseSensor.warmupMinutes` (60), `context.restingMinMinutesSinceExercise` (60), `context.postExerciseMaxMinutes` (60), `reference.minSampleN` (10), `baseline.minSessions` (7), `baseline.rangeK` (2), `baseline.minRelMad` (0.03), `glucose.bandLowMgDl` / `bandHighMgDl` (70 / 140), `sleep.minNightsForTrend` (3).
- `src/readings/reference.ts`: the placeholder ranges for resting heart rate (50 to 95), RMSSD (15 to 80), systolic (95 to 130), diastolic (60 to 85), and the whole age and sex banding.
- `src/data/exerciseRules.json`: every rule with `needsReview: true` (see the table above).
- `src/readings/config.ts` `mental.goodMin` (50) and `mental.watchMin` (29), and all recommendation wording in `src/readings/suggest.ts` and `src/readings/mental.ts`.
- `src/readings/reference.ts`: sleep (6 to 24 h) and skin temperature (28 to 35.5 degrees) placeholders, taken from the demonstration thresholds.
- `src/validation/estimator.ts`: the heart-rate slopes (0.3 and 0.1 mmHg per bpm).
- Judgement numbers not tagged in code, also not clinical: "active" means 3 or more METs when labelling replayed CGMacros frames (`scripts/fetch-data.mjs`), activity markers need 10 minutes, the activity lookup for motion labelling looks back 15 minutes, a standing person within 2 minutes of exercise counts as moving when wrist activity is unknown, the simulated sensor was applied 4 days before the scenario start, and simulated cuff calibration ages (12, 24, 33 and 5 days).

### What to check by hand

- Open Demo controls, start the synthetic replay, confirm the banner, play and pause, speed and loop, and that the other astronauts keep running.
- Run `npm run fetch-data`, then `npm run validate:bp`, then replay "Pulse Transit Time" and a CGMacros participant; read the attribution line that appears.
- Run a Mental check: finish the survey, then the camera test, and look at the report and at Vitals, History.
- Tap Measure vitals several times: each run should leave 2 or 3 vitals out of range, a different mix each time, with a "What to do now" list.
- Look at the ECG-derived bands in `public/replay/aging-reference.json` against what you expect for your population.

## Code map

| Path | Purpose |
| --- | --- |
| `src/sim/engine.ts` | One shared engine: clock, samplers, devices, cuff state machine, rules, store-and-forward, Earth receiver, persistence flush |
| `src/sim/generator.ts`, `scenarios.ts`, `crew.ts`, `params.ts` | Deterministic signals, scenario definitions, fictional crew/devices, simulation parameters |
| `src/sim/persist.ts`, `selectors.ts`, `types.ts`, `fmt.ts` | IndexedDB layer, stale/missing logic, data contract, formatting |
| `src/sim/instance.ts` | Singleton engine + `useSim()` hook (one timer; screens never start their own) |
| `src/features/cv-response-check/` | Response check: `logic/` (pure, tested), `config.ts`, thin `camera.ts` / `landmarker.ts`, hook and page |
| `src/sim/vitals.ts` | The six vital cards, body regions, and simulation-range flags |
| `src/pages/`, `src/components/` | AccountPicker, Home (body map), Vitals, Part; Overview, Astronaut, Mission Control, About; shared panels, charts, demo/evidence drawers |
| `src/readings/`, `src/replay/`, `src/validation/` | Reading model, context, quality, calibration, references, baselines, sleep, glucose, suggestions, survey, replay, validation (each with `*.test.ts`) |
| `scripts/fetch-data.mjs`, `scripts/validate-bp.mjs` | `npm run fetch-data` (open data subsets), `npm run validate:bp` |
| `src/sim/engine.test.ts` | Tests for seeding, timing, cuff states, outage/recovery, dedupe, scenarios, corrections, persistence, storage failure |

## Dependencies and why

Unchanged from the scaffold. In use: `react`, `react-dom`, `react-router-dom` (UI and routing), `idb` (IndexedDB), `@fontsource/inter` (self-hosted font), `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa` (offline shell), `typescript`, `vitest`. Charts are hand-written SVG. `@mediapipe/tasks-vision` (pose and hand landmarks for the Response check; WASM and models are served locally). **Currently unused** (left in place; remove if not needed): `lightstreamer-client-web`, `@fontsource/nunito`, `fraunces`, `space-grotesk` and `ibm-plex-mono`, (the `postinstall` script copies the MediaPipe WASM; `npm run setup:cv` does that plus the model download).

## Limitations

- All hardware links, readings, scenarios, the Earth receiver, delays, ground replies and roles are simulated. No accuracy, battery-life or flight-suitability claims are made; the report lists these as unverified.
- Thresholds are demonstration parameters, not clinical limits. Radiation, partial-pressure CO₂ and averaging intervals are not modelled (ppm only).
- Battery model is simple (band drains slowly; cuff drains per cycle; no charging gaps). Pulse-rate variability, SpO₂, respiration and ECG are out of the first build.
- The clock pauses while the page is closed. To keep the demo light, old high-rate readings are thinned to one per 15 minutes (evidence, manual and low-rate records are kept).
- Browser support was checked in Edge (Chromium) only.

## Attribution (retained from the earlier scaffold)

Public datasets used for replay and reference bands (only if you run `npm run fetch-data`): see "Public data" above for citations and licenses. CGMacros is CC BY-NC-SA 4.0, non-commercial.


- Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo).
- Data and visualizations are courtesy of the Environmental Data Application (EDA) (https://visualization.osdr.nasa.gov/eda/).
- NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites.

The current simulation does not use OSDR/EDA data. AI disclosure (from the report): ChatGPT assisted research synthesis, hardware concept analysis and report preparation; this prototype's code was also written with AI assistance.
