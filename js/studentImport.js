/**
 * ADNCO student CSV import / template
 */

import { generateId } from './dateUtils.js';
import { parseDayNumberInput } from './dayNumberAvailability.js';
import { formatPersonName, normalizePerson } from './personnelUtils.js';

function csvField(val) {
  if (val == null || val === '') return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
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

export function getStudentImportTemplate() {
  return [
    '# YouGotFireWatch ADNCO Student Import',
    '# studentType must be Academic or MAT',
    '# nonAvailability: simple day numbers — 5, 12-14, 20',
    'rank,lastName,firstName,phoneNumber,studentType,points,lastDutyDate,nonAvailability',
    'LCpl,Garcia,Luis,831-555-0101,MAT,4,,',
    'Cpl,Anderson,Sarah,831-555-0102,Academic,6,,"10-12, 18"',
    'PFC,Miller,James,831-555-0103,MAT,3,,5,20-22',
  ].join('\n');
}

export function parseStudentImportCSV(text) {
  const dataLines = text.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('#');
  });

  if (dataLines.length < 2) {
    return { students: [], error: 'File is empty or missing data rows.' };
  }

  const headers = parseCSVLine(dataLines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const required = ['rank', 'lastname', 'firstname', 'studenttype'];
  for (const r of required) {
    if (!headers.includes(r)) {
      return { students: [], error: `Missing required column: ${r}` };
    }
  }

  const students = [];
  const errors = [];

  for (let i = 1; i < dataLines.length; i++) {
    const vals = parseCSVLine(dataLines[i]);
    if (!vals.some((v) => v)) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });

    const studentType = row.studenttype?.trim();
    if (!row.rank || !row.lastname || !row.firstname) {
      errors.push(`Row ${i + 1}: missing rank or name — skipped.`);
      continue;
    }
    if (studentType !== 'Academic' && studentType !== 'MAT') {
      errors.push(`Row ${i + 1}: studentType must be Academic or MAT — skipped.`);
      continue;
    }

    const naRaw = row.nonavailability || row.non_availability || '';
    const na = parseDayNumberInput(naRaw);

    students.push(normalizePerson({
      id: generateId(),
      rank: row.rank.trim(),
      lastName: row.lastname.trim(),
      firstName: row.firstname.trim(),
      name: formatPersonName(row.lastname.trim(), row.firstname.trim()),
      phoneNumber: row.phonenumber?.trim() || '',
      studentType,
      points: parseFloat(row.points) || 0,
      adncoPoints: parseFloat(row.points) || 0,
      lastDutyDate: row.lastdutydate?.trim() || null,
      lastAdncoDutyDate: row.lastdutydate?.trim() || null,
      adncoNonAvailabilityInput: na.normalized || '',
      nonAvailabilityInput: '',
      nonAvailability: [],
    }));
  }

  if (!students.length) {
    return { students: [], error: 'No valid student rows found.', errors };
  }

  return { students, errors, error: null };
}

/** Merge imported students into personnel (match by rank+lastName+firstName, else add). */
export function mergeStudentsIntoPersonnel(personnel, students) {
  const list = [...personnel];
  for (const s of students) {
    const key = `${s.rank}|${s.lastName}|${s.firstName}`.toLowerCase();
    const idx = list.findIndex((p) =>
      `${p.rank}|${p.lastName || ''}|${p.firstName || ''}`.toLowerCase() === key
    );
    if (idx >= 0) {
      list[idx] = normalizePerson({ ...list[idx], ...s, id: list[idx].id });
    } else {
      list.push(s);
    }
  }
  return list;
}