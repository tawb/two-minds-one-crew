import { useSyncExternalStore } from 'react';
import { SimEngine } from './engine';
import { IdbPersist } from './persist';
import { SCENARIOS } from './scenarios';

/** One shared onboard engine for the whole app: one timer, no duplicates when screens change. */
export const engine = new SimEngine({ persist: new IdbPersist(), mix: true });
// Optional deep link, e.g. /?scenario=headache-co2, to open a scenario directly (no typing needed).
void engine.start().then(() => {
  const want = new URLSearchParams(window.location.search).get('scenario');
  if (want && want !== engine.S.scenarioId && SCENARIOS.some((s) => s.id === want)) engine.loadScenario(want);
}).catch((err) => console.error('AstroVitals: simulation failed to start', err));

if (import.meta.env.DEV) (window as unknown as { __astro: SimEngine }).__astro = engine; // dev-only diagnostics

if (import.meta.hot) import.meta.hot.dispose(() => engine.stop());

export function useSim(): SimEngine {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  return engine;
}
