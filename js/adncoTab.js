/**
 * ADNCO Student Rosters tab — fully separate from main duty roster
 */

import { formatMonthYear } from './dateUtils.js';
import {
  generateAdncoRoster, validateAdncoAssignment, finalizeAdncoRoster,
  createAdncoSlots, countAdncoStaffing, groupAdncoSlotsByDay, ADNCO_POSITIONS,
} from './adncoRoster.js';
import { exportAdncoCSV, openAdncoPrintout } from './adncoExport.js';
import {
  getStudentImportTemplate, parseStudentImportCSV, mergeStudentsIntoRoster,
  exportAdncoStudentsCSV,
} from './studentImport.js';
import { createSampleAdncoStudents } from './sampleData.js';
import { DAY_NUMBER_HINT } from './dayNumberAvailability.js';
import { adncoDisplayName } from './personnelUtils.js';
import { openCSVInNewTab } from './export.js';

export function createAdncoUiDefaults() {
  const now = new Date();
  return {
    adncoYear: now.getFullYear(),
    adncoMonth: now.getMonth() + 1,
    adncoGenerated: false,
    adncoWarnings: [],
    adncoKeepManual: false,
    adncoSlots: [],
    viewingAdncoHistory: null,
  };
}

function syncAdncoSlots(ctx) {
  const { state, ui, persist } = ctx;
  if (state.currentAdncoRoster) {
    state.currentAdncoRoster = { ...state.currentAdncoRoster, slots: ui.adncoSlots };
    persist();
  }
}

function renderPositionCell(slot, students, map, readOnly, esc) {
  const p = slot?.personId ? map.get(slot.personId) : null;
  if (readOnly || !slot) {
    return p
      ? `<div><strong>${esc(p.rank)} ${esc(p.lastName)}, ${esc(p.firstName)}</strong>${p.phoneNumber ? `<div class="adnco-phone text-xs">${esc(p.phoneNumber)}</div>` : ''}</div>`
      : '<span class="text-amber">—</span>';
  }
  const eligible = students.filter((s) => s.studentType === slot.eligibleType);
  return `<select class="input" style="font-size:0.7rem;width:100%;min-width:7rem" data-action="adnco-reassign" data-slot-id="${slot.id}">
    <option value="">Unassigned</option>
    ${eligible.map((s) => `<option value="${s.id}" ${slot.personId === s.id ? 'selected' : ''}>${esc(adncoDisplayName(s))}</option>`).join('')}
  </select>`;
}

