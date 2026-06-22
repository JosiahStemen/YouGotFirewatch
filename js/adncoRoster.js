/**
 * ADNCO Student Roster Generator
 *
 * Each duty period needs 5 positions:
 *   Bldg 827 (DNCO — LCpl), Bldg 827 #2, 2× Building 829, 1× Duty Driver (licensed)
 *
 * Duty changeover is 0630 daily, except Friday and Sunday end at 1630:
 *   MAT:       Sun 1630→Mon 0630, Mon 0630→Tue 0630 … Thu 0630→Fri 0630, Fri 0630→Fri 1630
 *   Academic:  Fri 1630→Sat 0630, Sat 0630→Sun 0630, Sun 0630→Sun 1630
 */

import {
  getMonthDays, toISODate, parseDate, isDateInRange, generateId, formatShortDate,
} from './dateUtils.js';
import { parseDayNumberInput, resolveDayNumberRangesForMonth } from './dayNumberAvailability.js';

export const ADNCO_POSITIONS = [
  { position: '827-1', label: 'Bldg 827 (DNCO)', requiresLcpl: true },
  { position: '827-2', label: 'Bldg 827 #2' },
  { position: '829-1', label: 'Bldg 829 #1' },
  { position: '829-2', label: 'Bldg 829 #2' },
  { position: 'driver', label: 'Duty Driver', requiresDriversLicense: true },
];

const PERIOD_SORT = { am: 0, day: 1, pm: 2 };

export function isLcplRank(rank) {
  return String(rank ?? '').trim().toLowerCase() === 'lcpl';
}

export function hasDriversLicense(person) {
  return person?.driversLicense === true;
}

export function personEligibleForAdncoSlot(person, slot) {
  if (!person || !slot) return false;
  if (person.studentType !== slot.eligibleType) return false;
  if (slot.position === '827-1' && !isLcplRank(person.rank)) return false;
  if (slot.position === 'driver' && !hasDriversLicense(person)) return false;
  return true;
}

export function getEligibleStudentsForSlot(slot, students) {
  return (students ?? []).filter((s) => personEligibleForAdncoSlot(s, slot));
}

function nextDayIso(iso) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

