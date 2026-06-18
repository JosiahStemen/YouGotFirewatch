/**
 * YouGotFireWatch — Two-Phase Roster Generator
 * Phase 1: Daily duties → lowest-point eligible person (hardest days first)
 * Phase 2: Supernumeraries → highest-point fully-available person per half
 */

import {
  getMonthDays, toISODate, isDateInRange, isCooldownSatisfied,
  getHalfDateRange, generateId, getDayType,
} from './dateUtils.js';
import { getUSFederalHolidays, isHoliday } from './holidays.js';
import { resolvePersonnelForMonth } from './nonAvailability.js';

function clonePersonState(personnel) {
  return personnel.map((p) => ({
    id: p.id, points: p.points, lastDutyDate: p.lastDutyDate,
    nonAvailability: [...p.nonAvailability],
  }));
}

function isAvailableOnDate(person, date) {
  return !person.nonAvailability.some((na) => isDateInRange(date, na.start, na.end));
}

function isFullyAvailableInRange(person, rangeStart, rangeEnd) {
  return !person.nonAvailability.some((na) => na.start <= rangeEnd && rangeStart <= na.end);
}

export function createMonthSlots(year, month, settings, existingSlots) {
  const days = getMonthDays(year, month);
  const holidays = getUSFederalHolidays(year);
  const map = new Map((existingSlots || []).map((s) => [s.date, s]));
  return days.map((day) => {
    const iso = toISODate(day);
    const existing = map.get(iso);
    if (existing) return { ...existing };
    const dayIsHoliday = isHoliday(iso, holidays);
    const dayType = getDayType(iso, dayIsHoliday);
    const points = settings.baselines[dayType];
    return { id: generateId(), date: iso, points, note: dayIsHoliday ? 'Federal holiday' : undefined, personId: null };
  });
}

export function createEmptySupernumeraries(settings) {
  return [
    { id: generateId(), half: 'first', personId: null, pointsAwarded: settings.supernumeraryPoints, unfilled: true },
    { id: generateId(), half: 'second', personId: null, pointsAwarded: settings.supernumeraryPoints, unfilled: true },
  ];
}

function assignDailyDuties(slots, tempState, cooldownDays) {
  const warnings = [], unassigned = [];
  const sorted = [...slots].sort((a, b) => b.points - a.points);
  const assigned = slots.map((s) => ({ ...s, personId: s.personId ?? null }));

  // Each person stands daily duty at most once per month (requires enough personnel).
  const assignedThisMonth = new Set();
  for (const slot of assigned) {
    if (slot.personId) assignedThisMonth.add(slot.personId);
  }

  for (const slot of sorted) {
    if (slot.personId) continue;

    const eligible = tempState.filter((p) =>
      isAvailableOnDate(p, slot.date) &&
      isCooldownSatisfied(p.lastDutyDate, slot.date, cooldownDays) &&
      !assignedThisMonth.has(p.id)
    );

    if (!eligible.length) {
      unassigned.push(slot.date);
      warnings.push(
        `No eligible person for ${slot.date} (${slot.points} pts) who has not already stood duty this month. Manual assignment required.`
      );
      continue;
    }

    eligible.sort((a, b) => a.points - b.points);
    const chosen = eligible[0];
    assignedThisMonth.add(chosen.id);

    const idx = assigned.findIndex((s) => s.date === slot.date);
    if (idx >= 0) assigned[idx] = { ...assigned[idx], personId: chosen.id };
    const pIdx = tempState.findIndex((p) => p.id === chosen.id);
    if (pIdx >= 0) {
      tempState[pIdx].points += slot.points;
      tempState[pIdx].lastDutyDate = slot.date;
    }
  }
  return { slots: assigned, unassigned, warnings };
}