export function renderAdncoTab(ctx) {
  const { state, ui, esc } = ctx;
  const students = state.adncoStudents ?? [];

  if (!students.length) {
    return `<div class="adnco-header mb-4">
      <h2 style="font-size:1.25rem;font-weight:600">Generate ADNCOs</h2>
      <p class="text-sm text-muted">Completely separate from Personnel and main OOD duty</p>
    </div>
    <div class="empty-state"><div class="empty-icon">🎓</div><h3>No Students Yet</h3>
      <p>Import a student CSV or load sample students. This does not use the main Personnel list.</p>
      <div class="flex gap-3 justify-center flex-wrap">
        <button class="btn btn-primary" data-action="adnco-import-students">Import Student CSV</button>
        <button class="btn btn-secondary" data-action="adnco-student-template">Download Template</button>
        <button class="btn btn-secondary" data-action="adnco-load-sample">Load Sample Students</button>
      </div></div>`;
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);
  const roster = state.currentAdncoRoster;
  const isFinalized = roster?.finalized;
  const slotSource = ui.adncoSlots?.length
    ? ui.adncoSlots
    : createAdncoSlots(ui.adncoYear, ui.adncoMonth);
  const staffing = countAdncoStaffing(slotSource, students);

  let html = `
    <div class="adnco-header mb-4">
      <div class="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 style="font-size:1.25rem;font-weight:600">Generate ADNCOs</h2>
          <p class="text-sm text-muted">${students.length} student${students.length !== 1 ? 's' : ''} · independent from main Personnel tab</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <select class="input w-auto" data-action="adnco-set-month">${Array.from({ length: 12 }, (_, i) =>
            `<option value="${i + 1}" ${ui.adncoMonth === i + 1 ? 'selected' : ''}>${new Date(2000, i).toLocaleString('en', { month: 'long' })}</option>`
          ).join('')}</select>
          <select class="input w-auto" data-action="adnco-set-year">${years.map((y) =>
            `<option value="${y}" ${ui.adncoYear === y ? 'selected' : ''}>${y}</option>`
          ).join('')}</select>
        </div>
      </div>
    </div>

    <div class="card adnco-rules mb-4">
      <h3 class="font-semibold text-gold mb-2">Positions Each Night</h3>
      <div class="grid-3 gap-2 text-sm mb-2">
        <div>🏢 <strong>2×</strong> Building 829</div>
        <div>🏢 <strong>2×</strong> Building 827</div>
        <div>🚗 <strong>1×</strong> Duty Driver</div>
      </div>
      <div class="grid-2 gap-3 text-sm">
        <div><span class="badge-mat">MAT</span> Sun <strong>1630</strong> → Fri <strong>1630</strong></div>
        <div><span class="badge-academic">Academic</span> Fri <strong>1630</strong> → Sun <strong>1630</strong></div>
      </div>
      <p class="text-xs text-dim mt-2">Assignments are <strong>randomized</strong> with fair rotation — everyone gets a turn before anyone is assigned again. No points. One student cannot fill two positions the same night.</p>
      <p class="text-xs text-muted mt-1">Staffing: ${staffing.matStudents} MAT students / ${staffing.matPositions} MAT positions (${staffing.matNights} nights × ${staffing.positionsPerNight}) · ${staffing.acStudents} Academic / ${staffing.acPositions} Academic positions (${staffing.acNights} nights)</p>
    </div>

    ${renderAdminWorkflow(ctx)}

    <div class="flex flex-wrap gap-2 mb-4">
      <button class="btn btn-secondary btn-sm" data-action="adnco-import-students">⬆ Import Students</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-export-students">⬇ Export Student List</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-student-template">📄 Template</button>
    </div>
  `;

  if (!ui.adncoGenerated || !roster) {
    html += `<div class="info-box mb-4">🎲 <strong>Generate</strong> fills every position randomly. Students who have not yet been assigned this month are preferred. Re-generate to shuffle (check <em>Keep manual assignments</em> to lock edits).</div>
      <div class="text-center mt-4">
        <button class="btn btn-primary btn-lg" data-action="adnco-generate">⚡ Generate ADNCOs</button>
      </div>`;
  } else {
    if (ui.adncoWarnings.length) {
      html += `<div class="card card-amber mb-4"><strong class="text-amber">⚠ Warnings</strong><ul class="text-sm mt-2">${ui.adncoWarnings.map((w) => `<li>• ${esc(w)}</li>`).join('')}</ul></div>`;
    }
    html += renderAdncoResults(ctx);
    if (!isFinalized) {
      html += `<div class="flex flex-wrap justify-center gap-3 mt-4 items-center">
        <label class="text-sm text-muted"><input type="checkbox" data-action="adnco-keep-manual" ${ui.adncoKeepManual ? 'checked' : ''}> Keep manual assignments on re-generate</label>
        <button class="btn btn-secondary" data-action="adnco-generate">🔄 Re-generate (reshuffle)</button>
        <button class="btn btn-primary" data-action="adnco-show-finalize">🔒 Finalize ADNCO Roster</button>
      </div>`;
    } else {
      html += `<p class="text-center text-olive mt-4">✓ ADNCO roster finalized — stored separately from main duty history.</p>`;
    }
  }

  if (state.adncoHistory?.length) {
    html += renderAdncoHistoryList(ctx);
  }

  return html;
}

function renderAdminWorkflow(ctx) {
  const { ui } = ctx;
  return `<div class="card adnco-admin-workflow mb-4">
    <h3 class="font-semibold mb-2">📋 Monthly Availability (admin)</h3>
    <p class="text-sm text-muted mb-3">Non-availability is set in the student CSV only — not in the app. Export the list each month, edit the <strong>nonAvailability</strong> column for ${formatMonthYear(ui.adncoMonth, ui.adncoYear)}, then re-import before generating.</p>
    <ol class="text-sm text-muted" style="margin:0 0 0.75rem 1.25rem;line-height:1.6">
      <li><strong>Export Student List</strong> (or use last month&apos;s export after finalize)</li>
      <li>Edit <strong>nonAvailability</strong> — day numbers only, e.g. <code>5, 12-14, 20</code></li>
      <li><strong>Import Students</strong> to load the updated file</li>
      <li><strong>Generate ADNCOs</strong></li>
    </ol>
    <p class="hint mb-0">${DAY_NUMBER_HINT}</p>
  </div>`;
}

