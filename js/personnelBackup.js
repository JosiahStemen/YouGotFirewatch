/**
 * YouGotFireWatch Personnel Backup CSV
 *
 * Columns: rank, lastName, firstName, phoneNumber, studentType, points,
 *          lastDutyDate, nonAvailability
 *
 * Legacy format with "name" column still supported on import.
 */

import { generateId } from './dateUtils.js';
import { parseNonAvailabilityColumn, formatNonAvailabilityForExport } from './nonAvailability.js';
import { formatPersonName, parseLegacyName, normalizePerson } from './personnelUtils.js';
import { formatDayNumberForDisplay } from './dayNumberAvailability.js';

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

function formatNAForExport(person) {
  const adnco = person.adncoNonAvailabilityInput?.trim();
  if (adnco) return formatDayNumberForDisplay(adnco);
  return formatNonAvailabilityForExport(person);
}

export function exportPersonnelBackup(personnel, settings) {
  const today = new Date().toISOString().split('T')[0];
  const lines = [
    '# YouGotFireWatch Personnel Backup',
    '# version,2',
    `# exported,${new Date().toISOString()}`,
    `# unit,${settings?.unitName || ''}`,
    '#',
    '# nonAvailability: blank=all month | all=no duty | 1-7 or 5,12-14 (day numbers)',
    '# studentType: Academic or MAT (required for ADNCO rosters)',
    '#',
    'rank,lastName,firstName,phoneNumber,studentType,points,lastDutyDate,nonAvailability',
  ];

  for (const p of personnel) {
    const norm = normalizePerson(p);
    lines.push([
      csvField(norm.rank),
      csvField(norm.lastName),
      csvField(norm.firstName),
      csvField(norm.phoneNumber || ''),
      csvField(norm.studentType || ''),
      norm.points ?? 0,
      csvField(norm.lastDutyDate || ''),
      csvField(formatNAForExport(norm)),
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
  const hasNewFormat = headers.includes('lastname') && headers.includes('firstname');
  const hasLegacy = headers.includes('name');

  if (!hasNewFormat && !hasLegacy) {
    return { personnel: [], error: 'Missing required columns: lastName & firstName (or legacy name)' };
  }
  if (!headers.includes('rank')) {
    return { personnel: [], error: 'Missing required column: rank' };
  }

  const personnel = [];
  const errors = [];

  for (let i = 1; i < dataLines.length; i++) {
    const vals = parseCSVLine(dataLines[i]);
    if (!vals.some((v) => v)) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });

    let lastName = row.lastname?.trim() || '';
    let firstName = row.firstname?.trim() || '';

    if (!lastName && row.name) {
      const parsed = parseLegacyName(row.name);
      lastName = parsed.lastName;
      firstName = parsed.firstName;
    }

    if (!row.rank || !lastName) {
      errors.push(`Row ${i + 1}: missing rank or name — skipped.`);
      continue;
    }

    const studentType = row.studenttype?.trim();
    const naRaw = row.nonavailability || row.non_availability || '';
    const na = parseNonAvailabilityColumn(naRaw);

    personnel.push(normalizePerson({
      id: generateId(),
      rank: row.rank.trim(),
      lastName,
      firstName,
      name: formatPersonName(lastName, firstName),
      phoneNumber: row.phonenumber?.trim() || '',
      studentType: studentType === 'Academic' || studentType === 'MAT' ? studentType : undefined,
      points: parseFloat(row.points) || 0,
      adncoPoints: parseFloat(row.points) || 0,
      lastDutyDate: row.lastdutydate?.trim() || row.last_duty_date?.trim() || null,
      lastAdncoDutyDate: row.lastdutydate?.trim() || row.last_duty_date?.trim() || null,
      section: row.section?.trim() || undefined,
      notes: row.notes?.trim() || undefined,
      nonAvailabilityInput: na.nonAvailabilityInput,
      nonAvailability: na.nonAvailability,
      adncoNonAvailabilityInput: na.nonAvailabilityInput || '',
    }));
  }

  if (!personnel.length) {
    return { personnel: [], error: 'No valid personnel rows found.' };
  }

  return { personnel, errors, error: null };
}

export function getPersonnelBackupTemplate() {
  return [
    '# YouGotFireWatch Personnel Backup',
    '# version,2',
    '#',
    'rank,lastName,firstName,phoneNumber,studentType,points,lastDutyDate,nonAvailability',
    'SSgt,Martinez,Jose,831-555-1001,,12,2026-05-28,',
    'Sgt,Thompson,Rachel,831-555-1002,MAT,18,2026-05-25,1-5',
    'Cpl,Davis,Michael,831-555-1003,Academic,15,2026-05-22,"10-12, 18"',
    'PFC,Anderson,Sarah,831-555-1004,MAT,9,2026-05-29,',
    'LCpl,Johnson,Alex,831-555-1005,Academic,6,2026-05-31,all',
    'PFC,Lee,Daniel,831-555-1006,,22,2026-05-20,',
  ].join('\n');
}