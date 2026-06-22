import { formatMonthYear } from './dateUtils.js';
import { groupAdncoSlotsByDay, ADNCO_POSITIONS } from './adncoRoster.js';

function personCell(p) {
  if (!p) return '';
  return `${p.rank} ${p.lastName}, ${p.firstName}${p.phoneNumber ? ` (${p.phoneNumber})` : ''}`;
}

function excelAssigneeCell(p, isMat) {
  if (!p) {
    return isMat ? '' : '<em>Unassigned</em>';
  }
  const phone = p.phoneNumber
    ? `<br><span style="font-size:10pt;color:#374151">${escapeHtml(p.phoneNumber)}</span>`
    : '';
  return `${escapeHtml(p.rank)} ${escapeHtml(p.lastName)}, ${escapeHtml(p.firstName)}${phone}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAdncoExcelHtml(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const monthLabel = formatMonthYear(roster.month, roster.year);
  const unit = escapeHtml(settings?.unitName || 'YouGotFireWatch');
  const generated = new Date().toLocaleString();
  const posHeaders = ADNCO_POSITIONS.map((p) =>
    `<th style="background:#1a2332;color:#ffffff;font-weight:bold;border:1px solid #9ca3af;padding:8px 10px;text-align:center;font-family:Arial,sans-serif;font-size:11pt">${escapeHtml(p.label)}</th>`
  ).join('');

  const rows = days.map((day) => {
    const isMat = day.eligibleType === 'MAT';
    const rowClass = isMat ? 'mat-row' : 'academic-row';
    const typeBg = isMat ? '#dbeafe' : '#fef3c7';
    const typeColor = isMat ? '#1e40af' : '#92400e';
    const cells = ADNCO_POSITIONS.map((pos) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      const cellBg = isMat ? '#fffbeb' : (p ? '#f0fdf4' : '#fef2f2');
      const border = isMat ? '2px solid #f59e0b' : '1px solid #d1d5db';
      return `<td style="background:${cellBg};border:${border};padding:8px 10px;vertical-align:top;font-family:Arial,sans-serif;font-size:11pt;min-width:120px">${excelAssigneeCell(p, isMat)}</td>`;
    }).join('');
    return `<tr class="${rowClass}">
      <td style="border:1px solid #d1d5db;padding:8px 10px;white-space:nowrap;font-family:Arial,sans-serif;font-size:11pt;font-weight:600">${escapeHtml(day.timeLabel)}</td>
      <td style="background:${typeBg};color:${typeColor};border:1px solid #d1d5db;padding:8px 10px;font-weight:bold;text-align:center;font-family:Arial,sans-serif;font-size:11pt">${day.eligibleType}</td>
      ${cells}
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
  <x:ExcelWorksheets>
    <x:ExcelWorksheet>
      <x:Name>ADNCO Roster</x:Name>
      <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet>
  </x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml><![endif]-->
<style>
  table { border-collapse: collapse; }
  td, th { mso-number-format:"\\@"; }
</style>
</head>
<body>
<table style="border-collapse:collapse;font-family:Arial,sans-serif">
  <tr><td colspan="7" style="font-size:18pt;font-weight:bold;padding:4px 0 2px">${escapeHtml(monthLabel)} ADNCO Roster</td></tr>
  <tr><td colspan="7" style="font-size:11pt;color:#4b5563;padding-bottom:4px">${unit} · Generated ${escapeHtml(generated)}${roster.finalized ? ' · FINALIZED' : ''}</td></tr>
  <tr><td colspan="7" style="font-size:10pt;color:#374151;padding:8px 10px;background:#f3f4f6;border:1px solid #d1d5db">
    <strong>Positions (in order):</strong> Bldg 827 (DNCO, LCpl) · Bldg 827 #2 · Bldg 829 #1 · Bldg 829 #2 · Duty Driver (licensed)<br>
    <strong>Academic rows</strong> are auto-filled. <strong style="color:#b45309">MAT rows (yellow cells)</strong> — MAT platoon fills in manually.
  </td></tr>
  <tr><td colspan="7" style="height:8px"></td></tr>
  <thead>
    <tr>
      <th style="background:#1a2332;color:#ffffff;font-weight:bold;border:1px solid #9ca3af;padding:8px 10px;font-family:Arial,sans-serif;font-size:11pt">Date &amp; Time</th>
      <th style="background:#1a2332;color:#ffffff;font-weight:bold;border:1px solid #9ca3af;padding:8px 10px;font-family:Arial,sans-serif;font-size:11pt">Type</th>
      ${posHeaders}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

export function exportAdncoCSV(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const headers = ['date_time_window', 'eligible_type', ...ADNCO_POSITIONS.map((p) => p.position)];
  const lines = [
    `# YouGotFireWatch ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}`,
    `# ${settings?.unitName || ''}`,
    `# Positions per night: Bldg 827 (DNCO), Bldg 827 #2, 2× Bldg 829, Duty Driver`,
    headers.join(','),
  ];

  for (const day of groupAdncoSlotsByDay(roster.slots)) {
    const row = [`"${day.timeLabel}"`, day.eligibleType];
    for (const pos of ADNCO_POSITIONS) {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      row.push(p ? `"${personCell(p)}"` : '');
    }
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/** Download a formatted Excel workbook (.xls) for MAT platoon to complete manually. */
export function downloadAdncoExcel(roster, students, settings) {
  const content = buildAdncoExcelHtml(roster, students, settings);
  const filename = `YouGotFireWatch-ADNCO-${roster.year}-${String(roster.month).padStart(2, '0')}.xls`;
  const blob = new Blob(['\ufeff', content], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export function openAdncoPrintout(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const finalized = roster.finalized ? ' <span class="badge">FINALIZED</span>' : '';

  const posHeaders = ADNCO_POSITIONS.map((p) => `<th>${p.label}</th>`).join('');

  const rows = days.map((day) => {
    const typeClass = day.eligibleType === 'MAT' ? 'mat' : 'academic';
    const isMat = day.eligibleType === 'MAT';
    const cells = ADNCO_POSITIONS.map((pos) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      if (!p) {
        return isMat
          ? '<td class="mat-manual"><em>MAT — fill in Excel</em></td>'
          : '<td><em>Unassigned</em></td>';
      }
      const phone = p.phoneNumber ? `<div class="phone"><a href="tel:${p.phoneNumber}">${p.phoneNumber}</a></div>` : '';
      return `<td class="assignee">${p.rank} ${p.lastName}, ${p.firstName}${phone}</td>`;
    }).join('');
    return `<tr>
      <td>${day.timeLabel}</td>
      <td><span class="type ${typeClass}">${day.eligibleType}</span></td>
      ${cells}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 1rem; color: #111; max-width: 72rem; margin: 0 auto; font-size: 0.8rem; }
  h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
  .sub { color: #555; font-size: 0.9rem; margin-bottom: 1.25rem; }
  .rules { background: #f4f6f8; border: 1px solid #dde; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1.25rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; }
  th { background: #1a2332; color: #fff; font-size: 0.75rem; }
  tr:nth-child(even) { background: #f9fafb; }
  .phone { font-weight: 600; font-size: 0.85rem; margin-top: 0.15rem; }
  .type { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; }
  .type.mat { background: #dbeafe; color: #1e40af; }
  .type.academic { background: #fef3c7; color: #92400e; }
  .mat-manual { background: #fffbeb; }
  .badge { background: #6b7c3e; color: #fff; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  @media print { body { padding: 0.25rem; font-size: 0.7rem; } .no-print { display: none; } }
</style></head><body>
<h1>ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}${finalized}</h1>
<p class="sub">${settings?.unitName || 'YouGotFireWatch'} · Generated ${new Date().toLocaleString()}</p>
<div class="rules">
  <strong>Each night (in order):</strong> Bldg 827 (DNCO, LCpl) · Bldg 827 #2 · 2× Bldg 829 · Duty Driver (licensed)<br>
  <strong>Academic rows</strong> auto-assigned · <strong>MAT rows</strong> filled manually by MAT platoon in Excel
</div>
<table>
  <thead><tr><th>Date &amp; Time</th><th>Type</th>${posHeaders}</tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="no-print" style="margin-top:1.5rem"><button onclick="window.print()">Print</button></p>
<script>setTimeout(()=>window.print(),400);</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}