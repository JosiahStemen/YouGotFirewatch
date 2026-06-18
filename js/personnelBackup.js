/**
 * YouGotFireWatch Personnel Backup CSV
 *
 * Single-file backup for names, points, last duty date, and non-availability.
 * Import before generating; export after finalizing to hand off duties.
 *
 * non_availability format: periods separated by ";", each "start|end" or "start|end|reason"
 * Example: 2026-06-01|2026-06-05|96-hour liberty;2026-06-10|2026-06-14|Leave
 */

import { generateId } from './dateUtils.js';

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

function encodeNonAvailability(na) {
  if (!na?.length) return '';
  return na.map((p) => `${p.start}|${p.end}${p.reason ? `|${p.reason}` : ''}`).join(';');
}

function decodeNonAvailability(str) {
  if (!str?.trim()) return [];
  return str.split(';').map((period) => {
    const parts = period.split('|').map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { start: parts[0], end: parts[1], reason: parts[2] || undefined };
  }).filter(Boolean);
}

export function exportPersonnelBackup(personnel, settings) {
  const today = new Date().toISOString().split('T')[0];
  const lines = [
    '# YouGotFireWatch Personnel Backup',
    '# version,1',
    `# exported,${new Date().toISOString()}`,
    `# unit,${settings?.unitName || ''}`,
    '#',
    '# Import this file to restore all personnel with points and non-availability.',
    '# non_availability: start|end|reason periods separated by semicolons',
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
      csvField(encodeNonAvailability(p.nonAvailability)),
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

    personnel.push({
      id: generateId(),
      rank: row.rank.trim(),
      name: row.name.trim(),
      points: parseFloat(row.points) || 0,
      lastDutyDate: row.last_duty_date?.trim() || null,
      section: row.section?.trim() || undefined,
      notes: row.notes?.trim() || undefined,
      nonAvailability: decodeNonAvailability(row.non_availability),
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
    'Sgt,"Thompson, R.",18,2026-05-25,Operations,,"2026-06-01|2026-06-05|96-hour liberty"',
    'Cpl,"Williams, K.",8,2026-05-30,Supply,,',
    'PFC,"Lee, D.",22,2026-05-20,Communications,Prime super candidate,',
  ].join('\n');
}