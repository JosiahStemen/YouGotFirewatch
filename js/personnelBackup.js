/**
 * YouGotFireWatch Personnel Backup CSV (main duty roster only)
 *
 * non_availability column (month-relative when you generate):
 *   (blank) — available whole month
 *   all     — no duty assigned that month
 *   1-7     — unavailable the 1st through the 7th
 *   1-7;20-25 — multiple ranges
 */

import { generateId } from './dateUtils.js';
import { parseNonAvailabilityColumn, formatNonAvailabilityForExport } from './nonAvailability.js';

function csvField(val) {
  if (val == null || val === '') return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';') || s.includes('|')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { result.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  result.push(cur.trim());
  return result;
}

export function exportPersonnelBackup(personnel, settings) {
  const today = new Date().toISOString().split('T')[0];
  const lines = [
    '# YouGotFireWatch Personnel Backup',
    '# version,1',
    `# exported,${new Date().toISOString()}`,
    `# unit,${settings?.unitName || ''}`,
    '#',
    '# Import before generating next month. non_availability uses day-of-month:',
    '# blank = available all month | all = no duty | 1-7 = unavailable days 1-7 | 1-7;20-25 = multiple',
    '#',
    'rank,name,points,last_duty_date,section,notes,non_availability',
  ];

  for (const p of personnel) {
    lines.push([
      csvField(p.rank),
      csvField(p.name),
      p.points ?? 0,
      csvField(p.lastDutyDate || ''),
      csvField(p.section || ''),
      csvField(p.notes || ''),
      csvField(formatNonAvailabilityForExport(p)),
    ].join(','));
  }

  return { content: lines.join('\n'), filename: `YouGotFireWatch-Personnel-Backup-${today}.csv` };
}

export function parsePersonnelBackupCSV(text) {
  const dataLines = text.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('#');
  });

  if (dataLines.length < 2) {
    return { personnel: [], error: 'File is empty or missing data rows.' };
  }

  const headers = parseCSVLine(dataLines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const required = ['rank', 'name'];
  for (const r of required) {
    if (!headers.includes(r)) {
      return { personnel: [], error: `Missing required column: ${r}` };
    }
  }

  const personnel = [];
  const errors = [];

  for (let i = 1; i < dataLines.length; i++) {
    const vals = parseCSVLine(dataLines[i]);
    if (!vals.some((v) => v)) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });

    if (!row.rank || !row.name) {
      errors.push(`Row ${i + 1}: missing rank or name — skipped.`);
      continue;
    }

    const na = parseNonAvailabilityColumn(row.non_availability);
    personnel.push({
      id: generateId(),
      rank: row.rank.trim(),
      name: row.name.trim(),
      points: parseFloat(row.points) || 0,
      lastDutyDate: row.last_duty_date?.trim() || null,
      section: row.section?.trim() || undefined,
      notes: row.notes?.trim() || undefined,
      nonAvailabilityInput: na.nonAvailabilityInput,
      nonAvailability: na.nonAvailability,
    });
  }

  if (!personnel.length) {
    return { personnel: [], error: 'No valid personnel rows found.' };
  }

  return { personnel, errors, error: null };
}

export function getPersonnelBackupTemplate() {
  return [
    '# YouGotFireWatch Personnel Backup',
    '# version,1',
    '#',
    'rank,name,points,last_duty_date,section,notes,non_availability',
    'SSgt,"Martinez, J.",12,2026-05-28,Admin,,',
    'Sgt,"Thompson, R.",18,2026-05-25,Operations,,1-5',
    'Cpl,"Davis, M.",15,2026-05-22,Communications,TDY,20-25',
    'PFC,"Anderson, S.",9,2026-05-29,Supply,,10-14',
    'LCpl,"Johnson, A.",6,2026-05-31,Motor T,Leave,all',
    'Cpl,"Williams, K.",8,2026-05-30,Supply,,',
    'PFC,"Lee, D.",22,2026-05-20,Communications,Prime super candidate,',
  ].join('\n');
}