export function formatDutyWindow(startDate, startTime, endDate, endTime) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const startLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${startLabel} ${startTime} → ${endLabel} ${endTime}`;
}

/** Duty periods that start on this calendar date. */
export function getDutyPeriodsForDate(startDateIso) {
  const dow = parseDate(startDateIso).getDay();
  if (dow === 0) {
    return [
      { periodId: 'am', eligibleType: 'Academic', startTime: '0630', endDate: startDateIso, endTime: '1630' },
      { periodId: 'pm', eligibleType: 'MAT', startTime: '1630', endDate: nextDayIso(startDateIso), endTime: '0630' },
    ];
  }
  if (dow >= 1 && dow <= 4) {
    return [
      { periodId: 'day', eligibleType: 'MAT', startTime: '0630', endDate: nextDayIso(startDateIso), endTime: '0630' },
    ];
  }
  if (dow === 5) {
    return [
      { periodId: 'am', eligibleType: 'MAT', startTime: '0630', endDate: startDateIso, endTime: '1630' },
      { periodId: 'pm', eligibleType: 'Academic', startTime: '1630', endDate: nextDayIso(startDateIso), endTime: '0630' },
    ];
  }
  return [
    { periodId: 'day', eligibleType: 'Academic', startTime: '0630', endDate: nextDayIso(startDateIso), endTime: '0630' },
  ];
}

export function inferLegacyPeriodId(startDateIso) {
  const dow = parseDate(startDateIso).getDay();
  if (dow === 0 || dow === 5) return 'pm';
  return 'day';
}

function slotKey(startDate, periodId, position) {
  return `${startDate}|${periodId}|${position}`;
}

function legacySlotKey(startDate, position) {
  return `${startDate}|${position}`;
}

function periodKey(startDate, periodId) {
  return `${startDate}|${periodId}`;
}

function migrateLegacySlots(existingSlots, year, month) {
  if (!existingSlots?.length) return existingSlots;
  if (!existingSlots[0].position) {
    const legacyByDate = new Map(existingSlots.map((s) => [s.startDate, s]));
    return createAdncoSlots(year, month, null).map((slot) => {
      const leg = legacyByDate.get(slot.startDate);
      if (leg?.personId && slot.position === '827-1' && slot.periodId === inferLegacyPeriodId(slot.startDate)) {
        return { ...slot, personId: leg.personId };
      }
      return slot;
    });
  }
  return existingSlots.map((s) => {
    const periodId = s.periodId ?? inferLegacyPeriodId(s.startDate);
    const period = getDutyPeriodsForDate(s.startDate).find((p) => p.periodId === periodId)
      ?? getDutyPeriodsForDate(s.startDate)[0];
    return {
      ...s,
      periodId,
      startTime: s.startTime ?? period.startTime,
      endDate: s.endDate ?? period.endDate,
      endTime: s.endTime ?? period.endTime,
      eligibleType: s.eligibleType ?? period.eligibleType,
      timeLabel: s.timeLabel ?? formatDutyWindow(s.startDate, period.startTime, period.endDate, period.endTime),
    };
  });
}

export function createAdncoSlots(year, month, existingSlots) {
  const normalized = migrateLegacySlots(existingSlots, year, month);
  const days = getMonthDays(year, month);
  const existingByKey = new Map();
  for (const s of normalized ?? []) {
    const pid = s.periodId ?? inferLegacyPeriodId(s.startDate);
    existingByKey.set(slotKey(s.startDate, pid, s.position), s);
    if (!s.periodId) existingByKey.set(legacySlotKey(s.startDate, s.position), s);
  }

  const slots = [];
  for (const day of days) {
    const startDate = toISODate(day);
    for (const period of getDutyPeriodsForDate(startDate)) {
      const timeLabel = formatDutyWindow(startDate, period.startTime, period.endDate, period.endTime);
      for (const pos of ADNCO_POSITIONS) {
        const key = slotKey(startDate, period.periodId, pos.position);
        const existing = existingByKey.get(key) ?? existingByKey.get(legacySlotKey(startDate, pos.position));
        if (existing) {
          slots.push({
            ...existing,
            periodId: period.periodId,
            startTime: period.startTime,
            endDate: period.endDate,
            endTime: period.endTime,
            timeLabel,
            eligibleType: period.eligibleType,
            position: pos.position,
            positionLabel: pos.label,
          });
          continue;
        }
        slots.push({
          id: generateId(),
          startDate,
          periodId: period.periodId,
          startTime: period.startTime,
          endDate: period.endDate,
          endTime: period.endTime,
          timeLabel,
          eligibleType: period.eligibleType,
          position: pos.position,
          positionLabel: pos.label,
          personId: null,
        });
      }
    }
  }

  return slots;
}

/** One entry per duty period (Fri/Sun may have two per calendar date). */
export function groupAdncoSlotsByDay(slots) {
  const map = new Map();
  for (const slot of slots ?? []) {
    const periodId = slot.periodId ?? inferLegacyPeriodId(slot.startDate);
    const key = periodKey(slot.startDate, periodId);
    if (!map.has(key)) {
      map.set(key, {
        startDate: slot.startDate,
        periodId,
        endDate: slot.endDate,
        timeLabel: slot.timeLabel,
        eligibleType: slot.eligibleType,
        positions: {},
      });
    }
    const group = map.get(key);
    group.positions[slot.position] = slot;
    if (slot.timeLabel) group.timeLabel = slot.timeLabel;
    if (slot.eligibleType) group.eligibleType = slot.eligibleType;
  }
  return [...map.values()].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
    || (PERIOD_SORT[a.periodId] ?? 1) - (PERIOD_SORT[b.periodId] ?? 1)
  );
}

/** Aggregate duty periods onto calendar dates for the month grid. */
export function groupAdncoCalendarDays(slots, year, month) {
  const periods = groupAdncoSlotsByDay(slots);
  const byDate = new Map();
  for (const p of periods) {
    if (!byDate.has(p.startDate)) byDate.set(p.startDate, []);
    byDate.get(p.startDate).push(p);
  }
  return getMonthDays(year, month).map((day) => {
    const startDate = toISODate(day);
    return { startDate, periods: byDate.get(startDate) ?? [] };
  });
}

export function resolveAdncoNonAvailability(person, year, month) {
  const input = person.adncoNonAvailabilityInput ?? '';
  if (!input.trim()) return [];
  const parsed = parseDayNumberInput(input);
  if (parsed.error) return [];
  return resolveDayNumberRangesForMonth(parsed.parts, year, month);
}

export function resolveAdncoPersonnel(personnel, year, month) {
  return personnel.map((p) => ({
    ...p,
    adncoResolvedNA: resolveAdncoNonAvailability(p, year, month),
  }));
}

function slotBlockedByNA(person, slot) {
  return person.adncoResolvedNA.some(
    (na) => isDateInRange(slot.startDate, na.start, na.end) || isDateInRange(slot.endDate, na.start, na.end)
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickFairRandom(resolved, slot, assignedToday, assignmentCount) {
  const pool = resolved.filter(
    (p) =>
      personEligibleForAdncoSlot(p, slot) &&
      !assignedToday.has(p.id) &&
      !slotBlockedByNA(p, slot)
  );
  if (!pool.length) return null;

  const minCount = Math.min(...pool.map((p) => assignmentCount.get(p.id) || 0));
  const fairest = pool.filter((p) => (assignmentCount.get(p.id) || 0) === minCount);
  return shuffle(fairest)[0];
}

export function generateAdncoRoster(year, month, students, existingRoster, keepManual, editedSlots) {
  students = (students ?? []).filter((p) => p.studentType === 'Academic' || p.studentType === 'MAT');
  const warnings = [];

  if (!students.length) {
    return {
      roster: null,
      warnings: ['No students with studentType Academic or MAT. Import a student CSV or load sample students in the ADNCO tab.'],
    };
  }

  const resolved = resolveAdncoPersonnel(students, year, month);
  let slots = editedSlots?.length
    ? editedSlots.map((s) => ({ ...s, periodId: s.periodId ?? inferLegacyPeriodId(s.startDate) }))
    : createAdncoSlots(year, month, existingRoster?.slots);

  if (keepManual && existingRoster) {
    const manualByKey = new Map(
      existingRoster.slots
        .filter((s) => s.personId)
        .map((s) => [slotKey(s.startDate, s.periodId ?? inferLegacyPeriodId(s.startDate), s.position), s.personId])
    );
    slots = slots.map((s) => {
      const key = slotKey(s.startDate, s.periodId ?? inferLegacyPeriodId(s.startDate), s.position);
      if (manualByKey.has(key)) return { ...s, personId: manualByKey.get(key) };
      return { ...s, personId: null };
    });
  } else if (!keepManual) {
    slots = slots.map((s) => ({ ...s, personId: null }));
  }

  const assignmentCount = new Map();
  for (const s of slots) {
    if (s.personId) {
      assignmentCount.set(s.personId, (assignmentCount.get(s.personId) || 0) + 1);
    }
  }

  const periodGroups = groupAdncoSlotsByDay(slots);
  const matPeriods = periodGroups.filter((p) => p.eligibleType === 'MAT').length;
  const acPeriods = periodGroups.filter((p) => p.eligibleType === 'Academic').length;

  if (matPeriods && !resolved.some((p) => p.studentType === 'MAT')) {
    warnings.push(`${matPeriods} MAT duty period(s) but no MAT students on roster.`);
  }
  if (acPeriods && !resolved.some((p) => p.studentType === 'Academic')) {
    warnings.push(`${acPeriods} Academic duty period(s) but no Academic students on roster.`);
  }
  if (matPeriods && !resolved.some((p) => p.studentType === 'MAT' && isLcplRank(p.rank))) {
    warnings.push('MAT periods require LCpls for Bldg 827 (DNCO) — no MAT LCpls on roster.');
  }
  if (acPeriods && !resolved.some((p) => p.studentType === 'Academic' && isLcplRank(p.rank))) {
    warnings.push('Academic periods require LCpls for Bldg 827 (DNCO) — no Academic LCpls on roster.');
  }

  const periodKeys = shuffle(periodGroups.map((p) => periodKey(p.startDate, p.periodId)));
  const result = slots.map((s) => ({ ...s }));

  for (const key of periodKeys) {
    const [startDate, periodId] = key.split('|');
    const assignedInPeriod = new Set(
      result
        .filter((s) => s.startDate === startDate && (s.periodId ?? inferLegacyPeriodId(s.startDate)) === periodId && s.personId)
        .map((s) => s.personId)
    );

    const periodSlots = ADNCO_POSITIONS.map((pos) =>
      result.find((s) =>
        s.startDate === startDate
        && (s.periodId ?? inferLegacyPeriodId(s.startDate)) === periodId
        && s.position === pos.position
      )
    ).filter(Boolean);

    for (const slot of periodSlots) {
      if (slot.personId) continue;

      const chosen = pickFairRandom(resolved, slot, assignedInPeriod, assignmentCount);
      if (!chosen) {
        warnings.push(
          `No eligible ${slot.eligibleType} student for ${slot.positionLabel} on ${slot.timeLabel}.`
        );
        continue;
      }

      const idx = result.findIndex((s) => s.id === slot.id);
      if (idx >= 0) {
        result[idx] = { ...result[idx], personId: chosen.id };
        assignedInPeriod.add(chosen.id);
        assignmentCount.set(chosen.id, (assignmentCount.get(chosen.id) || 0) + 1);
      }
    }
  }

  const roster = {
    id: existingRoster?.id ?? generateId(),
    type: 'adnco',
    month,
    year,
    slots: result,
    finalized: false,
    createdAt: existingRoster?.createdAt ?? new Date().toISOString(),
  };

  const unassigned = result.filter((s) => !s.personId).length;
  if (unassigned) {
    warnings.push(`${unassigned} position(s) still unassigned — add students or reduce non-availability.`);
  }

  return { roster, warnings };
}

export function validateAdncoAssignment(personId, slotId, roster, students, year, month) {
  if (!personId) return { valid: true, message: '' };
  const slot = roster.slots.find((s) => s.id === slotId);
  const person = (students ?? []).find((p) => p.id === personId);
  if (!slot || !person) return { valid: false, message: 'Invalid slot or person.' };

  if (person.studentType !== slot.eligibleType) {
    return {
      valid: false,
      message: `${person.rank} ${person.lastName || person.name} is ${person.studentType}. This period requires ${slot.eligibleType} students.`,
    };
  }

  if (slot.position === '827-1' && !isLcplRank(person.rank)) {
    return {
      valid: false,
      message: `Bldg 827 (DNCO) requires an LCpl. ${person.rank} ${person.lastName || person.name} is not eligible.`,
    };
  }

  if (slot.position === 'driver' && !hasDriversLicense(person)) {
    return {
      valid: false,
      message: `${person.rank} ${person.lastName || person.name} does not have a driver's license (driversLicense must be Y in the student CSV).`,
    };
  }

  const slotPeriodId = slot.periodId ?? inferLegacyPeriodId(slot.startDate);
  const samePeriod = roster.slots.find(
    (s) =>
      s.startDate === slot.startDate
      && (s.periodId ?? inferLegacyPeriodId(s.startDate)) === slotPeriodId
      && s.personId === personId
      && s.id !== slotId
  );
  if (samePeriod) {
    return {
      valid: false,
      message: `${person.rank} ${person.lastName || person.name} is already assigned ${samePeriod.positionLabel} that same duty period.`,
    };
  }

  const resolved = resolveAdncoPersonnel([person], year, month)[0];
  if (slotBlockedByNA(resolved, slot)) {
    return {
      valid: false,
      message: `${person.rank} ${person.lastName || person.name} is not available for this shift (check non-availability days).`,
    };
  }

  return { valid: true, message: '' };
}

