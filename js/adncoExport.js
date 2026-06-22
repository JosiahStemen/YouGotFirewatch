import { formatMonthYear } from './dateUtils.js';
import { groupAdncoSlotsByDay, ADNCO_POSITIONS } from './adncoRoster.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_BUILD = '20260707';

const COLORS = {
  navy: '1A2332',
  white: 'FFFFFF',
  slate: '4B5563',
  lightGray: 'F4F6F8',
  border: 'CBD5E1',
  headerText: 'FFFFFF',
  academicBg: 'FFFBEB',
  academicAlt: 'FEF9E7',
  academicType: '92400E',
  matBg: 'EFF6FF',
  matAlt: 'DBEAFE',
  matType: '1E40AF',
  matHint: '64748B',
  finalized: '6B7C3E',
  subtitleBg: 'E8EDF2',
  unassigned: '9CA3AF',
};

function thinBorder(color = COLORS.border) {
  const side = { style: 'thin', color: { rgb: color } };
  return { top: side, bottom: side, left: side, right: side };
}

function makeStyle({ font = {}, fill, alignment = {}, border = thinBorder() } = {}) {
  const style = { font: { name: 'Calibri', sz: 11, color: { rgb: COLORS.navy }, ...font }, alignment: { vertical: 'center', wrapText: true, ...alignment }, border };
  if (fill) style.fill = { patternType: 'solid', fgColor: { rgb: fill } };
  return style;
}

const STYLES = {
  title: makeStyle({ font: { bold: true, sz: 18, color: { rgb: COLORS.white } }, fill: COLORS.navy, alignment: { horizontal: 'center' } }),
  subtitle: makeStyle({ font: { sz: 11, color: { rgb: COLORS.slate } }, fill: COLORS.subtitleBg, alignment: { horizontal: 'center' } }),
  info: makeStyle({ font: { sz: 10, color: { rgb: COLORS.slate } }, fill: COLORS.lightGray, alignment: { horizontal: 'center', wrapText: true } }),
  colHeader: makeStyle({ font: { bold: true, sz: 10, color: { rgb: COLORS.white } }, fill: COLORS.navy, alignment: { horizontal: 'center' } }),
  time: (bg) => makeStyle({ font: { sz: 10 }, fill: bg, alignment: { horizontal: 'left' } }),
  typeAcademic: (bg) => makeStyle({ font: { bold: true, sz: 10, color: { rgb: COLORS.academicType } }, fill: bg, alignment: { horizontal: 'center' } }),
  typeMat: (bg) => makeStyle({ font: { bold: true, sz: 10, color: { rgb: COLORS.matType } }, fill: bg, alignment: { horizontal: 'center' } }),
  assignee: (bg) => makeStyle({ font: { sz: 10 }, fill: bg, alignment: { horizontal: 'left', wrapText: true } }),
  matBlank: (bg) => makeStyle({ font: { italic: true, sz: 10, color: { rgb: COLORS.matHint } }, fill: bg, alignment: { horizontal: 'center' } }),
  unassigned: (bg) => makeStyle({ font: { italic: true, sz: 10, color: { rgb: COLORS.unassigned } }, fill: bg, alignment: { horizontal: 'center' } }),
};

function getXlsxLibOrNull() {
  const lib = (typeof globalThis !== 'undefined' && globalThis.XLSX)
    || (typeof window !== 'undefined' && window.XLSX)
    || null;
  if (!lib?.utils?.book_new || !lib?.write) return null;
  return lib;
}

async function waitForXlsxLib() {
  for (let i = 0; i < 80; i++) {
    const lib = getXlsxLibOrNull();
    if (lib) return lib;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Excel library failed to load. Check your connection, hard refresh (Ctrl+Shift+R), and try again.');
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
  throw new Error(`Unexpected Excel output (${Object.prototype.toString.call(data)})`);
}

function writeWorkbookBytes(XLSX, wb) {
  const writeFn = typeof XLSX.writeXLSX === 'function' ? XLSX.writeXLSX : XLSX.write;
  const opts = { bookType: 'xlsx', cellStyles: true };
  for (const type of ['binary', 'array', 'base64']) {
    try {
      const bytes = normalizeToBytes(writeFn(wb, { ...opts, type }));
      if (byteLen(bytes) > 0) return bytes;
    } catch (err) {
      console.warn(`SheetJS write type "${type}" failed:`, err);
    }
  }
  throw new Error('SheetJS could not serialize the workbook');
}

function triggerDirectDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  return true;
}

