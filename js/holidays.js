function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return new Date(year, month - 1, 1);
}

function lastWeekdayOfMonth(year, month, weekday) {
  const d = new Date(year, month, 0);
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) return new Date(d);
    d.setDate(d.getDate() - 1);
  }
  return new Date(year, month, 0);
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function observed(date) {
  const d = new Date(date);
  if (d.getDay() === 0) { d.setDate(d.getDate() + 1); return toISO(d); }
  if (d.getDay() === 6) { d.setDate(d.getDate() - 1); return toISO(d); }
  return toISO(d);
}

export function getUSFederalHolidays(year) {
  const holidays = new Set();
  holidays.add(observed(new Date(year, 0, 1)));
  holidays.add(toISO(nthWeekdayOfMonth(year, 1, 1, 3)));
  holidays.add(toISO(nthWeekdayOfMonth(year, 2, 1, 3)));
  holidays.add(toISO(lastWeekdayOfMonth(year, 5, 1)));
  holidays.add(observed(new Date(year, 5, 19)));
  holidays.add(observed(new Date(year, 6, 4)));
  holidays.add(toISO(nthWeekdayOfMonth(year, 9, 1, 1)));
  holidays.add(toISO(nthWeekdayOfMonth(year, 10, 1, 2)));
  holidays.add(observed(new Date(year, 10, 11)));
  holidays.add(toISO(nthWeekdayOfMonth(year, 11, 4, 4)));
  holidays.add(observed(new Date(year, 11, 25)));
  return holidays;
}

export function isHoliday(iso, yearHolidays) {
  const year = parseInt(iso.slice(0, 4), 10);
  const holidays = yearHolidays || getUSFederalHolidays(year);
  return holidays.has(iso);
}

const HOLIDAY_NAMES = {
  "01-01": "New Year's Day", "01": "MLK Day", "02": "Presidents' Day",
  "05": "Memorial Day", "06-19": "Juneteenth", "07-04": "Independence Day",
  "09": "Labor Day", "10": "Columbus Day", "11-11": "Veterans Day",
  "11": "Thanksgiving", "12-25": "Christmas Day",
};

export function getHolidayName(iso) {
  const year = parseInt(iso.slice(0, 4), 10);
  if (!getUSFederalHolidays(year).has(iso)) return null;
  return 'Federal Holiday';
}