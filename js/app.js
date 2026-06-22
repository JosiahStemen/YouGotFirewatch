import { DEFAULT_SETTINGS, loadAppState, saveAppState, exportAppData, importAppData, clearAllData } from './storage.js';
import { createSamplePersonnel } from './sampleData.js';
import {
  formatMonthYear, formatShortDate, fullDayName, getCalendarGridOffset,
  generateId, getHalfDateRange,
} from './dateUtils.js';
import { getHolidayName } from './holidays.js';
import {
  createMonthSlots, generateRoster, validateSupernumeraryAssignment,
  validateDailyAssignment, computePointDistribution, finalizeRoster,
  resetSlotsToBaseline, applyWeekendHolidayDefaults, applyBulkUpdate,
  countDutyEligiblePersonnel,
} from './rosterGenerator.js';
import {
  exportRosterCSV, openCSVInNewTab, openFinalizePrintout, printRosterPDF,
} from './export.js';
import {
  exportPersonnelBackup, parsePersonnelBackupCSV, getPersonnelBackupTemplate,
} from './personnelBackup.js';
import {
  resolvePersonnelForMonth, parseNonAvailabilityColumn,
} from './nonAvailability.js';
import {
  renderAdncoTab, renderAdncoResults, handleAdncoClick, handleAdncoChange,
  handleAdncoInput, handleAdncoSubmit, createAdncoUiDefaults, initAdncoSlots,
} from './adncoTab.js?v=20260708';
import { groupAdncoSlotsByDay } from './adncoRoster.js';
import { normalizeStudentList } from './personnelUtils.js';

export const APP_VERSION = '2026.07.08';

// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  personnel: [],
  settings: { ...DEFAULT_SETTINGS },
  currentRoster: null,
  history: [],
  currentAdncoRoster: null,
  adncoHistory: [],
  adncoStudents: [],
  activeTab: 'generate',
};

let ui = {
  modal: null,
  editingPerson: null,
  showPersonForm: false,
  search: '',
  genYear: new Date().getFullYear(),
  genMonth: new Date().getMonth() + 1,
  slots: [],
  generated: false,
  warnings: [],
  keepManual: false,
  viewingHistory: null,
  settingsDraft: null,
  ...createAdncoUiDefaults(),
};

function persist() { saveAppState(state); }

function init() {
  const saved = loadAppState();
  if (saved) {
    state = { ...state, ...saved, adncoHistory: saved.adncoHistory ?? [], adncoStudents: saved.adncoStudents ?? [] };
  } else {
    state.personnel = createSamplePersonnel();
  }
  if (!state.adncoHistory) state.adncoHistory = [];
  if (!state.adncoStudents) state.adncoStudents = [];
  state.adncoStudents = normalizeStudentList(state.adncoStudents);
  if (state.activeTab === 'personnel') state.activeTab = 'generate';
  ui.settingsDraft = { ...state.settings, baselines: { ...state.settings.baselines } };
  ui.slots = createMonthSlots(ui.genYear, ui.genMonth, state.settings);
  initAdncoSlots({ state, ui });
  render();
}

