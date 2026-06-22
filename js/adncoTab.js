/**
 * ADNCO Student Rosters tab — UI and actions
 */

import { formatMonthYear } from './dateUtils.js';
import {
  generateAdncoRoster, validateAdncoAssignment, finalizeAdncoRoster,
  createAdncoSlots, countAdncoStaffing,
} from './adncoRoster.js';
import { exportAdncoCSV, openAdncoPrintout } from './adncoExport.js';
import {
  getStudentImportTemplate, parseStudentImportCSV, mergeStudentsIntoPersonnel,
} from './studentImport.js';
import { DAY_NUMBER_PLACEHOLDER, DAY_NUMBER_HINT } from './dayNumberAvailability.js';
import { getAdncoStudents, adncoDisplayName, displayName } from './personnelUtils.js';
import { openCSVInNewTab } from './export.js';

export function createAdncoUiDefaults() {
  const now = new Date();
  return {
    adncoYear: now.getFullYear(),
    adncoMonth: now.getMonth() + 1,
    adncoGenerated: false,
    adncoWarnings: [],
    adncoKeepManual: false,
    adncoSelfServiceId: '',
    adncoNaDraft: '',
    viewingAdncoHistory: null,
  };
}

export function renderAdncoTab(ctx) {
  const { state, ui, esc } = ctx;
  const students = getAdncoStudents(state.personnel);

  if (!students.length) {
    return `<div class="adnco-header mb-4">
      <h2 style="font-size:1.25rem;font-weight:600">ADNCO Student Rosters</h2>
      <p class="text-sm text-muted">Separate from main fire watch duty — for Academic &amp; MAT student schedules</p>
    </div>
    <div class="empty-state"><div class="empty-icon">🎓</div><h3>No ADNCO Students Yet</h3>
      <p>Add students in Personnel (set studentType) or import a student CSV.</p>
      <div class="flex gap-3 justify-center flex-wrap">
        <button class="btn btn-primary" data-action="tab" data-tab="personnel">Go to Personnel</button>
        <button class="btn btn-secondary" data-action="adnco-import-students">Import Student CSV</button>
        <button class="btn btn-secondary" data-action="adnco-student-template">Download Template</button>
      </div></div>`;
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);
  const roster = state.currentAdncoRoster;
  const isFinalized = roster?.finalized;
  const staffing = countAdncoStaffing(
    roster?.slots || createAdncoSlots(ui.adncoYear, ui.adncoMonth),
    state.personnel
  );

  let html = `
    <div class="adnco-header mb-4">
      <div class="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 style="font-size:1.25rem;font-weight:600">ADNCO Student Rosters</h2>
          <p class="text-sm text-muted">${students.length} student${students.length !== 1 ? 's' : ''} · separate from main duty roster</p>
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
      <h3 class="font-semibold text-gold mb-2">Duty Windows (hard rules)</h3>
      <div class="grid-2 gap-3 text-sm">
        <div><span class="badge-mat">MAT</span> Sun <strong>1630</strong> → Fri <strong>1630</strong></div>
        <div><span class="badge-academic">Academic</span> Fri <strong>1630</strong> → Sun <strong>1630</strong></div>
      </div>
      <p class="text-xs text-dim mt-2">MAT students fill Sun–Thu evening shifts. Academic students fill Fri–Sat evening shifts. One ADNCO duty per student per month.</p>
      <p class="text-xs text-muted mt-1">Staffing: ${staffing.matStudents} MAT students / ${staffing.matSlots} MAT slots · ${staffing.acStudents} Academic / ${staffing.acSlots} Academic slots</p>
    </div>

    ${renderSelfService(ctx)}

    <div class="flex flex-wrap gap-2 mb-4">
      <button class="btn btn-secondary btn-sm" data-action="adnco-import-students">⬆ Import Students</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-student-template">📄 Student Template</button>
    </div>
  `;

  if (!ui.adncoGenerated || !roster) {
    html += `<div class="text-center mt-4">
      <button class="btn btn-primary btn-lg" data-action="adnco-generate">⚡ Generate ADNCO Roster</button>
    </div>`;
  } else {
    if (ui.adncoWarnings.length) {
      html += `<div class="card card-amber mb-4"><strong class="text-amber">⚠ Warnings</strong><ul class="text-sm mt-2">${ui.adncoWarnings.map((w) => `<li>• ${esc(w)}</li>`).join('')}</ul></div>`;
    }
    html += renderAdncoResults(ctx);
    if (!isFinalized) {
      html += `<div class="flex flex-wrap justify-center gap-3 mt-4 items-center">
        <label class="text-sm text-muted"><input type="checkbox" data-action="adnco-keep-manual" ${ui.adncoKeepManual ? 'checked' : ''}> Keep manual assignments on re-generate</label>
        <button class="btn btn-secondary" data-action="adnco-generate">🔄 Re-generate</button>
        <button class="btn btn-primary" data-action="adnco-show-finalize">🔒 Finalize ADNCO Roster</button>
      </div>`;
    } else {
      html += `<p class="text-center text-olive mt-4">✓ ADNCO roster finalized and saved separately from main duty.</p>`;
    }
  }

  if (state.adncoHistory?.length) {
    html += renderAdncoHistoryList(ctx);
  }

  return html;
}