export function finalizeAdncoRoster(roster, students) {
  const updated = (students ?? []).map((p) => ({ ...p }));
  for (const slot of roster.slots) {
    if (!slot.personId) continue;
    const idx = updated.findIndex((p) => p.id === slot.personId);
    if (idx >= 0) {
      const prev = updated[idx].lastAdncoDutyDate;
      if (!prev || slot.startDate > prev) {
        updated[idx].lastAdncoDutyDate = slot.startDate;
      }
      updated[idx].adncoDutyCount = (updated[idx].adncoDutyCount ?? 0) + 1;
    }
  }
  return updated;
}

export function countAdncoStaffing(slots, students) {
  const periods = groupAdncoSlotsByDay(slots);
  const matPeriods = periods.filter((p) => p.eligibleType === 'MAT').length;
  const acPeriods = periods.filter((p) => p.eligibleType === 'Academic').length;
  const positionsPerPeriod = ADNCO_POSITIONS.length;
  const matStudents = (students ?? []).filter((p) => p.studentType === 'MAT').length;
  const acStudents = (students ?? []).filter((p) => p.studentType === 'Academic').length;
  return {
    matNights: matPeriods,
    acNights: acPeriods,
    matPositions: matPeriods * positionsPerPeriod,
    acPositions: acPeriods * positionsPerPeriod,
    matStudents,
    acStudents,
    positionsPerNight: positionsPerPeriod,
    positionsPerPeriod,
  };
}