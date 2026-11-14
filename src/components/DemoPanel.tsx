import { useState } from 'react';
import { SIM } from '../sim/params';
import { SCENARIOS } from '../sim/scenarios';
import { useSim } from '../sim/instance';
import type { DeviceState, Speed } from '../sim/types';
import { delayText } from './panels';
import { ReplayControls } from './ReplayControls';
import { Icon } from './icons';

/** Secondary panel. Styled differently from the crew interface on purpose: nothing here is real. */
export default function DemoPanel() {
  const e = useSim();
  const S = e.S;
  const [dev, setDev] = useState('BAND-A3');
  const [msg, setMsg] = useState('');
  const set = (st: DeviceState) => e.setDevice(dev, st);

  return (
    <div className="demo">
      <p className="demo-note">Simulation only. Not part of the crew app.</p>

      <h3>Scenario</h3>
      <div className="scn">
        {SCENARIOS.map((s) => (
          <label key={s.id} className={S.scenarioId === s.id ? 'scn-item on' : 'scn-item'}>
            <input type="radio" name="scn" checked={S.scenarioId === s.id} onChange={() => e.loadScenario(s.id)} />
            <span><b>{s.title}</b><br /><small>{s.blurb}</small></span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button onClick={() => e.replay()}>Replay</button>
        <button onClick={() => { if (window.confirm('Reset demo data? This clears all simulated records on this device.')) e.replay(); }}>
          Reset
        </button>
      </div>

      <h3>Test readings</h3>
      <div className="actions" role="group" aria-label="Test readings">
        {(['normal', 'high', 'low'] as const).map((b) => <button key={b} className={S.demoBias === b ? 'on' : ''} aria-pressed={S.demoBias === b} onClick={() => { e.setDemoBias(b); e.measureNow(S.viewerId); }}>{b[0].toUpperCase() + b.slice(1)}</button>)}
      </div>

      <h3>Personal baseline</h3>
      <div className="actions">
        <button onClick={() => e.backfillSessions(S.viewerId, 7)}>Add 7 simulated sessions</button>
      </div>

      <h3>Replay</h3>
      <ReplayControls />

      <h3>Speed</h3>
      <div className="actions">
        {([1, 10, 60] as Speed[]).map((s) => (
          <button key={s} aria-pressed={S.speed === s} className={S.speed === s ? 'on' : ''} onClick={() => e.setSpeed(s)}>x{s}</button>
        ))}
      </div>

      <h3>Earth link</h3>
      <div className="actions">
        <button onClick={() => e.setCommsEnabled(!S.comms.enabled)}>{S.comms.enabled ? 'Cut link' : 'Restore link'}</button>
      </div>
      <div className="actions">
        {SIM.comms.delayOptionsMs.map((d) => (
          <button key={d} className={S.comms.delayMs === d ? 'on' : ''} onClick={() => e.setDelay(d)}>Delay {delayText(d)}</button>
        ))}
      </div>

      <h3>Devices</h3>
      <label className="field">Device
        <select value={dev} onChange={(ev) => setDev(ev.target.value)}>
          {Object.values(S.devices).map((d) => <option key={d.id} value={d.id}>{d.id} ({d.state})</option>)}
        </select>
      </label>
      <div className="actions">
        <button onClick={() => set('disconnected')}>Disconnect</button>
        <button onClick={() => set('poor-contact')}>Poor contact</button>
        <button onClick={() => set('ok')}>Reconnect</button>
      </div>
      <div className="actions">
        <button className={S.injectCuffFail ? 'on' : ''} onClick={() => e.setInjectCuffFail(!S.injectCuffFail)}>
          {S.injectCuffFail ? <><Icon n="check" /> Next cuff will fail</> : 'Fail next cuff'}
        </button>
      </div>

      <h3>Ground</h3>
      <div className="actions">
        <button onClick={() => setMsg(e.simulateGroundReply() ? 'Reply sent. It arrives after the delay.' : 'No case is waiting.')}>
          Send ground reply
        </button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}

      <h3>Settings (not clinical limits)</h3>
      <details>
        <summary>Show</summary>
        <table className="mini">
          <tbody>
            <tr><th>Pulse, activity</th><td>every {SIM.intervals.heartRateMs / 1000} s</td></tr>
            <tr><th>Skin temperature, glucose</th><td>every {SIM.intervals.skinTempMs / 1000} s</td></tr>
            <tr><th>Cabin CO₂, temperature, humidity</th><td>every {SIM.intervals.cabinMs / 1000} s</td></tr>
            <tr><th>Cuff cycle</th><td>{SIM.cuff.durationMs / 1000} s, scheduled every {SIM.cuff.scheduleEveryMs / 60000} min</td></tr>
            {Object.entries(SIM.thresholds).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
          </tbody>
        </table>
      </details>
    </div>
  );
}
