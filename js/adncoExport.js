import { formatMonthYear } from './dateUtils.js';
import { groupAdncoSlotsByDay, ADNCO_POSITIONS } from './adncoRoster.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORT_BUILD = '20260712';
const MAT_PLACEHOLDER = 'MAT';

/** Mirrors openAdncoPrintout() CSS — keep in sync when changing print layout. */
export const ADNCO_PRINT_THEME = {
  bodyText: '111111',
  subText: '555555',
  rulesBg: 'F4F6F8',
  rulesBorder: 'DDDDDD',
  tableBorder: 'CCCCCC',
  headerBg: '1A2332',
  headerText: 'FFFFFF',
  rowStripe: 'F9FAFB',
  rowWhite: 'FFFFFF',
  typeMatBg: 'DBEAFE',
  typeMatText: '1E40AF',
  typeAcademicBg: 'FEF3C7',
  typeAcademicText: '92400E',
  matManualBg: 'FFFBEB',
  badgeFinalized: '6B7C3E',
  phoneWeight: true,
};

function thinBorder(color = ADNCO_PRINT_THEME.tableBorder) {
  const side = { style: 'thin', color: { rgb: color } };
  return { top: side, bottom: side, left: side, right: side };
}

function rulesBorder() {
  const c = { rgb: ADNCO_PRINT_THEME.rulesBorder };
  return {
    top: { style: 'thin', color: c },
    bottom: { style: 'thin', color: c },
    left: { style: 'thin', color: c },
    right: { style: 'thin', color: c },
  };
}

function makeStyle({ font = {}, fill, alignment = {}, border = thinBorder() } = {}) {
  const style = {
    font: { name: 'Calibri', sz: 11, color: { rgb: ADNCO_PRINT_THEME.bodyText }, ...font },
    alignment: { vertical: 'top', wrapText: true, ...alignment },
    border,
  };
  if (fill) style.fill = { patternType: 'solid', fgColor: { rgb: fill } };
  return style;
}

function rowBg(dataIndex) {
  return dataIndex % 2 === 1 ? ADNCO_PRINT_THEME.rowStripe : ADNCO_PRINT_THEME.rowWhite;
}