function adncoCtx() {
  return { state, ui, persist, render, toast, esc, openModal, closeModal, triggerFileImport };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function ptsBadge(pts, max = 10) {
  const r = Math.round(34 + Math.min(pts / max, 1) * 200);
  const g = Math.round(180 - Math.min(pts / max, 1) * 140);
  const b = Math.round(90 - Math.min(pts / max, 1) * 60);
  const label = Number.isInteger(pts) ? `${pts}pt${pts !== 1 ? 's' : ''}` : `${pts}pts`;
  return `<span class="pts-badge" style="background:rgba(${r},${g},${b},0.2);color:rgb(${r},${g},${b});border-color:rgba(${r},${g},${b},0.4)">${label}</span>`;
}

function personMap() { return new Map(state.personnel.map((p) => [p.id, p])); }

function personnelForRosterMonth() {
  return resolvePersonnelForMonth(state.personnel, ui.genYear, ui.genMonth);
}

function personNALabel(p) {
  const input = (p.nonAvailabilityInput ?? '').trim();
  if (input === 'all') return 'Unavailable all month (no duty assigned)';
  if (input) return `Unavailable days: ${input}`;
  const nas = p.nonAvailability ?? [];
  if (!nas.length) return '';
  return nas.map((na) => `${formatShortDate(na.start)}–${formatShortDate(na.end)}${na.reason ? ` (${na.reason})` : ''}`).join('; ');
}

function renderBackupCard(context = 'generate') {
  const count = state.personnel.length;
  return `<div class="card" style="border-color:rgba(107,124,62,0.4);background:rgba(107,124,62,0.05)">
    <h3 class="font-semibold text-olive mb-2">📁 Personnel Backup (CSV)</h3>
    <p class="text-sm text-muted mb-3">Keep a CSV file on your shared drive or desktop. Import before generating; export after finalizing so someone can cover for you.</p>
    <div class="flex flex-wrap gap-2 mb-3">
      <button class="btn btn-primary btn-sm" data-action="import-personnel-backup">⬆ Import Backup (Replace All)</button>
      <button class="btn btn-secondary btn-sm" data-action="export-personnel-backup">⬇ Export Personnel Backup</button>
      <button class="btn btn-secondary btn-sm" data-action="backup-template">Download Template</button>
    </div>
    <p class="text-xs text-dim mb-2">${count} personnel loaded. Edit the backup CSV between months, then import before generating.</p>
    <p class="text-xs text-dim"><strong>non_availability column:</strong> blank = available all month · <strong>all</strong> = no duty that month · <strong>1-7</strong> = unavailable the 1st–7th · <strong>1-7;20-25</strong> = multiple ranges. Values apply to whichever month you generate.</p>
    ${context === 'generate' ? '<p class="text-xs text-gold mt-2">After finalize, a printable roster opens in a new tab (print dialog + personnel CSV).</p>' : ''}
  </div>`;
}

function openPersonnelBackupTab() {
  const backup = exportPersonnelBackup(state.personnel, state.settings);
  openCSVInNewTab(backup.content, backup.filename);
  return backup.filename;
}

function importPersonnelBackup(text) {
  const result = parsePersonnelBackupCSV(text);
  if (result.error) { alert(result.error); return false; }
  const msg = state.personnel.length
    ? `Replace all ${state.personnel.length} current personnel with ${result.personnel.length} from this backup?`
    : `Load ${result.personnel.length} personnel from backup?`;
  if (!confirm(msg)) return false;
  state.personnel = result.personnel;
  persist();
  if (result.errors?.length) alert('Some rows were skipped:\n' + result.errors.join('\n'));
  toast(`Loaded ${result.personnel.length} personnel from backup`);
  render();
  return true;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function openModal(title, body, footer = '', size = '') {
  ui.modal = { title, body, footer, size };
  render();
}

function closeModal() { ui.modal = null; render(); }

// ─── Render ──────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="header">
      <div class="header-brand">
        <div class="header-logo">🛡</div>
        <div><h1>YouGotFireWatch</h1><div class="unit-name">${esc(state.settings.unitName)}</div></div>
      </div>
      <button class="btn btn-secondary btn-sm" data-action="show-help">❓ How It Works</button>
    </header>
    <nav class="tabs">
      ${['generate','adnco','history','settings'].map((t) =>
        `<button class="tab-btn ${state.activeTab === t ? 'active' : ''}" data-action="tab" data-tab="${t}">${
          {generate:'📅 Generate OOD List',adnco:'🎓 Generate ADNCOs',history:'📋 History',settings:'⚙️ Settings'}[t]
        }</button>`
      ).join('')}
    </nav>
    <main class="main">${renderTab()}</main>
    <footer class="footer">YouGotFireWatch v${APP_VERSION} — Fair fire watch roster generator. All data stored locally in your browser.</footer>
    ${ui.modal ? renderModal() : ''}
  `;
}

function renderModal() {
  const m = ui.modal;
  return `<div class="modal-overlay" data-action="close-modal-overlay">
    <div class="modal ${m.size}">
      <div class="modal-header"><h2>${esc(m.title)}</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="modal-body">${m.body}${m.footer ? `<div class="modal-footer">${m.footer}</div>` : ''}</div>
    </div>
  </div>`;
}

function renderTab() {
  switch (state.activeTab) {
    case 'personnel':
    case 'generate': return renderGenerate();
    case 'adnco': return renderAdncoTab(adncoCtx());
    case 'history': return renderHistory();
    case 'settings': return renderSettings();
    default: return '';
  }
}

// ─── Personnel (inside Generate OOD tab) ─────────────────────────────────────
function renderPersonnelPanel() {
  if (!state.personnel.length && !ui.showPersonForm) {
    return `<div class="empty-state" style="padding:1.5rem"><div class="empty-icon">👥</div><h3>No Personnel Yet</h3>
      <p>Add unit members manually, import a backup CSV, or load sample data before generating.</p>
      <div class="flex gap-3 justify-center flex-wrap">
        <button class="btn btn-primary" data-action="show-person-form">Add Person</button>
        <button class="btn btn-secondary" data-action="import-personnel-backup">Import Backup</button>
        <button class="btn btn-secondary" data-action="load-sample">Load Sample Data</button>
      </div></div>`;
  }

  const filtered = state.personnel.filter((p) =>
    !ui.search || p.name.toLowerCase().includes(ui.search.toLowerCase()) ||
    p.rank.toLowerCase().includes(ui.search.toLowerCase()) ||
    (p.section || '').toLowerCase().includes(ui.search.toLowerCase())
  );

  return `
    <div class="flex flex-wrap justify-between items-center gap-3 mb-3">
      <p class="text-sm text-muted">${state.personnel.length} member${state.personnel.length !== 1 ? 's' : ''} — manage OOD duty roster here</p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary btn-sm" data-action="show-person-form">+ Add Person</button>
        <button class="btn btn-secondary btn-sm" data-action="load-sample">Load Sample</button>
      </div>
    </div>
    <input class="input mb-3" style="max-width:20rem" placeholder="Search personnel..." value="${esc(ui.search)}" data-action="search-personnel">
    ${ui.showPersonForm ? renderPersonForm() : ''}
    <div class="grid-3">${filtered.map((p) => renderPersonCard(p)).join('')}</div>
    ${!filtered.length && ui.search ? '<p class="text-center text-dim">No matches.</p>' : ''}
  `;
}

function renderPersonCard(p) {
  return `<div class="card person-card">
    <div class="flex justify-between mb-3">
      <div><span class="person-rank">${esc(p.rank)}</span><h3>${esc(p.name)}</h3>${p.section ? `<span class="text-xs text-dim">${esc(p.section)}</span>` : ''}</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" data-action="edit-person" data-id="${p.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-person" data-id="${p.id}">Del</button>
      </div>
    </div>
    <div class="flex gap-4 text-sm">
      <div><span class="text-dim">Points</span><div class="person-points">${p.points}</div></div>
      <div><span class="text-dim">Last Duty</span><div>${p.lastDutyDate ? formatShortDate(p.lastDutyDate) : 'Never'}</div></div>
    </div>
    ${(() => { const na = personNALabel(p); return na ? `<div class="na-badge">⚠ ${esc(na)}${(p.nonAvailabilityInput ?? '').trim() ? ` <span class="text-dim">(applies when generating ${formatMonthYear(ui.genMonth, ui.genYear)})</span>` : ''}</div>` : ''; })()}
    ${p.notes ? `<p class="text-xs text-dim mt-2" style="font-style:italic">${esc(p.notes)}</p>` : ''}
  </div>`;
}

function renderPersonForm() {
  const p = ui.editingPerson;
  const naVal = p?.nonAvailabilityInput ?? '';
  return `<form class="card mb-4" data-action="save-person">
    <h3 class="mb-4 font-semibold">${p ? 'Edit' : 'Add'} Person</h3>
    <div class="grid-4 gap-3 mb-3">
      <div><label class="label">Rank</label><input class="input" name="rank" value="${esc(p?.rank)}" required></div>
      <div style="grid-column:span 2"><label class="label">Name</label><input class="input" name="name" value="${esc(p?.name)}" required></div>
      <div><label class="label">Points</label><input class="input" type="number" name="points" value="${p?.points ?? 0}" min="0"></div>
      <div><label class="label">Section</label><input class="input" name="section" value="${esc(p?.section)}"></div>
      <div style="grid-column:span 3"><label class="label">Notes</label><input class="input" name="notes" value="${esc(p?.notes)}"></div>
    </div>
    <div class="mb-3">
      <label class="label">Non-Availability (for roster month)</label>
      <input class="input" name="non_availability" value="${esc(naVal)}" placeholder="blank = available · all = no duty · 1-7 · 1-7;20-25">
      <p class="hint">Day-of-month ranges resolved when you generate. Blank = available all month. <strong>all</strong> = skip duty entirely that month.</p>
    </div>
    <div class="flex gap-3 justify-end">
      <button type="button" class="btn btn-secondary" data-action="cancel-person-form">Cancel</button>
      <button type="submit" class="btn btn-primary">${p ? 'Update' : 'Add'} Person</button>
    </div>
  </form>`;
}

// ─── Generate Tab ────────────────────────────────────────────────────────────
function renderGenerate() {
  const roster = state.currentRoster;
  const isFinalized = roster?.finalized;
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);

  const resolvedForMonth = resolvePersonnelForMonth(state.personnel, ui.genYear, ui.genMonth);
  const monthDays = resolvedForMonth.length ? new Date(ui.genYear, ui.genMonth, 0).getDate() : 0;
  const dutyEligible = countDutyEligiblePersonnel(resolvedForMonth, ui.genYear, ui.genMonth);
  const staffingOk = dutyEligible >= monthDays;

  let html = `
    <div class="flex flex-wrap justify-between items-center gap-4 mb-4">
      <div><h2 style="font-size:1.25rem;font-weight:600">Generate OOD List</h2>
        <p class="text-sm text-muted">Manage personnel, configure hardship points, then generate a fair two-phase assignment</p>
        ${state.personnel.length ? `<p class="text-sm ${staffingOk ? 'text-olive' : 'text-amber'} mt-1">${dutyEligible} duty-eligible / ${monthDays} days this month${staffingOk ? ' — staffing OK' : ' — short-staffed; weekdays may not fill'}</p>` : ''}</div>
      <div class="flex gap-2">
        <select class="input w-auto" data-action="set-month">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${ui.genMonth===i+1?'selected':''}>${new Date(2000,i).toLocaleString('en',{month:'long'})}</option>`).join('')}</select>
        <select class="input w-auto" data-action="set-year">${years.map((y)=>`<option value="${y}" ${ui.genYear===y?'selected':''}>${y}</option>`).join('')}</select>
      </div>
    </div>

    <details class="card mb-4 personnel-panel" ${!state.personnel.length || ui.showPersonForm ? 'open' : ''}>
      <summary class="font-semibold" style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:0.5rem">
        <span>👥 Personnel</span>
        <span class="text-sm text-muted font-normal">${state.personnel.length ? `(${state.personnel.length})` : '— add before generating'}</span>
      </summary>
      <div class="mt-3">${renderPersonnelPanel()}</div>
    </details>

    ${renderBackupCard('generate')}
    <div class="info-box mb-4">👥 <strong>One duty per person per month</strong> — you need at least as many duty-eligible Marines as days in the month (e.g. 31 for July). Harder days fill first; if short-staffed, Mon–Thu may show unassigned. Equal points is fine — ties pick fairly.</div>
    <div class="info-box mb-4">📅 <strong>Assignment order:</strong> (1) Holidays & weekends → <span class="text-green">lowest-point</span> eligible Marines, (2) Fri then Mon–Thu → lowest-point still available, (3) <span class="text-gold">Supernumeraries last</span> → next-highest balances among Marines not on daily duty (different person per half).</div>
  `;

  if (!state.personnel.length) {
    html += `<div class="info-box">Add at least one person above before generating a roster.</div>`;
  } else if (!ui.generated) {
    html += `<div class="card"><h3 class="mb-4 font-semibold">Calendar Editor — ${formatMonthYear(ui.genMonth, ui.genYear)}</h3>
      ${renderCalendar(ui.slots, false)}</div>
      <div class="text-center mt-4"><button class="btn btn-primary btn-lg" data-action="generate">⚡ Generate OOD List</button></div>`;
  } else if (roster) {
    if (ui.warnings.length) {
      html += `<div class="card card-amber"><strong class="text-amber">⚠ Assignment Warnings</strong><ul class="text-sm mt-2">${ui.warnings.map((w)=>`<li>• ${esc(w)}</li>`).join('')}</ul></div>`;
    }
    if (!isFinalized) {
      html += `<div class="card"><h3 class="text-sm font-semibold text-muted mb-3">Adjust Points Before Re-generating</h3>${renderCalendar(ui.slots, false)}</div>`;
    }
    html += renderRosterResults(roster, isFinalized);
    if (!isFinalized) {
      html += `<div class="flex flex-wrap justify-center gap-3 mt-4 items-center">
        <label class="text-sm text-muted"><input type="checkbox" data-action="toggle-keep-manual" ${ui.keepManual?'checked':''}> Keep manual assignments on re-generate</label>
        <button class="btn btn-secondary" data-action="generate">🔄 Re-generate</button>
        <button class="btn btn-primary" data-action="show-finalize">🔒 Finalize Roster</button>
      </div>`;
    } else {
      html += `<p class="text-center text-olive mt-4">✓ Finalized — points and duty dates updated.</p>`;
    }
  }
  return html;
}

function renderCalendar(slots, showAssignments) {
  const maxPts = Math.max(...slots.map((s) => s.points), 10);
  const offset = getCalendarGridOffset(ui.genYear, ui.genMonth);
  const map = personMap();
  const cells = [...Array(offset).fill(null), ...slots];
  while (cells.length % 7) cells.push(null);

  return `
    ${!showAssignments ? `<div class="cal-tools">
      <button class="btn btn-secondary btn-sm" data-action="toggle-baselines">✏ Baselines</button>
      <button class="btn btn-secondary btn-sm" data-action="weekend-defaults">☀ Weekend/Holiday Defaults</button>
      <button class="btn btn-secondary btn-sm" data-action="reset-baseline">↺ Reset All</button>
      <button class="btn btn-secondary btn-sm" data-action="show-bulk">📆 Bulk Edit Range</button>
    </div>
    <div id="baselines-panel" class="hidden card mb-3 grid-5">
      ${[{key:'weekday',label:'M–Thu'},{key:'friday',label:'Friday'},{key:'saturday',label:'Saturday'},{key:'sunday',label:'Sunday'},{key:'holiday',label:'Holiday'}].map(({key,label})=>`<div><label class="label">${label}</label>
        <input class="input" type="number" step="0.5" data-action="set-baseline" data-key="${key}" value="${state.settings.baselines[key]}" min="0"></div>`).join('')}
    </div>` : ''}
    <div class="cal-grid">
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map((slot) => {
        if (!slot) return '<div class="cal-day empty"></div>';
        const dayNum = parseInt(slot.date.split('-')[2], 10);
        const holiday = getHolidayName(slot.date);
        const assigned = showAssignments && slot.personId ? map.get(slot.personId) : null;
        return `<button class="cal-day ${slot.note?'has-note':''} ${assigned?'assigned':''}" data-action="edit-day" data-date="${slot.date}" ${showAssignments?'disabled style="cursor:default"':''}>
          <div class="flex justify-between"><span class="cal-day-num">${dayNum}</span>${ptsBadge(slot.points, maxPts)}</div>
          ${holiday ? `<span class="text-xs text-gold" style="font-size:0.6rem">${holiday}</span>` : ''}
          ${slot.note && !holiday ? `<span class="cal-day-note">${esc(slot.note)}</span>` : ''}
          ${assigned ? `<span class="cal-day-person">${esc(assigned.rank)} ${esc(assigned.name.split(',')[0])}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="cal-legend">
      <span><span class="legend-dot" style="background:rgba(74,222,128,0.3);border:1px solid rgba(74,222,128,0.5)"></span>Low pts (desirable)</span>
      <span><span class="legend-dot" style="background:rgba(248,113,113,0.3);border:1px solid rgba(248,113,113,0.5)"></span>High pts (hardship)</span>
      <span>${slots.length} days — full coverage required</span>
    </div>`;
}

function renderRosterResults(roster, readOnly) {
  const map = personMap();
  const maxPts = Math.max(...roster.slots.map((s) => s.points), 10);
  const sorted = [...roster.slots].sort((a, b) => a.date.localeCompare(b.date));
  const dist = computePointDistribution(roster, state.personnel);

  return `
    <div class="flex justify-between items-center mb-4">
      <h3 class="font-semibold">Roster Results</h3>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" data-action="export-pdf">📄 Print/PDF</button>
        <button class="btn btn-secondary btn-sm" data-action="export-csv">📊 Export CSV</button>
      </div>
    </div>
    ${renderSupernumeraries(roster, readOnly)}
    <div class="card"><h4 class="text-sm font-semibold text-muted mb-3">Daily Assignments</h4>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Assigned To</th><th>Points</th><th>Note</th>${!readOnly?'<th>Reassign</th>':''}</tr></thead><tbody>
        ${sorted.map((slot) => {
          const person = slot.personId ? map.get(slot.personId) : null;
          return `<tr><td>${fullDayName(slot.date)}</td>
            <td>${person ? esc(person.rank)+' '+esc(person.name) : '<span class="text-amber">Unassigned</span>'}</td>
            <td>${ptsBadge(slot.points, maxPts)}</td><td class="text-xs text-dim">${esc(slot.note)}</td>
            ${!readOnly ? `<td><select class="input" style="width:auto;font-size:0.75rem" data-action="reassign" data-date="${slot.date}">
              <option value="">Unassigned</option>${state.personnel.map((p)=>`<option value="${p.id}" ${slot.personId===p.id?'selected':''}>${esc(p.rank)} ${esc(p.name)}</option>`).join('')}
            </select></td>` : ''}</tr>`;
        }).join('')}
      </tbody></table></div>
    </div>
    <div class="card"><h4 class="text-sm font-semibold text-muted mb-3">Visual Calendar</h4>
      ${renderCalendar(roster.slots, true)}</div>
    <div class="card"><h4 class="text-sm font-semibold text-muted mb-3">Point Distribution Preview</h4>
      <div class="table-wrap"><table class="data"><thead><tr><th>Person</th><th>Current</th><th>Projected</th><th>Duties</th><th>Super</th></tr></thead><tbody>
        ${dist.map((d)=>`<tr><td>${esc(d.rank)} ${esc(d.name)}</td><td class="font-mono text-dim">${d.currentPoints}</td>
          <td class="font-mono font-semibold">${d.projectedPoints}${d.projectedPoints>d.currentPoints?` <span class="text-amber text-xs">(+${d.projectedPoints-d.currentPoints})</span>`:''}</td>
          <td class="text-dim">${d.dutiesAssigned}</td><td>${d.isSupernumerary?'<span class="text-gold text-xs">★ Super</span>':''}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

function renderSupernumeraries(roster, readOnly) {
  const map = personMap();
  return `<div class="card card-gold mb-4">
    <div class="flex items-center gap-2 mb-4"><span class="text-gold" style="font-size:1.25rem">★</span>
      <h3 class="text-gold font-semibold">Supernumeraries</h3>
      <span class="text-xs text-dim">Desirable backup — next-highest balance among Marines not on daily duty; different person each half</span></div>
    <div class="grid-2 gap-3">${roster.supernumeraries.map((sup) => {
      const range = getHalfDateRange(roster.year, roster.month, sup.half, state.settings.halfSplitDay);
      const person = sup.personId ? map.get(sup.personId) : null;
      const halfLabel = sup.half === 'first' ? '1st Half' : '2nd Half';
      return `<div class="super-card ${sup.unfilled?'unfilled':'filled'}">
        <div class="flex justify-between mb-2">
          <div><span class="font-semibold">${halfLabel}</span>
            <p class="text-xs text-dim">Days ${sup.half==='first'?`1–${state.settings.halfSplitDay}`:`${state.settings.halfSplitDay+1}–end`} (${formatShortDate(range.start)} – ${formatShortDate(range.end)})</p></div>
          <span class="text-xs ${sup.unfilled?'text-amber':'text-olive'}">${sup.unfilled?'⚠ Unfilled':'✓ Assigned'}</span>
        </div>
        ${person ? `<p class="font-semibold">${esc(person.rank)} ${esc(person.name)}</p>
          <p class="text-xs text-dim">Points: ${person.points} → +${sup.pointsAwarded} super pts</p>
          ${!readOnly ? `<select class="input mt-2" style="font-size:0.8125rem" data-action="assign-super" data-half="${sup.half}">
            <option value="">Unassign</option>${state.personnel.map((p)=>`<option value="${p.id}" ${sup.personId===p.id?'selected':''}>${esc(p.rank)} ${esc(p.name)} (${p.points} pts)</option>`).join('')}
          </select>` : ''}` :
          (!readOnly ? `<p class="text-sm text-amber mb-2">No fully available person. Assign manually:</p>
            <select class="input" style="font-size:0.8125rem" data-action="assign-super" data-half="${sup.half}">
              <option value="">Select person...</option>${state.personnel.map((p)=>`<option value="${p.id}">${esc(p.rank)} ${esc(p.name)} (${p.points} pts)</option>`).join('')}
            </select>` : '<p class="text-amber">Unfilled</p>')}
      </div>`;
    }).join('')}</div></div>`;
}

// ─── History Tab ─────────────────────────────────────────────────────────────
function renderHistoryCard(entry) {
  if (entry.kind === 'ood') {
    const r = entry.roster;
    const assigned = r.slots.filter((s) => s.personId).length;
    const supers = r.supernumeraries.filter((s) => s.personId).length;
    const status = r.finalized ? '<span class="text-xs text-olive">OOD · Finalized</span>'
      : '<span class="text-xs text-amber">OOD · Generated</span>';
    const dateLine = r.finalizedAt
      ? `<p class="text-xs text-dim mb-3">Finalized ${new Date(r.finalizedAt).toLocaleDateString()}</p>` : '';
    return `<div class="card"><div class="flex justify-between mb-3">
        <h3 class="font-semibold">${formatMonthYear(r.month, r.year)}</h3>${status}</div>
        <div class="grid-3 text-sm mb-3"><div><span class="text-dim text-xs">Days</span><p class="font-mono">${assigned}/${r.slots.length}</p></div>
          <div><span class="text-dim text-xs">Supers</span><p class="font-mono">${supers}/2</p></div>
          <div><span class="text-dim text-xs">Total Pts</span><p class="font-mono">${r.slots.reduce((s, x) => s + x.points, 0)}</p></div></div>
        ${dateLine}
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" style="flex:1" data-action="view-history" data-id="${r.id}">View</button>
          <button class="btn btn-secondary btn-sm" data-action="print-history" data-id="${r.id}">📄</button>
        </div></div>`;
  }

  const r = entry.roster;
  const periods = groupAdncoSlotsByDay(r.slots).length;
  const assigned = r.slots.filter((s) => s.personId).length;
  const status = r.finalized ? '<span class="text-xs text-olive">ADNCO · Finalized</span>'
    : '<span class="text-xs text-amber">ADNCO · Generated</span>';
  const dateLine = r.finalizedAt
    ? `<p class="text-xs text-dim mb-3">Finalized ${new Date(r.finalizedAt).toLocaleDateString()}</p>`
    : '<p class="text-xs text-dim mb-3">Generated — not yet finalized</p>';
  return `<div class="card"><div class="flex justify-between mb-3">
      <h3 class="font-semibold">${formatMonthYear(r.month, r.year)}</h3>${status}</div>
      <div class="grid-3 text-sm mb-3"><div><span class="text-dim text-xs">Periods</span><p class="font-mono">${periods}</p></div>
        <div><span class="text-dim text-xs">Positions</span><p class="font-mono">${assigned}/${r.slots.length}</p></div>
        <div><span class="text-dim text-xs">Students</span><p class="font-mono">${state.adncoStudents.length}</p></div></div>
      ${dateLine}
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" style="flex:1" data-action="view-adnco-history" data-id="${r.id}">View</button>
        <button class="btn btn-secondary btn-sm" data-action="print-adnco-history" data-id="${r.id}">📄</button>
      </div></div>`;
}

function renderHistory() {
  if (ui.viewingAdncoHistory) {
    const r = ui.viewingAdncoHistory;
    return `<div class="flex flex-wrap gap-2 mb-4">
        <button class="btn btn-secondary btn-sm" data-action="back-history">← Back</button>
        ${!r.finalized ? `<button class="btn btn-primary btn-sm" data-action="open-adnco-from-history" data-id="${r.id}">✏ Edit in ADNCO Tab</button>` : ''}
      </div>
      ${renderAdncoResults(adncoCtx(), r)}`;
  }
  if (ui.viewingHistory) {
    return `<button class="btn btn-secondary btn-sm mb-4" data-action="back-history">← Back</button>
      ${renderRosterResults(ui.viewingHistory, true)}`;
  }

  const entries = [
    ...state.history.map((r) => ({ kind: 'ood', roster: r, year: r.year, month: r.month })),
    ...(state.adncoHistory ?? []).map((r) => ({ kind: 'adnco', roster: r, year: r.year, month: r.month })),
  ].sort((a, b) => b.year - a.year || b.month - a.month);

  if (!entries.length) {
    return `<div class="empty-state"><div class="empty-icon">📋</div><h3>No Roster History</h3>
      <p>Generated and finalized OOD and ADNCO rosters will appear here.</p></div>`;
  }

  const oodCount = state.history.length;
  const adncoCount = state.adncoHistory?.length ?? 0;
  const summary = [
    oodCount ? `${oodCount} OOD` : '',
    adncoCount ? `${adncoCount} ADNCO` : '',
  ].filter(Boolean).join(' · ');

  return `<div class="mb-4"><h2 style="font-size:1.25rem;font-weight:600">Roster History</h2>
    <p class="text-sm text-muted">${entries.length} roster${entries.length !== 1 ? 's' : ''}${summary ? ` (${summary})` : ''}</p></div>
    <div class="grid-3">${entries.map(renderHistoryCard).join('')}</div>`;
}

// ─── Settings Tab ────────────────────────────────────────────────────────────
function renderSettings() {
  const s = ui.settingsDraft;
  return `
    <div class="mb-4"><h2 style="font-size:1.25rem;font-weight:600">Settings</h2>
      <p class="text-sm text-muted">Configure defaults for roster generation and exports</p></div>
    <div class="card mb-4"><h3 class="text-sm font-semibold text-muted mb-3">Unit Information</h3>
      <label class="label">Unit Name (PDF exports)</label>
      <input class="input" data-action="settings-field" data-field="unitName" value="${esc(s.unitName)}"></div>
    <div class="card mb-4"><h3 class="text-sm font-semibold text-muted mb-3">Assignment Rules</h3>
      <div class="grid-3 gap-3">
        <div><label class="label">Cooldown Days</label><input class="input" type="number" data-action="settings-field" data-field="cooldownDays" value="${s.cooldownDays}" min="0">
          <p class="hint">Min days between duties for same person</p></div>
        <div><label class="label">Half Split Day</label><input class="input" type="number" data-action="settings-field" data-field="halfSplitDay" value="${s.halfSplitDay}" min="1" max="28">
          <p class="hint">Day splitting 1st/2nd half (default: 15)</p></div>
        <div><label class="label">Supernumerary Points</label><input class="input" type="number" data-action="settings-field" data-field="supernumeraryPoints" value="${s.supernumeraryPoints}" min="0">
          <p class="hint">Low value — desirable position</p></div>
      </div></div>
    <div class="card mb-4"><h3 class="text-sm font-semibold text-muted mb-3">Default Baseline Points</h3>
      <div class="grid-3 gap-3">${[{key:'weekday',label:'M–Thu'},{key:'friday',label:'Friday'},{key:'saturday',label:'Saturday'},{key:'sunday',label:'Sunday'},{key:'holiday',label:'Holiday'}].map(({key,label})=>
        `<div><label class="label">${label}</label><input class="input" type="number" step="0.5" data-action="settings-baseline" data-key="${key}" value="${s.baselines[key]}" min="0"></div>`
      ).join('')}</div></div>
    <button class="btn btn-primary mb-4" data-action="save-settings">💾 Save Settings</button>
    ${renderBackupCard('settings')}
    <div class="card"><h3 class="text-sm font-semibold text-muted mb-3">Advanced</h3>
      <div class="flex flex-wrap gap-3">
        <button class="btn btn-danger btn-sm" data-action="show-reset">Reset All Data</button>
      </div>
      <p class="text-xs text-dim mt-2">Reset clears browser data only. Your CSV backup files are not affected.</p>
    </div>`;
}

// ─── Event Handling ──────────────────────────────────────────────────────────
document.addEventListener('click', handleClick);
document.addEventListener('change', handleChange);
document.addEventListener('input', handleInput);
document.addEventListener('submit', handleSubmit);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.modal) closeModal();
});

function handleClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (handleAdncoClick(action, el, adncoCtx())) return;

  switch (action) {
    case 'tab': state.activeTab = el.dataset.tab === 'personnel' ? 'generate' : el.dataset.tab; render(); break;
    case 'show-help': showHelpModal(); break;
    case 'close-modal': ui.adncoModalDate = null; closeModal(); break;
    case 'close-modal-overlay':
      if (e.target === el) closeModal();
      break;
    case 'show-person-form': ui.showPersonForm = true; ui.editingPerson = null; render(); break;
    case 'cancel-person-form': ui.showPersonForm = false; ui.editingPerson = null; render(); break;
    case 'edit-person': ui.editingPerson = state.personnel.find((p) => p.id === el.dataset.id); ui.showPersonForm = true; render(); break;
    case 'delete-person':
      if (confirm('Delete this person?')) { state.personnel = state.personnel.filter((p) => p.id !== el.dataset.id); persist(); render(); }
      break;
    case 'load-sample': state.personnel = createSamplePersonnel(); persist(); toast('Sample data loaded'); render(); break;
    case 'import-personnel-backup': triggerFileImport('.csv', (text) => importPersonnelBackup(text)); break;
    case 'export-personnel-backup': { const f = openPersonnelBackupTab(); toast(`Opened ${f} in new tab`); break; }
    case 'backup-template': openCSVInNewTab(getPersonnelBackupTemplate(), 'YouGotFireWatch-Personnel-Backup-Template.csv'); break;

    case 'generate': doGenerate(); break;
    case 'toggle-baselines': document.getElementById('baselines-panel')?.classList.toggle('hidden'); break;
    case 'weekend-defaults': ui.slots = applyWeekendHolidayDefaults(ui.slots, state.settings, ui.genYear); syncSlots(); render(); break;
    case 'reset-baseline': ui.slots = resetSlotsToBaseline(ui.slots, state.settings, ui.genYear); syncSlots(); render(); break;
    case 'show-bulk': showBulkModal(); break;
    case 'edit-day': showDayModal(el.dataset.date); break;
    case 'show-finalize': showFinalizeModal(); break;
    case 'confirm-finalize': doFinalize(); break;
    case 'export-pdf': if (state.currentRoster) printRosterPDF(state.currentRoster, state.personnel, state.settings); break;
    case 'export-csv': if (state.currentRoster) openCSVInNewTab(exportRosterCSV(state.currentRoster, state.personnel, state.settings), `YouGotFireWatch-Detail-${ui.genYear}-${String(ui.genMonth).padStart(2,'0')}.csv`); break;
    case 'back-history': ui.viewingHistory = null; ui.viewingAdncoHistory = null; render(); break;
    case 'view-history':
      ui.viewingHistory = state.history.find((h) => h.id === el.dataset.id);
      ui.viewingAdncoHistory = null;
      render();
      break;
    case 'print-history': { const r = state.history.find((h) => h.id === el.dataset.id); if (r) printRosterPDF(r, state.personnel, state.settings); break; }
    case 'save-settings': saveSettings(); break;
    case 'show-reset': showResetModal(); break;
    case 'confirm-reset': clearAllData(); state = { personnel: createSamplePersonnel(), settings: { ...DEFAULT_SETTINGS }, currentRoster: null, history: [], currentAdncoRoster: null, adncoHistory: [], adncoStudents: [], activeTab: 'settings' }; ui.settingsDraft = { ...state.settings, baselines: { ...state.settings.baselines } }; Object.assign(ui, createAdncoUiDefaults()); closeModal(); toast('Data reset'); render(); break;
    case 'apply-bulk': applyBulk(); break;
    case 'save-day': saveDayEdit(); break;
  }
}

