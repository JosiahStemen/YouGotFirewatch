/**
 * Simple day-of-month non-availability for ADNCO (junior-friendly).
 * Formats: 5, 12, 15  |  3-7, 12-14, 20  |  10-12, 18, 25-27
 */

import { getMonthDays, toISODate } from './dateUtils.js';

export const DAY_NUMBER_PLACEHOLDER = '5, 12-14, 20-22';
export const DAY_NUMBER_HINT = 'Enter days you cannot do duty (example: 5, 12-14, 20-22)';

export function parseDayNumberInput(str) {
  const raw = (str ?? '').trim();
  if (!raw) return { parts: [], normalized: '', error: null };

  const lower = raw.toLowerCase();
  if (lower === 'all') {
    return { parts: ['all'], normalized: 'all', error: null };
  }

  const normalized = raw.replace(/\s/g, '').replace(/,/g, ';');
  if (!/^(\d+(-\d+)?)(;(\d+(-\d+)?))*$/i.test(normalized)) {
    return {
      parts: [],
      normalized: raw,
      error: 'Use only day numbers like 5, 12-14, 20-22',
    };
  }

  return { parts: normalized.split(';').filter(Boolean), normalized, error: null };
}

export function resolveDayNumberRangesForMonth(parts, year, month) {
  if (!parts.length) return [];

  if (parts.length === 1 && parts[0].toLowerCase() === 'all') {
    const days = getMonthDays(year, month);
    return [{
      start: toISODate(days[0]),
      end: toISODate(days[days.length - 1]),
      reason: 'all month',
    }];
  }

  const lastDay = getMonthDays(year, month).length;
  const ranges = [];

  for (const part of parts) {
    const t = part.trim();
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

  return ranges;
}

export function formatDayNumberForDisplay(input) {
  if (!input) return '';
  return input.replace(/;/g, ', ');
}