// Parser for the headers of the PhysioNet "Pulse Transit Time PPG" dataset (ODbL 1.0).
// Each header carries a comment line such as:
//   # <filename>: s1_sit <activity>: sit <gender>: female <height>: 160 <weight>: 50 <age>: 25 <bp_sys_start>: 87 ...

export interface PttRecord {
  rec: string;
  subject: number;
  activity: 'sit' | 'walk' | 'run';
  sex: 'female' | 'male' | null;
  age: number | null;
  /** Cuff blood pressure at the start and at the end of the recording (mmHg). */
  sys: [number | null, number | null];
  dia: [number | null, number | null];
  /** Mean of the two wrist-PPG derived heart rates at the start and the end (bpm). */
  hr: [number | null, number | null];
}

const num = (m: Record<string, string>, k: string): number | null => {
  const v = m[k];
  return v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
};
const avg = (a: number | null, b: number | null) => (a !== null && b !== null ? (a + b) / 2 : a ?? b);

export function parsePttHeader(txt: string): PttRecord | null {
  const meta: Record<string, string> = {};
  for (const m of txt.matchAll(/<(\w+)>:\s*([^<]+)/g)) meta[m[1]] = m[2].trim();
  const rec = meta.filename;
  const activity = meta.activity as PttRecord['activity'] | undefined;
  if (!rec || !activity || !['sit', 'walk', 'run'].includes(activity)) return null;
  const sex = meta.gender === 'female' || meta.gender === 'male' ? meta.gender : null;
  return {
    rec, subject: Number(rec.match(/^s(\d+)_/)?.[1] ?? 0), activity, sex, age: num(meta, 'age'),
    sys: [num(meta, 'bp_sys_start'), num(meta, 'bp_sys_end')],
    dia: [num(meta, 'bp_dia_start'), num(meta, 'bp_dia_end')],
    hr: [avg(num(meta, 'hr_1_start'), num(meta, 'hr_2_start')), avg(num(meta, 'hr_1_end'), num(meta, 'hr_2_end'))],
  };
}