function handleChange(e) {
  const el = e.target;
  const action = el.dataset?.action;
  if (handleAdncoChange(action, el, adncoCtx())) return;
  if (action === 'set-month') { changeMonth(parseInt(el.value, 10), ui.genYear); }
  else if (action === 'set-year') { changeMonth(ui.genMonth, parseInt(el.value, 10)); }
  else if (action === 'toggle-keep-manual') { ui.keepManual = el.checked; }
  else if (action === 'reassign') { reassignSlot(el.dataset.date, el.value || null); }
  else if (action === 'assign-super') { assignSuper(el.dataset.half, el.value || null); }
  else if (action === 'set-baseline') {
    state.settings.baselines[el.dataset.key] = parseFloat(el.value) || 0;
    persist();
  }
}

function handleInput(e) {
  const el = e.target;
  if (handleAdncoInput(el, adncoCtx())) return;
  if (el.dataset?.action === 'search-personnel') { ui.search = el.value; render(); }
  else if (el.dataset?.action === 'settings-field') {
    const field = el.dataset.field;
    ui.settingsDraft[field] = el.type === 'number' ? parseInt(el.value, 10) || 0 : el.value;
  }
  else if (el.dataset?.action === 'settings-baseline') {
    ui.settingsDraft.baselines[el.dataset.key] = parseFloat(el.value) || 0;
  }

}

