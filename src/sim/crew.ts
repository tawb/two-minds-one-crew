// Fictional crew, cabin modules and devices. All names and values are invented.

import type { Device } from './types';

export interface Astronaut {
  id: string;
  name: string;
  role: string;
  moduleId: string;
  restHR: number;
  sys: number;
  dia: number;
  glucose: number;
  skinTemp: number;
  sleepStartH: number;
  exerciseStartH: number;
  /** Fictional. Used only to pick a population reference band. */
  age: number;
  sex: 'female' | 'male';
}

export const ASTRONAUTS: Astronaut[] = [
  { id: 'A1', name: 'Avery Lindqvist', role: 'Commander', moduleId: 'M1', restHR: 58, sys: 116, dia: 74, glucose: 92, skinTemp: 33.4, sleepStartH: 22.5, exerciseStartH: 17, age: 42, sex: 'female' },
  { id: 'A2', name: 'Mateo Silva', role: 'Flight engineer', moduleId: 'M2', restHR: 62, sys: 122, dia: 78, glucose: 95, skinTemp: 33.2, sleepStartH: 23, exerciseStartH: 17, age: 38, sex: 'male' },
  { id: 'A3', name: 'Priya Nair', role: 'Medical officer', moduleId: 'M1', restHR: 66, sys: 112, dia: 72, glucose: 90, skinTemp: 33.6, sleepStartH: 22, exerciseStartH: 10, age: 45, sex: 'female' },
  { id: 'A4', name: 'Kenji Aoki', role: 'Systems specialist', moduleId: 'M2', restHR: 60, sys: 119, dia: 76, glucose: 94, skinTemp: 33.3, sleepStartH: 23.5, exerciseStartH: 16.5, age: 36, sex: 'male' },
];

export interface CabinModule { id: string; name: string; sensorId: string }
export const MODULES: CabinModule[] = [
  { id: 'M1', name: 'Hab Module 1', sensorId: 'CAB-M1' },
  { id: 'M2', name: 'Hab Module 2', sensorId: 'CAB-M2' },
  { id: 'M3', name: 'Laboratory Module', sensorId: 'CAB-M3' },
];

export const astro = (id: string) => ASTRONAUTS.find((a) => a.id === id);
export const moduleOf = (id: string) => MODULES.find((m) => m.id === id);
export const residents = (moduleId: string) => ASTRONAUTS.filter((a) => a.moduleId === moduleId);
export const subjectName = (id: string) => astro(id)?.name ?? moduleOf(id)?.name ?? id;

export function initialDevices(): Record<string, Device> {
  const d: Record<string, Device> = {};
  const mk = (id: string, kind: Device['kind'], ownerId: string, label: string, battery: number | null) => {
    d[id] = { id, kind, ownerId, label, state: 'ok', since: 0, battery, lastValidAt: null };
  };
  ASTRONAUTS.forEach((a, i) => {
    mk(`BAND-${a.id}`, 'band', a.id, 'Proposed custom band (WHOOP-inspired, simulated link)', 62 + i * 9);
    mk(`CUFF-${a.id}`, 'cuff', a.id, 'Upper-arm cuff, separate battery (simulated link)', 88 - i * 6);
    mk(`CGM-${a.id}`, 'patch', a.id, 'Glucose patch (commercial CGM reference, simulated link)', null);
  });
  MODULES.forEach((m) => mk(m.sensorId, 'cabin', m.id, 'Cabin sensor: CO₂, temperature, humidity (simulated link)', null));
  return d;
}
