/**
 * ADNCO Student Rosters tab — fully separate from main duty roster
 */

import { formatMonthYear, getCalendarGridOffset, fullDayName } from './dateUtils.js';
import { getHolidayName } from './holidays.js';
import {
  generateAdncoRoster, validateAdncoAssignment, finalizeAdncoRoster,
  createAdncoSlots, countAdncoStaffing, resetAdncoSlotsToBaseline,
  applyAdncoWeekendDefaults, applyAdncoBulkUpdate,
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
    _adncoEditDate: null,
  };
}

function ptsBadge(pts, max = 10) {
  const r = Math.round(34 + Math.min(pts / max, 1) * 200);
  const g = Math.round(180 - Math.min(pts / max, 1) * 140);
  const b = Math.round(90 - Math.min(pts / max, 1) * 60);
  const label = Number.isInteger(pts) ? `${pts}pt${pts !== 1 ? 's' : ''}` : `${pts}pts`;
  return `<span class="pts-badge" style="background:rgba(${r},${g},${b},0.2);color:rgb(${r},${g},${b});border-color:rgba(${r},${g},${b},0.4)">${label}</span>`;
}

function syncAdncoSlots(ctx) {
  const { state, ui, persist } = ctx;
  if (state.currentAdncoRoster) {
    state.currentAdncoRoster = { ...state.currentAdncoRoster, slots: ui.adncoSlots };
    persist();
  }
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
    : createAdncoSlots(ui.adncoYear, ui.adncoMonth, state.settings);
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
      <h3 class="font-semibold text-gold mb-2">Duty Windows (hard rules)</h3>
      <div class="grid-2 gap-3 text-sm">
        <div><span class="badge-mat">MAT</span> Sun <strong>1630</strong> → Fri <strong>1630</strong></div>
        <div><span class="badge-academic">Academic</span> Fri <strong>1630</strong> → Sun <strong>1630</strong></div>
      </div>
      <p class="text-xs text-dim mt-2">MAT students fill Sun–Thu evening shifts. Academic students fill Fri–Sat evening shifts. One ADNCO duty per student per month.</p>
      <p class="text-xs text-muted mt-1">Staffing: ${staffing.matStudents} MAT students / ${staffing.matSlots} MAT slots · ${staffing.acStudents} Academic / ${staffing.acSlots} Academic slots</p>
    </div>

    ${renderAdminWorkflow(ctx)}

    <div class="flex flex-wrap gap-2 mb-4">
      <button class="btn btn-secondary btn-sm" data-action="adnco-import-students">⬆ Import Students</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-export-students">⬇ Export Student List</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-student-template">📄 Template</button>
    </div>
  `;

  if (!ui.adncoGenerated || !roster) {
    html += `<div class="card mb-4"><h3 class="mb-4 font-semibold">Calendar Editor — ${formatMonthYear(ui.adncoMonth, ui.adncoYear)}</h3>
      <p class="text-sm text-muted mb-3">Click any day to adjust hardship points before generating. Higher points = harder shift = assigned first.</p>
      ${renderAdncoCalendar(ctx, false)}</div>
      <div class="text-center mt-4">
        <button class="btn btn-primary btn-lg" data-action="adnco-generate">⚡ Generate ADNCOs</button>
      </div>`;
  } else {
    if (ui.adncoWarnings.length) {
      html += `<div class="card card-amber mb-4"><strong class="text-amber">⚠ Warnings</strong><ul class="text-sm mt-2">${ui.adncoWarnings.map((w) => `<li>• ${esc(w)}</li>`).join('')}</ul></div>`;
    }
    if (!isFinalized) {
      html += `<div class="card mb-4"><h3 class="text-sm font-semibold text-muted mb-3">Adjust Points Before Re-generating</h3>
        ${renderAdncoCalendar(ctx, false)}</div>`;
    }
    html += renderAdncoResults(ctx);
    if (!isFinalized) {
      html += `<div class="flex flex-wrap justify-center gap-3 mt-4 items-center">
        <label class="text-sm text-muted"><input type="checkbox" data-action="adnco-keep-manual" ${ui.adncoKeepManual ? 'checked' : ''}> Keep manual assignments on re-generate</label>
        <button class="btn btn-secondary" data-action="adnco-generate">🔄 Re-generate</button>
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

function renderAdncoCalendar(ctx, showAssignments) {
  const { state, ui, esc } = ctx;
  const slots = ui.adncoSlots ?? [];
  const maxPts = Math.max(...slots.map((s) => s.points), 10);
  const offset = getCalendarGridOffset(ui.adncoYear, ui.adncoMonth);
  const studentMap = new Map((state.adncoStudents ?? []).map((p) => [p.id, p]));
  const cells = [...Array(offset).fill(null), ...slots];
  while (cells.length % 7) cells.push(null);

  return `
    ${!showAssignments ? `<div class="cal-tools">
      <button class="btn btn-secondary btn-sm" data-action="adnco-toggle-baselines">✏ Baselines</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-weekend-defaults">☀ Weekend/Holiday Defaults</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-reset-baseline">↺ Reset All</button>
      <button class="btn btn-secondary btn-sm" data-action="adnco-show-bulk">📆 Bulk Edit Range</button>
    </div>
    <div id="adnco-baselines-panel" class="hidden card mb-3 grid-5">
      ${[{ key: 'weekday', label: 'M–Thu' }, { key: 'friday', label: 'Friday' }, { key: 'saturday', label: 'Saturday' }, { key: 'sunday', label: 'Sunday' }, { key: 'holiday', label: 'Holiday' }].map(({ key, label }) =>
        `<div><label class="label">${label}</label>
        <input class="input" type="number" step="0.5" data-action="adnco-set-baseline" data-key="${key}" value="${state.settings.baselines[key]}" min="0"></div>`
      ).join('')}
    </div>` : ''}
    <div class="cal-grid">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map((slot) => {
        if (!slot) return '<div class="cal-day empty"></div>';
        const dayNum = parseInt(slot.startDate.split('-')[2], 10);
        const holiday = getHolidayName(slot.startDate);
        const assigned = showAssignments && slot.personId ? studentMap.get(slot.personId) : null;
        const typeClass = slot.eligibleType === 'MAT' ? 'badge-mat' : 'badge-academic';
        return `<button class="cal-day adnco-cal-day ${slot.note ? 'has-note' : ''} ${assigned ? 'assigned' : ''}" data-action="adnco-edit-day" data-date="${slot.startDate}" ${showAssignments ? 'disabled style="cursor:default"' : ''}>
          <div class="flex justify-between items-start gap-1">
            <span class="cal-day-num">${dayNum}</span>
            ${ptsBadge(slot.points, maxPts)}
          </div>
          <span class="${typeClass}" style="font-size:0.55rem;padding:0.05rem 0.25rem;margin-top:0.1rem;display:inline-block">${slot.eligibleType === 'MAT' ? 'MAT' : 'AC'}</span>
          ${holiday ? `<span class="text-xs text-gold" style="font-size:0.55rem">${holiday}</span>` : ''}
          ${slot.note && !holiday ? `<span class="cal-day-note">${esc(slot.note)}</span>` : ''}
          ${assigned ? `<span class="cal-day-person">${esc(assigned.rank)} ${esc(assigned.lastName)}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="cal-legend">
      <span><span class="legend-dot" style="background:rgba(74,222,128,0.3);border:1px solid rgba(74,222,128,0.5)"></span>Low pts (desirable)</span>
      <span><span class="legend-dot" style="background:rgba(248,113,113,0.3);border:1px solid rgba(248,113,113,0.5)"></span>High pts (hardship)</span>
      <span><span class="badge-mat" style="font-size:0.65rem">MAT</span> Sun–Thu · <span class="badge-academic" style="font-size:0.65rem">AC</span> Fri–Sat</span>
    </div>`;
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
  const { state, ui, esc } = ctx;
  const roster = state.currentAdncoRoster;
  const map = new Map((state.adncoStudents ?? []).map((p) => [p.id, p]));
  const readOnly = roster.finalized;
  const students = state.adncoStudents ?? [];

  const maxPts = Math.max(...roster.slots.map((s) => s.points), 10);
  const rows = [...roster.slots].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((slot) => {
    const p = slot.personId ? map.get(slot.personId) : null;
    const typeClass = slot.eligibleType === 'MAT' ? 'badge-mat' : 'badge-academic';
    const eligible = students.filter((s) => s.studentType === slot.eligibleType);
    return `<tr>
      <td>${esc(slot.timeLabel)}</td>
      <td><span class="${typeClass}">${slot.eligibleType}</span></td>
      <td>${p ? `<strong>${esc(p.rank)} ${esc(p.lastName)}, ${esc(p.firstName)}</strong>` : '<span class="text-amber">Unassigned</span>'}</td>
      <td class="adnco-phone">${p?.phoneNumber ? esc(p.phoneNumber) : '<span class="text-dim">—</span>'}</td>
      <td>${ptsBadge(slot.points, maxPts)}</td>
      <td class="text-xs text-dim">${esc(slot.note)}</td>
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
        <button class="btn btn-secondary btn-sm" data-action="adnco-export-csv">📊 Export Roster CSV</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table class="data adnco-table">
      <thead><tr>
        <th>Date &amp; Time Window</th><th>Duty Type</th><th>Assigned Marine</th>
        <th>Phone</th><th>Points</th><th>Note</th><th>Student Type</th>${!readOnly ? '<th>Reassign</th>' : ''}
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
    case 'adnco-load-sample':
      state.adncoStudents = createSampleAdncoStudents();
      persist();
      toast('Sample ADNCO students loaded');
      render();
      return true;
    case 'adnco-generate': {
      const result = generateAdncoRoster(
        ui.adncoYear, ui.adncoMonth, state.adncoStudents ?? [],
        state.settings, state.currentAdncoRoster, ui.adncoKeepManual, ui.adncoSlots
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
    case 'adnco-toggle-baselines':
      document.getElementById('adnco-baselines-panel')?.classList.toggle('hidden');
      return true;
    case 'adnco-weekend-defaults':
      ui.adncoSlots = applyAdncoWeekendDefaults(ui.adncoSlots, state.settings, ui.adncoYear);
      syncAdncoSlots(ctx);
      render();
      return true;
    case 'adnco-reset-baseline':
      ui.adncoSlots = resetAdncoSlotsToBaseline(ui.adncoSlots, state.settings, ui.adncoYear);
      syncAdncoSlots(ctx);
      render();
      return true;
    case 'adnco-show-bulk':
      ctx.openModal('Bulk Edit Date Range',
        `<p class="text-sm text-muted mb-3">Apply the same points and note across a date range (e.g. block leave, surge week).</p>
         <div class="grid-2 gap-3 mb-3">
           <div><label class="label">Start Date</label><input class="input" id="adnco-bulk-start" type="date"></div>
           <div><label class="label">End Date</label><input class="input" id="adnco-bulk-end" type="date"></div>
         </div>
         <div class="mb-3"><label class="label">Points Value</label><input class="input" id="adnco-bulk-pts" type="number" step="0.5" value="1" min="0"></div>
         <div><label class="label">Note</label><input class="input" id="adnco-bulk-note" placeholder="e.g., pre-deployment surge"></div>`,
        `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
         <button class="btn btn-primary" data-action="adnco-apply-bulk">Apply to Range</button>`, 'sm');
      return true;
    case 'adnco-apply-bulk': {
      const start = document.getElementById('adnco-bulk-start')?.value;
      const end = document.getElementById('adnco-bulk-end')?.value;
      if (!start || !end) return true;
      const pts = parseFloat(document.getElementById('adnco-bulk-pts')?.value);
      const note = document.getElementById('adnco-bulk-note')?.value;
      ui.adncoSlots = applyAdncoBulkUpdate(ui.adncoSlots, start, end, { points: pts, note: note || undefined });
      syncAdncoSlots(ctx);
      closeModal();
      render();
      return true;
    }
    case 'adnco-edit-day': {
      const slot = ui.adncoSlots.find((s) => s.startDate === el.dataset.date);
      if (!slot) return true;
      const typeLabel = slot.eligibleType === 'MAT' ? 'MAT (Sun 1630 – Fri 1630)' : 'Academic (Fri 1630 – Sun 1630)';
      ctx.openModal(`Edit ${fullDayName(slot.startDate)}`,
        `<p class="text-sm text-muted mb-3"><span class="${slot.eligibleType === 'MAT' ? 'badge-mat' : 'badge-academic'}">${slot.eligibleType}</span> · ${typeLabel}</p>
         <div class="mb-3"><label class="label">Points Value</label>
           <input class="input" id="adnco-day-pts" type="number" step="0.5" value="${slot.points}" min="0">
           <p class="hint">Higher = more hardship. Harder shifts assign first.</p></div>
         <div><label class="label">Note</label>
           <input class="input" id="adnco-day-note" value="${ctx.esc(slot.note)}" placeholder="e.g., graduation week"></div>`,
        `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
         <button class="btn btn-primary" data-action="adnco-save-day" data-date="${slot.startDate}">Save</button>`, 'sm');
      ui._adncoEditDate = slot.startDate;
      return true;
    }
    case 'adnco-save-day': {
      const pts = parseFloat(document.getElementById('adnco-day-pts')?.value) || 0;
      const note = document.getElementById('adnco-day-note')?.value || '';
      ui.adncoSlots = ui.adncoSlots.map((s) =>
        s.startDate === ui._adncoEditDate ? { ...s, points: pts, note: note || undefined } : s
      );
      syncAdncoSlots(ctx);
      closeModal();
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
        `<p class="text-sm text-muted mb-3">Saves only to ADNCO history — does not affect main Personnel or duty rosters.</p>
         <p class="text-sm text-amber">Verify phone numbers and assignments before confirming.</p>`,
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
        ui.adncoSlots = r.slots;
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
  if (action === 'adnco-set-baseline') {
    state.settings.baselines[el.dataset.key] = parseFloat(el.value) || 0;
    persist();
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
    ui.adncoSlots = existing.slots;
    ui.adncoGenerated = true;
  } else {
    state.currentAdncoRoster = null;
    ui.adncoSlots = createAdncoSlots(month, year, state.settings);
  }
  persist();
  render();
}

/** Initialize ADNCO calendar slots for the current UI month (call on app boot). */
export function initAdncoSlots(ctx) {
  const { state, ui } = ctx;
  if (state.currentAdncoRoster?.month === ui.adncoMonth && state.currentAdncoRoster?.year === ui.adncoYear) {
    ui.adncoSlots = state.currentAdncoRoster.slots;
  } else if (!ui.adncoSlots?.length) {
    ui.adncoSlots = createAdncoSlots(ui.adncoYear, ui.adncoMonth, state.settings);
  }
}