function handleSubmit(e) {
  e.preventDefault();
  if (handleAdncoSubmit(e.target, adncoCtx())) return;
  if (e.target.dataset?.action === 'save-person') savePerson(e.target);
}

function savePerson(form) {
  const fd = new FormData(form);
  const na = parseNonAvailabilityColumn(fd.get('non_availability') || '');
  const person = {
    id: ui.editingPerson?.id || generateId(),
    rank: fd.get('rank').trim(),
    name: fd.get('name').trim(),
    points: parseInt(fd.get('points'), 10) || 0,
    lastDutyDate: ui.editingPerson?.lastDutyDate || null,
    section: fd.get('section')?.trim() || undefined,
    notes: fd.get('notes')?.trim() || undefined,
    nonAvailabilityInput: na.nonAvailabilityInput,
    nonAvailability: na.nonAvailability,
  };
  if (ui.editingPerson) {
    const idx = state.personnel.findIndex((p) => p.id === person.id);
    if (idx >= 0) state.personnel[idx] = person;
  } else {
    state.personnel.push(person);
  }
  ui.showPersonForm = false; ui.editingPerson = null;
  persist(); toast('Person saved'); render();
}

function changeMonth(month, year) {
  ui.genMonth = month; ui.genYear = year; ui.generated = false; ui.warnings = [];
  const existing = state.history.find((h) => h.month === month && h.year === year);
  if (existing) { state.currentRoster = existing; ui.slots = existing.slots; ui.generated = true; }
  else { state.currentRoster = null; ui.slots = createMonthSlots(year, month, state.settings); }
  persist(); render();
}

