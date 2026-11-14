// "Pick my account" is asked once per app session (per browser tab); the choice itself is the engine's viewerId.
const KEY = 'av_account_chosen';
let memory = false;
export function accountChosen(): boolean {
  if (memory) return true;
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function markAccountChosen() {
  memory = true;
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode: in-memory only */ }
}
export function clearAccountChosen() {
  memory = false;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// First-run tour: shown once per browser, reopenable from the menu.
const TOUR = 'av_tour_seen';
let tourMemory = false;
export function tourSeen(): boolean {
  if (tourMemory) return true;
  try { return localStorage.getItem(TOUR) === '1'; } catch { return false; }
}
export function markTourSeen() {
  tourMemory = true;
  try { localStorage.setItem(TOUR, '1'); } catch { /* private mode */ }
}
