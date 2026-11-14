import { openDB, type IDBPDatabase } from 'idb';
import type { Alert, DeviceMsg, EarthRec, Obs, OutboxItem } from './types';

export type StoreName = 'observations' | 'alerts' | 'deviceMsgs' | 'outbox' | 'earth';
const KEYS: Record<StoreName, string> = {
  observations: 'id', alerts: 'id', deviceMsgs: 'id', outbox: 'rec.id', earth: 'rec.id',
};
export const STORE_NAMES = Object.keys(KEYS) as StoreName[];
export const SCHEMA = 2;

export interface Loaded {
  observations: Obs[];
  alerts: Alert[];
  deviceMsgs: DeviceMsg[];
  outbox: OutboxItem[];
  earth: EarthRec[];
  meta: Record<string, unknown> | null;
  legacyViewer: string | null;
}

export interface Batch {
  put: Partial<Record<StoreName, unknown[]>>;
  del: Partial<Record<StoreName, string[]>>;
  meta?: Record<string, unknown>;
}

/** Everything lives in this browser. v1 -> v2 migration: the old (empty) readings/sessions/packets
 *  stores are dropped; the old settings record is kept and its crew choice is migrated on load. */
export class IdbPersist {
  private dbp: Promise<IDBPDatabase> | null = null;

  private db() {
    this.dbp ??= openDB('astrovitals', 2, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings');
        if (!d.objectStoreNames.contains('cache')) d.createObjectStore('cache');
        for (const n of ['readings', 'sessions', 'packets']) {
          if (d.objectStoreNames.contains(n)) d.deleteObjectStore(n);
        }
        for (const n of STORE_NAMES) {
          if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: KEYS[n] });
        }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      },
    });
    return this.dbp;
  }

  async load(): Promise<Loaded> {
    const d = await this.db();
    const [observations, alerts, deviceMsgs, outbox, earth] = await Promise.all(
      STORE_NAMES.map((n) => d.getAll(n)),
    );
    const meta = ((await d.get('meta', 'main')) as Record<string, unknown> | undefined) ?? null;
    const old = (await d.get('settings', 'main')) as { currentCrew?: string | null } | undefined;
    const legacyViewer = old?.currentCrew && /^[A-D]$/.test(old.currentCrew)
      ? `A${old.currentCrew.charCodeAt(0) - 64}`
      : null;
    return { observations, alerts, deviceMsgs, outbox, earth, meta, legacyViewer } as Loaded;
  }

  async save(batch: Batch): Promise<void> {
    const d = await this.db();
    const tx = d.transaction([...STORE_NAMES, 'meta'], 'readwrite');
    for (const n of STORE_NAMES) {
      for (const item of batch.put[n] ?? []) void tx.objectStore(n).put(item);
      for (const id of batch.del[n] ?? []) void tx.objectStore(n).delete(id);
    }
    if (batch.meta) void tx.objectStore('meta').put(batch.meta, 'main');
    await tx.done;
  }

  async clear(): Promise<void> {
    const d = await this.db();
    const tx = d.transaction([...STORE_NAMES, 'meta'], 'readwrite');
    for (const n of STORE_NAMES) void tx.objectStore(n).clear();
    void tx.objectStore('meta').clear();
    await tx.done;
  }
}