function syncSlots() {
  if (state.currentRoster) state.currentRoster = { ...state.currentRoster, slots: ui.slots };
  persist();
}

function doGenerate() {
  const result = generateRoster(ui.genYear, ui.genMonth, state.personnel, state.settings, state.currentRoster, ui.keepManual, ui.slots);
  state.currentRoster = result.roster;
  ui.slots = result.roster.slots;
  ui.warnings = result.warnings;
  ui.generated = true;
  persist(); render();
}

function reassignSlot(date, personId) {
  if (!state.currentRoster) return;
  if (personId) {
    const v = validateDailyAssignment(personId, date, state.currentRoster.slots, personnelForRosterMonth());
    if (!v.valid) { alert(v.message); render(); return; }
  }
  state.currentRoster.slots = state.currentRoster.slots.map((s) => s.date === date ? { ...s, personId } : s);
  ui.slots = state.currentRoster.slots;
  persist(); render();
}

function assignSuper(half, personId) {
  if (!state.currentRoster) return;
  if (personId) {
    const v = validateSupernumeraryAssignment(
      personId, half, personnelForRosterMonth(), ui.genYear, ui.genMonth,
      state.settings.halfSplitDay, state.currentRoster.slots, state.currentRoster.supernumeraries
    );
    if (!v.valid) { alert(v.message); render(); return; }
  }
  state.currentRoster.supernumeraries = state.currentRoster.supernumeraries.map((s) =>
    s.half === half ? { ...s, personId, unfilled: !personId } : s
  );
  persist(); render();
}