const PRINT_STYLES = {
  title: makeStyle({ font: { bold: true, sz: 16 }, alignment: { vertical: 'center' } }),
  titleFinalized: makeStyle({
    font: { bold: true, sz: 16, color: { rgb: ADNCO_PRINT_THEME.badgeFinalized } },
    alignment: { vertical: 'center' },
  }),
  subtitle: makeStyle({ font: { sz: 11, color: { rgb: ADNCO_PRINT_THEME.subText } }, alignment: { vertical: 'center' } }),
  rules: makeStyle({
    font: { sz: 10, color: { rgb: ADNCO_PRINT_THEME.bodyText } },
    fill: ADNCO_PRINT_THEME.rulesBg,
    border: rulesBorder(),
    alignment: { vertical: 'center', wrapText: true },
  }),
  colHeader: makeStyle({
    font: { bold: true, sz: 10, color: { rgb: ADNCO_PRINT_THEME.headerText } },
    fill: ADNCO_PRINT_THEME.headerBg,
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  dataCell: (bg) => makeStyle({ font: { sz: 10 }, fill: bg, alignment: { horizontal: 'left', vertical: 'top' } }),
  typeAcademic: makeStyle({
    font: { bold: true, sz: 9, color: { rgb: ADNCO_PRINT_THEME.typeAcademicText } },
    fill: ADNCO_PRINT_THEME.typeAcademicBg,
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  typeMat: makeStyle({
    font: { bold: true, sz: 9, color: { rgb: ADNCO_PRINT_THEME.typeMatText } },
    fill: ADNCO_PRINT_THEME.typeMatBg,
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  assignee: (bg) => makeStyle({ font: { sz: 10 }, fill: bg, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } }),
  matManual: makeStyle({
    font: { bold: true, sz: 10, color: { rgb: ADNCO_PRINT_THEME.typeMatText } },
    fill: ADNCO_PRINT_THEME.matManualBg,
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  unassigned: (bg) => makeStyle({
    font: { italic: true, sz: 10, color: { rgb: ADNCO_PRINT_THEME.subText } },
    fill: bg,
    alignment: { horizontal: 'left', vertical: 'top' },
  }),
};

function adncoPrintTitle(roster) {
  const label = `ADNCO Roster — ${formatMonthYear(roster.month, roster.year)}`;
  return roster.finalized ? `${label}  FINALIZED` : label;
}

function adncoPrintRulesLines() {
  return [
    'Each night (in order): Bldg 827 (DNCO, LCpl) · Bldg 827 #2 · 2× Bldg 829 · Duty Driver (licensed)',
    'Academic rows auto-assigned · MAT rows filled manually by MAT platoon in Excel',
  ];
}

function getXlsxLibOrNull() {
  const lib = (typeof globalThis !== 'undefined' && globalThis.XLSX)
    || (typeof window !== 'undefined' && window.XLSX)
    || null;
  if (!lib?.utils?.book_new || !lib?.write) return null;
  return lib;
}

function ensureStyledXlsxLib(XLSX) {
  if (!XLSX?.style_version) {
    throw new Error(
      'Excel styling library did not load (expected xlsx-js-style). '
      + 'Hard refresh with Ctrl+Shift+R and confirm footer shows v2026.07.10.'
    );
  }
}

async function waitForXlsxLib() {
  for (let i = 0; i < 80; i++) {
    const lib = getXlsxLibOrNull();
    if (lib) {
      ensureStyledXlsxLib(lib);
      return lib;
    }
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

function xlsxBytesIncludeThemeColors(bytes) {
  if (!bytes?.length) return false;
  const sample = bytes.length > 600000 ? bytes.subarray(0, 600000) : bytes;
  let text = '';
  for (let i = 0; i < sample.length; i++) text += String.fromCharCode(sample[i]);
  return text.includes('FF1A2332') || text.includes('1A2332');
}

function writeWorkbookBytes(XLSX, wb) {
  // xlsx-js-style only initializes its style writer in XLSX.write — writeXLSX skips yo setup.
  const opts = { bookType: 'xlsx', type: 'binary', cellStyles: true };
  let lastErr = null;
  for (const type of ['binary', 'array']) {
    try {
      const bytes = normalizeToBytes(XLSX.write(wb, { ...opts, type }));
      if (byteLen(bytes) > 0) {
        if (xlsxBytesIncludeThemeColors(bytes)) return bytes;
        lastErr = new Error('Excel file was created but colors were missing from the output.');
      }
    } catch (err) {
      lastErr = err;
      console.warn(`Excel write type "${type}" failed:`, err);
    }
  }
  throw lastErr || new Error('SheetJS could not serialize the workbook');
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
<p>Real Excel <strong>.xlsx</strong> file — open in <strong>desktop Microsoft Excel</strong> for full colors. Academic rows are filled; <strong>MAT position cells show MAT</strong> for platoon to replace with names.</p>
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

function styledCell(value, style) {
  return { t: 's', v: String(value ?? ''), s: style };
}

function buildAdncoWorkbook(XLSX, roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const unit = settings?.unitName || 'YouGotFireWatch';
  const generated = new Date().toLocaleString();
  const colCount = 2 + ADNCO_POSITIONS.length;
  const [rulesLine1, rulesLine2] = adncoPrintRulesLines();
  const headerRow = 5;
  const dataStart = headerRow + 1;

  const rows = Array.from({ length: dataStart + days.length }, () => Array(colCount).fill(''));
  rows[0][0] = styledCell(adncoPrintTitle(roster), roster.finalized ? PRINT_STYLES.titleFinalized : PRINT_STYLES.title);
  rows[1][0] = styledCell(`${unit} · Generated ${generated}`, PRINT_STYLES.subtitle);
  rows[2][0] = styledCell(`${rulesLine1}\n${rulesLine2}`, PRINT_STYLES.rules);
  rows[headerRow] = [
    styledCell('Date & Time', PRINT_STYLES.colHeader),
    styledCell('Type', PRINT_STYLES.colHeader),
    ...ADNCO_POSITIONS.map((p) => styledCell(p.label, PRINT_STYLES.colHeader)),
  ];

  days.forEach((day, idx) => {
    const r = dataStart + idx;
    const isMat = day.eligibleType === 'MAT';
    const bg = rowBg(idx);
    rows[r][0] = styledCell(day.timeLabel, PRINT_STYLES.dataCell(bg));
    rows[r][1] = styledCell(day.eligibleType, isMat ? PRINT_STYLES.typeMat : PRINT_STYLES.typeAcademic);
    ADNCO_POSITIONS.forEach((pos, pi) => {
      const slot = day.positions[pos.position];
      const p = slot?.personId ? map.get(slot.personId) : null;
      const c = 2 + pi;
      if (isMat) rows[r][c] = styledCell(MAT_PLACEHOLDER, PRINT_STYLES.matManual);
      else if (!p) rows[r][c] = styledCell('Unassigned', PRINT_STYLES.unassigned(bg));
      else rows[r][c] = styledCell(personExcelValue(p) || personCell(p), PRINT_STYLES.assignee(bg));
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(rows, { cellStyles: true });

  ws['!cols'] = [
    { wch: 34 },
    { wch: 11 },
    ...ADNCO_POSITIONS.map(() => ({ wch: 20 })),
  ];
  ws['!rows'] = [
    { hpt: 28 },
    { hpt: 18 },
    { hpt: 22 },
    { hpt: 18 },
    { hpt: 10 },
    { hpt: 22 },
    ...days.map(() => ({ hpt: 38 })),
  ];
  ws['!merges'] = [
    { s: { r: 2, c: 0 }, e: { r: 3, c: colCount - 1 } },
  ];
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
      + 'Try Ctrl+Shift+R to hard refresh. Footer should show v2026.07.10.'
    );
    return false;
  }
}

export function openAdncoPrintout(roster, students, settings) {
  const map = new Map((students ?? []).map((p) => [p.id, p]));
  const days = groupAdncoSlotsByDay(roster.slots);
  const t = ADNCO_PRINT_THEME;
  const finalized = roster.finalized ? ' <span class="badge">FINALIZED</span>' : '';
  const [rulesLine1, rulesLine2] = adncoPrintRulesLines();

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
<title>${adncoPrintTitle(roster)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 1rem; color: #${t.bodyText}; max-width: 72rem; margin: 0 auto; font-size: 0.8rem; }
  h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
  h1 .badge { color: #${t.badgeFinalized}; }
  .sub { color: #${t.subText}; font-size: 0.9rem; margin-bottom: 1.25rem; }
  .rules { background: #${t.rulesBg}; border: 1px solid #${t.rulesBorder}; padding: 0.75rem 1rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1.25rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #${t.tableBorder}; padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; }
  th { background: #${t.headerBg}; color: #${t.headerText}; font-size: 0.75rem; }
  tr:nth-child(even) { background: #${t.rowStripe}; }
  .phone { font-weight: 600; font-size: 0.85rem; margin-top: 0.15rem; }
  .type { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600; }
  .type.mat { background: #${t.typeMatBg}; color: #${t.typeMatText}; }
  .type.academic { background: #${t.typeAcademicBg}; color: #${t.typeAcademicText}; }
  .mat-manual { background: #${t.matManualBg}; }
  .badge { background: #${t.badgeFinalized}; color: #fff; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
  @media print { body { padding: 0.25rem; font-size: 0.7rem; } .no-print { display: none; } }
</style></head><body>
<h1>${adncoPrintTitle(roster).replace('  FINALIZED', '')}${finalized}</h1>
<p class="sub">${settings?.unitName || 'YouGotFireWatch'} · Generated ${new Date().toLocaleString()}</p>
<div class="rules">${rulesLine1}<br>${rulesLine2}</div>
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