import { formatMonthYear } from './dateUtils.js';
import { adncoDisplayName } from './personnelUtils.js';

export function exportAdncoCSV(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const lines = [
    `# YouGotFireWatch ADNCO Student Roster — ${formatMonthYear(roster.month, roster.year)}`,
    `# ${settings?.unitName || ''}`,
    'date_time_window,eligible_type,rank,last_name,first_name,phone,student_type',
  ];

  for (const slot of [...roster.slots].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const p = slot.personId ? map.get(slot.personId) : null;
    lines.push([
      `"${slot.timeLabel}"`,
      slot.eligibleType,
      p?.rank || '',
      p?.lastName || '',
      p?.firstName || '',
      p?.phoneNumber || '',
      p?.studentType || '',
    ].join(','));
  }

  return lines.join('\n');
}

export function openAdncoPrintout(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const sorted = [...roster.slots].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const finalized = roster.finalized ? ' <span class="badge">FINALIZED</span>' : '';

  const rows = sorted.map((slot) => {
    const p = slot.personId ? map.get(slot.personId) : null;
    const typeClass = slot.eligibleType === 'MAT' ? 'mat' : 'academic';
    return `<tr>
      <td>${slot.timeLabel}</td>
      <td><span class="type ${typeClass}">${slot.eligibleType}</span></td>
      <td class="assignee">${p ? `${p.rank} ${p.lastName}, ${p.firstName}` : '<em>Unassigned</em>'}</td>
      <td class="phone">${p?.phoneNumber ? `<a href="tel:${p.phoneNumber}">${p.phoneNumber}</a>` : '—'}</td>
      <td>${p?.studentType || '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 1.5rem; color: #111; max-width: 56rem; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
  .sub { color: #555; font-size: 0.9rem; margin-bottom: 1.25rem; }
  .rules { background: #f4f6f8; border: 1px solid #dde; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1.25rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th, td { border: 1px solid #ccc; padding: 0.5rem 0.65rem; text-align: left; }
  th { background: #1a2332; color: #fff; }
  tr:nth-child(even) { background: #f9fafb; }
  .phone { font-weight: 600; font-size: 1rem; }
  .type { font-size: 0.75rem; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 600; }
  .type.mat { background: #dbeafe; color: #1e40af; }
  .type.academic { background: #fef3c7; color: #92400e; }
  .badge { background: #6b7c3e; color: #fff; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  @media print { body { padding: 0.5rem; } .no-print { display: none; } }
</style></head><body>
<h1>ADNCO Student Roster — ${formatMonthYear(roster.month, roster.year)}${finalized}</h1>
<p class="sub">${settings?.unitName || 'YouGotFireWatch'} · Generated ${new Date().toLocaleString()}</p>
<div class="rules">
  <strong>Duty windows:</strong> MAT = Sun 1630 – Fri 1630 · Academic = Fri 1630 – Sun 1630
</div>
<table>
  <thead><tr><th>Date &amp; Time Window</th><th>Type</th><th>Assigned Marine</th><th>Phone</th><th>Student Type</th></tr></thead>
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