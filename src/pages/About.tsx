import Evidence from '../components/Evidence';
import { SimBadge, Tabs } from '../components/ui';
import { useTab } from '../components/useTab';
import Coverage from './Coverage';
import Validation from './Validation';

type ATab = 'about' | 'coverage' | 'validation' | 'sources';
const ATABS: [ATab, string][] = [['about', 'About'], ['coverage', 'Coverage'], ['validation', 'Validation'], ['sources', 'Sources']];

export default function About() {
  const [tab, setTab] = useTab<ATab>(ATABS.map(([t]) => t), 'about');
  return (
    <section>
      <h1 className="hero">About <SimBadge /></h1>
      <Tabs tabs={ATABS} value={tab} onChange={setTab} label="About sections" />
      {tab === 'coverage' && <div className="embedded"><Coverage /></div>}
      {tab === 'validation' && <div className="embedded"><Validation /></div>}
      {tab === 'sources' && <div className="panel"><Evidence /></div>}
      {tab === 'about' && <>
      <div className="panel">
        <p><b>AstroVitals</b> is an <b>AI-assisted student prototype</b> by Team Axiom (NASA Space Apps 2026). It uses <b>synthetic data</b> and <b>proposed hardware</b>. It is not a medical device.</p>
        <p><i>It does not tell you how you feel. It tells you what you cannot feel.</i> People diagnose.</p>
      </div>
      <div className="panel">
        <h2>What is simulated</h2>
        <ul>
          <li>All crew and readings are fictional.</li>
          <li>The wearable is a proposed band inspired by WHOOP, with an upper-arm cuff, glucose patch and cabin sensors. All connections are simulated.</li>
          <li>Automatic symptoms and well-being entries are labelled <b>“Simulated self-report”</b>.</li>
          <li>Earth, outages, delays, replies and the flight-surgeon role are simulated.</li>
        </ul>
        <h2>Data origins</h2>
        <ul>
          <li><b>Simulated</b>: made by the simulator.</li>
          <li><b>Device</b>: real hardware. None is connected.</li>
          <li><b>Manual</b>: typed in by a person.</li>
          <li><b>Simulated self-report</b>: generated symptom or well-being entry.</li>
        </ul>
      </div>
      <div className="panel">
        <h2>Attribution</h2>
        <ul>
          <li>Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo).</li>
          <li>Data and visualizations are courtesy of the Environmental Data Application (EDA) (https://visualization.osdr.nasa.gov/eda/).</li>
          <li>NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites.</li>
        </ul>
        <p className="muted">This simulation does not use OSDR or EDA data. References are under the Sources tab.</p>
      </div>
      </>}
    </section>
  );
}
