import { formatMonthYear, formatDisplayDate, getHalfDateRange } from './dateUtils.js';
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
<p class="footer">YouGotFireWatch: Daily duties to lowest-point eligible personnel. Supernumeraries reward highest-point fully-available personnel.</p>
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