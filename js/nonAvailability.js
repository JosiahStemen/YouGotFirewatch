/**
 * Non-availability for personnel backup CSV (month-relative).
 *
 * non_availability column formats:
 *   (blank)  — available entire month
 *   all      — not assigned any duty that month
 *   1-7      — unavailable days 1 through 7 of the roster month
 *   1-7;20-25 — multiple ranges (semicolon-separated)
 *   15       — single day only
 *
 * Legacy absolute dates (2026-06-01|2026-06-05) still supported on import.
 */

import { getMonthDays, toISODate } from './dateUtils.js';

export function parseNonAvailabilityColumn(str) {
  const raw = (str ?? '').trim();
  if (!raw) {
    return { nonAvailabilityInput: '', nonAvailability: [] };
  }

  const lower = raw.toLowerCase();
  if (lower === 'all') {
    return { nonAvailabilityInput: 'all', nonAvailability: [] };
  }

  // Month-relative day ranges: 1-7, 1-7;20-25, 5,12,15 or 3-7, 12-14
  const normalized = raw.replace(/\s/g, '').replace(/,/g, ';');
  if (/^(\d+(-\d+)?)(;(\d+(-\d+)?))*$/i.test(normalized)) {
    return { nonAvailabilityInput: normalized, nonAvailability: [] };
  }

  // Legacy: 2026-06-01|2026-06-05|reason
  const legacy = raw.split(';').map((period) => {
    const parts = period.split('|').map((s) => s.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { start: parts[0], end: parts[1], reason: parts[2] || undefined };
  }).filter(Boolean);

  if (legacy.length) {
    return { nonAvailabilityInput: '', nonAvailability: legacy };
  }

  return { nonAvailabilityInput: raw, nonAvailability: [] };
}

export function resolveNonAvailabilityForMonth(person, year, month) {
  const input = (person.nonAvailabilityInput ?? '').trim().toLowerCase();

  if (input === 'all') {
    const days = getMonthDays(year, month);
    return [{
      start: toISODate(days[0]),
      end: toISODate(days[days.length - 1]),
      reason: 'all month',
    }];
  }

  if (input) {
    const lastDay = getMonthDays(year, month).length;
    const ranges = [];

    for (const part of input.split(/[;,]/)) {
      const t = part.trim().replace(/\s/g, '');
      if (!t) continue;

      const rangeMatch = t.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        let startDay = parseInt(rangeMatch[1], 10);
        let endDay = parseInt(rangeMatch[2], 10);
        if (startDay > endDay) [startDay, endDay] = [endDay, startDay];
        startDay = Math.max(1, Math.min(startDay, lastDay));
        endDay = Math.max(startDay, Math.min(endDay, lastDay));
        ranges.push({
          start: toISODate(new Date(year, month - 1, startDay)),
          end: toISODate(new Date(year, month - 1, endDay)),
        });
        continue;
      }

      const singleMatch = t.match(/^(\d+)$/);
      if (singleMatch) {
        const d = Math.max(1, Math.min(parseInt(singleMatch[1], 10), lastDay));
        const iso = toISODate(new Date(year, month - 1, d));
        ranges.push({ start: iso, end: iso });
      }
    }

    if (ranges.length) return ranges;
  }

  return [...(person.nonAvailability ?? [])];
}

export function resolvePersonnelForMonth(personnel, year, month) {
  return personnel.map((p) => ({
    ...p,
    nonAvailability: resolveNonAvailabilityForMonth(p, year, month),
  }));
}

export function formatNonAvailabilityForExport(person) {
  if (person.nonAvailabilityInput != null && person.nonAvailabilityInput !== '') {
    return person.nonAvailabilityInput;
  }
  return '';
}

export function describeNonAvailability(person, year, month) {
  const input = (person.nonAvailabilityInput ?? '').trim();
  if (input === 'all') return 'Unavailable all month';
  if (input) return `Unavailable days: ${input}`;
  const resolved = resolveNonAvailabilityForMonth(person, year, month);
  if (!resolved.length) return '';
  return resolved.map((na) => `${na.start}–${na.end}`).join('; ');
}