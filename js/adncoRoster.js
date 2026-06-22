/**
 * ADNCO Student Roster Generator
 *
 * Duty windows (shift starts at 1630 on startDate):
 *   MAT       — Sun 1630 through Fri 1630 (starts Sun–Thu)
 *   Academic  — Fri 1630 through Sun 1630 (starts Fri–Sat)
 */

import {
  getMonthDays, toISODate, parseDate, isDateInRange, generateId, formatShortDate,
} from './dateUtils.js';
import { parseDayNumberInput, resolveDayNumberRangesForMonth } from './dayNumberAvailability.js';

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

export function createAdncoSlots(year, month, existingSlots) {
  const days = getMonthDays(year, month);
  const map = new Map((existingSlots || []).map((s) => [s.startDate, s]));
  return days.map((day) => {
    const startDate = toISODate(day);
    const existing = map.get(startDate);
    if (existing) return { ...existing };

    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    const endDate = toISODate(end);
    const eligibleType = getSlotEligibleType(startDate);

    return {
      id: generateId(),
      startDate,
      endDate,
      timeLabel: formatSlotWindow(startDate, endDate),
      eligibleType,
      personId: null,
      points: 1,
    };
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
    adncoPoints: p.adncoPoints ?? p.points ?? 0,
  }));
}

function slotBlockedByNA(person, slot) {
  return person.adncoResolvedNA.some(
    (na) => isDateInRange(slot.startDate, na.start, na.end) || isDateInRange(slot.endDate, na.start, na.end)
  );
}

function compareCandidates(a, b) {
  const aPts = a.adncoPoints ?? 0;
  const bPts = b.adncoPoints ?? 0;
  if (aPts !== bPts) return aPts - bPts;
  const aLast = a.lastAdncoDutyDate || '';
  const bLast = b.lastAdncoDutyDate || '';
  if (aLast !== bLast) return aLast.localeCompare(bLast);
  return a.id.localeCompare(b.id);
}

export function generateAdncoRoster(year, month, students, existingRoster, keepManual) {
  students = (students ?? []).filter((p) => p.studentType === 'Academic' || p.studentType === 'MAT');
  const warnings = [];

  if (!students.length) {
    return {
      roster: null,
      warnings: ['No students with studentType Academic or MAT. Import a student CSV or load sample students in the ADNCO tab.'],
    };
  }

  const resolved = resolveAdncoPersonnel(students, year, month);
  let slots = createAdncoSlots(year, month, existingRoster?.slots);

  if (keepManual && existingRoster) {
    slots = slots.map((s) => {
      const ex = existingRoster.slots.find((e) => e.startDate === s.startDate);
      return ex?.personId ? { ...s, personId: ex.personId } : { ...s, personId: null };
    });
  } else {
    slots = slots.map((s) => ({ ...s, personId: null }));
  }

  const assignedThisMonth = new Set(slots.filter((s) => s.personId).map((s) => s.personId));
  const tempState = resolved.map((p) => ({ ...p }));

  const matSlots = slots.filter((s) => s.eligibleType === 'MAT' && !s.personId);
  const acSlots = slots.filter((s) => s.eligibleType === 'Academic' && !s.personId);

  if (matSlots.length && !resolved.some((p) => p.studentType === 'MAT')) {
    warnings.push(`${matSlots.length} MAT duty slot(s) but no MAT students on roster.`);
  }
  if (acSlots.length && !resolved.some((p) => p.studentType === 'Academic')) {
    warnings.push(`${acSlots.length} Academic duty slot(s) but no Academic students on roster.`);
  }

  const sorted = [...slots].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const result = slots.map((s) => ({ ...s }));

  for (const slot of sorted) {
    const idx = result.findIndex((s) => s.startDate === slot.startDate);
    if (idx < 0 || result[idx].personId) continue;

    const eligible = tempState.filter((p) =>
      p.studentType === slot.eligibleType &&
      !assignedThisMonth.has(p.id) &&
      !slotBlockedByNA(p, slot)
    );

    if (!eligible.length) {
      warnings.push(
        `No eligible ${slot.eligibleType} student for ${formatSlotWindow(slot.startDate, slot.endDate)}. Manual assignment required.`
      );
      continue;
    }

    eligible.sort(compareCandidates);
    const chosen = eligible[0];
    result[idx] = { ...result[idx], personId: chosen.id };
    assignedThisMonth.add(chosen.id);

    const tIdx = tempState.findIndex((p) => p.id === chosen.id);
    if (tIdx >= 0) {
      tempState[tIdx].adncoPoints += slot.points;
      tempState[tIdx].lastAdncoDutyDate = slot.startDate;
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
    warnings.push(`${unassigned} ADNCO slot(s) still unassigned.`);
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
      message: `${person.rank} ${person.lastName || person.name} is ${person.studentType}. This slot requires ${slot.eligibleType} (window: ${slot.eligibleType === 'MAT' ? 'Sun 1630 – Fri 1630' : 'Fri 1630 – Sun 1630'}).`,
    };
  }

  const other = roster.slots.find((s) => s.personId === personId && s.id !== slotId);
  if (other) {
    return { valid: false, message: 'This student already has an ADNCO duty this month.' };
  }

  const resolved = resolveAdncoPersonnel([person], year, month)[0];
  if (slotBlockedByNA(resolved, slot)) {
    return { valid: false, message: `${person.rank} ${person.lastName || person.name} is not available for this shift (check non-availability days).` };
  }

  return { valid: true, message: '' };
}

export function finalizeAdncoRoster(roster, students) {
  const updated = (students ?? []).map((p) => ({ ...p }));
  for (const slot of roster.slots) {
    if (!slot.personId) continue;
    const idx = updated.findIndex((p) => p.id === slot.personId);
    if (idx >= 0) {
      updated[idx].adncoPoints = (updated[idx].adncoPoints ?? updated[idx].points ?? 0) + slot.points;
      updated[idx].lastAdncoDutyDate = slot.startDate;
    }
  }
  return updated;
}

export function countAdncoStaffing(slots, students) {
  const matSlots = slots.filter((s) => s.eligibleType === 'MAT').length;
  const acSlots = slots.filter((s) => s.eligibleType === 'Academic').length;
  const matStudents = (students ?? []).filter((p) => p.studentType === 'MAT').length;
  const acStudents = (students ?? []).filter((p) => p.studentType === 'Academic').length;
  return { matSlots, acSlots, matStudents, acStudents };
}