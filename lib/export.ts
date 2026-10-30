import ExcelJS from "exceljs";

export type ExportCell = string | number;
export type ExportRow = ExportCell[];

export const exportHeaders = [
  "No",
  "Nama",
  "Email",
  "No. HP",
  "Asal Kampus",
  "Jurusan",
  "Divisi",
  "Tanggal Mulai",
  "Tanggal Selesai",
  "Durasi (hari)",
  "Status",
  "Fase",
  "Sumber",
  "Diverifikasi Oleh",
  "Tanggal Verifikasi",
  "Tanggal Daftar",
];

export function protectSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ExportCell): string {
  const text = typeof value === "string" ? protectSpreadsheetText(value) : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createCsv(rows: ExportRow[]): string {
  return `\uFEFF${[exportHeaders, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

export async function createXlsx(rows: ExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Pemagang");
  worksheet.columns = exportHeaders.map((header, index) => ({
    header,
    key: `column_${index + 1}`,
    width: Math.max(15, Math.min(32, header.length + 4)),
  }));
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: "A1", to: `${worksheet.getColumn(exportHeaders.length).letter}${rows.length + 1}` };

  for (const row of rows) {
    worksheet.addRow(row.map((value) =>
      typeof value === "string" ? protectSpreadsheetText(value) : value,
    ));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
