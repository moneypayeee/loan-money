/** Builds a CSV (Excel-safe: quoted, UTF-8 BOM, formula injection neutralised) and downloads it. */
type Cell = string | number | boolean | null | undefined;

function cell(v: Cell) {
  if (v == null) return "";
  let s = String(v);
  // A cell starting with = + - @ is run as a formula by Excel; prefix it so it stays text.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]) {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const blob = new Blob(["﻿" + toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