function doFinalize() {
  if (!state.currentRoster) return;
  state.personnel = finalizeRoster(state.currentRoster, state.personnel, state.settings.halfSplitDay);
  const finalized = { ...state.currentRoster, finalized: true, finalizedAt: new Date().toISOString() };
  const idx = state.history.findIndex((h) => h.month === finalized.month && h.year === finalized.year);
  if (idx >= 0) state.history[idx] = finalized; else state.history.push(finalized);
  state.currentRoster = finalized;
  closeModal(); persist();

  // Open both windows immediately (same click — avoids pop-up blocker).
  const printed = openFinalizePrintout(finalized, state.personnel, state.settings);
  const personnelBackup = exportPersonnelBackup(state.personnel, state.settings);
  const csvOpened = openCSVInNewTab(personnelBackup.content, personnelBackup.filename);

  if (printed && csvOpened) {
    toast('Finalized! Roster printout + personnel CSV opened in new windows.');
  } else if (printed) {
    toast('Roster opened. Allow pop-ups for personnel CSV too.');
  } else if (csvOpened) {
    toast('Personnel CSV opened. Allow pop-ups for the printable roster.');
  } else {
    toast('Finalized! Allow pop-ups, then use Export buttons in History.');
  }
  render();
}

function saveSettings() {
  state.settings = { ...ui.settingsDraft, baselines: { ...ui.settingsDraft.baselines } };
  persist(); toast('Settings saved'); render();
}

