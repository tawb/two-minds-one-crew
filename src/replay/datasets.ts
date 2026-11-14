import { syntheticDay } from './synthetic';
import type { ReplayDataset } from './types';

/**
 * Datasets available for replay: the synthetic day (always) plus anything `npm run fetch-data` wrote to public/replay/.
 * Those are static files served by the app itself, not network calls to other sites.
 */
export async function loadDatasets(base = import.meta.env.BASE_URL, fetcher: typeof fetch = fetch): Promise<ReplayDataset[]> {
  const out: ReplayDataset[] = [syntheticDay()];
  try {
    const res = await fetcher(`${base}replay/manifest.json`, { cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return out;
    const files = (await res.json()) as { files?: string[] };
    for (const f of files.files ?? []) {
      try {
        const r = await fetcher(`${base}replay/${f}`);
        if (!r.ok) continue;
        const ds = (await r.json()) as ReplayDataset;
        if (ds && Array.isArray(ds.frames) && ds.frames.length && typeof ds.durationMs === 'number') out.push(ds);
      } catch { /* skip an unreadable file */ }
    }
  } catch { /* no manifest: only the synthetic day is offered */ }
  return out;
}
