// Minimal .xlsx writer (Office Open XML) for reports that open in Excel and Google Sheets:
// several sheets, bold header row, frozen header, filters, column widths, wrapped text and
// coloured status cells. No library: the ZIP is written with "stored" (uncompressed) entries.
(function (root) {
  const TSD = (root.TSD = root.TSD || {});

  // Cell styles (index into cellXfs)
  const S = { text: 0, head: 1, ok: 2, warn: 3, error: 4, info: 5, missing: 6, bold: 7, code: 8, title: 9, muted: 10, band1: 11, band2: 12, band3: 13 };
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="6">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
<font><sz val="9"/><name val="Courier New"/></font>
<font><b/><sz val="14"/><color rgb="FF08152E"/><name val="Arial"/></font>
<font><sz val="9"/><color rgb="FF5B6A82"/><name val="Arial"/></font>
</fonts>
<fills count="11">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF08152E"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9F2E3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1D6"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDE0DE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4A90D9"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2E8B57"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF7B68AE"/></patternFill></fill>
</fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFDCE5F2"/></left><right style="thin"><color rgb="FFDCE5F2"/></right><top style="thin"><color rgb="FFDCE5F2"/></top><bottom style="thin"><color rgb="FFDCE5F2"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="7" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="8" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="9" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="10" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const xml = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // sheet: { name, widths:[chars], header:[...], rows:[[cell]], title?, note?, freeze?:bool }
  // cell: string | number | { v, s: styleName }
  function sheetXml(sh) {
    const lines = [];
    let r = 0;
    const row = (cellsOrRow, defStyle) => {
      // a row is [cells] or { cells, ht } (ht = height in points, for multi-line code)
      const cells = Array.isArray(cellsOrRow) ? cellsOrRow : cellsOrRow.cells;
      const ht = Array.isArray(cellsOrRow) ? 0 : cellsOrRow.ht || 0;
      r++;
      const cs = cells.map((c, i) => {
        const cell = c && typeof c === 'object' && 'v' in c ? c : { v: c };
        const st = S[cell.s || defStyle || 'text'] || 0;
        const ref = colName(i) + r;
        if (cell.v === null || cell.v === undefined || cell.v === '') return `<c r="${ref}" s="${st}"/>`;
        if (typeof cell.v === 'number' && isFinite(cell.v)) return `<c r="${ref}" s="${st}"><v>${cell.v}</v></c>`;
        return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xml(String(cell.v).slice(0, 32000))}</t></is></c>`;
      }).join('');
      lines.push(`<row r="${r}"${ht ? ` ht="${Math.min(409, ht)}" customHeight="1"` : ''}>${cs}</row>`);
    };
    if (sh.title) row([{ v: sh.title, s: 'title' }]);
    if (sh.note) row([{ v: sh.note, s: 'muted' }]);
    (sh.pre || []).forEach((cells) => row(cells));
    if (sh.title || sh.note || sh.pre) row([]);
    let groupRow = 0;
    if (sh.groupHeader) { row(sh.groupHeader, 'text'); groupRow = r; }
    const headRow = r + 1;
    if (sh.header) row(sh.header, 'head');
    (sh.rows || []).forEach((cells) => row(cells));
    const last = colName(Math.max(0, (sh.header || [1]).length - 1));
    const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const xSplit = sh.freezeCol || 0;
    const topLeft = (xSplit ? colName(xSplit) : 'A') + (headRow + 1);
    const activePane = xSplit ? 'bottomRight' : 'bottomLeft';
    const pane = sh.header && sh.freeze !== false ? `<sheetViews><sheetView workbookViewId="0"><pane${xSplit ? ` xSplit="${xSplit}"` : ''} ySplit="${headRow}" topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const filter = sh.header && sh.filter !== false && (sh.rows || []).length ? `<autoFilter ref="A${headRow}:${last}${r}"/>` : '';
    const mergeRefs = [];
    if (sh.groupMerges && groupRow) sh.groupMerges.forEach(([s, e]) => mergeRefs.push(`${colName(s)}${groupRow}:${colName(e)}${groupRow}`));
    (sh.merges || []).forEach((ref) => mergeRefs.push(ref));
    const merges = mergeRefs.length ? `<mergeCells count="${mergeRefs.length}">${mergeRefs.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
    const valids = (sh.validations || []).length ? `<dataValidations count="${sh.validations.length}">${sh.validations.map((v) => `<dataValidation type="list" allowBlank="1" sqref="${v.sqref}"><formula1>"${xml(v.values.join(','))}"</formula1></dataValidation>`).join('')}</dataValidations>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${lines.join('')}</sheetData>${filter}${merges}${valids}</worksheet>`;
  }

  function files(sheets) {
    const safe = (n, i) => (xml(String(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)) || `Sheet${i + 1}`);
    const out = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${safe(sh.name, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': STYLES,
    };
    sheets.forEach((sh, i) => { out[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sh); });
    return out;
  }

  // ---------- ZIP (stored) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const utf8 = (s) => new TextEncoder().encode(s);
  function zip(entries) {
    const parts = []; const central = []; let offset = 0;
    const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
    const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    const time = 0; const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
    Object.entries(entries).forEach(([name, text]) => {
      const nameB = utf8(name); const data = utf8(text); const crc = crc32(data);
      const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]);
      parts.push(local, nameB, data);
      central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameB);
      offset += local.length + nameB.length + data.length;
    });
    const cdSize = central.reduce((n, b) => n + b.length, 0);
    const count = Object.keys(entries).length;
    const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end];
    const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
    let at = 0; all.forEach((b) => { out.set(b, at); at += b.length; });
    return out;
  }

  const build = (sheets) => zip(files(sheets));
  function download(filename, sheets) {
    const blob = new Blob([build(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  TSD.xlsx = { build, download, files, zip, crc32 };
})(typeof globalThis !== 'undefined' ? globalThis : window);