function renderSelfService(ctx) {
  const { state, ui, esc } = ctx;
  const students = getAdncoStudents(state.personnel).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const selected = students.find((p) => p.id === ui.adncoSelfServiceId);
  const naVal = ui.adncoNaDraft !== '' ? ui.adncoNaDraft : (selected?.adncoNonAvailabilityInput ?? '');

  return `<div class="card adnco-self-service mb-4">
    <h3 class="font-semibold mb-2">📱 Quick Availability Update</h3>
    <p class="text-sm text-muted mb-3">Marines: pick your name and enter <strong>only day numbers</strong> for ${formatMonthYear(ui.adncoMonth, ui.adncoYear)}. No dates, no calendars.</p>
    <div class="grid-2 gap-3 mb-3">
      <div>
        <label class="label">I am...</label>
        <select class="input" data-action="adnco-self-select">
          <option value="">Select your name...</option>
          ${students.map((p) => `<option value="${p.id}" ${ui.adncoSelfServiceId === p.id ? 'selected' : ''}>${esc(adncoDisplayName(p))} (${p.studentType})</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="label">Days I <em>cannot</em> stand duty</label>
        <input class="input input-lg adnco-na-input" data-action="adnco-na-draft" value="${esc(naVal)}" placeholder="${DAY_NUMBER_PLACEHOLDER}" ${!ui.adncoSelfServiceId ? 'disabled' : ''}>
      </div>
    </div>
    <p class="hint mb-3">${DAY_NUMBER_HINT}</p>
    <button class="btn btn-primary" data-action="adnco-save-availability" ${!ui.adncoSelfServiceId ? 'disabled' : ''}>Update My Availability</button>
  </div>`;
}

function renderAdncoResults(ctx) {
  const { state, ui, esc } = ctx;
  const roster = state.currentAdncoRoster;
  const map = new Map(state.personnel.map((p) => [p.id, p]));
  const readOnly = roster.finalized;
  const students = getAdncoStudents(state.personnel);

  const rows = [...roster.slots].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((slot) => {
    const p = slot.personId ? map.get(slot.personId) : null;
    const typeClass = slot.eligibleType === 'MAT' ? 'badge-mat' : 'badge-academic';
    const eligible = students.filter((s) => s.studentType === slot.eligibleType);
    return `<tr>
      <td>${esc(slot.timeLabel)}</td>
      <td><span class="${typeClass}">${slot.eligibleType}</span></td>
      <td>${p ? `<strong>${esc(p.rank)} ${esc(p.lastName)}, ${esc(p.firstName)}</strong>` : '<span class="text-amber">Unassigned</span>'}</td>
      <td class="adnco-phone">${p?.phoneNumber ? esc(p.phoneNumber) : '<span class="text-dim">—</span>'}</td>
      <td>${p?.studentType || '—'}</td>
      ${!readOnly ? `<td><select class="input" style="font-size:0.75rem;width:auto" data-action="adnco-reassign" data-slot-id="${slot.id}">
        <option value="">Unassigned</option>
        ${eligible.map((s) => `<option value="${s.id}" ${slot.personId === s.id ? 'selected' : ''}>${esc(adncoDisplayName(s))}</option>`).join('')}
      </select></td>` : ''}
    </tr>`;
  }).join('');

  return `
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-semibold">ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}</h3>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" data-action="adnco-print">📄 Print</button>
        <button class="btn btn-secondary btn-sm" data-action="adnco-export-csv">📊 Export CSV</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table class="data adnco-table">
      <thead><tr>
        <th>Date &amp; Time Window</th><th>Duty Type</th><th>Assigned Marine</th>
        <th>Phone</th><th>Student Type</th>${!readOnly ? '<th>Reassign</th>' : ''}
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
        <p class="text-xs text-dim">${filled}/${r.slots.length} assigned</p>
        <button class="btn btn-secondary btn-sm mt-2" style="width:100%" data-action="adnco-view-history" data-id="${r.id}">View</button>
      </div>`;
    }).join('')}</div></div>`;
}