function showDayModal(date) {
  const slot = ui.slots.find((s) => s.date === date);
  if (!slot) return;
  openModal(`Edit ${fullDayName(date)}`,
    `<div class="mb-3"><label class="label">Points Value</label>
      <input class="input" id="day-pts" type="number" step="0.5" value="${slot.points}" min="0">
      <p class="hint">Higher = more hardship. Adjust for 96s, holidays, surge periods.</p></div>
      <div><label class="label">Note</label>
      <input class="input" id="day-note" value="${esc(slot.note)}" placeholder="e.g., during 96 liberty"></div>`,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save-day" data-date="${date}">Save</button>`,
    'sm'
  );
  ui._editDate = date;
}

function saveDayEdit() {
  const pts = parseFloat(document.getElementById('day-pts')?.value) || 0;
  const note = document.getElementById('day-note')?.value || '';
  ui.slots = ui.slots.map((s) => s.date === ui._editDate ? { ...s, points: pts, note: note || undefined } : s);
  syncSlots(); closeModal(); render();
}

function showBulkModal() {
  openModal('Bulk Edit Date Range',
    `<p class="text-sm text-muted mb-3">Perfect for 96-hour liberty periods or known event blocks.</p>
     <div class="grid-2 gap-3 mb-3">
       <div><label class="label">Start Date</label><input class="input" id="bulk-start" type="date"></div>
       <div><label class="label">End Date</label><input class="input" id="bulk-end" type="date"></div>
     </div>
     <div class="mb-3"><label class="label">Points Value</label><input class="input" id="bulk-pts" type="number" step="0.5" value="1" min="0"></div>
     <div><label class="label">Note</label><input class="input" id="bulk-note" placeholder="e.g., 96-hour liberty period"></div>`,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="apply-bulk">Apply to Range</button>`, 'sm');
}

function applyBulk() {
  const start = document.getElementById('bulk-start')?.value;
  const end = document.getElementById('bulk-end')?.value;
  if (!start || !end) return;
  const pts = parseFloat(document.getElementById('bulk-pts')?.value);
  const note = document.getElementById('bulk-note')?.value;
  ui.slots = applyBulkUpdate(ui.slots, start, end, { points: pts, note: note || undefined });
  syncSlots(); closeModal(); render();
}

function showFinalizeModal() {
  openModal('Finalize Roster',
    `<p class="text-sm text-muted mb-3">Finalizing permanently updates all personnel points and last duty dates. The roster is saved to History and locked.</p>
     <p class="text-sm text-muted mb-3">A <strong>printable monthly roster</strong> opens in a new tab (print dialog appears automatically), plus an updated personnel CSV. Allow pop-ups if prompted.</p>
     <p class="text-sm text-amber">Verify all assignments before confirming.</p>`,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="confirm-finalize">🔒 Confirm Finalize</button>`, 'sm');
}

