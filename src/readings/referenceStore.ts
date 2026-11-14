import { useEffect, useSyncExternalStore } from 'react';
import type { AgingReference } from './reference';

// The Autonomic Aging summary written by `npm run fetch-data` (static file served by the app, no other site is contacted).
let aging: AgingReference | null = null;
let loaded = false;
const subs = new Set<() => void>();

export async function loadAging(base = import.meta.env.BASE_URL, fetcher: typeof fetch = fetch): Promise<AgingReference | null> {
  try {
    const r = await fetcher(`${base}replay/aging-reference.json`, { cache: 'no-cache' });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const j = (await r.json()) as AgingReference;
      if (Array.isArray(j.bands)) aging = j;
    }
  } catch { /* file not present: placeholders are used and labelled */ }
  loaded = true;
  subs.forEach((f) => f());
  return aging;
}

export const getAging = () => aging;
export const setAgingForTests = (a: AgingReference | null) => { aging = a; };

/** The reference sample, loaded once. null = not downloaded (placeholders apply). */
export function useAging(): AgingReference | null {
  useEffect(() => { if (!loaded) void loadAging(); }, []);
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => (loaded ? (aging ? 2 : 1) : 0));
  return aging;
}
