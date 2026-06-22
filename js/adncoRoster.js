/**
 * ADNCO Student Roster Generator
 *
 * Each duty night (1630 start) needs 5 positions:
 *   2× Building 829, 2× Building 827, 1× Duty Driver
 *
 * Duty windows (shift starts at 1630 on startDate):
 *   MAT       — Sun 1630 through Fri 1630 (starts Sun–Thu)
 *   Academic  — Fri 1630 through Sun 1630 (starts Fri–Sat)
 *
 * Assignment: randomized fair rotation — students with fewer duties this month
 * are preferred; no one is assigned twice the same night.
 */

import {
  getMonthDays, toISODate, parseDate, isDateInRange, generateId, formatShortDate,
} from './dateUtils.js';
import { parseDayNumberInput, resolveDayNumberRangesForMonth } from './dayNumberAvailability.js';

export const ADNCO_POSITIONS = [
  { position: '829-1', label: 'Bldg 829 #1' },
  { position: '829-2', label: 'Bldg 829 #2' },
  { position: '827-1', label: 'Bldg 827 #1' },
  { position: '827-2', label: 'Bldg 827 #2' },
  { position: 'driver', label: 'Duty Driver' },
];

export function getSlotEligibleType(startDateIso) {
  const dow = parseDate(startDateIso).getDay();
  if (dow === 5 || dow === 6) return 'Academic';
  return 'MAT';
}

export function formatSlotWindow(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const startLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${startLabel} 1630 → ${endLabel} 1630`;
}

function slotKey(startDate, position) {
  return `${startDate}|${position}`;
}

function migrateLegacySlots(existingSlots, year, month) {
  if (!existingSlots?.length || existingSlots[0].position) return existingSlots;

  const legacyByDate = new Map(existingSlots.map((s) => [s.startDate, s]));
  return createAdncoSlots(year, month, null).map((slot) => {
    const leg = legacyByDate.get(slot.startDate);
    if (leg?.personId && slot.position === '829-1') {
      return { ...slot, personId: leg.personId };
    }
    return slot;
  });
}

export function createAdncoSlots(year, month, existingSlots) {
  const normalized = migrateLegacySlots(existingSlots, year, month);
  const days = getMonthDays(year, month);
  const existingByKey = new Map(
    (normalized || []).map((s) => [slotKey(s.startDate, s.position), s])
  );
  const slots = [];

  for (const day of days) {
    const startDate = toISODate(day);
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    const endDate = toISODate(end);
    const eligibleType = getSlotEligibleType(startDate);
    const timeLabel = formatSlotWindow(startDate, endDate);

    for (const pos of ADNCO_POSITIONS) {
      const key = slotKey(startDate, pos.position);
      const existing = existingByKey.get(key);
      if (existing) {
        slots.push({ ...existing, position: pos.position, positionLabel: pos.label });
        continue;
      }
      slots.push({
        id: generateId(),
        startDate,
        endDate,
        timeLabel,
        eligibleType,
        position: pos.position,
        positionLabel: pos.label,
        personId: null,
      });
    }
  }

  return slots;
}

export function groupAdncoSlotsByDay(slots) {
  const map = new Map();
  for (const slot of slots ?? []) {
    if (!map.has(slot.startDate)) {
      map.set(slot.startDate, {
        startDate: slot.startDate,
        timeLabel: slot.timeLabel,
        eligibleType: slot.eligibleType,
        positions: {},
      });
    }
    map.get(slot.startDate).positions[slot.position] = slot;
  }
  return [...map.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
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
      p.studentType === slot.eligibleType &&
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
    ? editedSlots.map((s) => ({ ...s }))
    : createAdncoSlots(year, month, existingRoster?.slots);

  if (keepManual && existingRoster) {
    const manualByKey = new Map(
      existingRoster.slots
        .filter((s) => s.personId)
        .map((s) => [slotKey(s.startDate, s.position), s.personId])
    );
    slots = slots.map((s) => {
      const key = slotKey(s.startDate, s.position);
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

  const matDays = new Set(slots.filter((s) => s.eligibleType === 'MAT').map((s) => s.startDate)).size;
  const acDays = new Set(slots.filter((s) => s.eligibleType === 'Academic').map((s) => s.startDate)).size;

  if (matDays && !resolved.some((p) => p.studentType === 'MAT')) {
    warnings.push(`${matDays} MAT duty night(s) but no MAT students on roster.`);
  }
  if (acDays && !resolved.some((p) => p.studentType === 'Academic')) {
    warnings.push(`${acDays} Academic duty night(s) but no Academic students on roster.`);
  }

  const days = shuffle([...new Set(slots.map((s) => s.startDate))]);
  const result = slots.map((s) => ({ ...s }));

  for (const startDate of days) {
    const assignedToday = new Set(
      result.filter((s) => s.startDate === startDate && s.personId).map((s) => s.personId)
    );

    const daySlots = ADNCO_POSITIONS.map((pos) =>
      result.find((s) => s.startDate === startDate && s.position === pos.position)
    ).filter(Boolean);

    for (const slot of daySlots) {
      if (slot.personId) continue;

      const chosen = pickFairRandom(resolved, slot, assignedToday, assignmentCount);
      if (!chosen) {
        warnings.push(
          `No eligible ${slot.eligibleType} student for ${slot.positionLabel} on ${formatSlotWindow(slot.startDate, slot.endDate)}.`
        );
        continue;
      }

      const idx = result.findIndex((s) => s.id === slot.id);
      if (idx >= 0) {
        result[idx] = { ...result[idx], personId: chosen.id };
        assignedToday.add(chosen.id);
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
      message: `${person.rank} ${person.lastName || person.name} is ${person.studentType}. This night requires ${slot.eligibleType} students.`,
    };
  }

  const sameNight = roster.slots.find(
    (s) => s.startDate === slot.startDate && s.personId === personId && s.id !== slotId
  );
  if (sameNight) {
    return {
      valid: false,
      message: `${person.rank} ${person.lastName || person.name} is already assigned ${sameNight.positionLabel} that same night.`,
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
  const matNights = new Set((slots ?? []).filter((s) => s.eligibleType === 'MAT').map((s) => s.startDate)).size;
  const acNights = new Set((slots ?? []).filter((s) => s.eligibleType === 'Academic').map((s) => s.startDate)).size;
  const positionsPerNight = ADNCO_POSITIONS.length;
  const matStudents = (students ?? []).filter((p) => p.studentType === 'MAT').length;
  const acStudents = (students ?? []).filter((p) => p.studentType === 'Academic').length;
  return {
    matNights,
    acNights,
    matPositions: matNights * positionsPerNight,
    acPositions: acNights * positionsPerNight,
    matStudents,
    acStudents,
    positionsPerNight,
  };
}