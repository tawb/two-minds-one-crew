// References as listed in the "Astronaut Health Monitoring: Hardware Concept and Software Handoff
// Report" (14 Nov 2026). Titles only: the report gives no links and none are invented here.

export const REFERENCES: [number, string][] = [
  [1, 'NASA Space Apps 2026 - Health Monitoring Software Challenge'],
  [2, 'HackAthlone - Full Written Brief and Resource Inventory'],
  [3, 'NASA HRP - Risks of Human Spaceflight'],
  [4, 'NASA - ARCHeR'],
  [5, 'NASA - Risk of Cardiovascular Adaptations'],
  [6, 'WHOOP - Developer Support and Data Access'],
  [7, 'Analog Devices - MAX86141'],
  [8, 'Texas Instruments - TMP117'],
  [9, 'Abbott - Libre 3 System'],
  [10, 'American Heart Association - Blood Pressure Measurement'],
  [11, 'Sensirion - SCD30'],
  [12, 'NASA - Carbon Dioxide Technical Brief'],
  [13, 'NASA - Counteracting Bone and Muscle Loss'],
  [14, 'Association for Psychological Science - Limits of Inferring Emotion from Facial Movements'],
  [15, 'NASA - Delay/Disruption Tolerant Networking'],
  [16, 'JAMA Network Open - Jugular Blood Flow and Thrombosis During Spaceflight'],
  [17, 'NASA - Crew Health Records'],
  [18, 'Pulse-rate and heart-rate variability study'],
  [19, 'SunTech - Blood Pressure Module Instructions'],
];

const USES: [string, string, string][] = [
  ['Pulse, skin temperature, activity, sleep', 'Proposed band; optical and temperature sensors are examples, not verified devices', '4, 6, 7, 8, 18'],
  ['Blood pressure', 'Upper-arm cuff cycles; placement and sizing matter; cuff can disturb the wrist sensor', '10, 19'],
  ['Sensor glucose', 'Commercial patch precedent (interstitial glucose, one reading a minute)', '9'],
  ['Cabin CO₂, temperature, humidity', 'Module-tagged sensor; ppm and partial pressure differ, so original units are kept', '11, 12'],
  ['Headache and CO₂ context', 'Shows time and place overlap for review; individual cause stays undetermined', '12'],
  ['Store-and-forward sync', 'Save locally, queue, retry with the same IDs, Earth deduplicates', '15'],
  ['Well-being check-ins', 'Voluntary reports; camera assistance is a concept only', '4, 14'],
  ['Medical records and roles', 'Sensitive details need an agreed access policy', '17'],
];

export default function Evidence() {
  return (
    <div className="evidence-panel">
      <p>Based on the team's “Astronaut Health Monitoring: Hardware Concept and Software Handoff Report” (14 November 2026). Nothing here has been experimentally verified.</p>
      <h3>How sources are used</h3>
      <table className="mini">
        <thead><tr><th>Area</th><th>Use in this prototype</th><th>Refs</th></tr></thead>
        <tbody>{USES.map(([a, b, c]) => <tr key={a}><th scope="row">{a}</th><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table>
      <h3>References</h3>
      <ol className="refs">
        {REFERENCES.map(([n, t]) => <li key={n} value={n}>{t}</li>)}
      </ol>
      <p className="muted">AI disclosure: ChatGPT assisted the report; this code was written with AI assistance.</p>
    </div>
  );
}