function renderAdncoResults(ctx) {
  const { state, esc } = ctx;
  const roster = state.currentAdncoRoster;
  const map = new Map((state.adncoStudents ?? []).map((p) => [p.id, p]));
  const readOnly = roster.finalized;
  const students = state.adncoStudents ?? [];
  const days = groupAdncoSlotsByDay(roster.slots);

  const posHeaders = ADNCO_POSITIONS.map((p) => `<th>${p.label}</th>`).join('');
  const rows = days.map((day) => {
    const typeClass = day.eligibleType === 'MAT' ? 'badge-mat' : 'badge-academic';
    const cells = ADNCO_POSITIONS.map((pos) =>
      `<td>${renderPositionCell(day.positions[pos.position], students, map, readOnly, esc)}</td>`
    ).join('');
    return `<tr>
      <td style="white-space:nowrap">${esc(day.timeLabel)}</td>
      <td><span class="${typeClass}">${day.eligibleType}</span></td>
      ${cells}
    </tr>`;
  }).join('');

  return `
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-semibold">ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}</h3>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" data-action="adnco-print">📄 Print</button>
        <button class="btn btn-secondary btn-sm" data-action="adnco-export-csv">📊 Export Roster CSV</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table class="data adnco-table adnco-wide-table">
      <thead><tr>
        <th>Date &amp; Time</th><th>Type</th>${posHeaders}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
}

function renderAdncoHistoryList(ctx) {
  const { state, esc } = ctx;
  const sorted = [...state.adncoHistory].sort((a, b) => b.year - a.year || b.month - a.month);
  return `<div class="card mt-4"><h4 class="text-sm font-semibold text-muted mb-3">Past ADNCO Rosters</h4>
    <div class="grid-3">${sorted.map((r) => {
      const filled = r.slots.filter((s) => s.personId).length;
      return `<div class="card" style="padding:0.75rem">
        <div class="flex justify-between mb-2"><span class="font-semibold">${formatMonthYear(r.month, r.year)}</span>
          <span class="text-xs text-olive">Finalized</span></div>
        <p class="text-xs text-dim">${filled}/${r.slots.length} positions filled</p>
        <button class="btn btn-secondary btn-sm mt-2" style="width:100%" data-action="adnco-view-history" data-id="${r.id}">View</button>
      </div>`;
    }).join('')}</div></div>`;
}

export function handleAdncoClick(action, el, ctx) {
  const { state, ui, persist, render, toast, openModal, closeModal } = ctx;

  switch (action) {
    case 'adnco-load-sample':
      state.adncoStudents = createSampleAdncoStudents();
      persist();
      toast('Sample ADNCO students loaded');
      render();
      return true;
    case 'adnco-generate': {
      const result = generateAdncoRoster(
        ui.adncoYear, ui.adncoMonth, state.adncoStudents ?? [],
        state.currentAdncoRoster, ui.adncoKeepManual, ui.adncoSlots
      );
      if (!result.roster) {
        ui.adncoWarnings = result.warnings;
        toast(result.warnings[0] || 'Could not generate');
        render();
        return true;
      }
      state.currentAdncoRoster = result.roster;
      ui.adncoSlots = result.roster.slots;
      ui.adncoWarnings = result.warnings;
      ui.adncoGenerated = true;
      persist();
      render();
      return true;
    }
    case 'adnco-import-students':
      ctx.triggerFileImport('.csv', (text) => {
        const result = parseStudentImportCSV(text);
        if (result.error) { alert(result.error); return; }
        const msg = (state.adncoStudents?.length)
          ? `Replace all ${state.adncoStudents.length} students with ${result.students.length} from this file?`
          : `Load ${result.students.length} students?`;
        if (!confirm(msg)) return;
        state.adncoStudents = mergeStudentsIntoRoster([], result.students, true);
        persist();
        if (result.errors?.length) alert('Some rows skipped:\n' + result.errors.join('\n'));
        toast(`Loaded ${result.students.length} student(s)`);
        render();
      });
      return true;
    case 'adnco-export-students': {
      const exp = exportAdncoStudentsCSV(state.adncoStudents ?? []);
      openCSVInNewTab(exp.content, exp.filename);
      toast('Student list exported');
      return true;
    }
    case 'adnco-student-template':
      openCSVInNewTab(getStudentImportTemplate(), 'YouGotFireWatch-ADNCO-Student-Template.csv');
      return true;
    case 'adnco-show-finalize':
      openModal('Finalize ADNCO Roster',
        `<p class="text-sm text-muted mb-3">Saves only to ADNCO history — does not affect main Personnel or OOD rosters.</p>
         <p class="text-sm text-amber">Verify all 5 positions per night and phone numbers before confirming.</p>`,
        `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
         <button class="btn btn-primary" data-action="adnco-confirm-finalize">🔒 Confirm Finalize</button>`, 'sm');
      return true;
    case 'adnco-confirm-finalize': {
      if (!state.currentAdncoRoster) return true;
      state.adncoStudents = finalizeAdncoRoster(state.currentAdncoRoster, state.adncoStudents ?? []);
      const finalized = { ...state.currentAdncoRoster, finalized: true, finalizedAt: new Date().toISOString() };
      if (!state.adncoHistory) state.adncoHistory = [];
      const idx = state.adncoHistory.findIndex((h) => h.month === finalized.month && h.year === finalized.year);
      if (idx >= 0) state.adncoHistory[idx] = finalized;
      else state.adncoHistory.push(finalized);
      state.currentAdncoRoster = finalized;
      closeModal();
      persist();
      const printed = openAdncoPrintout(finalized, state.adncoStudents, state.settings);
      toast(printed ? 'ADNCO roster finalized — printout opened' : 'Finalized! Use Print button if pop-up blocked.');
      render();
      return true;
    }
    case 'adnco-print':
      if (state.currentAdncoRoster) openAdncoPrintout(state.currentAdncoRoster, state.adncoStudents ?? [], state.settings);
      return true;
    case 'adnco-export-csv':
      if (state.currentAdncoRoster) {
        openCSVInNewTab(
          exportAdncoCSV(state.currentAdncoRoster, state.adncoStudents ?? [], state.settings),
          `YouGotFireWatch-ADNCO-${ui.adncoYear}-${String(ui.adncoMonth).padStart(2, '0')}.csv`
        );
      }
      return true;
    case 'adnco-view-history': {
      const r = state.adncoHistory?.find((h) => h.id === el.dataset.id);
      if (r) {
        ui.viewingAdncoHistory = r;
        state.currentAdncoRoster = r;
        ui.adncoSlots = createAdncoSlots(r.year, r.month, r.slots);
        ui.adncoGenerated = true;
        ui.adncoYear = r.year;
        ui.adncoMonth = r.month;
        render();
      }
      return true;
    }
    default:
      return false;
  }
}

export function handleAdncoChange(action, el, ctx) {
  const { state, ui, persist, render } = ctx;

  if (action === 'adnco-set-month') {
    changeAdncoMonth(parseInt(el.value, 10), ui.adncoYear, ctx);
    return true;
  }
  if (action === 'adnco-set-year') {
    changeAdncoMonth(ui.adncoMonth, parseInt(el.value, 10), ctx);
    return true;
  }
  if (action === 'adnco-keep-manual') {
    ui.adncoKeepManual = el.checked;
    return true;
  }
  if (action === 'adnco-reassign') {
    const slotId = el.dataset.slotId;
    const personId = el.value || null;
    if (!state.currentAdncoRoster) return true;
    if (personId) {
      const v = validateAdncoAssignment(
        personId, slotId, state.currentAdncoRoster, state.adncoStudents ?? [], ui.adncoYear, ui.adncoMonth
      );
      if (!v.valid) { alert(v.message); render(); return true; }
    }
    state.currentAdncoRoster.slots = state.currentAdncoRoster.slots.map((s) =>
      s.id === slotId ? { ...s, personId } : s
    );
    ui.adncoSlots = state.currentAdncoRoster.slots;
    persist();
    render();
    return true;
  }
  return false;
}

function changeAdncoMonth(month, year, ctx) {
  const { state, ui, persist, render } = ctx;
  ui.adncoMonth = month;
  ui.adncoYear = year;
  ui.adncoGenerated = false;
  ui.adncoWarnings = [];
  const existing = state.adncoHistory?.find((h) => h.month === month && h.year === year);
  if (existing) {
    state.currentAdncoRoster = existing;
    ui.adncoSlots = createAdncoSlots(year, month, existing.slots);
    ui.adncoGenerated = true;
  } else {
    state.currentAdncoRoster = null;
    ui.adncoSlots = createAdncoSlots(year, month);
  }
  persist();
  render();
}

export function initAdncoSlots(ctx) {
  const { state, ui } = ctx;
  if (state.currentAdncoRoster?.month === ui.adncoMonth && state.currentAdncoRoster?.year === ui.adncoYear) {
    ui.adncoSlots = createAdncoSlots(ui.adncoYear, ui.adncoMonth, state.currentAdncoRoster.slots);
  } else if (!ui.adncoSlots?.length) {
    ui.adncoSlots = createAdncoSlots(ui.adncoYear, ui.adncoMonth);
  }
}