function assignSupernumeraries(supers, tempState, year, month, splitDay) {
  const warnings = [];
  const result = supers.map((s) => ({ ...s }));

  for (const sup of result) {
    if (sup.personId) continue;
    const range = getHalfDateRange(year, month, sup.half, splitDay);
    const available = tempState.filter((p) => isFullyAvailableInRange(p, range.start, range.end));
    if (!available.length) {
      sup.unfilled = true;
      warnings.push(`No fully available person for ${sup.half}-half supernumerary (${range.start} to ${range.end}).`);
      continue;
    }
    available.sort((a, b) => b.points - a.points);
    sup.personId = available[0].id;
    sup.unfilled = false;
    const pIdx = tempState.findIndex((p) => p.id === sup.personId);
    if (pIdx >= 0) tempState[pIdx].points += sup.pointsAwarded;
  }
  return { supers: result, warnings };
}

export function generateRoster(year, month, personnel, settings, existingRoster, keepManual, editedSlots) {
  if (!personnel.length) {
    return {
      roster: { id: generateId(), month, year, slots: createMonthSlots(year, month, settings), supernumeraries: createEmptySupernumeraries(settings), finalized: false, createdAt: new Date().toISOString() },
      warnings: ['No personnel available. Add personnel before generating.'],
      unassignedSlots: [],
    };
  }

  personnel = resolvePersonnelForMonth(personnel, year, month);

  const monthDayCount = getMonthDays(year, month).length;
  const rosterWarnings = [];
  if (personnel.length < monthDayCount) {
    rosterWarnings.push(
      `Only ${personnel.length} personnel for ${monthDayCount} duty days. Each person may only stand duty once — some days may be unassigned.`
    );
  }

  let slots = editedSlots ? editedSlots.map((s) => ({ ...s })) : createMonthSlots(year, month, settings, existingRoster?.slots);
  let supernumeraries = existingRoster?.supernumeraries
    ? existingRoster.supernumeraries.map((s) => ({ ...s }))
    : createEmptySupernumeraries(settings);

  if (keepManual && existingRoster) {
    slots = slots.map((s) => {
      const ex = existingRoster.slots.find((e) => e.date === s.date);
      return ex?.personId ? { ...s, personId: ex.personId } : s;
    });
    supernumeraries = supernumeraries.map((s) => {
      const ex = existingRoster.supernumeraries.find((e) => e.half === s.half);
      return ex?.personId ? { ...ex } : s;
    });
  } else {
    slots = slots.map((s) => ({ ...s, personId: null }));
    supernumeraries = createEmptySupernumeraries(settings);
  }

  const tempState = clonePersonState(personnel);

  if (keepManual) {
    for (const slot of slots) {
      if (!slot.personId) continue;
      const idx = tempState.findIndex((p) => p.id === slot.personId);
      if (idx >= 0) { tempState[idx].points += slot.points; tempState[idx].lastDutyDate = slot.date; }
    }
    for (const sup of supernumeraries) {
      if (!sup.personId) continue;
      const idx = tempState.findIndex((p) => p.id === sup.personId);
      if (idx >= 0) tempState[idx].points += sup.pointsAwarded;
    }
  }

  const daily = assignDailyDuties(slots, tempState, settings.cooldownDays);
  const superResult = assignSupernumeraries(supernumeraries, tempState, year, month, settings.halfSplitDay);

  return {
    roster: {
      id: existingRoster?.id ?? generateId(),
      month, year,
      slots: daily.slots,
      supernumeraries: superResult.supers,
      finalized: false,
      createdAt: existingRoster?.createdAt ?? new Date().toISOString(),
    },
    warnings: [...rosterWarnings, ...daily.warnings, ...superResult.warnings],
    unassignedSlots: daily.unassigned,
  };
}

