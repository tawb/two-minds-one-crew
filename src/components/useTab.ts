import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** A tab kept in the URL (?tab=...), so links and redirects can open a given tab. Unknown values fall back to the default. */
export function useTab<T extends string>(valid: readonly T[], fallback: T): [T, (t: T) => void] {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = (valid as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
  const set = useCallback((t: T) => {
    const next = new URLSearchParams(sp);
    if (t === fallback) next.delete('tab'); else next.set('tab', t);
    setSp(next, { replace: true });
  }, [sp, setSp, fallback]);
  return [tab, set];
}
