import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/**
 * Simple Excel export helper.
 * Usage:
 *   exportToExcel([{a:1,b:2}], "report.xlsx", "Sheet1")
 */
export function exportToExcel<Row extends Record<string, any>>(
  rows: Row[],
  filename = "export.xlsx",
  sheetName = "Sheet1"
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, filename);
}