function openXlsxInNewTab(bytes, filename) {
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open('', '_blank');
  if (!win) {
    URL.revokeObjectURL(blobUrl);
    triggerDirectDownload(bytes, filename);
    return true;
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

function setStyledCell(XLSX, ws, r, c, value, style) {
  const ref = XLSX.utils.encode_cell({ r, c });
  ws[ref] = { t: 's', v: String(value ?? ''), s: style };
}

function buildAdncoWorkbook(XLSX, roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const monthLabel = formatMonthYear(roster.month, roster.year);
  const unit = settings?.unitName || 'YouGotFireWatch';
  const generated = new Date().toLocaleString();
  const colCount = 2 + ADNCO_POSITIONS.length;
  const headerRow = 5;
  const dataStart = headerRow + 1;

  const rows = Array.from({ length: dataStart + days.length }, () => Array(colCount).fill(''));
  rows[0][0] = `${monthLabel} ADNCO Roster`;
  rows[1][0] = `${unit} · Generated ${generated}${roster.finalized ? ' · FINALIZED' : ''}`;
  rows[2][0] = 'Positions (in order): Bldg 827 (DNCO, LCpl) · Bldg 827 #2 · Bldg 829 #1 · Bldg 829 #2 · Duty Driver (licensed)';
  rows[3][0] = 'Academic rows are auto-filled. MAT rows are left blank for MAT platoon to complete.';
  rows[headerRow] = ['Date & Time', 'Type', ...ADNCO_POSITIONS.map((p) => p.label)];

  days.forEach((day, idx) => {
    const r = dataStart + idx;
    const isMat = day.eligibleType === 'MAT';
    rows[r][0] = day.timeLabel;
    rows[r][1] = day.eligibleType;
    ADNCO_POSITIONS.forEach((pos, pi) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      if (isMat) rows[r][2 + pi] = '';
      else if (!p) rows[r][2 + pi] = 'Unassigned';
      else rows[r][2 + pi] = personExcelValue(p) || personCell(p);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  setStyledCell(XLSX, ws, 0, 0, rows[0][0], STYLES.title);
  setStyledCell(XLSX, ws, 1, 0, rows[1][0], roster.finalized
    ? makeStyle({ font: { sz: 11, bold: true, color: { rgb: COLORS.white } }, fill: COLORS.finalized, alignment: { horizontal: 'center' } })
    : STYLES.subtitle);
  setStyledCell(XLSX, ws, 2, 0, rows[2][0], STYLES.info);
  setStyledCell(XLSX, ws, 3, 0, rows[3][0], STYLES.info);
  rows[headerRow].forEach((label, c) => setStyledCell(XLSX, ws, headerRow, c, label, STYLES.colHeader));

  days.forEach((day, idx) => {
    const r = dataStart + idx;
    const isMat = day.eligibleType === 'MAT';
    const bg = isMat ? (idx % 2 ? COLORS.matAlt : COLORS.matBg) : (idx % 2 ? COLORS.academicAlt : COLORS.academicBg);
    setStyledCell(XLSX, ws, r, 0, day.timeLabel, STYLES.time(bg));
    setStyledCell(XLSX, ws, r, 1, day.eligibleType, isMat ? STYLES.typeMat(bg) : STYLES.typeAcademic(bg));
    ADNCO_POSITIONS.forEach((pos, pi) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      const c = 2 + pi;
      if (isMat) setStyledCell(XLSX, ws, r, c, '', STYLES.matBlank(bg));
      else if (!p) setStyledCell(XLSX, ws, r, c, 'Unassigned', STYLES.unassigned(bg));
      else setStyledCell(XLSX, ws, r, c, personExcelValue(p) || personCell(p), STYLES.assignee(bg));
    });
  });

  ws['!cols'] = [
    { wch: 36 },
    { wch: 12 },
    ...ADNCO_POSITIONS.map(() => ({ wch: 22 })),
  ];
  ws['!rows'] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 28 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 24 },
    ...days.map(() => ({ hpt: 42 })),
  ];
  ws['!merges'] = [0, 1, 2, 3].map((r) => ({
    s: { r, c: 0 },
    e: { r, c: colCount - 1 },
  }));
  ws['!freeze'] = { xSplit: 0, ySplit: dataStart, topLeftCell: 'A7', activePane: 'bottomLeft', state: 'frozen' };
  ws['!printHeader'] = [1, dataStart];
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
  if (!ws['!pageSetup']) ws['!pageSetup'] = {};
  ws['!pageSetup'].orientation = 'landscape';
  ws['!pageSetup'].fitToWidth = 1;
  ws['!pageSetup'].fitToHeight = 0;
  ws['!pageSetup'].paperSize = 1;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ADNCO Roster');
  return wb;
}

async function buildAdncoXlsxBytes(roster, students, settings) {
  const XLSX = await waitForXlsxLib();
  const wb = buildAdncoWorkbook(XLSX, roster, students, settings);
  const bytes = writeWorkbookBytes(XLSX, wb);
  if (!byteLen(bytes)) throw new Error('Excel export produced an empty file');
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
export async function downloadAdncoExcel(roster, students, settings) {
  const filename = `YouGotFireWatch-ADNCO-${roster.year}-${String(roster.month).padStart(2, '0')}.xlsx`;
  try {
    const bytes = await buildAdncoXlsxBytes(roster, students, settings);
    return openXlsxInNewTab(bytes, filename);
  } catch (err) {
    console.error('ADNCO Excel export failed:', err);
    alert(
      `Could not create Excel file (export ${EXPORT_BUILD}):\n\n${err.message}\n\n`
      + 'Try Ctrl+Shift+R to hard refresh. Footer should show v2026.07.07.'
    );
    return false;
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