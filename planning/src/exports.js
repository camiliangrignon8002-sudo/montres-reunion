// Exports PDF, Excel (.xlsx) et CSV, écrits sans bibliothèque externe.
(function (root) {
  "use strict";
  const C = root.PlanningCore;

  const hexRgb = (hex) => { const n = parseInt(String(hex || "#999999").slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (hex, t) => hexRgb(hex).map((c) => Math.round(c + (255 - c) * (1 - t)));
  const cellLines = (state, cell) => {
    if (cell.shift) return cell.shift.segs.map((g) => `${g.s}–${g.e} ${g.z}`);
    if (cell.absences.length) return [C.ABSENCE_TYPES[cell.absences[0].type] || "Absent"];
    if (cell.cal === "formation") return ["Cours CFA"];
    return [];
  };
  const shiftZones = (cell) => (cell.shift ? [...new Set(cell.shift.segs.map((g) => g.z))] : []);

  // ---------- PDF ----------
  const CP1252 = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "œ": 0x9c, "Œ": 0x8c };
  function pdfText(s) {
    let out = "";
    for (const ch of String(s)) {
      let code = CP1252[ch] || ch.charCodeAt(0);
      if (code > 255) code = 63; // ?
      const c = String.fromCharCode(code);
      out += c === "(" || c === ")" || c === "\\" ? "\\" + c : c;
    }
    return out;
  }
  // Largeur approximative en Helvetica (points pour une taille 1).
  const textWidth = (s, size) => String(s).length * size * 0.5;

  function weeksToPDF(state, mondays, title) {
    const W = 842, H = 595, M = 28;
    const pages = [];
    for (const monday of mondays) {
      const grid = C.weekGrid(state, monday, { all: false });
      if (!grid.rows.length) continue;
      const ops = [];
      const rect = (x, y, w, h, rgb) => ops.push(`${(rgb[0] / 255).toFixed(3)} ${(rgb[1] / 255).toFixed(3)} ${(rgb[2] / 255).toFixed(3)} rg ${x.toFixed(1)} ${(H - y - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
      const stroke = (x, y, w, h) => ops.push(`0.80 0.80 0.82 RG 0.5 w ${x.toFixed(1)} ${(H - y - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
      const text = (x, y, s, size, bold, rgb) => { const c = rgb || [29, 29, 31]; ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)} rg ${x.toFixed(1)} ${(H - y).toFixed(1)} Td (${pdfText(s)}) Tj ET`); };
      const w = grid.week;
      text(M, M + 14, `${title || "Planning"} — semaine du ${C.fmtWeek(monday)}`, 15, true);
      text(M, M + 30, `${w && w.status === "validé" ? "Validé" : "Brouillon"} · exporté le ${C.fmtDate(C.iso(new Date()), "num")}`, 9, false, [110, 110, 115]);
      // Légende
      let lx = W - M;
      const legend = state.zones.map((z) => ({ label: `${z.short} ${z.name}`, rgb: mix(z.color, 0.55) })).concat([{ label: "Cours CFA", rgb: [255, 214, 235] }, { label: "Absence", rgb: [229, 229, 234] }]);
      for (const l of legend.reverse()) { const tw = textWidth(l.label, 8) + 18; lx -= tw; rect(lx, M + 6, 10, 10, l.rgb); text(lx + 13, M + 14, l.label, 8); lx -= 8; }
      const top = M + 44, nameW = 96, totalW = 44, dayW = (W - 2 * M - nameW - totalW) / 7;
      const rowH = Math.min(30, (H - top - M - 20) / grid.rows.length);
      rect(M, top, W - 2 * M, 20, [242, 242, 247]);
      text(M + 6, top + 13, "Équipe", 8.5, true);
      grid.days.forEach((d, i) => text(M + nameW + i * dayW + 6, top + 13, `${C.DAYS_SHORT[C.dow(d)]} ${C.fmtDate(d, "short")}`, 8.5, true));
      text(W - M - totalW + 6, top + 13, "Total", 8.5, true);
      grid.rows.forEach((row, r) => {
        const y = top + 20 + r * rowH;
        text(M + 6, y + rowH / 2 + 3, row.emp.name, 8.5, true);
        row.cells.forEach((cell, i) => {
          const x = M + nameW + i * dayW;
          const lines = cellLines(state, cell);
          if (cell.shift) {
            const lh = (rowH - 4) / cell.shift.segs.length;
            cell.shift.segs.forEach((g, k) => { const z = C.zoneById(state, g.z); rect(x + 2, y + 2 + k * lh, dayW - 4, lh - 1, mix(z ? z.color : "#999999", 0.5)); });
          } else if (lines.length) rect(x + 2, y + 2, dayW - 4, rowH - 4, cell.cal === "formation" ? [255, 214, 235] : [229, 229, 234]);
          const lh = (rowH - 4) / Math.max(1, lines.length);
          lines.forEach((l, k) => text(x + 6, y + 2 + k * lh + lh / 2 + 3, l, Math.min(8, lh - 2), false));
          stroke(x, y, dayW, rowH);
        });
        text(W - M - totalW + 6, y + rowH / 2 + 3, C.fmtHours(row.minutes), 8.5, true);
        stroke(M, y, nameW, rowH); stroke(W - M - totalW, y, totalW, rowH);
      });
      text(M, H - M + 6, "Chaque horaire porte le code de sa zone (ZP, ZR) : le planning reste lisible sans les couleurs.", 7.5, false, [110, 110, 115]);
      pages.push(ops.join("\n"));
    }
    if (!pages.length) return null;
    // Assemblage du fichier
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    for (const content of pages) {
      const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  // ---------- XLSX (zip sans compression) ----------
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x5a21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x5a21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cenSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cenSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }
  const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colName = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const argb = (hex) => "FF" + String(hex).slice(1).toUpperCase();
  const lighten = (hex, t) => "#" + mix(hex, t).map((c) => c.toString(16).padStart(2, "0")).join("");

  function weeksToXLSX(state, mondays) {
    const zones = state.zones;
    // Remplissages : 0 none, 1 gray125, 2.. zones, puis mixte, cours, absence, en-tête
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const zoneFill = {};
    for (const z of zones) { zoneFill[z.id] = fills.length; fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(lighten(z.color, 0.55))}"/></patternFill></fill>`); }
    const mixedFill = fills.length; fills.push(`<fill><patternFill patternType="lightUp"><fgColor rgb="${argb(lighten((zones[1] || zones[0]).color, 0.8))}"/><bgColor rgb="${argb(lighten(zones[0].color, 0.45))}"/></patternFill></fill>`);
    const coursFill = fills.length; fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FFFFD6EB"/></patternFill></fill>');
    const absFill = fills.length; fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FFE5E5EA"/></patternFill></fill>');
    const headFill = fills.length; fills.push('<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F7"/></patternFill></fill>');
    const xf = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const style = (font, fill, wrap) => { xf.push(`<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" ${wrap ? 'wrapText="1"' : ""}/></xf>`); return xf.length - 1; };
    const sHead = style(1, headFill, false), sName = style(1, 0, false), sEmpty = style(0, 0, true);
    const sZone = {}; for (const z of zones) sZone[z.id] = style(0, zoneFill[z.id], true);
    const sMixed = style(0, mixedFill, true), sCours = style(0, coursFill, true), sAbs = style(0, absFill, true), sTitle = style(1, 0, false);
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD1D1D6"/></left><right style="thin"><color rgb="FFD1D1D6"/></right><top style="thin"><color rgb="FFD1D1D6"/></top><bottom style="thin"><color rgb="FFD1D1D6"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xf.length}">${xf.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

    const sheets = [];
    for (const monday of mondays) {
      const grid = C.weekGrid(state, monday, { all: false });
      if (!grid.rows.length) continue;
      const rows = [];
      const cell = (r, c, v, s) => `<c r="${colName(c)}${r}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
      rows.push(`<row r="1">${cell(1, 0, `Planning — semaine du ${C.fmtWeek(monday)} (${grid.week && grid.week.status === "validé" ? "validé" : "brouillon"})`, sTitle)}</row>`);
      rows.push(`<row r="2">${zones.map((z, i) => cell(2, i, `${z.short} = ${z.name}`, sZone[z.id])).join("")}${cell(2, zones.length, "Cours CFA", sCours)}${cell(2, zones.length + 1, "Absence", sAbs)}</row>`);
      rows.push(`<row r="3">${cell(3, 0, "Équipe", sHead)}${grid.days.map((d, i) => cell(3, i + 1, `${C.DAYS[C.dow(d)]} ${C.fmtDate(d, "short")}`, sHead)).join("")}${cell(3, 8, "Total", sHead)}</row>`);
      grid.rows.forEach((row, k) => {
        const r = k + 4;
        const cs = row.cells.map((c, i) => {
          const lines = cellLines(state, c); const zs = shiftZones(c);
          const s = c.shift ? (zs.length > 1 ? sMixed : sZone[zs[0]] || sEmpty) : c.absences.length ? sAbs : c.cal === "formation" ? sCours : sEmpty;
          return cell(r, i + 1, lines.join("\n"), s);
        }).join("");
        rows.push(`<row r="${r}" ht="34" customHeight="1">${cell(r, 0, row.emp.name, sName)}${cs}${cell(r, 8, C.hoursDecimal(row.minutes).replace(".", ","), sName)}</row>`);
      });
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="3" topLeftCell="B4" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="8" width="19" customWidth="1"/><col min="9" max="9" width="8" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><pageSetup orientation="landscape"/></worksheet>`;
      sheets.push({ name: `Semaine ${C.fmtDate(monday, "short").replace("/", "-")}`, xml });
    }
    if (!sheets.length) return null;
    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: styles },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
    ];
    return zip(files);
  }

  root.PlanningExports = { weeksToPDF, weeksToXLSX, zip, crc32 };
  if (typeof module !== "undefined" && module.exports) module.exports = root.PlanningExports;
})(typeof globalThis !== "undefined" ? globalThis : this);
