import { formatMonthYear } from './dateUtils.js';
import { groupAdncoSlotsByDay, ADNCO_POSITIONS } from './adncoRoster.js';

function personCell(p) {
  if (!p) return '';
  return `${p.rank} ${p.lastName}, ${p.firstName}${p.phoneNumber ? ` (${p.phoneNumber})` : ''}`;
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

export function openAdncoPrintout(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const finalized = roster.finalized ? ' <span class="badge">FINALIZED</span>' : '';

  const posHeaders = ADNCO_POSITIONS.map((p) => `<th>${p.label}</th>`).join('');

  const rows = days.map((day) => {
    const typeClass = day.eligibleType === 'MAT' ? 'mat' : 'academic';
    const cells = ADNCO_POSITIONS.map((pos) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      if (!p) return '<td><em>Unassigned</em></td>';
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
  .badge { background: #6b7c3e; color: #fff; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  @media print { body { padding: 0.25rem; font-size: 0.7rem; } .no-print { display: none; } }
</style></head><body>
<h1>ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}${finalized}</h1>
<p class="sub">${settings?.unitName || 'YouGotFireWatch'} · Generated ${new Date().toLocaleString()}</p>
<div class="rules">
  <strong>Each night (in order):</strong> Bldg 827 (DNCO, LCpl) · Bldg 827 #2 · 2× Bldg 829 · Duty Driver (licensed)<br>
  <strong>Duty changeover 0630</strong> (Fri &amp; Sun end 1630)<br>
  <strong>MAT:</strong> Sun 1630→Mon 0630, Mon–Thu 0630→0630, Fri 0630→1630<br>
  <strong>Academic:</strong> Fri 1630→Sat 0630, Sat 0630→Sun 0630, Sun 0630→1630
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