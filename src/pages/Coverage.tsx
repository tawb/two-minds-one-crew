import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';

const STD = 'https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf';
const OCHMO = 'https://www.nasa.gov/ochmo/health-operations-and-oversight/hsa-standards/';

interface Row { area: string; measured: string[]; notMeasured: string[]; note?: string }

// What this prototype measures, by NASA health area. The "not measured" column is as important as the first one.
const ROWS: Row[] = [
  {
    area: 'Cardiovascular',
    measured: ['Pulse from the wrist band (optical)', 'Blood pressure from the upper-arm cuff, with calibration age', 'Skin temperature from the band'],
    notMeasured: ['Heart rhythm (no ECG)', 'Cardiac output and vascular health', 'Response to standing up (orthostatic)', 'Exercise capacity'],
  },
  {
    area: 'Bone and muscle',
    measured: ['Time active, estimated from the band (a rough proxy only)'],
    notMeasured: ['Bone mineral density', 'Muscle strength and muscle mass', 'Load and repetitions of resistive exercise'],
    note: 'Bone density and muscle strength are NASA requirements that this device cannot measure. Workout logs, where kept, only show whether exercise was done (adherence), not what it did to bone or muscle. NASA-STD-3001 Vol. 1 [V1 4027] covers bone density.',
  },
  {
    area: 'Sleep',
    measured: ['Sleep duration estimated by the band', 'Resting pulse overnight', 'Efficiency and stages only where a source provides them (replayed data), not from the simulated band'],
    notMeasured: ['Sleep stages from brain activity', 'Sleep disorders', 'Circadian phase', 'How rested the person feels (not asked)'],
  },
  {
    area: 'Nutrition',
    measured: ['Sensor glucose over time, with meal and activity markers', 'Time in a placeholder band, SD and CV'],
    notMeasured: ['What was eaten, calories or nutrients', 'Body mass and body composition', 'Hydration', 'Vitamins and minerals', 'Any diabetes assessment'],
    note: 'Meal timing is what the astronaut enters or the simulator schedules. It is not measured.',
  },
  {
    area: 'Behavioral health',
    measured: ['Alertness through the mental check (camera), against the person\'s own usual', 'Last night\'s sleep recorded beside each check'],
    notMeasured: ['Mood, stress or anxiety', 'Thinking and memory beyond reaction time', 'Team and social factors', 'Any diagnosis'],
    note: 'Mood, stress and fatigue entries in this prototype are simulated self-report, not measured.',
  },
];

export default function Coverage() {
  const nav = useNavigate();
  return (
    <section className="doc-page">
      <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon n="left" /> Back</button>
      <h1 className="hero">Coverage</h1>
      <p className="banner info">This is a simulation prototype. Nothing here is a medical device, a diagnosis or a NASA-approved method.</p>
      <div className="tablewrap">
        <table className="mini covtable">
          <thead><tr><th>Health area</th><th>Measured here</th><th>Not measured</th></tr></thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.area}>
                <th scope="row">{r.area}</th>
                <td><ul className="plain">{r.measured.map((m) => <li key={m}>{m}</li>)}</ul></td>
                <td><ul className="plain">{r.notMeasured.map((m) => <li key={m}>{m}</li>)}</ul>{r.note && <p className="fine left">{r.note}</p>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="psection">
        <div className="vlabel">Sources</div>
        <ul className="plain">
          <li><a href={STD} target="_blank" rel="noreferrer">NASA-STD-3001 Volume 1, Rev C: Crew Health</a> (health and performance requirements, including bone density [V1 4027])</li>
          <li><a href={OCHMO} target="_blank" rel="noreferrer">NASA OCHMO technical briefs</a> (readable summaries of the standard)</li>
        </ul>
        <p className="fine left">The areas in the table follow these documents in broad terms. Which requirement applies to which row was not checked line by line. A flight surgeon should confirm the mapping.</p>
      </div>
    </section>
  );
}
