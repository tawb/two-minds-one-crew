import { useEffect, useState } from 'react';
import { loadDatasets } from '../replay/datasets';
import { REPLAY_LABEL, REPLAY_SPEEDS, SYNTHETIC_LABEL, type ReplayDataset } from '../replay/types';
import { useSim } from '../sim/instance';

export const replayLabel = (kind: 'synthetic' | 'public' | null) => (kind === 'synthetic' ? SYNTHETIC_LABEL : REPLAY_LABEL);

/** Toggle plus play, pause, speed and loop. Replayed data goes through the same pipeline as the live devices. */
export function ReplayControls() {
  const e = useSim();
  const R = e.S.replay;
  const [list, setList] = useState<ReplayDataset[]>([]);
  const [pick, setPick] = useState('');
  useEffect(() => { loadDatasets().then((d) => { setList(d); setPick((p) => p || d[d.length - 1]?.id || ''); }); }, []);
  const ds = list.find((d) => d.id === pick);
  return (
    <div className="replayctl">
      <label className="field">Dataset
        <select value={pick} onChange={(ev) => { setPick(ev.target.value); if (R.on) { const d = list.find((x) => x.id === ev.target.value); if (d) e.startReplay(d); } }}>
          {list.map((d) => <option key={d.id} value={d.id}>{d.title}{d.kind === 'synthetic' ? ' (synthetic)' : ''}</option>)}
        </select>
      </label>
      {list.length === 1 && <p className="muted">Only the synthetic day is available. <code>npm run fetch-data</code> adds recorded data.</p>}
      <div className="actions">
        <button className={R.on ? 'on' : ''} aria-pressed={R.on} disabled={!ds} onClick={() => (R.on ? e.stopReplay() : ds && e.startReplay(ds))}>
          {R.on ? 'Replay on (tap to stop)' : 'Start replay'}
        </button>
      </div>
      {R.on && (
        <>
          <div className="actions">
            <button onClick={() => e.setReplayPlaying(!R.playing)}>{R.playing ? 'Pause' : R.ended ? 'Play again' : 'Play'}</button>
            <button className={R.loop ? 'on' : ''} aria-pressed={R.loop} onClick={() => e.setReplayLoop(!R.loop)}>Loop</button>
          </div>
          <div className="actions" role="group" aria-label="Replay speed">
            {REPLAY_SPEEDS.map((s) => <button key={s} className={R.speed === s ? 'on' : ''} aria-pressed={R.speed === s} onClick={() => e.setReplaySpeed(s)}>x{s}</button>)}
          </div>
        </>
      )}
      {ds && (
        <p className="fine left">{ds.description} Source: {ds.attribution} License: {ds.license}{ds.nonCommercial ? ' (non-commercial use only)' : ''}. {ds.limits}</p>
      )}
    </div>
  );
}

/** Always visible while replay is on, so recorded data can never be mistaken for a live device. */
export function ReplayBanner() {
  const e = useSim();
  const R = e.S.replay;
  if (!R.on) return null;
  return (
    <div className="banner replay-banner" role="status">
      <b>{replayLabel(R.kind)}</b>
      <span> {R.datasetTitle}{R.ended ? ' · finished' : R.playing ? '' : ' · paused'}</span>
      <span className="rbtns">
        <button onClick={() => e.setReplayPlaying(!R.playing)} aria-label={R.playing ? 'Pause replay' : 'Play replay'}>{R.playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => e.stopReplay()}>Stop</button>
      </span>
    </div>
  );
}