function showResetModal() {
  openModal('Reset All Data',
    `<p class="text-sm text-amber mb-2">⚠ This deletes everything and loads sample data.</p>
     <p class="text-sm text-muted">All personnel, rosters, history, and settings will be permanently deleted.</p>`,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-danger" data-action="confirm-reset">Reset Everything</button>`, 'sm');
}

function showHelpModal() {
  openModal('How YouGotFireWatch Works',
    `<p class="text-sm text-muted mb-4">YouGotFireWatch runs <strong>two separate roster systems</strong> — main OOD fire watch (points-based) and ADNCO student duty (random fair rotation). They do not share personnel lists.</p>

     <h3 class="text-gold font-semibold mb-2">📅 OOD Fire Watch (Generate OOD List)</h3>
     <p class="text-sm text-muted mb-3">Personnel live in the Generate OOD List tab. A two-phase algorithm assigns one Marine per day plus two supernumerary half-month positions.</p>
     <div class="card mb-3" style="padding:1rem"><strong>Phase 1: Daily Duties</strong>
       <p class="text-sm text-muted mt-1"><strong>1.</strong> Holidays & weekends → <span class="text-green">lowest-point</span> eligible Marine. <strong>2.</strong> Friday, then Mon–Thu → lowest-point Marines still free. Non-availability and cooldown respected.</p></div>
     <div class="card mb-3" style="padding:1rem"><strong class="text-gold">★ Phase 2: Supernumeraries</strong>
       <p class="text-sm text-muted mt-1">Each half-month goes to a <em>different</em> Marine — the <span class="text-gold">next-highest point balance</span> among those fully available and <em>not</em> on daily duty that half.</p></div>
     <div class="card mb-3" style="padding:1rem"><strong>📊 Points & Calendar</strong>
       <p class="text-sm text-muted mt-1">Click calendar days to set hardship points and notes (96s, holidays). Finalizing permanently updates points and last duty dates. Use the personnel CSV backup workflow each month.</p></div>

     <h3 class="text-gold font-semibold mb-2 mt-4">🎓 ADNCO Student Duty (Generate ADNCOs)</h3>
     <p class="text-sm text-muted mb-3">Student CSV uses <strong>section</strong> (1, 2, 3 = Academic platoons; MAT = MAT platoon). <strong>Generate auto-fills Academic periods only</strong> — MAT platoon completes MAT rows in Excel after finalize.</p>
     <div class="card mb-3" style="padding:1rem"><strong>Monthly Workflow</strong>
       <p class="text-sm text-muted mt-1">Import student CSV → generate (Academic only) → finalize → <strong>Excel roster downloads</strong> (MAT rows blank) + student CSV. Send Excel to MAT platoon; save CSV for next month.</p></div>
     <div class="card mb-3" style="padding:1rem"><strong>Duty Windows</strong>
       <p class="text-sm text-muted mt-1">Academic fair rotation: never-stood first, then oldest <strong>lastDutyDate</strong>. Fri/Sun split unless the whole day is one type (then 0630→0630).</p></div>
     <div class="card" style="padding:1rem"><strong>✏ ADNCO Calendar</strong>
       <p class="text-sm text-muted mt-1">Click days to pre-assign, add notes, or override <strong>MAT ↔ Academic</strong> per period (e.g. 96 liberty). DNCO requires LCpl; driver requires license Y.</p></div>`,
    `<button class="btn btn-primary" data-action="close-modal" style="width:100%">Got It</button>`, 'lg');
}

function triggerFileImport(accept, callback) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => callback(e.target.result);
    reader.readAsText(file);
  };
  input.click();
}

// ─── Boot ────────────────────────────────────────────────────────────────────
init();