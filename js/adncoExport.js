import { formatMonthYear } from './dateUtils.js';
import { groupAdncoSlotsByDay, ADNCO_POSITIONS } from './adncoRoster.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function getXlsxLib() {
  const lib = (typeof globalThis !== 'undefined' && globalThis.XLSX)
    || (typeof window !== 'undefined' && window.XLSX)
    || null;
  if (!lib?.utils?.book_new || !lib?.write) {
    throw new Error('Excel library failed to load — hard refresh (Ctrl+F5) and try again.');
  }
  return lib;
}

function byteLen(data) {
  if (!data) return 0;
  if (typeof data.byteLength === 'number') return data.byteLength;
  if (typeof data.length === 'number') return data.length;
  return 0;
}

function normalizeToBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (typeof data === 'string') {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
    return out;
  }
  throw new Error('Unexpected Excel output format from SheetJS');
}

function isZipArchive(bytes) {
  const len = byteLen(bytes);
  if (len < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4B;
}

function writeWorkbookBytes(XLSX, wb) {
  // SheetJS full.min supports type: 'array' | 'binary' | 'base64' | 'buffer' — NOT 'uint8array'.
  const writeFn = typeof XLSX.writeXLSX === 'function' ? XLSX.writeXLSX : XLSX.write;
  const opts = { bookType: 'xlsx', type: 'array' };
  try {
    return normalizeToBytes(writeFn(wb, opts));
  } catch (err) {
    // Fallback: binary string → bytes (also valid PK zip).
    return normalizeToBytes(writeFn(wb, { bookType: 'xlsx', type: 'binary' }));
  }
}

function openXlsxInNewTab(bytes, filename) {
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Allow pop-ups for this site to open the Excel roster in a new tab.');
    URL.revokeObjectURL(blobUrl);
    return false;
  }
  const safeName = filename.replace(/[<>"']/g, '');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeName}</title>
<style>
  body { font-family: Arial, system-ui, sans-serif; margin: 24px; color: #1a2332; max-width: 36rem; }
  h1 { font-size: 1.1rem; margin-bottom: 6px; }
  p { color: #4b5563; font-size: 0.875rem; line-height: 1.5; margin-bottom: 14px; }
  a.dl { display: inline-block; padding: 10px 18px; background: #1a6b3c; color: #fff;
    text-decoration: none; border-radius: 6px; font-weight: 600; margin-bottom: 12px; }
  .hint { font-size: 0.8rem; color: #6b7280; }
</style></head><body>
<h1>${safeName}</h1>
<p>Real Excel <strong>.xlsx</strong> file — open in Microsoft Excel. Academic rows are filled; <strong>MAT rows are blank</strong> for platoon to complete.</p>
<a class="dl" id="dl" href="${blobUrl}" download="${safeName}">Download .xlsx</a>
<p class="hint">If download did not start, click the button above. Close this tab to return to YouGotFireWatch.</p>
<script>
  window.addEventListener('load', function() {
    var link = document.getElementById('dl');
    if (link) link.click();
  });
</script>
</body></html>`);
  win.document.close();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  return true;
}

function personCell(p) {
  if (!p) return '';
  return `${p.rank} ${p.lastName}, ${p.firstName}${p.phoneNumber ? ` (${p.phoneNumber})` : ''}`;
}

function personExcelValue(p) {
  if (!p) return '';
  const name = `${p.rank} ${p.lastName}, ${p.firstName}`;
  return p.phoneNumber ? `${name}\n${p.phoneNumber}` : name;
}

function buildAdncoWorkbook(XLSX, roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const monthLabel = formatMonthYear(roster.month, roster.year);
  const unit = settings?.unitName || 'YouGotFireWatch';
  const generated = new Date().toLocaleString();
  const colCount = 2 + ADNCO_POSITIONS.length;

  const rows = [
    [`${monthLabel} ADNCO Roster`],
    [`${unit} · Generated ${generated}${roster.finalized ? ' · FINALIZED' : ''}`],
    ['Positions (in order): Bldg 827 (DNCO, LCpl) · Bldg 827 #2 · Bldg 829 #1 · Bldg 829 #2 · Duty Driver (licensed)'],
    ['Academic rows are auto-filled. MAT rows are left blank for MAT platoon to complete.'],
    [],
    ['Date & Time', 'Type', ...ADNCO_POSITIONS.map((p) => p.label)],
  ];

  for (const day of days) {
    const isMat = day.eligibleType === 'MAT';
    const posCells = ADNCO_POSITIONS.map((pos) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      if (isMat) return '';
      return personExcelValue(p) || (p ? personCell(p) : '');
    });
    rows.push([day.timeLabel, day.eligibleType, ...posCells]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 34 },
    { wch: 11 },
    ...ADNCO_POSITIONS.map(() => ({ wch: 24 })),
  ];
  ws['!merges'] = [0, 1, 2, 3].map((r) => ({
    s: { r, c: 0 },
    e: { r, c: colCount - 1 },
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ADNCO Roster');
  return wb;
}

function buildAdncoXlsxBytes(roster, students, settings) {
  const XLSX = getXlsxLib();
  const wb = buildAdncoWorkbook(XLSX, roster, students, settings);
  const bytes = writeWorkbookBytes(XLSX, wb);
  if (!byteLen(bytes)) throw new Error('Excel export produced an empty file');
  if (!isZipArchive(bytes)) throw new Error('Excel export did not produce a valid .xlsx zip archive');
  return bytes;
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

/** Open real .xlsx in a new tab (main app tab stays put). */
export function downloadAdncoExcel(roster, students, settings) {
  const filename = `YouGotFireWatch-ADNCO-${roster.year}-${String(roster.month).padStart(2, '0')}.xlsx`;
  try {
    const bytes = buildAdncoXlsxBytes(roster, students, settings);
    return Promise.resolve(openXlsxInNewTab(bytes, filename));
  } catch (err) {
    console.error('ADNCO Excel export failed:', err);
    alert(`Could not create Excel file: ${err.message}`);
    return Promise.resolve(false);
  }
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