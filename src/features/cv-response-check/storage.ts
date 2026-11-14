import { CV_CONFIG } from './config';
import type { CvResultDetail } from './events';
import type { StoredSession } from './types';

// Only numbers and timestamps are stored. Every access is wrapped: storage can be blocked or full.
const sessionsKey = (userId: string) => `${CV_CONFIG.storage.keyPrefix}:sessions:${userId}`;
const lastKey = (userId: string) => `${CV_CONFIG.storage.keyPrefix}:last:${userId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSessions(userId: string): StoredSession[] {
  const v = read<StoredSession[]>(sessionsKey(userId));
  return Array.isArray(v) ? v.filter((s) => s && typeof s.timestamp === 'number') : [];
}

/** Appends a session and keeps only the most recent `maxSessions`. Returns false if storage failed. */
export function saveSession(userId: string, s: StoredSession): boolean {
  const next = [...loadSessions(userId), s].slice(-CV_CONFIG.baseline.maxSessions);
  return write(sessionsKey(userId), next);
}

export function loadLastResult(userId: string): CvResultDetail | null {
  return read<CvResultDetail>(lastKey(userId));
}

export function saveLastResult(userId: string, d: CvResultDetail): boolean {
  return write(lastKey(userId), d);
}

export function clearSessions(userId: string): void {
  try {
    localStorage.removeItem(sessionsKey(userId));
    localStorage.removeItem(lastKey(userId));
  } catch { /* ignore */ }
}