export function validateDailyAssignment(personId, date, slots, personnel) {
  if (!personId) return { valid: true, message: '' };
  const conflict = slots.find((s) => s.personId === personId && s.date !== date);
  if (conflict) {
    return {
      valid: false,
      message: `This person is already assigned on ${conflict.date}. Each member may only stand daily duty once per month.`,
    };
  }
  if (personnel) {
    const person = personnel.find((p) => p.id === personId);
    if (person?.nonAvailability?.some((na) => isDateInRange(date, na.start, na.end))) {
      return { valid: false, message: `${person.rank} ${person.name} is not available on ${date}.` };
    }
  }
  return { valid: true, message: '' };
}

export function validateSupernumeraryAssignment(personId, half, personnel, year, month, splitDay) {
  const person = personnel.find((p) => p.id === personId);
  if (!person) return { valid: false, message: 'Person not found.' };
  const range = getHalfDateRange(year, month, half, splitDay);
  const conflict = person.nonAvailability.some((na) => na.start <= range.end && range.start <= na.end);
  if (conflict) {
    return { valid: false, message: `${person.rank} ${person.name} has non-availability during the ${half} half (${range.start} to ${range.end}). Supernumeraries require full availability.` };
  }
  return { valid: true, message: 'Valid.' };
}

export function computePointDistribution(roster, personnel) {
  const dist = new Map();
  for (const p of personnel) {
    dist.set(p.id, { personId: p.id, name: p.name, rank: p.rank, currentPoints: p.points, projectedPoints: p.points, dutiesAssigned: 0, isSupernumerary: false });
  }
  for (const slot of roster.slots) {
    if (slot.personId && dist.has(slot.personId)) {
      const e = dist.get(slot.personId);
      e.projectedPoints += slot.points;
      e.dutiesAssigned++;
    }
  }
  for (const sup of roster.supernumeraries) {
    if (sup.personId && dist.has(sup.personId)) {
      const e = dist.get(sup.personId);
      e.projectedPoints += sup.pointsAwarded;
      e.isSupernumerary = true;
    }
  }
  return [...dist.values()].sort((a, b) => a.projectedPoints - b.projectedPoints);
}

export function finalizeRoster(roster, personnel, halfSplitDay) {
  const updated = personnel.map((p) => ({ ...p }));
  for (const slot of roster.slots) {
    if (!slot.personId) continue;
    const idx = updated.findIndex((p) => p.id === slot.personId);
    if (idx >= 0) { updated[idx].points += slot.points; updated[idx].lastDutyDate = slot.date; }
  }
  for (const sup of roster.supernumeraries) {
    if (!sup.personId) continue;
    const idx = updated.findIndex((p) => p.id === sup.personId);
    if (idx >= 0) {
      const range = getHalfDateRange(roster.year, roster.month, sup.half, halfSplitDay);
      const existing = updated[idx].lastDutyDate;
      updated[idx].points += sup.pointsAwarded;
      updated[idx].lastDutyDate = !existing || range.end > existing ? range.end : existing;
    }
  }
  return updated;
}

export function resetSlotsToBaseline(slots, settings, year) {
  const holidays = getUSFederalHolidays(year);
  return slots.map((slot) => {
    const dayIsHoliday = isHoliday(slot.date, holidays);
    const dayType = getDayType(slot.date, dayIsHoliday);
    return { ...slot, points: settings.baselines[dayType], note: undefined };
  });
}

export function applyWeekendHolidayDefaults(slots, settings, year) {
  const holidays = getUSFederalHolidays(year);
  return slots.map((slot) => {
    const dayIsHoliday = isHoliday(slot.date, holidays);
    const dayType = getDayType(slot.date, dayIsHoliday);
    return { ...slot, points: settings.baselines[dayType], note: dayIsHoliday ? 'Federal holiday' : slot.note };
  });
}

export function applyBulkUpdate(slots, startDate, endDate, updates) {
  return slots.map((slot) => {
    if (slot.date >= startDate && slot.date <= endDate) {
      return {
        ...slot,
        points: updates.points ?? slot.points,
        note: updates.note ? (updates.appendNote && slot.note ? `${slot.note}; ${updates.note}` : updates.note) : slot.note,
      };
    }
    return slot;
  });
}