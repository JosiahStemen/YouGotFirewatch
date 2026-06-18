export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getMonthDays(year, month) {
  const days = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function isDateInRange(date, start, end) {
  return date >= start && date <= end;
}

export function formatDisplayDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMonthYear(month, year) {
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function getCalendarGridOffset(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

export function isCooldownSatisfied(lastDutyDate, slotDate, cooldownDays) {
  if (!lastDutyDate) return true;
  const last = parseDate(lastDutyDate);
  const slot = parseDate(slotDate);
  const diff = Math.floor((slot - last) / (1000 * 60 * 60 * 24));
  return diff > cooldownDays;
}

export function getHalfDateRange(year, month, half, splitDay) {
  const days = getMonthDays(year, month);
  if (half === 'first') {
    const first = days.filter((d) => d.getDate() <= splitDay);
    return { start: toISODate(first[0]), end: toISODate(first[first.length - 1]) };
  }
  const second = days.filter((d) => d.getDate() > splitDay);
  return { start: toISODate(second[0]), end: toISODate(second[second.length - 1]) };
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getDayType(iso, isHolidayDay) {
  if (isHolidayDay) return 'holiday';
  const day = parseDate(iso).getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  if (day === 5) return 'friday';
  return 'weekday';
}

export function dayName(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

export function fullDayName(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}