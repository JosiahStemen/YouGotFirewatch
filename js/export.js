import { formatMonthYear, formatDisplayDate, getHalfDateRange, getCalendarGridOffset } from './dateUtils.js';
import { getHolidayName } from './holidays.js';
import { exportPersonnelBackup } from './personnelBackup.js';

export function exportRosterCSV(roster, personnel, settings) {
  const map = new Map(personnel.map((p) => [p.id, p]));
  const lines = [`Unit,${settings.unitName}`, `Month,${formatMonthYear(roster.month, roster.year)}`, '', 'Date,Day,Rank,Name,Points,Note'];
  for (const slot of [...roster.slots].sort((a, b) => a.date.localeCompare(b.date))) {
    const person = slot.personId ? map.get(slot.personId) : null;
    lines.push([slot.date, new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }), person?.rank ?? 'UNASSIGNED', person?.name ?? '', slot.points, `"${(slot.note || '').replace(/"/g, '""')}"`].join(','));
  }
  lines.push('', 'Supernumeraries', 'Half,Rank,Name,Points,Status,Note');
  for (const sup of roster.supernumeraries) {
    const person = sup.personId ? map.get(sup.personId) : null;
    const range = getHalfDateRange(roster.year, roster.month, sup.half, settings.halfSplitDay);
    lines.push([`${sup.half} (${range.start} to ${range.end})`, person?.rank ?? 'UNFILLED', person?.name ?? '', sup.pointsAwarded, sup.unfilled ? 'UNFILLED' : 'ASSIGNED', `"${(sup.note || '').replace(/"/g, '""')}"`].join(','));
  }
  return lines.join('\n');
}

export function formatRankLastName(person) {
  if (!person) return 'UNASSIGNED';
  const lastName = person.name.includes(',') ? person.name.split(',')[0].trim() : person.name.trim();
  return `${person.rank} ${lastName}`;
}

export function exportMonthlyDutyRosterSimple(roster, personnel) {
  const map = new Map(personnel.map((p) => [p.id, p]));
  const lines = ['Date,Rank and Last Name'];
  for (const slot of [...roster.slots].sort((a, b) => a.date.localeCompare(b.date))) {
    const person = slot.personId ? map.get(slot.personId) : null;
    const label = formatRankLastName(person);
    lines.push(`${slot.date},"${label.replace(/"/g, '""')}"`);
  }
  const filename = `YouGotFireWatch-Roster-${roster.year}-${String(roster.month).padStart(2, '0')}.csv`;
  return { content: lines.join('\n'), filename };
}

