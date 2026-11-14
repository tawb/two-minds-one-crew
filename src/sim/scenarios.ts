// Self-populating scenarios (report §10). Each one is a modifier set for the generator (so history
// and live data agree) plus a few timed events. Offsets are simulated seconds after the scenario start.

import type { SimEngine } from './engine';
import type { ScenarioMods } from './generator';

export interface ScenarioEvent { atSec: number; id: string; run: (e: SimEngine) => void }

export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  mods: ScenarioMods;
  deviceInit?: Record<string, { battery?: number }>;
  events: ScenarioEvent[];
}

const headacheEvents = (e: SimEngine) => {
  const onset = e.S.T0 - 25 * 60_000;
  e.reportSymptom('A2', { symptom: 'Headache', severity: 3, onsetAt: onset, note: 'Dull, since before the last work block.', origin: 'simulated-self-report' });
  e.simulatedCheckin('A2', { mood: 3, stress: 3, fatigue: 4 });
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'routine',
    title: 'Routine monitoring',
    blurb: 'Four crew members, normal readings, scheduled cuff cycles.',
    mods: {},
    events: [],
  },
  {
    id: 'headache-co2',
    title: 'Headache and fatigue, CO₂ rising in the same module',
    blurb: 'Mateo Silva reports headache and fatigue after two short nights. CO₂ in his own module (Hab Module 2) has been rising.',
    mods: {
      co2Ramp: { M2: { start: -150, end: -10, holdUntil: 90, peak: 2000 } },
      shortSleep: { A2: [5.3, 5.6] },
    },
    events: [{ atSec: 10, id: 'headache', run: headacheEvents }],
  },
  {
    id: 'headache-stale',
    title: 'Same symptoms, CO₂ reading is stale',
    blurb: 'Same report, but the Hab Module 2 CO₂ sensor stopped reporting about three hours ago. The software must explain the uncertainty.',
    mods: {
      co2Ramp: { M2: { start: -300, end: -200, holdUntil: 90, peak: 1800 } },
      cabinOfflineFromMin: { M2: -185 },
      shortSleep: { A2: [5.3, 5.6] },
    },
    events: [{ atSec: 10, id: 'headache', run: headacheEvents }],
  },
  {
    id: 'headache-other-module',
    title: 'Same symptoms, CO₂ is high in another module',
    blurb: 'CO₂ is elevated in the Laboratory Module, but Mateo Silva is in Hab Module 2 where CO₂ is normal. The location does not match.',
    mods: {
      co2Ramp: { M3: { start: -150, end: -10, holdUntil: 90, peak: 1900 } },
      shortSleep: { A2: [5.3, 5.6] },
    },
    events: [{ atSec: 10, id: 'headache', run: headacheEvents }],
  },
  {
    id: 'wearable-help',
    title: 'Disconnected wearable, then a help request',
    blurb: "Priya Nair's band battery runs out and the band disconnects. She then requests help with incomplete sensor data.",
    mods: {},
    deviceInit: { 'BAND-A3': { battery: 12 } },
    events: [
      { atSec: 5, id: 'band-low', run: (e) => e.setBattery('BAND-A3', 4) },
      { atSec: 10, id: 'band-off', run: (e) => e.setDevice('BAND-A3', 'disconnected') },
      { atSec: 50, id: 'help', run: (e) => e.requestHelp('A3', 'Feeling dizzy. Band has disconnected. (Simulated request)', true) },
    ],
  },
  {
    id: 'comms-loss',
    title: 'Earth communication loss, then recovery',
    blurb: 'The link to Earth drops for about 100 s. Onboard monitoring and alerts continue (an elevated cuff result appears), then queued records are delivered once.',
    mods: { bpBoost: { A4: { sys: 34, dia: 16 } } },
    events: [
      { atSec: 10, id: 'outage', run: (e) => e.setCommsEnabled(false) },
      { atSec: 110, id: 'restore', run: (e) => e.setCommsEnabled(true) },
    ],
  },
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
