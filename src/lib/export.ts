import * as XLSX from "xlsx";

export type Cell = string | number | null | undefined;
export type Sheet = { name: string; rows: Cell[][] };

/** Formato dos arquivos exportados. Troque para "xlsx" se preferir o formato moderno do Excel. */
const FORMAT: "xls" | "xlsx" = "xls";

function widths(rows: Cell[][]) {
  const n = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: n }, (_, c) => ({
    wch: Math.min(48, Math.max(10, ...rows.map((r) => String(r[c] ?? "").length + 2))),
  }));
}

/** Baixa uma planilha Excel com uma ou mais abas. `fileName` vai sem extensão. */
export function downloadSheets(fileName: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map((r) => r.map((c) => c ?? "")));
    ws["!cols"] = widths(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Dados");
  }
  XLSX.writeFile(wb, `${fileName.replace(/\.(csv|xlsx?)$/i, "")}.${FORMAT}`, {
    bookType: FORMAT === "xls" ? "biff8" : "xlsx",
  });
}

export function downloadXls(fileName: string, rows: Cell[][], sheetName = "Dados") {
  downloadSheets(fileName, [{ name: sheetName, rows }]);
}