export function handleAdncoClick(action, el, ctx) {
  const { state, ui, persist, render, toast, openModal, closeModal } = ctx;

  switch (action) {
    case 'adnco-generate': {
      const result = generateAdncoRoster(
        ui.adncoYear, ui.adncoMonth, state.personnel,
        state.currentAdncoRoster, ui.adncoKeepManual
      );
      if (!result.roster) {
        ui.adncoWarnings = result.warnings;
        toast(result.warnings[0] || 'Could not generate');
        render();
        return true;
      }
      state.currentAdncoRoster = result.roster;
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
        state.personnel = mergeStudentsIntoPersonnel(state.personnel, result.students);
        persist();
        if (result.errors?.length) alert('Some rows skipped:\n' + result.errors.join('\n'));
        toast(`Imported ${result.students.length} student(s)`);
        render();
      });
      return true;
    case 'adnco-student-template':
      openCSVInNewTab(getStudentImportTemplate(), 'YouGotFireWatch-ADNCO-Student-Template.csv');
      return true;
    case 'adnco-save-availability': {
      if (!ui.adncoSelfServiceId) return true;
      const idx = state.personnel.findIndex((p) => p.id === ui.adncoSelfServiceId);
      if (idx < 0) return true;
      state.personnel[idx].adncoNonAvailabilityInput = ui.adncoNaDraft.trim();
      persist();
      toast('Your availability was updated!');
      render();
      return true;
    }
    case 'adnco-show-finalize':
      openModal('Finalize ADNCO Roster',
        `<p class="text-sm text-muted mb-3">This saves the ADNCO roster separately from main fire watch duty. Student ADNCO points will update.</p>
         <p class="text-sm text-amber">Verify phone numbers and assignments before confirming.</p>`,
        `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
         <button class="btn btn-primary" data-action="adnco-confirm-finalize">🔒 Confirm Finalize</button>`, 'sm');
      return true;
    case 'adnco-confirm-finalize': {
      if (!state.currentAdncoRoster) return true;
      state.personnel = finalizeAdncoRoster(state.currentAdncoRoster, state.personnel);
      const finalized = { ...state.currentAdncoRoster, finalized: true, finalizedAt: new Date().toISOString() };
      if (!state.adncoHistory) state.adncoHistory = [];
      const idx = state.adncoHistory.findIndex((h) => h.month === finalized.month && h.year === finalized.year);
      if (idx >= 0) state.adncoHistory[idx] = finalized;
      else state.adncoHistory.push(finalized);
      state.currentAdncoRoster = finalized;
      closeModal();
      persist();
      const printed = openAdncoPrintout(finalized, state.personnel, state.settings);
      toast(printed ? 'ADNCO roster finalized — printout opened' : 'Finalized! Use Print button if pop-up blocked.');
      render();
      return true;
    }
    case 'adnco-print':
      if (state.currentAdncoRoster) openAdncoPrintout(state.currentAdncoRoster, state.personnel, state.settings);
      return true;
    case 'adnco-export-csv':
      if (state.currentAdncoRoster) {
        openCSVInNewTab(
          exportAdncoCSV(state.currentAdncoRoster, state.personnel, state.settings),
          `YouGotFireWatch-ADNCO-${ui.adncoYear}-${String(ui.adncoMonth).padStart(2, '0')}.csv`
        );
      }
      return true;
    case 'adnco-view-history': {
      const r = state.adncoHistory?.find((h) => h.id === el.dataset.id);
      if (r) {
        ui.viewingAdncoHistory = r;
        state.currentAdncoRoster = r;
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
  if (action === 'adnco-self-select') {
    ui.adncoSelfServiceId = el.value;
    const p = state.personnel.find((x) => x.id === el.value);
    ui.adncoNaDraft = p?.adncoNonAvailabilityInput ?? '';
    render();
    return true;
  }
  if (action === 'adnco-reassign') {
    const slotId = el.dataset.slotId;
    const personId = el.value || null;
    if (!state.currentAdncoRoster) return true;
    if (personId) {
      const v = validateAdncoAssignment(
        personId, slotId, state.currentAdncoRoster, state.personnel, ui.adncoYear, ui.adncoMonth
      );
      if (!v.valid) { alert(v.message); render(); return true; }
    }
    state.currentAdncoRoster.slots = state.currentAdncoRoster.slots.map((s) =>
      s.id === slotId ? { ...s, personId } : s
    );
    persist();
    render();
    return true;
  }
  return false;
}

export function handleAdncoInput(action, el, ctx) {
  if (action === 'adnco-na-draft') {
    ctx.ui.adncoNaDraft = el.value;
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
    ui.adncoGenerated = true;
  } else {
    state.currentAdncoRoster = null;
  }
  persist();
  render();
}