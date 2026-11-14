import { fmtHM } from '../sim/fmt';
import { Shape } from './icons';
import type { Obs } from '../sim/types';

export interface ChartSeries { name: string; color: string; points: Obs[] }
export interface ChartMarker { t: number; label: string }

/** Hand-written SVG line chart. Missing readings break the line and are marked on the baseline. */
export default function TrendChart({ title, units, series, from, to, markers = [], band, height = 170, compact = false }: {
  title: string; units: string; series: ChartSeries[]; from: number; to: number;
  markers?: ChartMarker[]; band?: [number, number]; height?: number; compact?: boolean;
}) {
  const W = 640, padL = 44, padR = 26, padT = 10, padB = 24;
  const vals: number[] = [];
  series.forEach((s) => s.points.forEach((p) => { if (typeof p.value === 'number') vals.push(p.value); }));
  if (band) vals.push(band[0], band[1]);
  const empty = vals.length === 0;
  let lo = empty ? 0 : Math.min(...vals), hi = empty ? 1 : Math.max(...vals);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const x = (t: number) => padL + ((t - from) / (to - from)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (height - padT - padB);
  const stride = (n: number) => Math.max(1, Math.ceil(n / 500));

  const paths = series.map((s) => {
    const pts = s.points.filter((_, i) => i % stride(s.points.length) === 0 || s.points[i].value === null);
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (typeof p.value !== 'number') { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(p.measuredAt).toFixed(1)},${y(p.value).toFixed(1)}`;
      pen = true;
    }
    return d;
  });
  const gaps = series.flatMap((s) => s.points.filter((p) => p.value === null));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => from + f * (to - from));
  const yTicks = [0, 0.5, 1].map((f) => lo + f * (hi - lo));
  const label = empty ? `${title}: no data in this range` : `${title}, ${units}`;

  return (
    <figure className="chart">
      <figcaption hidden={compact && series.length < 2}>
        <b>{title}</b> <span className="muted">({units})</span>
        {series.length > 1 && series.map((s) => <span key={s.name} className="legend" style={{ color: s.color }}> <Shape n="circle" /> {s.name}</span>)}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
        {band && <rect x={padL} width={W - padL - padR} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} className="band" />}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="grid" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="axis">{Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="axis">{fmtHM(t)}</text>
        ))}
        {paths.map((d, i) => d && <path key={series[i].name} d={d} fill="none" stroke={series[i].color} strokeWidth="1.8" strokeLinejoin="round" />)}
        {series.map((s, i) => s.points.length > 0 && s.points.length < 40 && s.points.map((p) =>
          typeof p.value === 'number' && <circle key={p.id} cx={x(p.measuredAt)} cy={y(p.value)} r="3" fill={series[i].color} />))}
        {gaps.slice(-120).map((p) => <line key={p.id} x1={x(p.measuredAt)} x2={x(p.measuredAt)} y1={height - padB - 6} y2={height - padB} className="gap" />)}
        {markers.map((m) => m.t >= from && m.t <= to && (
          <g key={m.label + m.t}>
            <line x1={x(m.t)} x2={x(m.t)} y1={padT} y2={height - padB} className="marker" />
            <text x={x(m.t) + 3} y={padT + 10} className="axis">{m.label}</text>
          </g>
        ))}
        {empty && <text x={W / 2} y={height / 2} textAnchor="middle" className="axis">No valid data in this range</text>}
      </svg>
    </figure>
  );
}