/** Open CSV in a new tab so the main app stays open. */
export function openCSVInNewTab(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Allow pop-ups to export CSV.');
    URL.revokeObjectURL(blobUrl);
    return false;
  }
  const safeName = filename.replace(/</g, '');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeName}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #1a2332; }
  h1 { font-size: 1.1rem; margin-bottom: 6px; }
  p { color: #666; font-size: 0.875rem; margin-bottom: 14px; }
  a.dl { display: inline-block; padding: 8px 16px; background: #b8941f; color: #0a0f1a;
    text-decoration: none; border-radius: 6px; font-weight: 600; margin-bottom: 16px; }
  pre { background: #f4f4f5; padding: 16px; border-radius: 8px; overflow: auto; font-size: 13px; line-height: 1.5; }
</style></head><body>
<h1>${safeName}</h1>
<p>Download the file below, then close this tab to return to YouGotFireWatch.</p>
<a class="dl" id="dl" href="${blobUrl}" download="${safeName}">Download CSV</a>
<pre id="preview"></pre>
<script>
  document.getElementById('preview').textContent = ${JSON.stringify(csvContent)};
  window.addEventListener('load', function() { document.getElementById('dl').click(); });
</script>
</body></html>`);
  win.document.close();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  return true;
}

export function downloadFile(content, filename, mime) {
  openCSVInNewTab(content, filename);
}

/**
 * Opens one new tab with a printable monthly roster + personnel points.
 * Auto-triggers the browser print dialog. Includes CSV download links as backup.
 */
export function openFinalizePrintout(roster, personnel, settings) {
  const monthLabel = formatMonthYear(roster.month, roster.year);
  const personMap = new Map(personnel.map((p) => [p.id, p]));
  const sorted = [...roster.slots].sort((a, b) => a.date.localeCompare(b.date));

  const dutyRows = sorted.map((slot) => {
    const person = slot.personId ? personMap.get(slot.personId) : null;
    const displayDate = new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    return `<tr><td>${displayDate}</td><td>${formatRankLastName(person)}</td></tr>`;
  }).join('');

  const superRows = roster.supernumeraries.map((sup) => {
    const person = sup.personId ? personMap.get(sup.personId) : null;
    const range = getHalfDateRange(roster.year, roster.month, sup.half, settings.halfSplitDay);
    const half = sup.half === 'first' ? '1st Half' : '2nd Half';
    return `<tr><td>${half}</td><td>${formatShortDate(range.start)} – ${formatShortDate(range.end)}</td><td>${formatRankLastName(person)}</td></tr>`;
  }).join('');

  const personnelSorted = [...personnel].sort((a, b) => a.name.localeCompare(b.name));
  const personnelRows = personnelSorted.map((p) =>
    `<tr><td>${p.rank}</td><td>${p.name}</td><td style="text-align:center">${p.points}</td><td>${p.lastDutyDate || '—'}</td></tr>`
  ).join('');

  const dutyCsv = exportMonthlyDutyRosterSimple(roster, personnel);
  const personnelCsv = exportPersonnelBackup(personnel, settings);
  const dutyBlob = URL.createObjectURL(new Blob([dutyCsv.content], { type: 'text/csv' }));
  const personnelBlob = URL.createObjectURL(new Blob([personnelCsv.content], { type: 'text/csv' }));

  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Allow pop-ups for this site, then finalize again.');
    URL.revokeObjectURL(dutyBlob);
    URL.revokeObjectURL(personnelBlob);
    return false;
  }

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${settings.unitName} — ${monthLabel} Roster</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 32px; color: #1a2332; }
  h1 { font-size: 1.35rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; color: #666; font-weight: normal; margin: 0 0 20px; }
  h3 { font-size: 0.95rem; border-bottom: 2px solid #c9a227; padding-bottom: 4px; margin: 24px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
  th { background: #1a2332; color: #c9a227; padding: 8px 10px; text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e5e5; }
  tr:nth-child(even) { background: #f9f9f9; }
  .noprint { margin-bottom: 20px; padding: 12px; background: #f0f4f8; border-radius: 8px; font-size: 13px; }
  .noprint button, .noprint a { display: inline-block; margin-right: 10px; padding: 8px 16px;
    background: #b8941f; color: #0a0f1a; border: none; border-radius: 6px; font-weight: 600;
    text-decoration: none; cursor: pointer; font-size: 13px; }
  .footer { margin-top: 24px; font-size: 10px; color: #999; }
  @media print {
    .noprint { display: none !important; }
    body { margin: 16px; }
  }
</style></head><body>
<div class="noprint">
  <strong>Ready to print.</strong> Use the button below or File → Print. Close this tab to return to YouGotFireWatch.
  <br><br>
  <button onclick="window.print()">🖨 Print Roster</button>
  <a id="dl-roster" href="${dutyBlob}" download="${dutyCsv.filename}">⬇ Download Roster CSV</a>
  <a id="dl-personnel" href="${personnelBlob}" download="${personnelCsv.filename}">⬇ Download Personnel CSV</a>
</div>
<h1>${settings.unitName}</h1>
<h2>Fire Watch Roster — ${monthLabel}</h2>
${roster.finalizedAt ? `<p style="font-size:12px;color:#888;margin-bottom:16px">Finalized ${formatDisplayDate(roster.finalizedAt.split('T')[0])}</p>` : ''}
<h3>Monthly Duty Assignments</h3>
<table><thead><tr><th>Date</th><th>Rank and Last Name</th></tr></thead><tbody>${dutyRows}</tbody></table>
<h3>Supernumeraries</h3>
<table><thead><tr><th>Half</th><th>Period</th><th>Assigned To</th></tr></thead><tbody>${superRows}</tbody></table>
<h3>Updated Personnel Points</h3>
<table><thead><tr><th>Rank</th><th>Name</th><th>Points</th><th>Last Duty</th></tr></thead><tbody>${personnelRows}</tbody></table>
<p class="footer">YouGotFireWatch — ${settings.unitName}</p>
<script>
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 400);
  });
</script>
</body></html>`);
  win.document.close();
  setTimeout(() => { URL.revokeObjectURL(dutyBlob); URL.revokeObjectURL(personnelBlob); }, 120000);
  return true;
}

function formatShortDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Opens a new tab with a large month-grid calendar for wall posting.
 * Auto-triggers the browser print dialog (landscape recommended).
 */
export function openOodCalendarPrintout(roster, personnel, settings) {
  const monthLabel = formatMonthYear(roster.month, roster.year);
  const personMap = new Map(personnel.map((p) => [p.id, p]));
  const offset = getCalendarGridOffset(roster.year, roster.month);
  const sorted = [...roster.slots].sort((a, b) => a.date.localeCompare(b.date));
  const cells = [...Array(offset).fill(null), ...sorted];
  while (cells.length % 7) cells.push(null);

  const gridCells = cells.map((slot) => {
    if (!slot) return '<div class="day empty"></div>';
    const dayNum = parseInt(slot.date.split('-')[2], 10);
    const holiday = getHolidayName(slot.date);
    const person = slot.personId ? personMap.get(slot.personId) : null;
    const assignee = person ? formatRankLastName(person) : 'Unassigned';
    const note = slot.note && !holiday ? `<div class="note">${slot.note}</div>` : '';
    const hol = holiday ? `<div class="holiday">${holiday}</div>` : '';
    return `<div class="day${person ? ' filled' : ''}">
      <div class="num">${dayNum}</div>
      ${hol}
      <div class="assignee">${assignee}</div>
      ${note}
    </div>`;
  }).join('');

  const superLines = roster.supernumeraries.map((sup) => {
    const person = sup.personId ? personMap.get(sup.personId) : null;
    const range = getHalfDateRange(roster.year, roster.month, sup.half, settings.halfSplitDay);
    const half = sup.half === 'first' ? '1st Half' : '2nd Half';
    const label = person ? formatRankLastName(person) : 'Unfilled';
    return `<div class="super"><strong>${half}</strong> (${formatShortDate(range.start)} – ${formatShortDate(range.end)}): ${label}</div>`;
  }).join('');

  const finalized = roster.finalizedAt
    ? `<p class="meta">Finalized ${formatDisplayDate(roster.finalizedAt.split('T')[0])}</p>` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${settings.unitName} — ${monthLabel} OOD Calendar</title>
<style>
  * { box-sizing: border-box; }
  @page { size: landscape; margin: 0.4in; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0.5in; color: #1a2332; }
  h1 { font-size: 1.6rem; margin: 0 0 2px; letter-spacing: 0.02em; }
  h2 { font-size: 1.15rem; font-weight: normal; color: #444; margin: 0 0 6px; }
  .meta { font-size: 0.75rem; color: #777; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
  .dow { text-align: center; font-size: 0.85rem; font-weight: 700; color: #1a2332;
    background: #1a2332; color: #c9a227; padding: 6px 4px; border-radius: 3px; }
  .day { border: 2px solid #1a2332; border-radius: 4px; min-height: 1.35in;
    padding: 6px 8px; display: flex; flex-direction: column; background: #fff; }
  .day.empty { visibility: hidden; border: none; }
  .day.filled { background: #faf8f0; }
  .num { font-size: 1.1rem; font-weight: 700; line-height: 1; margin-bottom: 4px; }
  .assignee { font-size: 0.95rem; font-weight: 700; line-height: 1.15; margin-top: auto;
    color: #1a2332; word-break: break-word; }
  .holiday { font-size: 0.6rem; font-weight: 600; color: #b8941f; margin-bottom: 2px; }
  .note { font-size: 0.55rem; color: #666; margin-top: 2px; }
  .supers { margin-top: 14px; padding-top: 10px; border-top: 2px solid #c9a227; }
  .supers h3 { font-size: 0.85rem; margin: 0 0 6px; color: #1a2332; }
  .super { font-size: 0.8rem; margin-bottom: 3px; }
  .footer { margin-top: 10px; font-size: 0.6rem; color: #999; text-align: center; }
  .no-print { margin-bottom: 14px; padding: 10px 12px; background: #f0f4f8; border-radius: 6px; font-size: 0.8rem; }
  .no-print button { padding: 8px 16px; background: #b8941f; color: #0a0f1a; border: none;
    border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.8rem; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 0; }
    .day { min-height: 1.2in; }
  }
</style></head><body>
<div class="no-print">
  <strong>Wall calendar ready.</strong> Use landscape orientation for best results. Close this tab when done.
  <br><br><button onclick="window.print()">🖨 Print Calendar</button>
</div>
<h1>${settings.unitName}</h1>
<h2>OOD Calendar — ${monthLabel}</h2>
${finalized}
<div class="grid">
  ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d) => `<div class="dow">${d}</div>`).join('')}
  ${gridCells}
</div>
<div class="supers">
  <h3>★ Supernumeraries</h3>
  ${superLines}
</div>
<p class="footer">YouGotFireWatch — ${settings.unitName}</p>
<script>setTimeout(() => window.print(), 400);</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); return true; }
  alert('Pop-up blocked. Allow pop-ups to print the calendar.');
  return false;
}

export function printRosterPDF(roster, personnel, settings) {
  const map = new Map(personnel.map((p) => [p.id, p]));
  const monthLabel = formatMonthYear(roster.month, roster.year);
  const sorted = [...roster.slots].sort((a, b) => a.date.localeCompare(b.date));

  let superRows = roster.supernumeraries.map((sup) => {
    const person = sup.personId ? map.get(sup.personId) : null;
    const range = getHalfDateRange(roster.year, roster.month, sup.half, settings.halfSplitDay);
    return `<tr><td>${sup.half === 'first' ? '1st Half' : '2nd Half'}</td><td>${range.start} – ${range.end}</td><td>${person ? person.rank + ' ' + person.name : 'UNFILLED'}</td><td>${sup.pointsAwarded}</td><td>${sup.unfilled ? 'Needs Assignment' : 'Assigned'}</td></tr>`;
  }).join('');

  let dailyRows = sorted.map((slot) => {
    const person = slot.personId ? map.get(slot.personId) : null;
    const day = new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `<tr><td>${day}</td><td>${person ? person.rank + ' ' + person.name : 'UNASSIGNED'}</td><td>${slot.points}</td><td>${slot.note || ''}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><title>YouGotFireWatch ${monthLabel}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1a2332; }
  h1 { color: #1a2332; margin-bottom: 4px; } h2 { color: #666; font-weight: normal; font-size: 16px; }
  h3 { color: #1a2332; border-bottom: 2px solid #c9a227; padding-bottom: 4px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th { background: #1a2332; color: #c9a227; padding: 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f5f5f5; }
  .footer { margin-top: 24px; font-size: 10px; color: #999; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${settings.unitName}</h1>
<h2>Duty Roster — ${monthLabel}</h2>
${roster.finalizedAt ? `<p style="font-size:12px;color:#999">Finalized: ${formatDisplayDate(roster.finalizedAt.split('T')[0])}</p>` : ''}
<h3>Supernumeraries (Desirable Backup Positions)</h3>
<table><thead><tr><th>Half</th><th>Period</th><th>Assigned To</th><th>Points</th><th>Status</th></tr></thead><tbody>${superRows}</tbody></table>
<h3>Daily Assignments</h3>
<table><thead><tr><th>Date</th><th>Assigned To</th><th>Points</th><th>Note</th></tr></thead><tbody>${dailyRows}</tbody></table>
<p class="footer">YouGotFireWatch: Daily duties to lowest-point eligible personnel. Supernumeraries go to the next-highest balances among Marines not on daily duty (different person per half).</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else alert('Pop-up blocked. Allow pop-ups to print/export PDF.');
}

export function parsePersonnelCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const vals = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    if (!row.name || !row.rank) return null;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      rank: row.rank, name: row.name,
      points: parseInt(row.points, 10) || 0,
      lastDutyDate: null,
      section: row.section || undefined,
      notes: row.notes || undefined,
      nonAvailability: [],
    };
  }).filter(Boolean);
}

export function getPersonnelCSVTemplate() {
  return 'rank,name,points,section,notes\nSSgt,Martinez J.,12,Admin,\nSgt,Thompson R.,18,Operations,\nCpl,Williams K.,8,Supply,';
}